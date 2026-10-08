//! Segment persistence. Segments are annotations of shared library assets:
//! any signed-in content user may read them, writes require the existing
//! content-asset edit permission on the source asset (open studio access only
//! requires a sign-in), and `owner_user_id` records the creator. Confirmed
//! intervals of one (asset, preset) never overlap: an advisory lock + explicit
//! check reports the conflicting ids, and the database exclusion constraint
//! is the race backstop.
use super::super::permissions::ensure_content_asset_edit_permission;
use super::super::repository::query_asset_by_id;
use super::access::StudioAccess;
use super::domain;
use super::error::{ConflictCode, StudioError, StudioResult};
use super::types::{
    ConfirmContentSegmentsRequest, ConfirmContentSegmentsResponse, ContentSegment,
    ContentSegmentListQuery, ContentSegmentListResponse, CreateContentSegmentRequest,
    SegmentPreset, SegmentPresetLabel, UpdateContentSegmentRequest,
};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
};
use serde_json::Value;
use sqlx::{postgres::PgRow, PgConnection, PgPool, Row};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use uuid::Uuid;

const SEGMENT_SELECT: &str = "SELECT s.segment_id, s.owner_user_id, s.asset_id, a.title AS asset_title, s.source_content_hash, COALESCE(LOWER(TRIM(a.raw_sha256)) = s.source_content_hash, FALSE) AS source_current, s.source_duration_ms, s.start_ms, s.end_ms, s.preset_key, s.preset_version, s.label_key, s.product_name, s.origin, s.status, s.evidence, s.revision, s.confirmed_by, s.confirmed_at::TEXT AS confirmed_at, s.created_at::TEXT AS created_at, s.updated_at::TEXT AS updated_at FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id";

/// The exclusion-constraint race backstop cannot name the winner, so the
/// overlap conflict carries no segment ids.
pub(super) fn db_error(error: sqlx::Error) -> StudioError {
    if let sqlx::Error::Database(database) = &error {
        if database.code().as_deref() == Some("23P01") {
            return StudioError::conflict(
                ConflictCode::SegmentOverlap,
                "与已确认片段时间重叠，请刷新后调整",
                Vec::new(),
            );
        }
    }
    tracing::error!(?error, "content ai studio database operation failed");
    AppError::Internal.into()
}

fn segment_from_row(row: &PgRow) -> ContentSegment {
    ContentSegment {
        segment_id: row.get("segment_id"),
        owner_user_id: row.get("owner_user_id"),
        asset_id: row.get("asset_id"),
        asset_title: row.get("asset_title"),
        source_content_hash: row.get("source_content_hash"),
        source_current: row.get("source_current"),
        source_duration_ms: row.get("source_duration_ms"),
        start_ms: row.get("start_ms"),
        end_ms: row.get("end_ms"),
        preset_key: row.get("preset_key"),
        preset_version: row.get("preset_version"),
        label_key: row.get("label_key"),
        product_name: row.get("product_name"),
        origin: row.get("origin"),
        status: row.get("status"),
        evidence: row.get("evidence"),
        revision: row.get("revision"),
        confirmed_by: row.get("confirmed_by"),
        confirmed_at: row.get("confirmed_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        cover_url: None,
    }
}

fn parse_labels(value: Value) -> AppResult<Vec<SegmentPresetLabel>> {
    serde_json::from_value(value).map_err(|error| {
        tracing::error!(?error, "stored segment preset labels are invalid");
        AppError::Internal
    })
}

pub(super) async fn list_presets(pool: &PgPool) -> StudioResult<Vec<SegmentPreset>> {
    let rows = sqlx::query("SELECT preset_key, version, dimension, name, labels, status FROM ads.content_segment_presets WHERE status = 'active' ORDER BY preset_key, version DESC")
        .fetch_all(pool).await.map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            Ok(SegmentPreset {
                preset_key: row.get("preset_key"),
                version: row.get("version"),
                dimension: row.get("dimension"),
                name: row.get("name"),
                labels: parse_labels(row.get("labels"))?,
                status: row.get("status"),
            })
        })
        .collect()
}

/// Active preset labels; unknown or retired presets cannot receive new writes.
pub(super) async fn active_preset_labels(
    db: &mut PgConnection,
    preset_key: &str,
    version: i32,
) -> StudioResult<Vec<SegmentPresetLabel>> {
    let row = sqlx::query("SELECT labels, status FROM ads.content_segment_presets WHERE preset_key = $1 AND version = $2")
        .bind(preset_key).bind(version).fetch_optional(&mut *db).await.map_err(db_error)?
        .ok_or_else(|| AppError::bad_request("分类预设不存在"))?;
    if row.get::<String, _>("status") != "active" {
        return Err(AppError::bad_request("分类预设已停用，不能写入或确认片段").into());
    }
    Ok(parse_labels(row.get("labels"))?)
}

pub(super) struct AssetFacts {
    pub(super) sha256: String,
    duration_ms: Option<i32>,
    product_name: Option<String>,
}

/// Scoped access requires the caller's edit permission on the asset; open
/// access only requires the asset to exist. Readiness and hash always apply.
pub(super) async fn writable_asset(
    pool: &PgPool,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    asset_id: Uuid,
) -> StudioResult<AssetFacts> {
    let asset = if access.is_open() {
        query_asset_by_id(pool, asset_id)
            .await?
            .ok_or(AppError::NotFound)?
    } else {
        ensure_content_asset_edit_permission(pool, user, asset_id).await?
    };
    ensure_enterprise(access, &asset.tags)?;
    if asset.external_only || asset.asset_status != "ready" {
        return Err(AppError::bad_request("素材必须是已就绪的原片").into());
    }
    let sha256 = domain::normalize_sha256(asset.raw_sha256.as_deref())
        .ok_or_else(|| AppError::bad_request("素材缺少已验证的原片摘要"))?;
    Ok(AssetFacts {
        sha256,
        duration_ms: domain::duration_ms(asset.duration_seconds),
        // An over-long legacy product name is not inherited rather than truncated.
        product_name: domain::normalize_product_name(asset.product_name.as_deref())
            .ok()
            .flatten(),
    })
}

/// Rejects an original outside the configured enterprise (`企业:<name>` tag).
pub(super) fn ensure_enterprise(access: StudioAccess<'_>, tags: &[String]) -> AppResult<()> {
    match access.enterprise_tag() {
        Some(tag) if !tags.iter().any(|t| t == tag) => Err(AppError::bad_request(
            "素材不属于当前企业，不能在 AI 创作中心使用",
        )),
        _ => Ok(()),
    }
}

/// Marks every segment bound to an older content hash of the asset as stale.
/// Runs outside the caller's transaction so the fact survives a rejected write.
async fn mark_stale(pool: &PgPool, asset_id: Uuid, current_sha256: &str) -> StudioResult<()> {
    sqlx::query("UPDATE ads.content_segments SET status = 'stale', revision = revision + 1, updated_at = NOW() WHERE asset_id = $1 AND source_content_hash <> $2 AND status <> 'stale'")
        .bind(asset_id).bind(current_sha256).execute(pool).await.map_err(db_error)?;
    Ok(())
}

async fn lock_interval_scope(
    db: &mut PgConnection,
    asset_id: Uuid,
    preset_key: &str,
) -> StudioResult<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))")
        .bind(asset_id.to_string())
        .bind(preset_key)
        .execute(&mut *db)
        .await
        .map_err(db_error)?;
    Ok(())
}

async fn ensure_no_confirmed_overlap(
    db: &mut PgConnection,
    asset_id: Uuid,
    preset_key: &str,
    range: (i32, i32),
    exclude: &[Uuid],
) -> StudioResult<()> {
    let conflicts: Vec<Uuid> = sqlx::query_scalar("SELECT segment_id FROM ads.content_segments WHERE asset_id = $1 AND preset_key = $2 AND status = 'confirmed' AND start_ms < $4 AND end_ms > $3 AND NOT (segment_id = ANY($5)) ORDER BY start_ms, segment_id LIMIT 10")
        .bind(asset_id).bind(preset_key).bind(range.0).bind(range.1).bind(exclude)
        .fetch_all(&mut *db).await.map_err(db_error)?;
    if conflicts.is_empty() {
        return Ok(());
    }
    Err(overlap_conflict(conflicts))
}

fn overlap_conflict(ids: Vec<Uuid>) -> StudioError {
    let text = ids
        .iter()
        .map(Uuid::to_string)
        .collect::<Vec<_>>()
        .join(",");
    StudioError::conflict(
        ConflictCode::SegmentOverlap,
        format!("与已确认片段时间重叠：{text}"),
        ids,
    )
}

fn stale_conflict(detail: String, id: Uuid) -> StudioError {
    StudioError::conflict(ConflictCode::StaleSegment, detail, vec![id])
}

fn revision_conflict(detail: String, id: Uuid) -> StudioError {
    StudioError::conflict(ConflictCode::RevisionConflict, detail, vec![id])
}

pub(super) async fn fetch_segment(pool: &PgPool, id: Uuid) -> StudioResult<Option<ContentSegment>> {
    let row = sqlx::query(&format!(
        "{SEGMENT_SELECT} WHERE s.segment_id = $1 AND a.is_deleted = FALSE"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    Ok(row.as_ref().map(segment_from_row))
}

pub(super) async fn list_segments(
    pool: &PgPool,
    query: ContentSegmentListQuery,
    enterprise_tag: Option<&str>,
) -> StudioResult<ContentSegmentListResponse> {
    let limit = domain::list_limit(&query)?;
    if let Some(cursor) = query.cursor {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM ads.content_segments WHERE segment_id = $1)",
        )
        .bind(cursor)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
        if !exists {
            return Err(AppError::bad_request("cursor 无效").into());
        }
    }
    let product = domain::normalize_product_name(query.product_name.as_deref())?;
    let sql = format!("{SEGMENT_SELECT} WHERE a.is_deleted = FALSE AND ($1::UUID IS NULL OR s.asset_id = $1) AND ($2::TEXT IS NULL OR s.preset_key = $2) AND ($3::TEXT IS NULL OR s.label_key = $3) AND ($4::TEXT IS NULL OR s.product_name = $4) AND ($5::TEXT IS NULL OR s.status = $5) AND ($6::TEXT IS NULL OR s.origin = $6) AND ($7::UUID IS NULL OR (s.asset_id, s.preset_key, s.start_ms, s.segment_id) > (SELECT c.asset_id, c.preset_key, c.start_ms, c.segment_id FROM ads.content_segments c WHERE c.segment_id = $7)) AND ($9::BOOL IS NOT TRUE OR NULLIF(BTRIM(s.product_name), '') IS NULL) AND ($10::TEXT IS NULL OR $10 = ANY(a.tags)) ORDER BY s.asset_id, s.preset_key, s.start_ms, s.segment_id LIMIT $8");
    let rows = sqlx::query(&sql)
        .bind(query.asset_id)
        .bind(query.preset_key)
        .bind(query.label_key)
        .bind(product)
        .bind(query.status)
        .bind(query.origin)
        .bind(query.cursor)
        .bind(limit + 1)
        .bind(query.without_product)
        .bind(enterprise_tag)
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    let mut items: Vec<ContentSegment> = rows.iter().map(segment_from_row).collect();
    let next_cursor = if items.len() as i64 > limit {
        items.truncate(limit as usize);
        items.last().map(|item| item.segment_id)
    } else {
        None
    };
    Ok(ContentSegmentListResponse {
        items,
        next_cursor,
        assets: Vec::new(),
    })
}

pub(super) async fn create_segment(
    pool: &PgPool,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    request: CreateContentSegmentRequest,
) -> StudioResult<ContentSegment> {
    domain::validate_key(&request.preset_key, "presetKey")?;
    domain::validate_key(&request.label_key, "labelKey")?;
    let asset = writable_asset(pool, user, access, request.asset_id).await?;
    mark_stale(pool, request.asset_id, &asset.sha256).await?;
    if let Some(expected) = request.source_content_hash.as_deref() {
        let expected = domain::normalize_sha256(Some(expected))
            .ok_or_else(|| AppError::bad_request("sourceContentHash 必须是 64 位十六进制摘要"))?;
        if expected != asset.sha256 {
            return Err(StudioError::conflict(
                ConflictCode::SourceChanged,
                "原片已变化，请刷新后重新标注",
                Vec::new(),
            ));
        }
    }
    domain::validate_range(request.start_ms, request.end_ms, asset.duration_ms)?;
    let product_name =
        domain::normalize_product_name(request.product_name.as_deref())?.or(asset.product_name);
    let status = if request.draft {
        "suggested"
    } else {
        "confirmed"
    };
    let mut tx = pool.begin().await.map_err(db_error)?;
    let labels = active_preset_labels(&mut tx, &request.preset_key, request.preset_version).await?;
    domain::ensure_label(&labels, &request.label_key)?;
    if status == "confirmed" {
        lock_interval_scope(&mut tx, request.asset_id, &request.preset_key).await?;
        ensure_no_confirmed_overlap(
            &mut tx,
            request.asset_id,
            &request.preset_key,
            (request.start_ms, request.end_ms),
            &[],
        )
        .await?;
    }
    let segment_id = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, source_duration_ms, start_ms, end_ms, preset_key, preset_version, label_key, product_name, origin, status, confirmed_by, confirmed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'human', $12, CASE WHEN $12 = 'confirmed' THEN $2 END, CASE WHEN $12 = 'confirmed' THEN NOW() END)")
        .bind(segment_id).bind(&user.user_id).bind(request.asset_id).bind(&asset.sha256)
        .bind(asset.duration_ms).bind(request.start_ms).bind(request.end_ms)
        .bind(&request.preset_key).bind(request.preset_version).bind(&request.label_key)
        .bind(product_name).bind(status)
        .execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(fetch_segment(pool, segment_id)
        .await?
        .ok_or(AppError::Internal)?)
}

pub(super) async fn update_segment(
    pool: &PgPool,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    segment_id: Uuid,
    request: UpdateContentSegmentRequest,
) -> StudioResult<ContentSegment> {
    if request.start_ms.is_none()
        && request.end_ms.is_none()
        && request.label_key.is_none()
        && request.product_name.is_none()
        && request.status.is_none()
    {
        return Err(AppError::bad_request("没有需要修改的字段").into());
    }
    if let Some(label_key) = request.label_key.as_deref() {
        domain::validate_key(label_key, "labelKey")?;
    }
    if let Some(status) = request.status.as_deref() {
        domain::validate_client_status(status)?;
    }
    let existing = fetch_segment(pool, segment_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let asset = writable_asset(pool, user, access, existing.asset_id).await?;
    mark_stale(pool, existing.asset_id, &asset.sha256).await?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let row = sqlx::query("SELECT revision, status, source_content_hash, start_ms, end_ms, preset_key, preset_version, label_key, product_name FROM ads.content_segments WHERE segment_id = $1 FOR UPDATE")
        .bind(segment_id).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    if row.get::<String, _>("status") == "stale"
        || row.get::<String, _>("source_content_hash") != asset.sha256
    {
        return Err(stale_conflict(
            "原片已变化，片段已标记为过期，不能修改".into(),
            segment_id,
        ));
    }
    if row.get::<i32, _>("revision") != request.expected_revision {
        return Err(revision_conflict(
            "片段已被修改，请刷新后重试".into(),
            segment_id,
        ));
    }
    let start_ms = request.start_ms.unwrap_or(row.get("start_ms"));
    let end_ms = request.end_ms.unwrap_or(row.get("end_ms"));
    domain::validate_range(start_ms, end_ms, asset.duration_ms)?;
    let preset_key: String = row.get("preset_key");
    let current_label: String = row.get("label_key");
    let label_key = request.label_key.unwrap_or(current_label.clone());
    let status = request.status.unwrap_or_else(|| row.get("status"));
    if label_key != current_label || status == "confirmed" {
        let labels = active_preset_labels(&mut tx, &preset_key, row.get("preset_version")).await?;
        domain::ensure_label(&labels, &label_key)?;
    }
    if status == "confirmed" {
        lock_interval_scope(&mut tx, existing.asset_id, &preset_key).await?;
        ensure_no_confirmed_overlap(
            &mut tx,
            existing.asset_id,
            &preset_key,
            (start_ms, end_ms),
            &[segment_id],
        )
        .await?;
    }
    // A confirmed segment keeps its confirmer when only the product changes;
    // new bounds, label or a fresh confirmation record the editing user.
    let product_name = match request.product_name.as_deref() {
        Some(value) => domain::normalize_product_name(Some(value))?,
        None => row.get("product_name"),
    };
    sqlx::query("UPDATE ads.content_segments SET start_ms = $2, end_ms = $3, label_key = $4, product_name = $5, status = $6, source_duration_ms = $7, confirmed_by = CASE WHEN $6 = 'confirmed' THEN (CASE WHEN status = 'confirmed' AND start_ms = $2 AND end_ms = $3 AND label_key = $4 THEN confirmed_by ELSE $8 END) END, confirmed_at = CASE WHEN $6 = 'confirmed' THEN (CASE WHEN status = 'confirmed' AND start_ms = $2 AND end_ms = $3 AND label_key = $4 THEN confirmed_at ELSE NOW() END) END, revision = revision + 1, updated_at = NOW() WHERE segment_id = $1")
        .bind(segment_id).bind(start_ms).bind(end_ms).bind(&label_key).bind(product_name)
        .bind(&status).bind(asset.duration_ms).bind(&user.user_id)
        .execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(fetch_segment(pool, segment_id)
        .await?
        .ok_or(AppError::Internal)?)
}

struct ConfirmRow {
    asset_id: Uuid,
    preset_key: String,
    preset_version: i32,
    range: (i32, i32),
}

pub(super) async fn confirm_segments(
    pool: &PgPool,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    request: ConfirmContentSegmentsRequest,
) -> StudioResult<ConfirmContentSegmentsResponse> {
    if request.items.is_empty() || request.items.len() > domain::MAX_CONFIRM_ITEMS {
        return Err(AppError::bad_request("一次确认 1–200 个片段").into());
    }
    let expected: HashMap<Uuid, i32> = request
        .items
        .iter()
        .map(|item| (item.segment_id, item.expected_revision))
        .collect();
    if expected.len() != request.items.len() {
        return Err(AppError::bad_request("确认列表包含重复片段").into());
    }
    let mut ids: Vec<Uuid> = expected.keys().copied().collect();
    ids.sort();
    let assets: Vec<Uuid> = sqlx::query_scalar("SELECT DISTINCT s.asset_id FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.segment_id = ANY($1) AND a.is_deleted = FALSE")
        .bind(&ids).fetch_all(pool).await.map_err(db_error)?;
    let mut hashes = HashMap::new();
    for asset_id in assets {
        let asset = writable_asset(pool, user, access, asset_id).await?;
        mark_stale(pool, asset_id, &asset.sha256).await?;
        hashes.insert(asset_id, asset.sha256);
    }
    let mut tx = pool.begin().await.map_err(db_error)?;
    let rows = sqlx::query("SELECT segment_id, asset_id, revision, status, source_content_hash, preset_key, preset_version, start_ms, end_ms FROM ads.content_segments WHERE segment_id = ANY($1) ORDER BY segment_id FOR UPDATE")
        .bind(&ids).fetch_all(&mut *tx).await.map_err(db_error)?;
    if rows.len() != ids.len() {
        return Err(AppError::NotFound.into());
    }
    let mut batch: BTreeMap<Uuid, ConfirmRow> = BTreeMap::new();
    for row in &rows {
        let id: Uuid = row.get("segment_id");
        let asset_id: Uuid = row.get("asset_id");
        let current = hashes.get(&asset_id).ok_or(AppError::NotFound)?;
        if row.get::<String, _>("status") == "stale"
            || &row.get::<String, _>("source_content_hash") != current
        {
            return Err(stale_conflict(
                format!("原片已变化，片段已标记为过期：{id}"),
                id,
            ));
        }
        if Some(&row.get::<i32, _>("revision")) != expected.get(&id) {
            return Err(revision_conflict(
                format!("片段已被修改，请刷新后重试：{id}"),
                id,
            ));
        }
        batch.insert(
            id,
            ConfirmRow {
                asset_id,
                preset_key: row.get("preset_key"),
                preset_version: row.get("preset_version"),
                range: (row.get("start_ms"), row.get("end_ms")),
            },
        );
    }
    let presets: BTreeSet<(String, i32)> = batch
        .values()
        .map(|row| (row.preset_key.clone(), row.preset_version))
        .collect();
    for (key, version) in &presets {
        active_preset_labels(&mut tx, key, *version).await?;
    }
    let scopes: BTreeSet<(Uuid, String)> = batch
        .values()
        .map(|row| (row.asset_id, row.preset_key.clone()))
        .collect();
    for (asset_id, preset_key) in &scopes {
        lock_interval_scope(&mut tx, *asset_id, preset_key).await?;
    }
    let entries: Vec<(&Uuid, &ConfirmRow)> = batch.iter().collect();
    for (index, (id, row)) in entries.iter().enumerate() {
        for (other_id, other) in &entries[index + 1..] {
            if row.asset_id == other.asset_id
                && row.preset_key == other.preset_key
                && domain::overlaps(row.range, other.range)
            {
                return Err(StudioError::conflict(
                    ConflictCode::BatchOverlap,
                    format!("所选片段之间时间重叠：{id},{other_id}"),
                    vec![**id, **other_id],
                ));
            }
        }
        ensure_no_confirmed_overlap(&mut tx, row.asset_id, &row.preset_key, row.range, &ids)
            .await?;
    }
    sqlx::query("UPDATE ads.content_segments SET status = 'confirmed', confirmed_by = $2, confirmed_at = NOW(), revision = revision + 1, updated_at = NOW() WHERE segment_id = ANY($1)")
        .bind(&ids).bind(&user.user_id).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    let mut items = Vec::with_capacity(request.items.len());
    for item in &request.items {
        items.push(
            fetch_segment(pool, item.segment_id)
                .await?
                .ok_or(AppError::Internal)?,
        );
    }
    Ok(ConfirmContentSegmentsResponse { items })
}
