use std::collections::HashMap;

use crate::dashboard::goods_score::types::{
    GoodsScoreCard, GoodsScoreProfile, GoodsScoreRankingRow,
};

pub(super) fn build_goods_score_ranking(
    profiles: &[GoodsScoreProfile],
) -> (HashMap<String, GoodsScoreCard>, Vec<GoodsScoreRankingRow>) {
    let mut ranking = Vec::<GoodsScoreRankingRow>::with_capacity(profiles.len());
    let mut score_by_product_id = HashMap::<String, GoodsScoreCard>::with_capacity(profiles.len());

    for (index, profile) in profiles.iter().enumerate() {
        let rank = index + 1;
        score_by_product_id.insert(
            profile.product_id.clone(),
            GoodsScoreCard {
                topsis_score: profile.topsis_score,
                topsis_rank: rank,
                score_confidence: profile.score_confidence.clone(),
                score_breakdown: profile.score_breakdown.clone(),
            },
        );
        ranking.push(GoodsScoreRankingRow {
            product_id: profile.product_id.clone(),
            product_name: profile.product_name.clone(),
            curr_gmv: profile.curr_gmv,
            gmv_wow: Some(profile.gmv_wow),
            topsis_score: profile.topsis_score,
            topsis_rank: rank,
            score_confidence: profile.score_confidence.clone(),
            score_breakdown: profile.score_breakdown.clone(),
        });
    }

    (score_by_product_id, ranking)
}
