//! Paginated segment library, including original-spend filtering before pagination.
use super::{
    domain,
    error::StudioResult,
    repository::{db_error, segment_from_row, SEGMENT_SELECT},
    types::{ContentSegment, ContentSegmentListQuery, ContentSegmentListResponse},
};
use crate::error::AppError;
use sqlx::PgPool;

pub(super) async fn list_segments(
    pool: &PgPool,
    query: ContentSegmentListQuery,
    enterprise_tag: Option<&str>,
    min_spend: f64,
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
    if query
        .spend_class
        .as_deref()
        .is_some_and(|v| !["qualified", "low", "unknown"].contains(&v))
    {
        return Err(AppError::bad_request("spendClass 无效").into());
    }
    let mut db = pool.acquire().await.map_err(db_error)?;
    let ctes = super::admission::ctes(super::admission::installed(&mut db).await?, "$11");
    let select = SEGMENT_SELECT.replacen(
        " FROM",
        &format!(", {} FROM", super::admission::PROJECTION),
        1,
    );
    let join = super::admission::JOIN;
    let sql = format!("{ctes} {select} {join} WHERE a.is_deleted = FALSE AND ($1::UUID IS NULL OR s.asset_id = $1) AND ($2::TEXT IS NULL OR s.preset_key = $2) AND ($3::TEXT IS NULL OR s.label_key = $3 OR $3 = ANY(s.additional_label_keys)) AND ($4::TEXT IS NULL OR s.product_name = $4) AND ($5::TEXT IS NULL OR s.status = $5) AND ($6::TEXT IS NULL OR s.origin = $6) AND ($7::UUID IS NULL OR (s.asset_id, s.preset_key, s.start_ms, s.segment_id) > (SELECT c.asset_id, c.preset_key, c.start_ms, c.segment_id FROM ads.content_segments c WHERE c.segment_id = $7)) AND ($9::BOOL IS NOT TRUE OR NULLIF(BTRIM(s.product_name), '') IS NULL) AND ($10::TEXT IS NULL OR $10 = ANY(a.tags)) AND $11::FLOAT8 > 0 AND ($12::TEXT IS NULL OR COALESCE(spend.spend_class, 'unknown') = $12) ORDER BY s.asset_id, s.preset_key, s.start_ms, s.segment_id LIMIT $8");
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
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
        .bind(min_spend)
        .bind(query.spend_class)
        .fetch_all(&mut *db)
        .await
        .map_err(db_error)?;
    let mut items: Vec<ContentSegment> = rows
        .iter()
        .map(|row| {
            let mut item = segment_from_row(row);
            item.source_spend = Some(super::admission::from_row(row));
            item
        })
        .collect();
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
