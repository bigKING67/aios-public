// SQLx 0.9 audit: Internal fragments/columns are selected by fixed callers or allowlists; request values remain bound.
//! 单条剪辑: one output from an explicit ordered list of confirmed segments of
//! one preset version, each optionally trimmed inside its own bounds. All
//! clips share one product. Sources pass the same production binding as
//! 框架混剪 (`StudioAccess::source_permission`), and the output is a one-Run
//! batch (`structure.mode = "edit"`, requested = planned = 1) rendered through
//! the same model-free `framework_remix` Run, so outputs, lineage, the 成片
//! page and cancel need no second pipeline.
//!
//! Duplicate reminder: an existing running or succeeded output (either mode,
//! batches visible to the caller, same enterprise) with the same ordered
//! (original, in, out) intervals is `exact`; one sharing ≥ 80 % of source time
//! with it (over the longer of the two) is `similar`. Create refuses an exact
//! repeat with 409 `remix_edit_duplicate` unless `allowDuplicate`.
use super::super::delivery::build_cover_url_for_key;
use super::access::{batch_in_enterprise_sql, StudioAccess};
use super::domain;
use super::error::{ConflictCode, StudioError, StudioResult};
use super::remix::{active_runs, seed, validate_idempotency_key};
use super::remix_combos::combination_hash;
use super::remix_read::outcome;
use super::remix_types::{
    CreateRemixEditRequest, RemixBatchDetail, RemixEditCheckRequest, RemixEditCheckResponse,
    RemixEditClip, RemixEditMatch,
};
use super::repository::{active_preset_labels, db_error};
use crate::marketing::content_assets::production::framework_remix::{
    self as runs, RemixClip, RemixRun, RemixSource,
};
use crate::{
    auth::CurrentUser,
    config::Settings,
    error::{AppError, AppResult},
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, PgPool, Row};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use uuid::Uuid;

pub(super) const MAX_EDIT_CLIPS: usize = 50;
const MIN_CLIP_MS: i32 = 1_000;
const MIN_TOTAL_MS: i64 = 3_000;
const SIMILAR_THRESHOLD: f64 = 0.8;
const SIMILAR_LIMIT: usize = 3;
const EXACT_LIMIT: usize = 5;
/// Most recent comparable outputs read per check (outputs sharing an original).
const COMPARE_LIMIT: i64 = 500;
const TITLE_PRODUCT_CHARS: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Interval {
    pub(super) asset_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
}

struct Segment {
    asset_id: Uuid,
    start_ms: i32,
    end_ms: i32,
    label_key: String,
    product_name: Option<String>,
    source_content_hash: String,
}

/// A validated edit: its product and clips resolved against current segments.
struct Resolved {
    product_name: String,
    intervals: Vec<Interval>,
    segments: HashMap<Uuid, Segment>,
}

fn validate_shape(
    preset_key: &str,
    preset_version: i32,
    clips: &[RemixEditClip],
    max_seconds: u32,
) -> AppResult<()> {
    domain::validate_key(preset_key, "presetKey")?;
    if preset_version < 1 {
        return Err(AppError::bad_request("presetVersion 必须为正数"));
    }
    if clips.is_empty() || clips.len() > MAX_EDIT_CLIPS {
        return Err(AppError::bad_request(format!(
            "单条剪辑需包含 1–{MAX_EDIT_CLIPS} 段"
        )));
    }
    let mut total: i64 = 0;
    for (index, clip) in clips.iter().enumerate() {
        // i64: hostile i32 bounds must not overflow before the length check.
        if clip.start_ms < 0
            || i64::from(clip.end_ms) - i64::from(clip.start_ms) < i64::from(MIN_CLIP_MS)
        {
            return Err(AppError::bad_request(format!(
                "第 {} 段入出点无效，每段至少 1 秒",
                index + 1
            )));
        }
        total += i64::from(clip.end_ms) - i64::from(clip.start_ms);
    }
    let max_ms = i64::from(max_seconds) * 1000;
    if !(MIN_TOTAL_MS..=max_ms).contains(&total) {
        return Err(AppError::bad_request(format!(
            "单条成片总时长需在 3–{max_seconds} 秒之间"
        )));
    }
    Ok(())
}

/// Current confirmed segments of the preset version whose original is live,
/// unchanged and inside the enterprise; `lock` takes a share lock (create).
async fn load_segments(
    db: &mut PgConnection,
    preset_key: &str,
    preset_version: i32,
    clips: &[RemixEditClip],
    enterprise_tag: Option<&str>,
    lock: bool,
) -> StudioResult<HashMap<Uuid, Segment>> {
    let mut ids: Vec<Uuid> = clips.iter().map(|clip| clip.segment_id).collect();
    ids.sort();
    ids.dedup();
    let sql = format!(
        "SELECT s.segment_id, s.asset_id, s.start_ms, s.end_ms, s.label_key, s.product_name, s.source_content_hash FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.segment_id = ANY($1) AND s.status = 'confirmed' AND s.preset_key = $2 AND s.preset_version = $3 AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) AND ($4::TEXT IS NULL OR $4 = ANY(a.tags)) ORDER BY s.segment_id{}",
        if lock { " FOR SHARE OF s" } else { "" }
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(&ids)
        .bind(preset_key)
        .bind(preset_version)
        .bind(enterprise_tag)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get("segment_id"),
                Segment {
                    asset_id: row.get("asset_id"),
                    start_ms: row.get("start_ms"),
                    end_ms: row.get("end_ms"),
                    label_key: row.get("label_key"),
                    product_name: row.get("product_name"),
                    source_content_hash: row.get("source_content_hash"),
                },
            )
        })
        .collect())
}

fn resolve(clips: &[RemixEditClip], segments: HashMap<Uuid, Segment>) -> StudioResult<Resolved> {
    let mut missing: Vec<Uuid> = clips
        .iter()
        .map(|clip| clip.segment_id)
        .filter(|id| !segments.contains_key(id))
        .collect();
    missing.sort();
    missing.dedup();
    if !missing.is_empty() {
        return Err(StudioError::conflict(
            ConflictCode::SourceChanged,
            "部分片段已不可用（取消确认、原片更新或不在本企业），请移除或替换后再试",
            missing,
        ));
    }
    let mut product_name: Option<&str> = None;
    let mut intervals = Vec::with_capacity(clips.len());
    for (index, clip) in clips.iter().enumerate() {
        let segment = &segments[&clip.segment_id];
        if clip.start_ms < segment.start_ms || clip.end_ms > segment.end_ms {
            return Err(AppError::bad_request(format!(
                "第 {} 段的入出点超出了片段范围，只能在片段内修剪",
                index + 1
            ))
            .into());
        }
        let product = segment.product_name.as_deref().unwrap_or("");
        if product.is_empty() || product_name.is_some_and(|first| first != product) {
            return Err(AppError::bad_request(
                "单条剪辑只能使用同一产品的片段，请先给片段补全产品或移除其他产品的片段",
            )
            .into());
        }
        product_name = Some(product);
        intervals.push(Interval {
            asset_id: segment.asset_id,
            start_ms: clip.start_ms,
            end_ms: clip.end_ms,
        });
    }
    Ok(Resolved {
        product_name: product_name.unwrap_or_default().to_owned(),
        intervals,
        segments,
    })
}

/// Binds every original (rights, readiness, bucket, raw hash, duration; edit
/// permission unless open access) and rechecks hash and length per clip.
async fn bind_sources(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    resolved: &Resolved,
) -> StudioResult<HashMap<Uuid, RemixSource>> {
    let asset_ids: BTreeSet<Uuid> = resolved.intervals.iter().map(|i| i.asset_id).collect();
    let mut sources: HashMap<Uuid, RemixSource> = HashMap::new();
    for asset_id in asset_ids {
        let source = runs::bind_source(
            pool,
            &settings.tos_bucket,
            user,
            asset_id,
            access.source_permission(),
        )
        .await?;
        sources.insert(asset_id, source);
    }
    for segment in resolved.segments.values() {
        let source = &sources[&segment.asset_id];
        if source.sha256() != segment.source_content_hash
            || u32::try_from(segment.end_ms).map_or(true, |end| end > source.duration_ms())
        {
            return Err(AppError::bad_request("原片已变化或时长不足，请重新选择片段").into());
        }
    }
    Ok(sources)
}

pub(super) fn total_ms(intervals: &[Interval]) -> i64 {
    intervals
        .iter()
        .map(|interval| i64::from(interval.end_ms) - i64::from(interval.start_ms))
        .sum()
}

/// Per-original union of intervals, sorted and merged.
fn union(intervals: &[Interval]) -> BTreeMap<Uuid, Vec<(i32, i32)>> {
    let mut by_asset: BTreeMap<Uuid, Vec<(i32, i32)>> = BTreeMap::new();
    for interval in intervals {
        by_asset
            .entry(interval.asset_id)
            .or_default()
            .push((interval.start_ms, interval.end_ms));
    }
    for ranges in by_asset.values_mut() {
        ranges.sort_unstable();
        let mut merged: Vec<(i32, i32)> = Vec::with_capacity(ranges.len());
        for &(start, end) in ranges.iter() {
            match merged.last_mut() {
                Some(last) if start <= last.1 => last.1 = last.1.max(end),
                _ => merged.push((start, end)),
            }
        }
        *ranges = merged;
    }
    by_asset
}

/// Shared source time of two edits over the longer one (0–1).
pub(super) fn overlap(a: &[Interval], b: &[Interval]) -> f64 {
    let (ua, ub) = (union(a), union(b));
    let mut shared: i64 = 0;
    for (asset, ranges) in &ua {
        let Some(other) = ub.get(asset) else { continue };
        for &(start, end) in ranges {
            for &(other_start, other_end) in other {
                let from = start.max(other_start);
                let to = end.min(other_end);
                if to > from {
                    shared += i64::from(to - from);
                }
            }
        }
    }
    let longer = total_ms(a).max(total_ms(b));
    if longer == 0 {
        return 0.0;
    }
    (shared as f64 / longer as f64).min(1.0)
}

fn intervals_from_json(segments: &Value) -> Vec<Interval> {
    segments
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(Interval {
                        asset_id: Uuid::parse_str(item["assetId"].as_str()?).ok()?,
                        start_ms: i32::try_from(item["startMs"].as_i64()?).ok()?,
                        end_ms: i32::try_from(item["endMs"].as_i64()?).ok()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Exact repeats and similar outputs among the caller-visible running or
/// succeeded outputs that share at least one original with `intervals`.
async fn compare(
    db: &mut PgConnection,
    settings: &Settings,
    owner: Option<&str>,
    enterprise_tag: Option<&str>,
    intervals: &[Interval],
) -> StudioResult<(Vec<RemixEditMatch>, Vec<RemixEditMatch>)> {
    let mut assets: Vec<Uuid> = intervals.iter().map(|i| i.asset_id).collect();
    assets.sort();
    assets.dedup();
    let sql = format!(
        "SELECT br.batch_id, br.ordinal, br.segments, br.output_asset_id, r.status, oa.cover_object_key, COALESCE(b.structure->>'mode', 'framework') AS mode, COALESCE(b.constraints->>'productName', '') AS product_name, b.created_at::TEXT AS created_at FROM ads.content_remix_batch_runs br JOIN ads.content_remix_batches b ON b.batch_id = br.batch_id JOIN ads.content_production_runs r ON r.run_id = br.run_id LEFT JOIN ads.marketing_content_assets oa ON oa.asset_id = br.output_asset_id AND oa.is_deleted = FALSE WHERE r.status IN ('succeeded', 'queued', 'running', 'paused') AND (br.output_asset_id IS NULL OR oa.asset_id IS NOT NULL) AND ($1::TEXT IS NULL OR b.owner_user_id = $1) AND EXISTS (SELECT 1 FROM JSONB_ARRAY_ELEMENTS(br.segments) cs WHERE (cs->>'assetId')::UUID = ANY($2)) AND {} ORDER BY b.created_at DESC, br.ordinal LIMIT $4",
        batch_in_enterprise_sql(3)
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(owner)
        .bind(&assets)
        .bind(enterprise_tag)
        .bind(COMPARE_LIMIT)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?;
    let mut exact = Vec::new();
    let mut similar = Vec::new();
    for row in rows {
        let theirs = intervals_from_json(&row.get("segments"));
        let same = theirs == intervals;
        let ratio = if same {
            1.0
        } else {
            overlap(intervals, &theirs)
        };
        if !same && ratio < SIMILAR_THRESHOLD {
            continue;
        }
        let cover_key: Option<String> = row.get("cover_object_key");
        let run_status: String = row.get("status");
        let found = RemixEditMatch {
            batch_id: row.get("batch_id"),
            ordinal: row.get("ordinal"),
            mode: row.get("mode"),
            product_name: row.get("product_name"),
            outcome: outcome(&run_status).into(),
            output_asset_id: row.get("output_asset_id"),
            output_cover_url: cover_key.and_then(|key| build_cover_url_for_key(settings, &key)),
            duration_ms: total_ms(&theirs),
            overlap: ratio,
            created_at: row.get("created_at"),
        };
        if same {
            exact.push(found);
        } else {
            similar.push(found);
        }
    }
    exact.truncate(EXACT_LIMIT);
    similar.sort_by(|a, b| b.overlap.total_cmp(&a.overlap));
    similar.truncate(SIMILAR_LIMIT);
    Ok((exact, similar))
}

pub(super) async fn check(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    request: &RemixEditCheckRequest,
) -> StudioResult<RemixEditCheckResponse> {
    validate_shape(
        &request.preset_key,
        request.preset_version,
        &request.clips,
        settings.content_ai_studio_remix_max_seconds,
    )?;
    let mut db = pool.acquire().await.map_err(db_error)?;
    let segments = load_segments(
        &mut db,
        &request.preset_key,
        request.preset_version,
        &request.clips,
        access.enterprise_tag(),
        false,
    )
    .await?;
    let resolved = resolve(&request.clips, segments)?;
    bind_sources(pool, settings, user, access, &resolved).await?;
    let (exact, similar) = compare(
        &mut db,
        settings,
        access.batch_owner(user),
        access.enterprise_tag(),
        &resolved.intervals,
    )
    .await?;
    Ok(RemixEditCheckResponse {
        product_name: resolved.product_name,
        duration_ms: total_ms(&resolved.intervals),
        exact,
        similar,
    })
}

/// Canonical request hash (`allowDuplicate` excluded, so a confirmed retry
/// with the same key still replays). Prefixed with the mode so a 框架混剪 key
/// can never replay as an edit.
pub(super) fn digest(request: &CreateRemixEditRequest) -> String {
    let clips: Vec<Value> = request
        .clips
        .iter()
        .map(|clip| json!([clip.segment_id, clip.start_ms, clip.end_ms]))
        .collect();
    let canonical = json!({
        "mode": "edit",
        "presetKey": request.preset_key,
        "presetVersion": request.preset_version,
        "clips": clips,
    });
    hex::encode(Sha256::digest(canonical.to_string().as_bytes()))
}

/// Untrimmed edits share the 框架混剪 segment-id hash (so a later framework
/// batch of the same owner never repeats them); trimmed ones hash the cuts.
pub(super) fn edit_hash(clips: &[RemixEditClip], untrimmed: bool) -> String {
    if untrimmed {
        let ids: Vec<Uuid> = clips.iter().map(|clip| clip.segment_id).collect();
        return combination_hash(&ids);
    }
    let canonical: Vec<String> = clips
        .iter()
        .map(|clip| {
            format!(
                "{}:{}-{}",
                clip.segment_id.hyphenated(),
                clip.start_ms,
                clip.end_ms
            )
        })
        .collect();
    hex::encode(Sha256::digest(canonical.join("\n").as_bytes()))
}

pub(super) async fn create(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    request: &CreateRemixEditRequest,
) -> StudioResult<RemixBatchDetail> {
    validate_idempotency_key(&request.idempotency_key)?;
    validate_shape(
        &request.preset_key,
        request.preset_version,
        &request.clips,
        settings.content_ai_studio_remix_max_seconds,
    )?;
    let digest = digest(request);
    let owner = user.user_id.as_str();
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended('content-remix-batches:' || $1, 0))",
    )
    .bind(owner)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    let existing = sqlx::query("SELECT batch_id, request_digest FROM ads.content_remix_batches WHERE owner_user_id = $1 AND idempotency_key = $2")
        .bind(owner).bind(&request.idempotency_key).fetch_optional(&mut *tx).await.map_err(db_error)?;
    if let Some(row) = existing {
        if row.get::<String, _>("request_digest") != digest {
            return Err(StudioError::conflict(
                ConflictCode::IdempotencyConflict,
                "幂等键已用于不同的剪辑请求",
                Vec::new(),
            ));
        }
        let batch_id: Uuid = row.get("batch_id");
        tx.commit().await.map_err(db_error)?;
        return super::remix_read::detail(pool, settings, owner, Some(owner), batch_id).await;
    }
    let preset_labels =
        active_preset_labels(&mut tx, &request.preset_key, request.preset_version).await?;
    let segments = load_segments(
        &mut tx,
        &request.preset_key,
        request.preset_version,
        &request.clips,
        access.enterprise_tag(),
        true,
    )
    .await?;
    let resolved = resolve(&request.clips, segments)?;
    let sources = bind_sources(pool, settings, user, access, &resolved).await?;
    if !request.allow_duplicate {
        let (exact, _) = compare(
            &mut tx,
            settings,
            access.batch_owner(user),
            access.enterprise_tag(),
            &resolved.intervals,
        )
        .await?;
        if let Some(first) = exact.first() {
            let batch = first.batch_id.simple().to_string();
            return Err(StudioError::conflict(
                ConflictCode::RemixEditDuplicate,
                format!(
                    "已有完全相同的成片（批次 {}，第 {} 条），确认仍要生成请选择「仍然生成」",
                    &batch[..8],
                    first.ordinal
                ),
                Vec::new(),
            ));
        }
    }
    let active = active_runs(&mut tx, owner).await?;
    if active + 1 > settings.content_ai_studio_remix_max_active {
        return Err(StudioError::conflict(
            ConflictCode::RemixActiveLimit,
            format!(
                "排队中的剪辑已有 {active} 条，达到上限 {}，请等待完成后再提交",
                settings.content_ai_studio_remix_max_active
            ),
            Vec::new(),
        ));
    }
    let label_name = |key: &str| {
        preset_labels
            .iter()
            .find(|label| label.key == key)
            .map_or_else(|| key.to_owned(), |label| label.name.clone())
    };
    let chosen: Vec<&Segment> = request
        .clips
        .iter()
        .map(|clip| &resolved.segments[&clip.segment_id])
        .collect();
    let labels: Vec<&str> = chosen.iter().map(|s| s.label_key.as_str()).collect();
    let names: Vec<String> = labels.iter().map(|key| label_name(key)).collect();
    let untrimmed = request
        .clips
        .iter()
        .zip(&chosen)
        .all(|(clip, s)| clip.start_ms == s.start_ms && clip.end_ms == s.end_ms);
    let batch_id = Uuid::new_v4();
    let batch = batch_id.simple().to_string();
    let short_product: String = resolved
        .product_name
        .chars()
        .take(TITLE_PRODUCT_CHARS)
        .collect();
    sqlx::query("INSERT INTO ads.content_remix_batches (batch_id, owner_user_id, idempotency_key, request_digest, preset_key, preset_version, structure, constraints, requested_count, planned_count, seed, shortfall_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 1, $9, NULL)")
        .bind(batch_id).bind(owner).bind(&request.idempotency_key).bind(&digest)
        .bind(&request.preset_key).bind(request.preset_version)
        .bind(json!({"mode": "edit", "labels": labels, "sourceAssetId": null}))
        .bind(json!({"productName": resolved.product_name}))
        .bind(seed(&digest) as i64)
        .execute(&mut *tx).await.map_err(db_error)?;
    let run_sources: Vec<&RemixSource> = sources.values().collect();
    let run = RemixRun {
        idempotency_key: format!("remix-{batch}-1"),
        title: format!("单条剪辑 · {short_product} · {}", &batch[..8]),
        brief: format!(
            "单条剪辑（{}），保留各片段原声，不调用模型规划",
            names.join(" → ")
        ),
        summary: format!("按选定顺序拼接 {} 段：{}", chosen.len(), names.join(" → ")),
        clips: request
            .clips
            .iter()
            .zip(&chosen)
            .enumerate()
            .map(|(index, (clip, segment))| RemixClip {
                asset_id: segment.asset_id,
                start_ms: clip.start_ms as u32,
                end_ms: clip.end_ms as u32,
                reason: format!(
                    "第 {} 段 · {} · 片段 {}",
                    index + 1,
                    label_name(&segment.label_key),
                    clip.segment_id
                ),
            })
            .collect(),
    };
    let run_id = runs::create_and_produce(&mut tx, owner, run, &run_sources).await?;
    let segments: Vec<Value> = request
        .clips
        .iter()
        .zip(&chosen)
        .map(|(clip, s)| json!({"segmentId": clip.segment_id, "assetId": s.asset_id, "startMs": clip.start_ms, "endMs": clip.end_ms, "labelKey": s.label_key, "sourceContentHash": s.source_content_hash}))
        .collect();
    sqlx::query("INSERT INTO ads.content_remix_batch_runs (batch_id, ordinal, run_id, combination_hash, segments) VALUES ($1, 1, $2, $3, $4)")
        .bind(batch_id).bind(run_id).bind(edit_hash(&request.clips, untrimmed)).bind(json!(segments))
        .execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    super::remix_read::detail(pool, settings, owner, Some(owner), batch_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(start_ms: i32, end_ms: i32) -> RemixEditClip {
        RemixEditClip {
            segment_id: Uuid::from_u128(1),
            start_ms,
            end_ms,
        }
    }

    fn at(asset: u128, start_ms: i32, end_ms: i32) -> Interval {
        Interval {
            asset_id: Uuid::from_u128(asset),
            start_ms,
            end_ms,
        }
    }

    #[test]
    fn shape_bounds_clip_count_length_and_total() {
        assert!(validate_shape("framework", 1, &[clip(0, 3_000)], 600).is_ok());
        assert!(validate_shape("framework", 1, &[], 600).is_err());
        assert!(validate_shape("framework", 0, &[clip(0, 3_000)], 600).is_err());
        assert!(validate_shape("framework", 1, &[clip(0, 999), clip(0, 5_000)], 600).is_err());
        assert!(validate_shape("framework", 1, &[clip(-1, 5_000)], 600).is_err());
        assert!(validate_shape("framework", 1, &[clip(0, 2_000)], 600).is_err());
        assert!(validate_shape("framework", 1, &[clip(0, 61_000)], 60).is_err());
        // Hostile bounds whose i32 difference would overflow are rejected, not wrapped.
        assert!(
            validate_shape("framework", 1, &[clip(2_000_000_000, -2_000_000_000)], 600).is_err()
        );
        assert!(validate_shape("framework", 1, &[clip(0, i32::MAX)], 600).is_err());
        let many = vec![clip(0, 1_000); MAX_EDIT_CLIPS + 1];
        assert!(validate_shape("framework", 1, &many, 600).is_err());
    }

    #[test]
    fn overlap_is_shared_time_over_the_longer_edit() {
        let a = [at(1, 0, 10_000), at(2, 0, 10_000)];
        assert_eq!(overlap(&a, &a), 1.0);
        // Reordered clips share all source time.
        assert_eq!(overlap(&a, &[at(2, 0, 10_000), at(1, 0, 10_000)]), 1.0);
        // A short trim of a long output is not similar to it.
        assert_eq!(overlap(&a, &[at(1, 0, 4_000)]), 0.2);
        assert_eq!(overlap(&a, &[at(1, 0, 10_000), at(2, 0, 7_000)]), 0.85);
        assert_eq!(overlap(&a, &[at(3, 0, 20_000)]), 0.0);
        // Overlapping clips inside one edit are not counted twice.
        let doubled = [at(1, 0, 10_000), at(1, 5_000, 10_000)];
        assert!(overlap(&doubled, &[at(1, 0, 10_000)]) <= 1.0);
    }

    #[test]
    fn digest_ignores_allow_duplicate_and_tracks_cuts() {
        let request = |end_ms: i32, allow_duplicate: bool| CreateRemixEditRequest {
            idempotency_key: "edit-1".into(),
            preset_key: "framework".into(),
            preset_version: 1,
            clips: vec![clip(0, end_ms)],
            allow_duplicate,
        };
        assert_eq!(
            digest(&request(5_000, false)),
            digest(&request(5_000, true))
        );
        assert_ne!(
            digest(&request(5_000, false)),
            digest(&request(4_000, false))
        );
    }

    #[test]
    fn untrimmed_edits_share_the_framework_hash() {
        let clips = [clip(0, 5_000)];
        assert_eq!(
            edit_hash(&clips, true),
            combination_hash(&[Uuid::from_u128(1)])
        );
        assert_ne!(edit_hash(&clips, false), edit_hash(&clips, true));
        assert_eq!(edit_hash(&clips, false).len(), 64);
    }
}
