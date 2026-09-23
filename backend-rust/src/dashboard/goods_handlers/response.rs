use serde_json::{json, Value};

use super::super::goods::{build_goods_score_candidates, DashboardGoodsMetricRow};
use super::super::goods_score::build_goods_score_result;
use super::super::validation::parse_date_literal;
use super::request::ValidatedGoodsQuery;

pub(super) fn build_goods_payload(
    query: &ValidatedGoodsQuery,
    as_of_date: &str,
    metrics_rows: &[DashboardGoodsMetricRow],
) -> Value {
    let summary_total_curr_gmv = metrics_rows
        .first()
        .map(|row| row.total_curr_gmv)
        .unwrap_or(0.0);
    let summary_total_prev_gmv = metrics_rows
        .first()
        .map(|row| row.total_prev_gmv)
        .unwrap_or(0.0);
    let summary_delta = summary_total_curr_gmv - summary_total_prev_gmv;
    let summary_delta_rate = if summary_total_prev_gmv.abs() > f64::EPSILON {
        Some(summary_delta / summary_total_prev_gmv)
    } else {
        None
    };

    let score_result = build_goods_score_result(build_goods_score_candidates(metrics_rows));
    let displayed_rows = metrics_rows.iter().take(query.top_n).collect::<Vec<_>>();

    let matrix = displayed_rows
        .iter()
        .map(|row| {
            json!({
                "productId": row.product_id,
                "productName": row.product_name,
                "currGmv": row.curr_gmv,
                "prevGmv": row.prev_gmv,
                "gmvDelta": row.gmv_delta,
                "salesShare": row.sales_share,
                "gmvWow": row.gmv_wow,
            })
        })
        .collect::<Vec<_>>();

    let table = displayed_rows
        .iter()
        .map(|row| {
            let score_card = score_result
                .score_by_product_id
                .get(row.product_id.as_str());
            json!({
                "productId": row.product_id,
                "productName": row.product_name,
                "currGmv": row.curr_gmv,
                "prevGmv": row.prev_gmv,
                "gmvDelta": row.gmv_delta,
                "gmvWow": row.gmv_wow,
                "currGsv": row.curr_gsv,
                "gsvWow": row.gsv_wow,
                "visitorCount": row.curr_visitor_count,
                "visitorWow": row.visitor_wow,
                "payBuyerCount": row.curr_pay_buyer_count,
                "payBuyerWow": row.pay_buyer_wow,
                "payConversionRate": row.pay_conversion_rate,
                "payConversionRateWow": row.pay_conversion_rate_wow,
                "avgOrderValue": row.avg_order_value,
                "avgOrderValueWow": row.avg_order_value_wow,
                "refundAmount": row.curr_refund_amount,
                "refundWow": row.refund_wow,
                "salesShare": row.sales_share,
                "topsisScore": score_card.map(|item| item.topsis_score),
                "topsisRank": score_card.map(|item| item.topsis_rank),
                "scoreConfidence": score_card.map(|item| item.score_confidence.clone()),
                "scoreBreakdown": score_card.map(|item| json!({
                    "scale": item.score_breakdown.scale,
                    "efficiency": item.score_breakdown.efficiency,
                    "growth": item.score_breakdown.growth,
                    "risk": item.score_breakdown.risk,
                })),
            })
        })
        .collect::<Vec<_>>();

    let score_ranking = score_result
        .ranking
        .iter()
        .take(query.top_n)
        .map(|item| {
            json!({
                "productId": item.product_id,
                "productName": item.product_name,
                "currGmv": item.curr_gmv,
                "gmvWow": item.gmv_wow,
                "topsisScore": item.topsis_score,
                "topsisRank": item.topsis_rank,
                "scoreConfidence": item.score_confidence,
                "scoreBreakdown": {
                    "scale": item.score_breakdown.scale,
                    "efficiency": item.score_breakdown.efficiency,
                    "growth": item.score_breakdown.growth,
                    "risk": item.score_breakdown.risk,
                },
            })
        })
        .collect::<Vec<_>>();

    let observed_days = match (
        parse_date_literal(query.start_date.as_str()),
        parse_date_literal(as_of_date),
    ) {
        (Some(start), Some(as_of)) if as_of >= start => {
            as_of.signed_duration_since(start).num_days() + 1
        }
        _ => 0,
    };

    json!({
        "startDate": query.start_date.as_str(),
        "endDate": query.end_date.as_str(),
        "prevStartDate": query.prev_start_date.as_str(),
        "prevEndDate": query.prev_end_date.as_str(),
        "platform": query.platform.as_str(),
        "topN": query.top_n,
        "scorePoolN": score_result.candidate_count,
        "asOfDate": as_of_date,
        "summary": {
            "totalCurrGmv": summary_total_curr_gmv,
            "totalPrevGmv": summary_total_prev_gmv,
            "delta": summary_delta,
            "deltaRate": summary_delta_rate,
            "observedDays": observed_days,
        },
        "matrix": matrix,
        "table": table,
        "scoreRanking": score_ranking,
    })
}
