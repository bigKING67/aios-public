use sqlx::PgPool;

use super::{
    metrics::calculate_wow,
    periods::{normalize_week_period_for_api, normalize_week_period_for_db},
    quant_attribution::{build_goods_channel_quant_attribution, format_channel_list},
    GoodsChannelFunnelDiagnosisData,
};
use crate::error::AppResult;

mod queries;
mod row_mapping;
mod selection;

use queries::{
    load_paid_funnel_rows, load_product_scope, load_search_recommend_rows,
    load_selection_basis_rows,
};
use row_mapping::{extract_as_of_date, map_metric_rows, map_selection_basis_rows};
use selection::{
    build_channel_selection_details, build_quant_attribution_by_channel,
    derive_contributions_from_items, select_channels, select_items_for_channels,
};

pub(super) async fn build_weekly_goods_channel_funnel_diagnosis(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<GoodsChannelFunnelDiagnosisData>> {
    let normalized = normalize_week_period_for_db(week_period);

    let Some(product_scope) = load_product_scope(pool, normalized.as_str()).await? else {
        return Ok(Vec::new());
    };

    let paid_rows =
        load_paid_funnel_rows(pool, normalized.as_str(), product_scope.product_id.as_str()).await?;
    let search_recommend_rows =
        load_search_recommend_rows(pool, normalized.as_str(), product_scope.product_id.as_str())
            .await?;

    if paid_rows.is_empty() && search_recommend_rows.is_empty() {
        return Ok(Vec::new());
    }

    let as_of_date =
        extract_as_of_date(paid_rows.first().or_else(|| search_recommend_rows.first()));

    let mut all_items = map_metric_rows(paid_rows, product_scope.product_name.as_str());
    all_items.extend(map_metric_rows(
        search_recommend_rows,
        product_scope.product_name.as_str(),
    ));

    if all_items.is_empty() {
        return Ok(Vec::new());
    }

    let selection_basis_rows =
        load_selection_basis_rows(pool, normalized.as_str(), product_scope.product_id.as_str())
            .await?;

    let channel_delta_contributions = if selection_basis_rows.is_empty() {
        derive_contributions_from_items(all_items.as_slice())
    } else {
        map_selection_basis_rows(selection_basis_rows)
    };

    let product_gmv_wow = calculate_wow(product_scope.curr_gmv, product_scope.prev_gmv);
    let selected_channels =
        select_channels(channel_delta_contributions.as_slice(), product_gmv_wow);
    let mut selected_items =
        select_items_for_channels(all_items.as_slice(), selected_channels.as_slice());

    if selected_items.is_empty() {
        selected_items = all_items.iter().take(2).cloned().collect();
    }

    let selected_channel_details = build_channel_selection_details(
        selected_channels.as_slice(),
        channel_delta_contributions.as_slice(),
    );
    let channel_context = format_channel_list(selected_channels.as_slice());
    let quant_attribution =
        build_goods_channel_quant_attribution(selected_items.as_slice(), channel_context.as_str());
    let quant_attribution_by_channel =
        build_quant_attribution_by_channel(selected_channels.as_slice(), selected_items.as_slice());

    Ok(vec![GoodsChannelFunnelDiagnosisData {
        platform: "taobao".to_string(),
        week_period: normalize_week_period_for_api(week_period),
        as_of_date,
        product_id: product_scope.product_id,
        product_name: product_scope.product_name,
        product_curr_gmv: product_scope.curr_gmv,
        product_prev_gmv: product_scope.prev_gmv,
        product_gmv_wow,
        selected_channels,
        selected_channel_details,
        funnel_items: selected_items,
        quant_attribution,
        quant_attribution_by_channel,
    }])
}
