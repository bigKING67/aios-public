use super::super::{
    metrics::{pick_topsis_metric_value, topsis_metrics},
    normalization::normalize_with_winsorized_min_max,
    types::GoodsScoreCandidate,
};
use crate::dashboard::goods_score::types::TopsisMetricDefinition;

#[derive(Debug, Clone)]
pub(super) struct WeightedMetricData {
    pub(super) metric: TopsisMetricDefinition,
    pub(super) weighted_values: Vec<f64>,
    pub(super) positive_ideal: f64,
    pub(super) negative_ideal: f64,
}

pub(super) fn build_weighted_metric_data(
    candidates: &[GoodsScoreCandidate],
) -> Vec<WeightedMetricData> {
    topsis_metrics()
        .iter()
        .map(|metric| {
            let raw_values = candidates
                .iter()
                .map(|candidate| pick_topsis_metric_value(metric, candidate))
                .collect::<Vec<_>>();
            let normalized_values =
                normalize_with_winsorized_min_max(raw_values.as_slice(), metric.is_cost);
            let weighted_values = normalized_values
                .iter()
                .map(|value| value * metric.weight)
                .collect::<Vec<_>>();
            let positive_ideal = weighted_values
                .iter()
                .copied()
                .fold(f64::NEG_INFINITY, |acc, value| acc.max(value));
            let negative_ideal = weighted_values
                .iter()
                .copied()
                .fold(f64::INFINITY, |acc, value| acc.min(value));
            WeightedMetricData {
                metric: *metric,
                weighted_values,
                positive_ideal,
                negative_ideal,
            }
        })
        .collect::<Vec<_>>()
}
