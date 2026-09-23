use sqlx::PgPool;

use super::{
    periods::{normalize_week_period_for_api, normalize_week_period_for_db},
    GoodsChannelAttributionData,
};
use crate::error::AppResult;

mod ads;
mod fallback;
mod rows;
mod sql;

pub(super) async fn build_weekly_goods_channel_attribution(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<GoodsChannelAttributionData>> {
    let normalized = normalize_week_period_for_db(week_period);
    let Some(ads_rows) = ads::query_ads_rows(pool, normalized.as_str()).await? else {
        return fallback::build_from_dwd(pool, week_period).await;
    };

    let as_of_date = rows::first_as_of_date(&ads_rows);
    let mapped_rows = rows::map_channel_rows(ads_rows);

    Ok(vec![GoodsChannelAttributionData {
        platform: "taobao".to_string(),
        week_period: normalize_week_period_for_api(week_period),
        as_of_date,
        total_pay_amount: mapped_rows.total_pay_amount,
        total_prev_pay_amount: mapped_rows.total_prev_pay_amount,
        items: mapped_rows.items,
    }])
}
