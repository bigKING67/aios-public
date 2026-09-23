use super::super::traffic_channel::TrafficChannelProfile;
use super::FactorGuidance;

pub(super) fn build_impression_reason(
    is_negative: bool,
    channel_context: &str,
    channel_profile: TrafficChannelProfile,
) -> FactorGuidance {
    match (is_negative, channel_profile) {
        (true, TrafficChannelProfile::Search) => (
            format!("{channel_context}展现缩量，常见于搜索排位权重下滑或核心词被竞品超越。"),
            "先核查核心词搜索排位与标题关键词权重，必要时用关键词推广做短期补流，避免自然搜索继续失位。"
                .to_string(),
        ),
        (false, TrafficChannelProfile::Search) => (
            format!("{channel_context}展现放量，说明搜索权重或核心词覆盖改善。"),
            "保持核心词权重防守，避免频繁改标题导致搜索权重波动。".to_string(),
        ),
        (true, TrafficChannelProfile::Recommend) => (
            format!("{channel_context}展现缩量，常见于库存低于安全线、动销率下降或评价质量下滑。"),
            "优先补库存到安全线，排查近7天动销与评价波动，先止住推荐分发下滑。".to_string(),
        ),
        (false, TrafficChannelProfile::Recommend) => (
            format!("{channel_context}展现放量，推荐分发等级提升对GMV形成正向支撑。"),
            "维持库存绿线、动销节奏和评价质量，稳住推荐位置等级。".to_string(),
        ),
        (true, TrafficChannelProfile::KeywordAd) => (
            format!("{channel_context}展现缩量，通常来自预算削减、出价下调或质量分下降。"),
            "优先核对预算和出价是否低于上周，再检查关键词质量分与下线词，恢复高转化词保量。"
                .to_string(),
        ),
        (false, TrafficChannelProfile::KeywordAd) => (
            format!("{channel_context}展现放量，关键词竞价覆盖扩张对GMV形成正向拉动。"),
            "保持预算与出价稳定，优先保证高转化词覆盖，避免盲目追求第一排位。".to_string(),
        ),
        (true, TrafficChannelProfile::CrowdAd) => (
            format!("{channel_context}展现缩量，常见于人群精度下降、预算收缩或人群包透支。"),
            "先排查人群源质量并收敛低质大包，再校准预算与出价，优先保障核心人群保量。".to_string(),
        ),
        (false, TrafficChannelProfile::CrowdAd) => (
            format!("{channel_context}展现放量，人群定向覆盖扩张对GMV形成支撑。"),
            "维持核心人群与扩展人群分层投放，避免过快放大低质人群规模。".to_string(),
        ),
        (true, TrafficChannelProfile::SceneAd) => (
            format!("{channel_context}展现缩量，通常来自场景包覆盖不足或出价竞争力下降。"),
            "核查场景包和时段设置，恢复高转化场景保量并校准出价。".to_string(),
        ),
        (false, TrafficChannelProfile::SceneAd) => (
            format!("{channel_context}展现放量，场景流量覆盖扩大带动上游基盘增长。"),
            "保留高转化场景与时段溢价配置，持续清理低效场景流量。".to_string(),
        ),
        (true, TrafficChannelProfile::FreeMixed) => (
            format!("{channel_context}自然流量入口缩量，搜索权重和推荐分发需拆分复核。"),
            "搜索侧核查排位和词权重，推荐侧核查库存/动销/评价，分别执行修复动作。".to_string(),
        ),
        (false, TrafficChannelProfile::FreeMixed) => (
            format!("{channel_context}自然流量入口放量，对GMV形成正向支撑。"),
            "同步维护搜索权重与推荐分发稳定性，避免单一入口波动放大风险。".to_string(),
        ),
        (true, TrafficChannelProfile::PaidMixed) => (
            format!("{channel_context}付费流量展现缩量，预算/出价/人群或词包配置存在短板。"),
            "分渠道检查预算出价、词包质量和人群精度，优先恢复高ROI计划的保量能力。".to_string(),
        ),
        (false, TrafficChannelProfile::PaidMixed) => (
            format!("{channel_context}付费流量展现放量，投放覆盖扩张形成正向拉动。"),
            "维持高ROI计划预算倾斜，防止低质流量占比上升侵蚀转化效率。".to_string(),
        ),
        (true, TrafficChannelProfile::Mixed | TrafficChannelProfile::Unknown) => (
            format!("{channel_context}曝光/访客入口缩量，上游流量供给走弱。"),
            "拆分自然与付费来源定位损耗：自然侧修复搜索/推荐承接，付费侧校准预算、出价与人群包。"
                .to_string(),
        ),
        (false, TrafficChannelProfile::Mixed | TrafficChannelProfile::Unknown) => (
            format!("{channel_context}曝光/访客入口放量，流量底盘扩张对GMV形成正向支撑。"),
            "保持自然与付费流量结构平衡，优先保障高转化来源，避免单一渠道波动放大风险。"
                .to_string(),
        ),
    }
}
