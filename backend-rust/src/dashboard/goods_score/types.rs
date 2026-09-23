use std::collections::HashMap;

#[derive(Debug, Clone)]
pub(crate) struct GoodsScoreCandidate {
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) curr_gmv: f64,
    pub(crate) curr_gsv: f64,
    pub(crate) refund_amount: f64,
    pub(crate) sales_share: f64,
    pub(crate) pay_conversion_rate: f64,
    pub(crate) avg_order_value: f64,
    pub(crate) gmv_wow: f64,
    pub(crate) pay_buyer_wow: f64,
    pub(crate) visitor_wow: f64,
    pub(crate) visitor_count: f64,
    pub(crate) pay_buyer_count: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct GoodsScoreBreakdown {
    pub(crate) scale: f64,
    pub(crate) efficiency: f64,
    pub(crate) growth: f64,
    pub(crate) risk: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct GoodsScoreCard {
    pub(crate) topsis_score: f64,
    pub(crate) topsis_rank: usize,
    pub(crate) score_confidence: String,
    pub(crate) score_breakdown: GoodsScoreBreakdown,
}

#[derive(Debug, Clone)]
pub(crate) struct GoodsScoreRankingRow {
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) curr_gmv: f64,
    pub(crate) gmv_wow: Option<f64>,
    pub(crate) topsis_score: f64,
    pub(crate) topsis_rank: usize,
    pub(crate) score_confidence: String,
    pub(crate) score_breakdown: GoodsScoreBreakdown,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash)]
pub(crate) enum GoodsScoreDimension {
    Scale,
    Efficiency,
    Growth,
    Risk,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct TopsisMetricDefinition {
    pub(crate) key: &'static str,
    pub(crate) weight: f64,
    pub(crate) dimension: GoodsScoreDimension,
    pub(crate) is_cost: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct GoodsScoreResult {
    pub(crate) score_by_product_id: HashMap<String, GoodsScoreCard>,
    pub(crate) ranking: Vec<GoodsScoreRankingRow>,
    pub(crate) candidate_count: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct GoodsScoreProfile {
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) curr_gmv: f64,
    pub(crate) gmv_wow: f64,
    pub(crate) score_confidence: String,
    pub(crate) score_breakdown: GoodsScoreBreakdown,
    pub(crate) closeness: f64,
    pub(crate) topsis_score: f64,
}
