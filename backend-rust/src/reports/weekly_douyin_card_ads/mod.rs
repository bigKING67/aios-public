mod products;
mod query;
mod sources;
mod types;

use serde_json::json;
use sqlx::PgPool;

use self::{
    products::query_product_attribution_items, query::query_weekly_card_ads_summary,
    sources::query_source_items,
};
use super::periods::normalize_week_period_for_api;
use crate::error::AppResult;

pub(super) async fn try_build_weekly_douyin_card_attribution_from_ads(
    pool: &PgPool,
    normalized_week_period: &str,
    week_period: &str,
) -> AppResult<Option<Vec<serde_json::Value>>> {
    let Some(summary) = query_weekly_card_ads_summary(pool, normalized_week_period).await? else {
        return Ok(None);
    };

    let Some(product_result) =
        query_product_attribution_items(pool, normalized_week_period).await?
    else {
        return Ok(None);
    };

    let source_items = if product_result.diagnosis_product_id.is_empty() {
        vec![]
    } else {
        let Some(source_items) = query_source_items(
            pool,
            normalized_week_period,
            product_result.diagnosis_product_id.as_str(),
        )
        .await?
        else {
            return Ok(None);
        };
        source_items
    };

    Ok(Some(vec![json!({
        "platform": "douyin",
        "week_period": normalize_week_period_for_api(week_period),
        "as_of_date": summary.as_of_date.map(|value| value.to_string()),
        "observed_days": summary.observed_days,
        "total_curr_gmv": summary.total_curr_gmv,
        "total_prev_gmv": summary.total_prev_gmv,
        "diagnosis_product_id": product_result.diagnosis_product_id,
        "diagnosis_product_name": product_result.diagnosis_product_name,
        "product_items": product_result.product_items,
        "source_items": source_items
    })]))
}
