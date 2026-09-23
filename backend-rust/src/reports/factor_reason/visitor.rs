use super::super::traffic_channel::TrafficChannelProfile;
use super::FactorGuidance;

pub(super) fn build_visitor_reason(
    is_negative: bool,
    channel_context: &str,
    channel_profile: TrafficChannelProfile,
) -> FactorGuidance {
    match (is_negative, channel_profile) {
        (true, TrafficChannelProfile::Search) => (
            format!(
                "{channel_context}访客规模回落，核心搜索词排位与权重下滑导致自然搜索入口走弱。"
            ),
            "优先修复核心词排位与标题关键词权重，核查竞品挤压情况，必要时用关键词推广做阶段补流。"
                .to_string(),
        ),
        (false, TrafficChannelProfile::Search) => (
            format!("{channel_context}访客规模增长，自然搜索入口扩张对GMV形成正向支撑。"),
            "保持高相关关键词覆盖与标题稳定性，持续提升高意向搜索访客占比。".to_string(),
        ),
        (true, TrafficChannelProfile::Recommend) => (
            format!(
                "{channel_context}访客规模回落，推荐分发缩量常由库存、动销或评价指标走弱触发。"
            ),
            "先补库存并核查动销与评价波动，必要时通过促销活动恢复推荐分发强度。".to_string(),
        ),
        (false, TrafficChannelProfile::Recommend) => (
            format!("{channel_context}访客规模增长，推荐分发扩张对GMV形成正向支撑。"),
            "维持库存与动销稳定，持续优化主图素材和互动信号，稳住推荐流量质量。".to_string(),
        ),
        (true, TrafficChannelProfile::KeywordAd) => (
            format!(
                "{channel_context}访客规模回落，关键词投放覆盖与引流效率下降导致上游基盘走弱。"
            ),
            "核对预算与出价、排查低质词占比，优先恢复高转化词计划保量。".to_string(),
        ),
        (false, TrafficChannelProfile::KeywordAd) => (
            format!("{channel_context}访客规模增长，关键词投放引流扩张对GMV形成正向拉动。"),
            "保持高ROI词包预算稳定，控制低意向宽泛词占比，避免流量质量下滑。".to_string(),
        ),
        (true, TrafficChannelProfile::CrowdAd) => (
            format!("{channel_context}访客规模回落，人群精度或预算配置走弱导致引流不足。"),
            "先排查人群包质量与重叠度，收敛低质大包并校准预算出价，优先保障核心人群触达。"
                .to_string(),
        ),
        (false, TrafficChannelProfile::CrowdAd) => (
            format!("{channel_context}访客规模增长，人群定向覆盖扩大带来增量流量。"),
            "保持核心与扩展人群分层投放，持续监控人群质量避免边际流量稀释。".to_string(),
        ),
        (true, TrafficChannelProfile::SceneAd) => (
            format!("{channel_context}访客规模回落，场景覆盖与时段触达效率下降。"),
            "优先恢复高转化场景包覆盖并调整时段溢价，修复场景流量承接。".to_string(),
        ),
        (false, TrafficChannelProfile::SceneAd) => (
            format!("{channel_context}访客规模增长，场景流量覆盖扩张形成正向支撑。"),
            "延续高转化场景策略并清理低效场景，稳定高意向访客占比。".to_string(),
        ),
        (true, TrafficChannelProfile::FreeMixed) => (
            format!("{channel_context}访客规模回落，自然流量入口承接不足导致上游基盘走弱。"),
            "搜索侧修复核心词排位，推荐侧修复库存/动销/评价，分路径提升自然访客质量。".to_string(),
        ),
        (false, TrafficChannelProfile::FreeMixed) => (
            format!("{channel_context}访客规模增长，自然流量入口扩张对GMV形成正向支撑。"),
            "保持搜索与推荐入口的高意向访客占比，避免泛流量稀释后链路转化。".to_string(),
        ),
        (true, TrafficChannelProfile::PaidMixed) => (
            format!("{channel_context}访客规模回落，付费计划引流效率下降。"),
            "分渠道校准预算出价与人群/词包质量，先恢复高ROI计划保量并观察48小时。".to_string(),
        ),
        (false, TrafficChannelProfile::PaidMixed) => (
            format!("{channel_context}访客规模增长，付费引流扩张对GMV形成正向支撑。"),
            "保持高质量访客来源稳定投放，避免低意向泛流量稀释后链路转化。".to_string(),
        ),
        (true, TrafficChannelProfile::Mixed | TrafficChannelProfile::Unknown) => (
            format!("{channel_context}访客规模回落，流量入口与承接链路同时走弱。"),
            "分渠道拆解自然与付费贡献，先修复搜索/推荐承接，再校准预算出价与人群结构。".to_string(),
        ),
        (false, TrafficChannelProfile::Mixed | TrafficChannelProfile::Unknown) => (
            format!("{channel_context}访客规模增长，流量入口扩张对GMV形成正向支撑。"),
            "保持高质量访客来源结构稳定，避免低意向泛流量稀释后链路转化。".to_string(),
        ),
    }
}
