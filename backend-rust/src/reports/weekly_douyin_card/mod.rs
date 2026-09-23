use serde_json::json;
use sqlx::PgPool;

use super::{
    periods::{normalize_week_period_for_api, normalize_week_period_for_db, parse_week_period},
    weekly_douyin_card_ads::try_build_weekly_douyin_card_attribution_from_ads,
};
use crate::error::AppResult;

mod period_scope;
mod product;
mod queries;
mod sources;
mod sql;

pub(super) async fn build_weekly_douyin_card_attribution(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<serde_json::Value>> {
    let normalized = normalize_week_period_for_db(week_period);
    if let Some(result) =
        try_build_weekly_douyin_card_attribution_from_ads(pool, normalized.as_str(), week_period)
            .await?
    {
        return Ok(result);
    }

    let (week_start, week_end) = parse_week_period(week_period)?;
    let Some(window) =
        period_scope::resolve_attribution_window(pool, normalized.as_str(), week_start, week_end)
            .await?
    else {
        return Ok(Vec::new());
    };

    let Some(totals) = queries::query_card_gmv_totals(pool, &window).await? else {
        return Ok(Vec::new());
    };

    let prev_product_rows = queries::query_previous_product_rows(pool, &window).await?;
    let Some(product_rows) = queries::query_current_product_rows(pool, &window).await? else {
        return Ok(Vec::new());
    };
    let product::ProductAttribution {
        product_items,
        diagnosis_product_id,
        diagnosis_product_name,
    } = product::build_product_attribution(prev_product_rows, product_rows);

    let source_items = if diagnosis_product_id.is_empty() {
        Vec::new()
    } else {
        let current_source_rows =
            queries::query_current_source_rows(pool, &window, diagnosis_product_id.as_str())
                .await?;
        let prev_source_rows =
            queries::query_previous_source_rows(pool, &window, diagnosis_product_id.as_str())
                .await?;
        sources::build_source_items(current_source_rows, prev_source_rows)
    };

    Ok(vec![json!({
        "platform": "douyin",
        "week_period": normalize_week_period_for_api(week_period),
        "as_of_date": window.as_of_date.to_string(),
        "observed_days": window.observed_days,
        "total_curr_gmv": totals.total_curr_gmv,
        "total_prev_gmv": totals.total_prev_gmv,
        "diagnosis_product_id": diagnosis_product_id,
        "diagnosis_product_name": diagnosis_product_name,
        "product_items": product_items,
        "source_items": source_items
    })])
}
