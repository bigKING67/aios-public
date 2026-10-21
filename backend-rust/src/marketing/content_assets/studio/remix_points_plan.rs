//! Planned remix runs shared by 类型 1 (框架混剪) and 类型 2 (卖点混剪), plus the
//! 类型 2 loader. A planned clip lists every segment it was cut from (one
//! framework segment, or the selling-point segments of one block) so creation
//! can recheck all of them under a share lock.
use super::access::StudioAccess;
use super::domain;
use super::error::StudioResult;
use super::remix::{Normalized, Plan, RemixMode, SlotPlan, MAX_SLOTS};
use super::remix_combos::{Candidate, Combination};
use super::remix_selling_points::{
    self as points, FrameSegment, PointSegment, PointSelection, RefSlot, SlotOption,
};
use super::repository::{active_preset_labels, db_error};
use super::types::SegmentPresetLabel;
use crate::marketing::content_assets::production::framework_remix::{
    self as runs, RemixSource, FRAMEWORK_REMIX_MAX_SOURCES,
};
use crate::{auth::CurrentUser, config::Settings, error::AppError};
use serde_json::json;
use sqlx::PgPool;
use sqlx::{PgConnection, Row};
use std::collections::HashSet;
use std::collections::{BTreeSet, HashMap};
use uuid::Uuid;

/// Selling-point preset written by migration 035.
pub(super) const POINT_PRESET_KEY: &str = "selling_point";
pub(super) const POINT_PRESET_VERSION: i32 = 1;
const MAX_FRAMES_PER_LABEL: i64 = 200;

#[derive(Clone, Debug)]
pub(super) struct PlannedPart {
    pub(super) segment_id: Uuid,
    /// Expected `continues_previous` (always false for framework segments).
    pub(super) continues_previous: bool,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    pub(super) label_key: String,
    pub(super) additional_label_keys: Vec<String>,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
}

#[derive(Clone, Debug)]
pub(super) struct PlannedClip {
    /// 1-based slot ordinal.
    pub(super) slot: usize,
    pub(super) asset_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    /// Framework label of the slot.
    pub(super) label_key: String,
    pub(super) source_content_hash: String,
    pub(super) parts: Vec<PlannedPart>,
    /// Segments rechecked at create but not rendered: the framework segment a
    /// block was taken from.
    pub(super) guards: Vec<PlannedPart>,
    /// 类型 2 only: selling points of the clip, its slot tier and fallback flag.
    pub(super) selling_points: Vec<String>,
    pub(super) tier: Option<&'static str>,
    pub(super) fallback: bool,
}

#[derive(Debug)]
pub(super) struct PlannedRun {
    pub(super) hash: String,
    pub(super) clips: Vec<PlannedClip>,
}

/// 类型 2 inputs: the reference original's framework and selling-point
/// segments, and same-product candidates of the reference's framework labels.
pub(super) struct PointInputs {
    pub(super) reference_frames: Vec<FrameSegment>,
    pub(super) reference_points: Vec<PointSegment>,
    pub(super) frames: Vec<FrameSegment>,
    pub(super) points: Vec<PointSegment>,
}

/// The former endorsement key mixed stars, KOLs and experts. Keep its history,
/// but require a human to classify it before using a newly planned output.
/// Only 混剪口播 frames count: points elsewhere are not used by 类型 2.
fn legacy_endorsement_frames(frames: &[FrameSegment], points: &[PointSegment]) -> HashSet<Uuid> {
    frames
        .iter()
        .filter(|frame| points::carries_points(frame))
        .filter(|frame| {
            points.iter().any(|point| {
                point.asset_id == frame.asset_id
                    && point.start_ms < frame.end_ms
                    && point.end_ms > frame.start_ms
                    && (point.label_key == "celebrity_endorsement"
                        || point
                            .additional_label_keys
                            .iter()
                            .any(|key| key == "celebrity_endorsement"))
            })
        })
        .map(|frame| frame.segment_id)
        .collect()
}

fn frame(row: &sqlx::postgres::PgRow) -> FrameSegment {
    FrameSegment {
        segment_id: row.get("segment_id"),
        asset_id: row.get("asset_id"),
        start_ms: row.get("start_ms"),
        end_ms: row.get("end_ms"),
        label_key: row.get("label_key"),
        source_content_hash: row.get("source_content_hash"),
    }
}

fn point(row: &sqlx::postgres::PgRow) -> PointSegment {
    PointSegment {
        segment_id: row.get("segment_id"),
        asset_id: row.get("asset_id"),
        start_ms: row.get("start_ms"),
        end_ms: row.get("end_ms"),
        label_key: row.get("label_key"),
        continues_previous: row.get("continues_previous"),
        additional_label_keys: row.get("additional_label_keys"),
    }
}

const REFERENCE_SQL: &str = "SELECT s.segment_id, s.asset_id, s.start_ms, s.end_ms, s.label_key, s.source_content_hash, s.continues_previous, s.additional_label_keys FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.asset_id = $1 AND s.preset_key = $2 AND s.preset_version = $3 AND s.status = 'confirmed' AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) AND ($4::TEXT IS NULL OR $4 = ANY(a.tags)) ORDER BY s.start_ms, s.segment_id";
const FRAMES_SQL: &str = "SELECT segment_id, asset_id, start_ms, end_ms, label_key, source_content_hash, continues_previous FROM (SELECT s.segment_id, s.asset_id, s.start_ms, s.end_ms, s.label_key, s.source_content_hash, s.continues_previous, ROW_NUMBER() OVER (PARTITION BY s.label_key ORDER BY s.asset_id, s.start_ms, s.segment_id) AS rank FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.preset_key = $1 AND s.preset_version = $2 AND s.label_key = ANY($3) AND s.product_name = $4 AND s.status = 'confirmed' AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) AND ($6::TEXT IS NULL OR $6 = ANY(a.tags))) ranked WHERE rank <= $5 ORDER BY label_key, asset_id, start_ms, segment_id";
const POINTS_SQL: &str = "SELECT s.segment_id, s.asset_id, s.start_ms, s.end_ms, s.label_key, s.source_content_hash, s.continues_previous, s.additional_label_keys FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.asset_id = ANY($1) AND s.preset_key = $2 AND s.preset_version = $3 AND s.product_name = $4 AND s.status = 'confirmed' AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) ORDER BY s.asset_id, s.start_ms, s.segment_id";

pub(super) async fn load(
    db: &mut PgConnection,
    preset: (&str, i32),
    product_name: &str,
    reference_asset: Uuid,
    enterprise_tag: Option<&str>,
) -> StudioResult<PointInputs> {
    // Fails with a clear 400 when migration 035 is missing or the preset retired.
    active_preset_labels(db, POINT_PRESET_KEY, POINT_PRESET_VERSION).await?;
    let reference_frames: Vec<FrameSegment> = sqlx::query(REFERENCE_SQL)
        .bind(reference_asset)
        .bind(preset.0)
        .bind(preset.1)
        .bind(enterprise_tag)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?
        .iter()
        .map(frame)
        .collect();
    let reference_points: Vec<PointSegment> = sqlx::query(REFERENCE_SQL)
        .bind(reference_asset)
        .bind(POINT_PRESET_KEY)
        .bind(POINT_PRESET_VERSION)
        .bind(enterprise_tag)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?
        .iter()
        .map(point)
        .collect();
    let labels: Vec<String> = reference_frames
        .iter()
        .map(|f| f.label_key.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let frames: Vec<FrameSegment> = sqlx::query(FRAMES_SQL)
        .bind(preset.0)
        .bind(preset.1)
        .bind(&labels)
        .bind(product_name)
        .bind(MAX_FRAMES_PER_LABEL)
        .bind(enterprise_tag)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?
        .iter()
        .map(frame)
        .collect();
    let assets: Vec<Uuid> = frames
        .iter()
        .map(|f| f.asset_id)
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let points: Vec<PointSegment> = sqlx::query(POINTS_SQL)
        .bind(&assets)
        .bind(POINT_PRESET_KEY)
        .bind(POINT_PRESET_VERSION)
        .bind(product_name)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?
        .iter()
        .map(point)
        .collect();
    Ok(PointInputs {
        reference_frames,
        reference_points,
        frames,
        points,
    })
}

/// Result of 类型 2 planning; `slots` keeps each slot's reference shape and
/// candidate options for availability reporting.
pub(super) struct PointPlan {
    pub(super) slots: Vec<RefSlot>,
    pub(super) options: Vec<Vec<SlotOption>>,
    pub(super) selection: PointSelection,
    pub(super) runs: Vec<PlannedRun>,
}

/// `usable` filters candidate frames and points by source binding, raw hash
/// and duration (applied by the caller's source check).
pub(super) fn plan(
    inputs: &PointInputs,
    preset: (&str, i32),
    usable: impl Fn(Uuid, i32, i32) -> bool,
    count: usize,
    seed: u64,
    max_total_ms: u64,
    used: &HashSet<String>,
) -> PointPlan {
    let reference_blocks = points::build_blocks(&inputs.reference_frames, &inputs.reference_points);
    let slots = points::reference_slots(&inputs.reference_frames, &reference_blocks);
    let mut unsafe_frames = points::unsafe_frame_ids(&inputs.frames, &inputs.points);
    unsafe_frames.extend(legacy_endorsement_frames(&inputs.frames, &inputs.points));
    let frames: Vec<FrameSegment> = inputs
        .frames
        .iter()
        .filter(|f| {
            !unsafe_frames.contains(&f.segment_id) && usable(f.asset_id, f.start_ms, f.end_ms)
        })
        .cloned()
        .collect();
    let candidate_points: Vec<PointSegment> = inputs
        .points
        .iter()
        .filter(|p| usable(p.asset_id, p.start_ms, p.end_ms))
        .cloned()
        .collect();
    let blocks: Vec<_> = points::build_blocks(&frames, &candidate_points)
        .into_values()
        .flatten()
        .collect();
    let options: Vec<Vec<SlotOption>> = slots
        .iter()
        .enumerate()
        .map(|(index, slot)| {
            points::slot_options(slot, &frames, &blocks, true, seed ^ (index as u64 + 1))
        })
        .collect();
    let reference = points::reference_hash(&slots);
    let limits = points::Limits {
        max_total_ms,
        max_sources: FRAMEWORK_REMIX_MAX_SOURCES,
        allowance: points::repeat_allowance(&slots),
    };
    let selection = points::select(&options, count, seed, &limits, used, &reference);
    let known: HashMap<Uuid, (i32, i32, String, bool, Vec<String>)> = candidate_points
        .iter()
        .map(|p| {
            let value = (
                p.start_ms,
                p.end_ms,
                p.label_key.clone(),
                p.continues_previous,
                p.additional_label_keys.clone(),
            );
            (p.segment_id, value)
        })
        .chain(frames.iter().map(|f| {
            let value = (f.start_ms, f.end_ms, f.label_key.clone(), false, Vec::new());
            (f.segment_id, value)
        }))
        .collect();
    let part = |id: Uuid, framework: bool| {
        let (start_ms, end_ms, label_key, continues_previous, additional_label_keys) =
            known.get(&id).cloned().unwrap_or_default();
        let (preset_key, preset_version) = if framework {
            (preset.0.to_owned(), preset.1)
        } else {
            (POINT_PRESET_KEY.to_owned(), POINT_PRESET_VERSION)
        };
        PlannedPart {
            segment_id: id,
            continues_previous,
            start_ms,
            end_ms,
            label_key,
            additional_label_keys,
            preset_key,
            preset_version,
        }
    };
    let runs = selection
        .combos
        .iter()
        .map(|combo| PlannedRun {
            hash: combo.hash.clone(),
            clips: combo
                .picks
                .iter()
                .zip(&options)
                .enumerate()
                .flat_map(|(slot_index, (pick, slot_options))| {
                    let option = &slot_options[*pick];
                    let part = &part;
                    option.clips.iter().map(move |clip| PlannedClip {
                        slot: slot_index + 1,
                        asset_id: clip.asset_id,
                        start_ms: clip.start_ms,
                        end_ms: clip.end_ms,
                        label_key: clip.framework_label.clone(),
                        source_content_hash: clip.source_content_hash.clone(),
                        parts: clip
                            .segment_ids
                            .iter()
                            .map(|id| part(*id, option.fallback))
                            .collect(),
                        guards: clip
                            .frame_id
                            .map(|id| part(id, true))
                            .into_iter()
                            .chain(clip.point_guard_ids.iter().map(|id| part(*id, false)))
                            .collect(),
                        selling_points: clip.selling_points.clone(),
                        tier: Some(option.tier.as_str()),
                        fallback: option.fallback,
                    })
                })
                .collect(),
        })
        .collect();
    PointPlan {
        slots,
        options,
        selection,
        runs,
    }
}

/// Binds every candidate asset as a production source; assets failing rights,
/// permission or readiness are dropped and counted.
pub(super) async fn bind_sources(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    asset_ids: BTreeSet<Uuid>,
) -> StudioResult<(HashMap<Uuid, RemixSource>, usize)> {
    let mut sources = HashMap::new();
    let mut excluded_assets = 0;
    for asset_id in asset_ids {
        match runs::bind_source(
            pool,
            &settings.tos_bucket,
            user,
            asset_id,
            access.source_permission(),
        )
        .await
        {
            Ok(source) => {
                sources.insert(asset_id, source);
            }
            Err(AppError::BadRequest(_) | AppError::Forbidden | AppError::NotFound) => {
                excluded_assets += 1;
            }
            Err(error) => return Err(error.into()),
        }
    }
    Ok((sources, excluded_assets))
}

/// A span is usable when its asset is bound, the raw hash still matches, it
/// ends inside the source and lasts 100 ms..max.
pub(super) fn usable(
    sources: &HashMap<Uuid, RemixSource>,
    max_ms: u64,
    asset_id: Uuid,
    hash: Option<&str>,
    start_ms: i32,
    end_ms: i32,
) -> bool {
    let duration = u64::try_from(end_ms.saturating_sub(start_ms)).unwrap_or(0);
    sources.get(&asset_id).is_some_and(|source| {
        hash.is_none_or(|hash| source.sha256() == hash)
            && u32::try_from(end_ms).is_ok_and(|end| end <= source.duration_ms())
    }) && (100..=max_ms).contains(&duration)
}

pub(super) fn framework_runs(
    slots: &[Vec<Candidate>],
    combos: &[Combination],
    preset: (&str, i32),
) -> Vec<PlannedRun> {
    combos
        .iter()
        .map(|combo| PlannedRun {
            hash: combo.hash.clone(),
            clips: combo
                .picks
                .iter()
                .zip(slots)
                .enumerate()
                .map(|(index, (pick, slot))| {
                    let c = &slot[*pick];
                    PlannedClip {
                        slot: index + 1,
                        asset_id: c.asset_id,
                        start_ms: c.start_ms,
                        end_ms: c.end_ms,
                        label_key: c.label_key.clone(),
                        source_content_hash: c.source_content_hash.clone(),
                        guards: Vec::new(),
                        parts: vec![PlannedPart {
                            segment_id: c.segment_id,
                            continues_previous: false,
                            start_ms: c.start_ms,
                            end_ms: c.end_ms,
                            label_key: c.label_key.clone(),
                            additional_label_keys: Vec::new(),
                            preset_key: preset.0.to_owned(),
                            preset_version: preset.1,
                        }],
                        selling_points: Vec::new(),
                        tier: None,
                        fallback: false,
                    }
                })
                .collect(),
        })
        .collect()
}

/// Frozen clip record of a batch run; 类型 2 adds the slot fill details.
pub(super) fn stored_segment(clip: &PlannedClip, mode: RemixMode) -> serde_json::Value {
    let mut value = json!({"segmentId": clip.parts[0].segment_id, "assetId": clip.asset_id, "startMs": clip.start_ms, "endMs": clip.end_ms, "labelKey": clip.label_key, "sourceContentHash": clip.source_content_hash});
    if mode == RemixMode::SellingPoint {
        value["slot"] = json!(clip.slot);
        value["tier"] = json!(clip.tier);
        value["fallback"] = json!(clip.fallback);
        value["sellingPoints"] = json!(clip.selling_points);
        value["segmentIds"] = json!(clip.parts.iter().map(|p| p.segment_id).collect::<Vec<_>>());
        // Lineage writes one row per selling-point segment with its own range.
        value["parts"] = json!(clip
            .parts
            .iter()
            .map(|p| json!({"segmentId": p.segment_id, "startMs": p.start_ms, "endMs": p.end_ms}))
            .collect::<Vec<_>>());
    }
    value
}

/// Dependencies of 类型 2 planning shared with `remix::build_plan`.
pub(super) struct Context<'a> {
    pub(super) pool: &'a PgPool,
    pub(super) settings: &'a Settings,
    pub(super) user: &'a CurrentUser,
    pub(super) access: StudioAccess<'a>,
    pub(super) max_ms: u64,
    pub(super) seed: u64,
    pub(super) used: &'a HashSet<String>,
}

/// 类型 2 plan: slots are the reference original's framework segments.
pub(super) async fn build(
    db: &mut PgConnection,
    cx: Context<'_>,
    n: &Normalized,
    preset_labels: Vec<SegmentPresetLabel>,
) -> StudioResult<Plan> {
    let Context {
        pool,
        settings,
        user,
        access,
        max_ms,
        seed,
        used,
    } = cx;
    let preset = (n.preset_key.as_str(), n.preset_version);
    let asset_id = n.source_asset_id.ok_or(AppError::Internal)?;
    let inputs = load(
        db,
        preset,
        &n.product_name,
        asset_id,
        access.enterprise_tag(),
    )
    .await?;
    if !legacy_endorsement_frames(&inputs.reference_frames, &inputs.reference_points).is_empty() {
        return Err(AppError::bad_request(
            "参考原片含旧范围的背书标签，请先确认是明星、KOL 或其他背书",
        )
        .into());
    }
    let labels: Vec<String> = inputs
        .reference_frames
        .iter()
        .map(|f| f.label_key.clone())
        .collect();
    if !points::unsafe_frame_ids(&inputs.reference_frames, &inputs.reference_points).is_empty() {
        return Err(AppError::bad_request(
            "参考原片存在跨框架或无法安全切开的卖点连续关系，请先人工复核框架边界和连着标记",
        )
        .into());
    }
    if labels.is_empty() {
        return Err(AppError::bad_request("参考原片在该预设版本下没有当前有效的已确认片段").into());
    }
    if !inputs.reference_frames.iter().any(points::carries_points) {
        return Err(AppError::bad_request(
            "参考原片没有已确认的混剪口播框架段；卖点只在混剪口播中拆解，请改用框架混剪",
        )
        .into());
    }
    if labels.len() > MAX_SLOTS {
        return Err(AppError::bad_request(format!(
            "参考原片有 {} 段，超过 {MAX_SLOTS} 个槽位上限",
            labels.len()
        ))
        .into());
    }
    for label in &labels {
        domain::ensure_label(&preset_labels, label)?;
    }
    let asset_ids = inputs.frames.iter().map(|f| f.asset_id).collect();
    let (sources, excluded_assets) = bind_sources(pool, settings, user, access, asset_ids).await?;
    let hashes: HashMap<Uuid, String> = inputs
        .frames
        .iter()
        .map(|f| (f.asset_id, f.source_content_hash.clone()))
        .collect();
    let check = |asset_id: Uuid, start_ms: i32, end_ms: i32| {
        usable(
            &sources,
            max_ms,
            asset_id,
            hashes.get(&asset_id).map(String::as_str),
            start_ms,
            end_ms,
        )
    };
    let planned = plan(&inputs, preset, check, n.count, seed, max_ms, used);
    let slots = planned
        .slots
        .iter()
        .zip(&planned.options)
        .map(|(slot, options)| SlotPlan {
            candidates: options.len(),
            selling_points: Some(slot.target.clone()),
            fallback: Some(slot.fallback),
        })
        .collect();
    let selection = &planned.selection;
    Ok(Plan {
        mode: n.mode,
        labels,
        preset_labels,
        slots,
        sources,
        excluded_assets,
        theoretical: selection.theoretical,
        available: selection.available,
        exact: selection.exact,
        previously_used: selection.previously_used,
        reference_excluded: selection.reference_excluded,
        runs: planned.runs,
        seed,
    })
}

/// Match the segment writers' interval scope. Try-lock after row locks avoids
/// waiting in the opposite order to an in-flight insert/AI publisher.
pub(super) async fn lock_point_scopes(db: &mut PgConnection, plan: &Plan) -> StudioResult<()> {
    if plan.mode != RemixMode::SellingPoint {
        return Ok(());
    }
    let assets: BTreeSet<_> = plan
        .runs
        .iter()
        .flat_map(|r| r.clips.iter().map(|c| c.asset_id))
        .collect();
    for asset in assets {
        let locked: bool = sqlx::query_scalar(
            "SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1 || ':' || $2, 0))",
        )
        .bind(asset.to_string())
        .bind(POINT_PRESET_KEY)
        .fetch_one(&mut *db)
        .await
        .map_err(db_error)?;
        if !locked {
            return Err(super::error::StudioError::conflict(
                super::error::ConflictCode::SourceChanged,
                "所选原片的卖点正在修改，请稍后重新预览",
                Vec::new(),
            ));
        }
    }
    Ok(())
}

/// Recheck known continuity and the whole-frame annotation sets under the
/// selling-point scope lock. Read all source points once, including neighbours
/// just outside a rendered frame; they can make its boundary inseparable.
pub(super) async fn changed_point_evidence(
    db: &mut PgConnection,
    plan: &Plan,
    product: &str,
) -> StudioResult<Vec<Uuid>> {
    if plan.mode != RemixMode::SellingPoint {
        return Ok(Vec::new());
    }
    let clips: Vec<_> = plan.runs.iter().flat_map(|r| &r.clips).collect();
    let assets: Vec<_> = clips
        .iter()
        .map(|c| c.asset_id)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let current: Vec<PointSegment> = sqlx::query(POINTS_SQL)
        .bind(&assets)
        .bind(POINT_PRESET_KEY)
        .bind(POINT_PRESET_VERSION)
        .bind(product)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?
        .iter()
        .map(point)
        .collect();
    let mut frames = HashMap::new();
    let mut fallbacks = HashMap::new();
    for clip in &clips {
        let frame = if clip.fallback {
            fallbacks.insert(clip.parts[0].segment_id, clip);
            clip.parts.first()
        } else {
            clip.guards
                .iter()
                .find(|p| p.preset_key != POINT_PRESET_KEY)
        };
        if let Some(frame) = frame {
            frames.insert(
                frame.segment_id,
                FrameSegment {
                    segment_id: frame.segment_id,
                    asset_id: clip.asset_id,
                    start_ms: frame.start_ms,
                    end_ms: frame.end_ms,
                    label_key: frame.label_key.clone(),
                    source_content_hash: clip.source_content_hash.clone(),
                },
            );
        }
    }
    let frames: Vec<_> = frames.into_values().collect();
    let mut changed: Vec<_> = points::unsafe_frame_ids(&frames, &current)
        .into_iter()
        .collect();
    changed.extend(legacy_endorsement_frames(&frames, &current));
    let blocks = points::build_blocks(&frames, &current);
    let containing: HashMap<_, _> = blocks
        .values()
        .flatten()
        .flat_map(|b| b.points.iter().map(move |p| (p.segment_id, b)))
        .collect();
    for clip in clips.iter().filter(|c| !c.fallback) {
        let ids: Vec<_> = clip.parts.iter().map(|p| p.segment_id).collect();
        let unchanged = containing.get(&ids[0]).is_some_and(|b| {
            b.points
                .iter()
                .map(|p| p.segment_id)
                .eq(ids.iter().copied())
        });
        if !unchanged {
            changed.push(ids[0]);
        }
    }
    // Points inside other frameworks are not part of a 类型 2 plan.
    for clip in fallbacks
        .into_values()
        .filter(|clip| clip.label_key == points::POINT_FRAMEWORK_LABEL)
    {
        let expected: HashSet<_> = clip
            .guards
            .iter()
            .filter(|p| p.preset_key == POINT_PRESET_KEY)
            .map(|p| p.segment_id)
            .collect();
        let actual: HashSet<_> = current
            .iter()
            .filter(|p| {
                p.asset_id == clip.asset_id && p.start_ms < clip.end_ms && p.end_ms > clip.start_ms
            })
            .map(|p| p.segment_id)
            .collect();
        changed.extend(expected.symmetric_difference(&actual).copied());
    }
    Ok(changed)
}
