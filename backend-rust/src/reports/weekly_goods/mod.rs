use sqlx::PgPool;

use super::{
    periods::{normalize_week_period_for_api, normalize_week_period_for_db},
    GoodsAttributionData,
};
use crate::error::AppResult;

mod ads;
mod fallback;
mod rows;
mod sql;

pub(super) async fn build_weekly_goods_attribution(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<GoodsAttributionData>> {
    let normalized = normalize_week_period_for_db(week_period);
    let Some(ads_rows) = ads::query_ads_rows(pool, normalized.as_str()).await? else {
        return fallback::build_from_ods(pool, week_period).await;
    };

    let as_of_date = rows::first_as_of_date(&ads_rows);
    let (total_gmv, total_prev_gmv) = rows::first_totals(&ads_rows);
    let items = rows::map_product_rows(ads_rows);

    Ok(vec![GoodsAttributionData {
        platform: "taobao".to_string(),
        week_period: normalize_week_period_for_api(week_period),
        as_of_date,
        total_gmv,
        total_prev_gmv,
        items,
    }])
}
