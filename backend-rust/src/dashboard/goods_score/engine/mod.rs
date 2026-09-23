use std::collections::HashMap;

use super::types::{GoodsScoreCandidate, GoodsScoreResult};

mod profile;
mod ranking;
mod weighted;

pub(crate) fn build_goods_score_result(candidates: Vec<GoodsScoreCandidate>) -> GoodsScoreResult {
    if candidates.is_empty() {
        return GoodsScoreResult {
            score_by_product_id: HashMap::new(),
            ranking: Vec::new(),
            candidate_count: 0,
        };
    }

    let weighted_by_metric = weighted::build_weighted_metric_data(candidates.as_slice());
    let mut profiles =
        profile::build_goods_score_profiles(candidates.as_slice(), weighted_by_metric.as_slice());
    profiles.sort_by(profile::sort_profiles);

    let candidate_count = candidates.len();
    let (score_by_product_id, ranking) = ranking::build_goods_score_ranking(&profiles);

    GoodsScoreResult {
        score_by_product_id,
        ranking,
        candidate_count,
    }
}
