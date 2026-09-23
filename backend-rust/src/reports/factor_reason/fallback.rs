use super::super::traffic_channel::TrafficChannelNature;
use super::FactorGuidance;

pub(super) fn build_fallback_reason(channel_nature: TrafficChannelNature) -> FactorGuidance {
    match channel_nature {
        TrafficChannelNature::Free => (
            "指标出现波动，建议优先从搜索/推荐入口与承接页面做联合排查。".to_string(),
            "先处理贡献绝对值最大的因子，再逐项验证自然流量修复效果。".to_string(),
        ),
        TrafficChannelNature::Paid => (
            "指标出现波动，建议结合渠道投放和承接页面做联合排查。".to_string(),
            "先处理贡献绝对值最大的因子，再逐项校验策略效果。".to_string(),
        ),
        TrafficChannelNature::Mixed | TrafficChannelNature::Unknown => (
            "指标出现波动，建议结合渠道来源与承接页面做联合排查。".to_string(),
            "先处理贡献绝对值最大的因子，并拆分自然/付费渠道验证策略效果。".to_string(),
        ),
    }
}
