//! 框架混剪批次. Candidates are confirmed segments of one preset version whose
//! label fills a slot, whose `product_name` equals the requested product
//! exactly and whose content hash still equals the raw asset. Every candidate
//! asset must also pass the production source binding (edit permission —
//! skipped in open studio access — rights window, readiness, bucket, raw hash,
//! duration). Combinations are deterministic (`remix_combos`); each one becomes
//! a framework_remix Run owned by the batch creator whose host plan is frozen
//! and dispatched in the same transaction as the batch. No model call is made.
//! Batches are visible to their owner, or to every signed-in user in open
//! access (`remix_read`).
use super::access::StudioAccess;
use super::domain;
use super::error::{ConflictCode, StudioError, StudioResult};
use super::remix_combos::{self, Candidate, Combination, Selection};
use super::remix_types::{
    CreateRemixBatchRequest, RemixBatchDetail, RemixBatchPreviewRequest, RemixBatchPreviewResponse,
    RemixSlotAvailability,
};
use super::repository::{active_preset_labels, db_error};
use super::types::SegmentPresetLabel;
use crate::marketing::content_assets::production::framework_remix::{
    self as runs, RemixClip, RemixRun, RemixSource,
};
use crate::{
    auth::CurrentUser,
    config::Settings,
    error::{AppError, AppResult},
};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, PgPool, Row};
use std::collections::{BTreeSet, HashMap, HashSet};
use uuid::Uuid;

pub(super) const MAX_SLOTS: usize = 30;
const MAX_CANDIDATES_PER_LABEL: i64 = 200;
const TITLE_PRODUCT_CHARS: usize = 40;

/// Studio flag first (shared guard), then the remix flag and the Runs
/// pipeline it renders through.
pub(super) fn ensure_enabled(settings: &Settings) -> AppResult<()> {
    if !settings.content_ai_studio_remix_enabled {
        return Err(AppError::ServiceUnavailable("框架混剪尚未启用".into()));
    }
    if !settings.content_production_enabled || !settings.content_production_runs_enabled {
        return Err(AppError::ServiceUnavailable(
            "持久制作任务尚未启用，框架混剪无法排队渲染".into(),
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct Normalized {
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) labels: Option<Vec<String>>,
    pub(super) source_asset_id: Option<Uuid>,
    pub(super) product_name: String,
    pub(super) count: usize,
}

impl Normalized {
    /// SHA-256 of the canonical input; seeds the shuffle and fences idempotency.
    pub(super) fn digest(&self) -> String {
        let canonical = json!({
            "presetKey": self.preset_key,
            "presetVersion": self.preset_version,
            "labels": self.labels,
            "sourceAssetId": self.source_asset_id,
            "productName": self.product_name,
            "count": self.count,
        });
        hex::encode(Sha256::digest(canonical.to_string().as_bytes()))
    }
}

pub(super) fn seed(digest: &str) -> u64 {
    u64::from_str_radix(&digest[..16], 16).unwrap_or(0)
}

pub(super) fn normalize(
    request: &RemixBatchPreviewRequest,
    max_per_batch: usize,
) -> AppResult<Normalized> {
    domain::validate_key(&request.preset_key, "presetKey")?;
    if request.preset_version < 1 {
        return Err(AppError::bad_request("presetVersion 必须为正数"));
    }
    let labels = match (&request.labels, request.source_asset_id) {
        (Some(labels), None) => {
            if labels.is_empty() || labels.len() > MAX_SLOTS {
                return Err(AppError::bad_request(format!(
                    "框架结构需包含 1–{MAX_SLOTS} 个标签"
                )));
            }
            for label in labels {
                domain::validate_key(label, "labels")?;
            }
            Some(labels.clone())
        }
        (None, Some(_)) => None,
        _ => {
            return Err(AppError::bad_request(
                "结构需二选一：手动标签序列 labels 或参考原片 sourceAssetId",
            ))
        }
    };
    let product_name = domain::normalize_product_name(Some(&request.product_name))?
        .ok_or_else(|| AppError::bad_request("请指定产品，框架混剪只组合同一产品的片段"))?;
    let count = usize::try_from(request.count).unwrap_or(0);
    if !(1..=max_per_batch).contains(&count) {
        return Err(AppError::bad_request(format!(
            "每批可生成 1–{max_per_batch} 条"
        )));
    }
    Ok(Normalized {
        preset_key: request.preset_key.clone(),
        preset_version: request.preset_version,
        labels,
        source_asset_id: request.source_asset_id,
        product_name,
        count,
    })
}

pub(super) fn preview_request(request: &CreateRemixBatchRequest) -> RemixBatchPreviewRequest {
    RemixBatchPreviewRequest {
        preset_key: request.preset_key.clone(),
        preset_version: request.preset_version,
        labels: request.labels.clone(),
        source_asset_id: request.source_asset_id,
        product_name: request.product_name.clone(),
        count: request.count,
    }
}

pub(super) struct Plan {
    pub(super) labels: Vec<String>,
    pub(super) preset_labels: Vec<SegmentPresetLabel>,
    pub(super) slots: Vec<Vec<Candidate>>,
    pub(super) sources: HashMap<Uuid, RemixSource>,
    pub(super) excluded_assets: usize,
    pub(super) selection: Selection,
    pub(super) seed: u64,
}

/// The reference original's current confirmed segments in time order: their
/// labels are the slot structure, their ids the combination a batch must not
/// reproduce (an output identical to the original is not a remix).
async fn structure_from_asset(
    db: &mut PgConnection,
    n: &Normalized,
    asset_id: Uuid,
    enterprise_tag: Option<&str>,
) -> StudioResult<(Vec<String>, Vec<Uuid>)> {
    let rows: Vec<(String, Uuid)> = sqlx::query_as("SELECT s.label_key, s.segment_id FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.asset_id = $1 AND a.is_deleted = FALSE AND s.preset_key = $2 AND s.preset_version = $3 AND s.status = 'confirmed' AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) AND ($4::TEXT IS NULL OR $4 = ANY(a.tags)) ORDER BY s.start_ms, s.segment_id")
        .bind(asset_id).bind(&n.preset_key).bind(n.preset_version).bind(enterprise_tag)
        .fetch_all(&mut *db).await.map_err(db_error)?;
    let (labels, ids): (Vec<String>, Vec<Uuid>) = rows.into_iter().unzip();
    if labels.is_empty() {
        return Err(AppError::bad_request("参考原片在该预设版本下没有当前有效的已确认片段").into());
    }
    if labels.len() > MAX_SLOTS {
        return Err(AppError::bad_request(format!(
            "参考原片有 {} 段，超过 {MAX_SLOTS} 个槽位上限，请改用手动标签序列",
            labels.len()
        ))
        .into());
    }
    Ok((labels, ids))
}

async fn load_candidates(
    db: &mut PgConnection,
    n: &Normalized,
    labels: &BTreeSet<String>,
    enterprise_tag: Option<&str>,
) -> StudioResult<Vec<Candidate>> {
    let labels: Vec<String> = labels.iter().cloned().collect();
    let rows = sqlx::query("SELECT segment_id, asset_id, start_ms, end_ms, label_key, source_content_hash FROM (SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.label_key ORDER BY s.asset_id, s.start_ms, s.segment_id) AS rank FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.preset_key = $1 AND s.preset_version = $2 AND s.status = 'confirmed' AND s.label_key = ANY($3) AND s.product_name = $4 AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) AND ($6::TEXT IS NULL OR $6 = ANY(a.tags))) ranked WHERE rank <= $5 ORDER BY label_key, asset_id, start_ms, segment_id")
        .bind(&n.preset_key).bind(n.preset_version).bind(&labels).bind(&n.product_name).bind(MAX_CANDIDATES_PER_LABEL).bind(enterprise_tag)
        .fetch_all(&mut *db).await.map_err(db_error)?;
    Ok(rows
        .into_iter()
        .map(|row| Candidate {
            segment_id: row.get("segment_id"),
            asset_id: row.get("asset_id"),
            start_ms: row.get("start_ms"),
            end_ms: row.get("end_ms"),
            label_key: row.get("label_key"),
            source_content_hash: row.get("source_content_hash"),
        })
        .collect())
}

/// Combination hashes of every batch this user created (never repeated).
pub(super) async fn used_hashes(
    db: &mut PgConnection,
    owner: &str,
) -> StudioResult<HashSet<String>> {
    let hashes: Vec<String> = sqlx::query_scalar("SELECT r.combination_hash FROM ads.content_remix_batch_runs r JOIN ads.content_remix_batches b USING (batch_id) WHERE b.owner_user_id = $1")
        .bind(owner).fetch_all(&mut *db).await.map_err(db_error)?;
    Ok(hashes.into_iter().collect())
}

pub(super) async fn build_plan(
    pool: &PgPool,
    settings: &Settings,
    db: &mut PgConnection,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    n: &Normalized,
    used: &HashSet<String>,
) -> StudioResult<Plan> {
    let preset_labels = active_preset_labels(db, &n.preset_key, n.preset_version).await?;
    let (labels, reference) = match (&n.labels, n.source_asset_id) {
        (Some(labels), _) => (labels.clone(), None),
        (None, Some(asset_id)) => {
            let (labels, ids) =
                structure_from_asset(db, n, asset_id, access.enterprise_tag()).await?;
            (labels, Some(remix_combos::combination_hash(&ids)))
        }
        (None, None) => return Err(AppError::Internal.into()),
    };
    for label in &labels {
        domain::ensure_label(&preset_labels, label)?;
    }
    let distinct: BTreeSet<String> = labels.iter().cloned().collect();
    let candidates = load_candidates(db, n, &distinct, access.enterprise_tag()).await?;
    let asset_ids: BTreeSet<Uuid> = candidates.iter().map(|c| c.asset_id).collect();
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
    let max_ms = u64::from(settings.content_ai_studio_remix_max_seconds) * 1000;
    let usable = |c: &Candidate| {
        sources.get(&c.asset_id).is_some_and(|source| {
            source.sha256() == c.source_content_hash
                && u32::try_from(c.end_ms).is_ok_and(|end| end <= source.duration_ms())
        }) && (100..=max_ms).contains(&c.duration_ms())
    };
    let slots: Vec<Vec<Candidate>> = labels
        .iter()
        .map(|label| {
            candidates
                .iter()
                .filter(|c| &c.label_key == label && usable(c))
                .cloned()
                .collect()
        })
        .collect();
    let seed = seed(&n.digest());
    let selection = remix_combos::select(&slots, n.count, seed, max_ms, used, reference.as_deref());
    Ok(Plan {
        labels,
        preset_labels,
        slots,
        sources,
        excluded_assets,
        selection,
        seed,
    })
}

fn label_name<'a>(plan: &'a Plan, key: &'a str) -> &'a str {
    plan.preset_labels
        .iter()
        .find(|label| label.key == key)
        .map_or(key, |label| label.name.as_str())
}

pub(super) fn shortfall_reason(plan: &Plan, requested: usize) -> Option<String> {
    let missing: Vec<String> = plan
        .labels
        .iter()
        .enumerate()
        .filter(|(index, _)| plan.slots[*index].is_empty())
        .map(|(index, key)| format!("第{}位·{}", index + 1, label_name(plan, key)))
        .collect();
    if !missing.is_empty() {
        return Some(format!(
            "以下框架槽位没有同产品的可用已确认片段：{}",
            missing.join("、")
        ));
    }
    let selection = &plan.selection;
    if (selection.combos.len()) >= requested {
        return None;
    }
    let counts: Vec<String> = plan.slots.iter().map(|s| s.len().to_string()).collect();
    Some(format!(
        "可用组合{}{} 种，少于请求的 {requested} 条（各槽位候选 {}；已排除同一片段重复、总时长越界{}）",
        if selection.exact { "只有 " } else { "抽样只找到 " },
        selection.combos.len(),
        counts.join(" × "),
        if selection.previously_used > 0 {
            format!("及此前批次已用的 {} 种", selection.previously_used)
        } else {
            String::new()
        }
    ))
}

pub(super) fn preview_response(n: &Normalized, plan: &Plan) -> RemixBatchPreviewResponse {
    let to_i64 = |value: u64| i64::try_from(value).unwrap_or(i64::MAX);
    RemixBatchPreviewResponse {
        labels: plan.labels.clone(),
        source_asset_id: n.source_asset_id,
        product_name: n.product_name.clone(),
        slots: plan
            .labels
            .iter()
            .zip(&plan.slots)
            .enumerate()
            .map(|(index, (label, slot))| RemixSlotAvailability {
                ordinal: index as i32 + 1,
                label_key: label.clone(),
                candidate_count: slot.len() as i32,
            })
            .collect(),
        missing_labels: plan
            .labels
            .iter()
            .zip(&plan.slots)
            .filter(|(_, slot)| slot.is_empty())
            .map(|(label, _)| label.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        excluded_asset_count: plan.excluded_assets as i32,
        theoretical_combinations: to_i64(plan.selection.theoretical),
        available_combinations: to_i64(plan.selection.available),
        available_is_lower_bound: !plan.selection.exact,
        previously_used_combinations: to_i64(plan.selection.previously_used),
        reference_combination_excluded: plan.selection.reference_excluded,
        requested_count: n.count as i32,
        plannable_count: plan.selection.combos.len() as i32,
        shortfall_reason: shortfall_reason(plan, n.count),
        seed: plan.seed as i64,
    }
}

pub(super) async fn preview(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    request: &RemixBatchPreviewRequest,
) -> StudioResult<RemixBatchPreviewResponse> {
    let n = normalize(request, settings.content_ai_studio_remix_max_per_batch)?;
    let mut db = pool.acquire().await.map_err(db_error)?;
    let used = used_hashes(&mut db, &user.user_id).await?;
    let plan = build_plan(pool, settings, &mut db, user, access, &n, &used).await?;
    Ok(preview_response(&n, &plan))
}

pub(super) fn validate_idempotency_key(key: &str) -> AppResult<()> {
    if key.is_empty()
        || key.len() > 100
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    {
        return Err(AppError::bad_request(
            "幂等键需为 1–100 位字母、数字、_ 或 -",
        ));
    }
    Ok(())
}

fn picked<'a>(plan: &'a Plan, combo: &Combination) -> Vec<&'a Candidate> {
    combo
        .picks
        .iter()
        .zip(&plan.slots)
        .map(|(pick, slot)| &slot[*pick])
        .collect()
}

/// Rechecks every chosen segment under a share lock: still confirmed, bound to
/// the current raw content hash, and unchanged in preset, label, product and
/// boundaries since the plan was read (a confirmed segment may be edited in
/// place, which would otherwise freeze stale cut points into a Run).
pub(super) async fn lock_segments(
    db: &mut PgConnection,
    plan: &Plan,
    n: &Normalized,
) -> StudioResult<()> {
    let chosen: HashMap<Uuid, &Candidate> = plan
        .selection
        .combos
        .iter()
        .flat_map(|combo| picked(plan, combo))
        .map(|c| (c.segment_id, c))
        .collect();
    let mut ids: Vec<Uuid> = chosen.keys().copied().collect();
    ids.sort();
    let rows = sqlx::query("SELECT s.segment_id, s.start_ms, s.end_ms, s.label_key, s.source_content_hash FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.segment_id = ANY($1) AND s.status = 'confirmed' AND s.preset_key = $2 AND s.preset_version = $3 AND s.product_name = $4 AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) ORDER BY s.segment_id FOR SHARE OF s")
        .bind(&ids).bind(&n.preset_key).bind(n.preset_version).bind(&n.product_name)
        .fetch_all(&mut *db).await.map_err(db_error)?;
    let current: HashSet<Uuid> = rows
        .iter()
        .filter(|row| {
            let id: Uuid = row.get("segment_id");
            chosen.get(&id).is_some_and(|c| {
                c.start_ms == row.get::<i32, _>("start_ms")
                    && c.end_ms == row.get::<i32, _>("end_ms")
                    && c.label_key == row.get::<String, _>("label_key")
                    && c.source_content_hash == row.get::<String, _>("source_content_hash")
            })
        })
        .map(|row| row.get("segment_id"))
        .collect();
    let changed: Vec<Uuid> = ids.into_iter().filter(|id| !current.contains(id)).collect();
    if !changed.is_empty() {
        return Err(StudioError::conflict(
            ConflictCode::SourceChanged,
            "所选片段已变化（取消确认、改动或原片更新），请重新预览",
            changed,
        ));
    }
    Ok(())
}

pub(super) async fn active_runs(db: &mut PgConnection, owner: &str) -> StudioResult<usize> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ads.content_remix_batch_runs br JOIN ads.content_remix_batches b USING (batch_id) JOIN ads.content_production_runs r ON r.run_id = br.run_id WHERE b.owner_user_id = $1 AND r.status IN ('queued', 'running', 'cancelling')")
        .bind(owner).fetch_one(&mut *db).await.map_err(db_error)?;
    Ok(usize::try_from(count).unwrap_or(usize::MAX))
}

fn remix_run(
    plan: &Plan,
    batch_id: Uuid,
    ordinal: usize,
    combo: &Combination,
    product: &str,
) -> RemixRun {
    let chosen = picked(plan, combo);
    let names: Vec<&str> = plan
        .labels
        .iter()
        .map(|key| label_name(plan, key))
        .collect();
    let short_product: String = product.chars().take(TITLE_PRODUCT_CHARS).collect();
    let batch = batch_id.simple().to_string();
    RemixRun {
        idempotency_key: format!("remix-{batch}-{ordinal}"),
        title: format!("框架混剪 · {short_product} · {}-{ordinal:02}", &batch[..8]),
        brief: format!(
            "框架混剪（{}），保留各片段原声，不调用模型规划",
            names.join(" → ")
        ),
        summary: format!(
            "按框架顺序确定性组合 {} 段：{}",
            chosen.len(),
            names.join(" → ")
        ),
        clips: chosen
            .iter()
            .enumerate()
            .map(|(index, c)| RemixClip {
                asset_id: c.asset_id,
                start_ms: c.start_ms as u32,
                end_ms: c.end_ms as u32,
                reason: format!(
                    "槽位 {} · {} · 片段 {}",
                    index + 1,
                    label_name(plan, &c.label_key),
                    c.segment_id
                ),
            })
            .collect(),
    }
}

pub(super) async fn create(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    request: &CreateRemixBatchRequest,
) -> StudioResult<RemixBatchDetail> {
    validate_idempotency_key(&request.idempotency_key)?;
    let n = normalize(
        &preview_request(request),
        settings.content_ai_studio_remix_max_per_batch,
    )?;
    let digest = n.digest();
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
                "幂等键已用于不同的混剪请求",
                Vec::new(),
            ));
        }
        let batch_id: Uuid = row.get("batch_id");
        tx.commit().await.map_err(db_error)?;
        return super::remix_read::detail(pool, settings, owner, Some(owner), batch_id).await;
    }
    let used = used_hashes(&mut tx, owner).await?;
    let plan = build_plan(pool, settings, &mut tx, user, access, &n, &used).await?;
    let planned = plan.selection.combos.len();
    if planned == 0 {
        return Err(StudioError::conflict(
            ConflictCode::RemixUnavailable,
            shortfall_reason(&plan, n.count).unwrap_or_else(|| "没有可用组合".into()),
            Vec::new(),
        ));
    }
    let active = active_runs(&mut tx, owner).await?;
    if active + planned > settings.content_ai_studio_remix_max_active {
        return Err(StudioError::conflict(
            ConflictCode::RemixActiveLimit,
            format!(
                "排队中的框架混剪已有 {active} 条，本批 {planned} 条将超过上限 {}，请等待完成后再提交",
                settings.content_ai_studio_remix_max_active
            ),
            Vec::new(),
        ));
    }
    lock_segments(&mut tx, &plan, &n).await?;
    let batch_id = Uuid::new_v4();
    let structure = json!({"labels": plan.labels, "sourceAssetId": n.source_asset_id});
    sqlx::query("INSERT INTO ads.content_remix_batches (batch_id, owner_user_id, idempotency_key, request_digest, preset_key, preset_version, structure, constraints, requested_count, planned_count, seed, shortfall_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)")
        .bind(batch_id).bind(owner).bind(&request.idempotency_key).bind(&digest)
        .bind(&n.preset_key).bind(n.preset_version).bind(&structure)
        .bind(json!({"productName": n.product_name})).bind(n.count as i32).bind(planned as i32)
        .bind(plan.seed as i64).bind(shortfall_reason(&plan, n.count))
        .execute(&mut *tx).await.map_err(db_error)?;
    for (index, combo) in plan.selection.combos.iter().enumerate() {
        let ordinal = index + 1;
        let chosen = picked(&plan, combo);
        let sources: Vec<&RemixSource> = chosen
            .iter()
            .filter_map(|c| plan.sources.get(&c.asset_id))
            .collect();
        let run_id = runs::create_and_produce(
            &mut tx,
            owner,
            remix_run(&plan, batch_id, ordinal, combo, &n.product_name),
            &sources,
        )
        .await?;
        let segments: Vec<_> = chosen
            .iter()
            .map(|c| json!({"segmentId": c.segment_id, "assetId": c.asset_id, "startMs": c.start_ms, "endMs": c.end_ms, "labelKey": c.label_key, "sourceContentHash": c.source_content_hash}))
            .collect();
        sqlx::query("INSERT INTO ads.content_remix_batch_runs (batch_id, ordinal, run_id, combination_hash, segments) VALUES ($1, $2, $3, $4, $5)")
            .bind(batch_id).bind(ordinal as i32).bind(run_id).bind(&combo.hash).bind(json!(segments))
            .execute(&mut *tx).await.map_err(db_error)?;
    }
    tx.commit().await.map_err(db_error)?;
    super::remix_read::detail(pool, settings, owner, Some(owner), batch_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> RemixBatchPreviewRequest {
        RemixBatchPreviewRequest {
            preset_key: "framework".into(),
            preset_version: 1,
            labels: Some(vec!["mixed_voiceover".into(), "street_interview".into()]),
            source_asset_id: None,
            product_name: " 精华 ".into(),
            count: 3,
        }
    }

    #[test]
    fn normalization_requires_one_structure_product_and_bounded_count() {
        let n = normalize(&request(), 10).unwrap();
        assert_eq!(n.product_name, "精华");
        assert_eq!(n.count, 3);
        let mut both = request();
        both.source_asset_id = Some(Uuid::nil());
        assert!(normalize(&both, 10).is_err());
        let mut neither = request();
        neither.labels = None;
        assert!(normalize(&neither, 10).is_err());
        let mut reference = neither.clone();
        reference.source_asset_id = Some(Uuid::nil());
        assert!(normalize(&reference, 10).is_ok());
        let mut blank = request();
        blank.product_name = "  ".into();
        assert!(normalize(&blank, 10).is_err());
        for count in [0, 11, -1] {
            let mut bad = request();
            bad.count = count;
            assert!(normalize(&bad, 10).is_err());
        }
        let mut long = request();
        long.labels = Some(vec!["a".into(); MAX_SLOTS + 1]);
        assert!(normalize(&long, 10).is_err());
        let mut bad_key = request();
        bad_key.labels = Some(vec!["Bad".into()]);
        assert!(normalize(&bad_key, 10).is_err());
    }

    #[test]
    fn digest_is_stable_and_input_sensitive() {
        let a = normalize(&request(), 10).unwrap();
        let mut other = request();
        other.count = 4;
        let b = normalize(&other, 10).unwrap();
        assert_eq!(a.digest(), normalize(&request(), 10).unwrap().digest());
        assert_ne!(a.digest(), b.digest());
        assert_ne!(seed(&a.digest()), seed(&b.digest()));
    }

    #[test]
    fn idempotency_keys_are_bounded_ascii() {
        assert!(validate_idempotency_key("remix-1_a").is_ok());
        assert!(validate_idempotency_key("").is_err());
        assert!(validate_idempotency_key("有").is_err());
        assert!(validate_idempotency_key(&"a".repeat(101)).is_err());
    }
}
