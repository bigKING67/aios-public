use std::collections::HashMap;

use super::weighted::WeightedMetricData;
use crate::dashboard::goods_score::{
    metrics::topsis_dimension_weight,
    normalization::round_to_one_decimal,
    types::{GoodsScoreBreakdown, GoodsScoreCandidate, GoodsScoreDimension, GoodsScoreProfile},
};

pub(super) fn build_goods_score_profiles(
    candidates: &[GoodsScoreCandidate],
    weighted_by_metric: &[WeightedMetricData],
) -> Vec<GoodsScoreProfile> {
    candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| build_goods_score_profile(index, candidate, weighted_by_metric))
        .collect()
}

pub(super) fn sort_profiles(
    left: &GoodsScoreProfile,
    right: &GoodsScoreProfile,
) -> std::cmp::Ordering {
    if (right.closeness - left.closeness).abs() > f64::EPSILON {
        return right
            .closeness
            .partial_cmp(&left.closeness)
            .unwrap_or(std::cmp::Ordering::Equal);
    }
    if (right.curr_gmv - left.curr_gmv).abs() > f64::EPSILON {
        return right
            .curr_gmv
            .partial_cmp(&left.curr_gmv)
            .unwrap_or(std::cmp::Ordering::Equal);
    }
    left.product_id.cmp(&right.product_id)
}

fn build_goods_score_profile(
    index: usize,
    candidate: &GoodsScoreCandidate,
    weighted_by_metric: &[WeightedMetricData],
) -> GoodsScoreProfile {
    let mut positive_distance_square = 0.0;
    let mut negative_distance_square = 0.0;
    let mut weighted_by_dimension = base_dimension_scores();

    for metric_data in weighted_by_metric {
        let weighted_value = *metric_data.weighted_values.get(index).unwrap_or(&0.0);
        let positive_delta = weighted_value - metric_data.positive_ideal;
        let negative_delta = weighted_value - metric_data.negative_ideal;
        positive_distance_square += positive_delta * positive_delta;
        negative_distance_square += negative_delta * negative_delta;
        if let Some(dimension_total) = weighted_by_dimension.get_mut(&metric_data.metric.dimension)
        {
            *dimension_total += weighted_value;
        }
    }

    let closeness = topsis_closeness(
        positive_distance_square.sqrt(),
        negative_distance_square.sqrt(),
    );
    let score_breakdown = build_score_breakdown(&weighted_by_dimension);

    GoodsScoreProfile {
        product_id: candidate.product_id.clone(),
        product_name: candidate.product_name.clone(),
        curr_gmv: candidate.curr_gmv,
        gmv_wow: candidate.gmv_wow,
        score_confidence: resolve_goods_score_confidence(
            candidate.visitor_count,
            candidate.pay_buyer_count,
        ),
        score_breakdown,
        closeness,
        topsis_score: round_to_one_decimal(closeness * 10.0),
    }
}

fn base_dimension_scores() -> HashMap<GoodsScoreDimension, f64> {
    HashMap::from([
        (GoodsScoreDimension::Scale, 0.0),
        (GoodsScoreDimension::Efficiency, 0.0),
        (GoodsScoreDimension::Growth, 0.0),
        (GoodsScoreDimension::Risk, 0.0),
    ])
}

fn topsis_closeness(positive_distance: f64, negative_distance: f64) -> f64 {
    let denominator = positive_distance + negative_distance;
    if denominator <= f64::EPSILON {
        0.5
    } else {
        negative_distance / denominator
    }
}

fn build_score_breakdown(
    weighted_by_dimension: &HashMap<GoodsScoreDimension, f64>,
) -> GoodsScoreBreakdown {
    GoodsScoreBreakdown {
        scale: round_to_one_decimal(dimension_score(
            weighted_by_dimension,
            GoodsScoreDimension::Scale,
        )),
        efficiency: round_to_one_decimal(dimension_score(
            weighted_by_dimension,
            GoodsScoreDimension::Efficiency,
        )),
        growth: round_to_one_decimal(dimension_score(
            weighted_by_dimension,
            GoodsScoreDimension::Growth,
        )),
        risk: round_to_one_decimal(dimension_score(
            weighted_by_dimension,
            GoodsScoreDimension::Risk,
        )),
    }
}

fn dimension_score(
    weighted_by_dimension: &HashMap<GoodsScoreDimension, f64>,
    dimension: GoodsScoreDimension,
) -> f64 {
    weighted_by_dimension
        .get(&dimension)
        .copied()
        .unwrap_or(0.0)
        / topsis_dimension_weight(dimension)
        * 10.0
}

fn resolve_goods_score_confidence(visitor_count: f64, pay_buyer_count: f64) -> String {
    if visitor_count >= 500.0 && pay_buyer_count >= 30.0 {
        "high".to_string()
    } else if visitor_count >= 100.0 && pay_buyer_count >= 10.0 {
        "medium".to_string()
    } else {
        "low".to_string()
    }
}
