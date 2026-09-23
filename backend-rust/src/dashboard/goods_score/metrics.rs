use super::types::{GoodsScoreCandidate, GoodsScoreDimension, TopsisMetricDefinition};

pub(super) fn topsis_metrics() -> Vec<TopsisMetricDefinition> {
    vec![
        TopsisMetricDefinition {
            key: "curr_gmv",
            weight: 0.18,
            dimension: GoodsScoreDimension::Scale,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "sales_share",
            weight: 0.12,
            dimension: GoodsScoreDimension::Scale,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "pay_conversion_rate",
            weight: 0.12,
            dimension: GoodsScoreDimension::Efficiency,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "avg_order_value",
            weight: 0.08,
            dimension: GoodsScoreDimension::Efficiency,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "gsv_rate",
            weight: 0.10,
            dimension: GoodsScoreDimension::Efficiency,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "gmv_wow",
            weight: 0.12,
            dimension: GoodsScoreDimension::Growth,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "pay_buyer_wow",
            weight: 0.08,
            dimension: GoodsScoreDimension::Growth,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "visitor_wow",
            weight: 0.05,
            dimension: GoodsScoreDimension::Growth,
            is_cost: false,
        },
        TopsisMetricDefinition {
            key: "refund_rate",
            weight: 0.15,
            dimension: GoodsScoreDimension::Risk,
            is_cost: true,
        },
    ]
}

pub(super) fn topsis_dimension_weight(dimension: GoodsScoreDimension) -> f64 {
    match dimension {
        GoodsScoreDimension::Scale => 0.30,
        GoodsScoreDimension::Efficiency => 0.30,
        GoodsScoreDimension::Growth => 0.25,
        GoodsScoreDimension::Risk => 0.15,
    }
}

pub(super) fn pick_topsis_metric_value(
    metric: &TopsisMetricDefinition,
    candidate: &GoodsScoreCandidate,
) -> f64 {
    match metric.key {
        "curr_gmv" => candidate.curr_gmv,
        "sales_share" => candidate.sales_share,
        "pay_conversion_rate" => candidate.pay_conversion_rate,
        "avg_order_value" => candidate.avg_order_value,
        "gsv_rate" => {
            if candidate.curr_gmv <= f64::EPSILON {
                0.0
            } else {
                candidate.curr_gsv / candidate.curr_gmv
            }
        }
        "gmv_wow" => candidate.gmv_wow,
        "pay_buyer_wow" => candidate.pay_buyer_wow,
        "visitor_wow" => candidate.visitor_wow,
        "refund_rate" => {
            if candidate.curr_gmv <= f64::EPSILON {
                1.0
            } else {
                candidate.refund_amount / candidate.curr_gmv
            }
        }
        _ => 0.0,
    }
}
