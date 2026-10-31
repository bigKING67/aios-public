// SQLx 0.9 audit: SQL fragments come from fixed constants and allowlisted filters; request values remain bound.
//! The 成片 batch list: keyset pages newest first, filtered by type and by whether a
//! batch still has outputs to watch, plus per-type counts over the viewer's whole scope
//! (the owner's batches in scoped access, every batch in open access).
use super::access::batch_in_enterprise_sql;
use super::error::StudioResult;
use super::remix_read::{attach_owner_names, batch_from_row, BATCH_SELECT};
use super::remix_types::{
    RemixBatch, RemixBatchCounts, RemixBatchListQuery, RemixBatchListResponse, RemixBatchModeCounts,
};
use super::repository::db_error;
use crate::config::Settings;
use crate::error::AppError;
use sqlx::{PgPool, Row};
use uuid::Uuid;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;
const MODES: [&str; 3] = ["framework", "sellingPoint", "edit"];
/// Same default as `batch_from_row`: a batch without a stored mode is 框架混剪.
const MODE_SQL: &str = "COALESCE(b.structure->>'mode', 'framework')";
/// Same rule as the client's `isRemixBatchWithoutOutputs`, on `BATCH_SELECT`'s columns:
/// nothing left to play and nothing still rendering.
const WITHOUT_OUTPUTS_SQL: &str = "q.available = 0 AND q.running = 0 AND q.rejected < q.total";
const WITH_OUTPUTS_SQL: &str = "(q.available > 0 OR q.running > 0)";
/// Same rule as the client's `remixBatchPendingReviewCount`: a reviewable output without a
/// review for its current asset.
const PENDING_REVIEW_SQL: &str = "q.reviewable > q.approved + q.rejected";

struct Cursor {
    created_at: String,
    batch_id: Uuid,
}

fn encode_cursor(batch: &RemixBatch) -> String {
    hex::encode(format!("{}|{}", batch.created_at, batch.batch_id))
}

fn decode_cursor(value: &str) -> Result<Cursor, AppError> {
    let invalid = || AppError::bad_request("cursor 无效，请从第一页重新加载");
    let bytes = hex::decode(value).map_err(|_| invalid())?;
    let text = String::from_utf8(bytes).map_err(|_| invalid())?;
    let (created_at, batch_id) = text.rsplit_once('|').ok_or_else(invalid)?;
    Ok(Cursor {
        created_at: created_at.to_owned(),
        batch_id: Uuid::parse_str(batch_id).map_err(|_| invalid())?,
    })
}

/// Rows to skip for a numbered page (1-based); keyset paging through `cursor` starts at 0.
fn page_offset(page: Option<i64>, limit: i64, has_cursor: bool) -> Result<i64, AppError> {
    match page {
        None => Ok(0),
        Some(_) if has_cursor => Err(AppError::bad_request("page 和 cursor 只能二选一")),
        Some(page) if page < 1 => Err(AppError::bad_request("page 需从 1 开始")),
        Some(page) => (page - 1)
            .checked_mul(limit)
            .ok_or_else(|| AppError::bad_request("page 超出范围")),
    }
}

/// The `review` filter as a fixed predicate on the grouped batch row.
fn review_filter(review: Option<&str>) -> Result<&'static str, AppError> {
    match review {
        None => Ok("TRUE"),
        Some("pending") => Ok(PENDING_REVIEW_SQL),
        Some("rejected") => Ok("q.rejected > 0"),
        Some(_) => Err(AppError::bad_request("review 只能是 pending 或 rejected")),
    }
}

/// The `outputs` filter as a fixed predicate on the grouped batch row.
fn outputs_filter(outputs: Option<&str>) -> Result<&'static str, AppError> {
    match outputs {
        None => Ok("TRUE"),
        Some("with") => Ok(WITH_OUTPUTS_SQL),
        Some("without") => Ok(WITHOUT_OUTPUTS_SQL),
        Some(_) => Err(AppError::bad_request("outputs 只能是 with 或 without")),
    }
}

pub(super) async fn list(
    pool: &PgPool,
    settings: &Settings,
    viewer: &str,
    owner: Option<&str>,
    enterprise_tag: Option<&str>,
    query: &RemixBatchListQuery,
) -> StudioResult<RemixBatchListResponse> {
    let mode = query.mode.as_deref();
    if mode.is_some_and(|mode| !MODES.contains(&mode)) {
        return Err(AppError::bad_request("mode 只能是 framework、sellingPoint 或 edit").into());
    }
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::bad_request(format!("limit 需在 1 到 {MAX_LIMIT} 之间")).into());
    }
    let outputs = outputs_filter(query.outputs.as_deref())?;
    let review = review_filter(query.review.as_deref())?;
    let quality = match query.quality.as_deref() {
        None => "TRUE",
        Some("failed") => "q.qc_failed > 0",
        Some(_) => return Err(AppError::bad_request("quality 只能是 failed").into()),
    };
    let cursor = query.cursor.as_deref().map(decode_cursor).transpose()?;
    let offset = page_offset(query.page, limit, cursor.is_some())?;

    // Mode and cursor narrow the batches before grouping; the outputs filter needs the
    // grouped counts. One extra row tells whether another page follows.
    let sql = format!(
        "SELECT q.* FROM ({BATCH_SELECT} AND {} AND ($4::TEXT IS NULL OR {MODE_SQL} = $4) \
         AND ($5::TEXT IS NULL OR (b.created_at, b.batch_id) < ($5::TEXT::TIMESTAMPTZ, $6::UUID)) \
         GROUP BY b.batch_id) q WHERE {outputs} AND {review} AND {quality} ORDER BY q.created_at_ts DESC, q.batch_id DESC LIMIT $2 OFFSET $7",
        batch_in_enterprise_sql(3)
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(owner)
        .bind(limit + 1)
        .bind(enterprise_tag)
        .bind(mode)
        .bind(cursor.as_ref().map(|cursor| cursor.created_at.as_str()))
        .bind(cursor.as_ref().map(|cursor| cursor.batch_id))
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    let more = rows.len() as i64 > limit;
    let mut items: Vec<RemixBatch> = rows
        .iter()
        .take(limit as usize)
        .map(|row| batch_from_row(row, viewer, Some(settings)))
        .collect();
    attach_owner_names(pool, &mut items).await;
    let next_cursor = if more {
        items.last().map(encode_cursor)
    } else {
        None
    };

    Ok(RemixBatchListResponse {
        items,
        next_cursor,
        counts: counts(pool, owner, enterprise_tag).await?,
    })
}

/// Every batch in scope by type, split by whether it still has outputs to watch, plus the
/// batches waiting for review.
async fn counts(
    pool: &PgPool,
    owner: Option<&str>,
    enterprise_tag: Option<&str>,
) -> StudioResult<RemixBatchCounts> {
    // The planner drops `BATCH_SELECT`'s unused cover and failure subqueries here.
    let sql = format!(
        "SELECT COALESCE(q.structure->>'mode', 'framework') AS mode, ({WITHOUT_OUTPUTS_SQL}) AS without_outputs, \
         ({PENDING_REVIEW_SQL}) AS pending_review, (q.qc_failed > 0) AS qc_failed, (q.rejected > 0) AS has_rejected, (q.available > 0 OR q.running > 0) AS with_outputs, COUNT(*)::BIGINT AS batches \
         FROM ({BATCH_SELECT} AND {} GROUP BY b.batch_id) q GROUP BY 1, 2, 3, 4, 5, 6",
        batch_in_enterprise_sql(2)
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(owner)
        .bind(enterprise_tag)
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    let mut counts = RemixBatchCounts::default();
    for row in rows {
        let mode: String = row.get("mode");
        let batches: i64 = row.get("batches");
        if row.get::<bool, _>("without_outputs") {
            add(&mut counts.without_outputs, &mode, batches);
        }
        if row.get::<bool, _>("with_outputs") {
            add(&mut counts.with_outputs, &mode, batches);
        }
        if row.get::<bool, _>("has_rejected") {
            add(&mut counts.rejected, &mode, batches);
        }
        if row.get::<bool, _>("qc_failed") {
            add(&mut counts.qc_failed, &mode, batches);
        }
        if row.get::<bool, _>("pending_review") {
            add(&mut counts.pending_review, &mode, batches);
        }
    }
    Ok(counts)
}

fn add(counts: &mut RemixBatchModeCounts, mode: &str, batches: i64) {
    counts.all += batches;
    match mode {
        "sellingPoint" => counts.selling_point += batches,
        "edit" => counts.edit += batches,
        // Unknown stored modes read as 框架混剪, as `batch_from_row` does.
        _ => counts.framework += batches,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_round_trips_and_rejects_garbage() {
        let id = Uuid::parse_str("22fa108e-803c-4967-9287-b6cc6e955f2d").unwrap();
        let encoded = hex::encode(format!("2026-10-22 22:37:12.5+08|{id}"));
        let cursor = decode_cursor(&encoded).unwrap();
        assert_eq!(cursor.created_at, "2026-10-22 22:37:12.5+08");
        assert_eq!(cursor.batch_id, id);
        assert!(decode_cursor("not base64!").is_err());
        assert!(decode_cursor(&hex::encode("no-separator")).is_err());
        assert!(decode_cursor(&hex::encode("2026-10-22|not-a-uuid")).is_err());
    }

    #[test]
    fn outputs_filter_is_allowlisted() {
        assert_eq!(outputs_filter(None).unwrap(), "TRUE");
        assert_eq!(
            outputs_filter(Some("without")).unwrap(),
            WITHOUT_OUTPUTS_SQL
        );
        assert_eq!(outputs_filter(Some("with")).unwrap(), WITH_OUTPUTS_SQL);
        assert!(outputs_filter(Some("1 OR 1=1")).is_err());
        assert_eq!(review_filter(None).unwrap(), "TRUE");
        assert_eq!(review_filter(Some("pending")).unwrap(), PENDING_REVIEW_SQL);
        assert!(review_filter(Some("approved")).is_err());
    }

    #[test]
    fn page_offset_skips_whole_pages_and_rejects_bad_input() {
        assert_eq!(page_offset(None, 20, false).unwrap(), 0);
        assert_eq!(page_offset(None, 20, true).unwrap(), 0);
        assert_eq!(page_offset(Some(1), 20, false).unwrap(), 0);
        assert_eq!(page_offset(Some(3), 20, false).unwrap(), 40);
        assert!(page_offset(Some(0), 20, false).is_err());
        assert!(page_offset(Some(2), 20, true).is_err());
        assert!(page_offset(Some(i64::MAX), 20, false).is_err());
    }

    #[test]
    fn counts_fold_unknown_modes_into_framework() {
        let mut counts = RemixBatchModeCounts::default();
        add(&mut counts, "sellingPoint", 2);
        add(&mut counts, "edit", 1);
        add(&mut counts, "legacy", 3);
        assert_eq!(
            (
                counts.all,
                counts.framework,
                counts.selling_point,
                counts.edit
            ),
            (6, 3, 2, 1)
        );
    }
}
