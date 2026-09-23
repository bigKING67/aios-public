use super::super::traffic_channel::TrafficChannelProfile;
use super::FactorGuidance;

pub(super) fn build_click_rate_reason(
    is_negative: bool,
    channel_profile: TrafficChannelProfile,
) -> FactorGuidance {
    match (is_negative, channel_profile) {
        (true, TrafficChannelProfile::Search) => (
            "搜索点击率回落，常见于搜索排位后移或主图/标题卖点吸引力下降。".to_string(),
            "优先核查搜索排位变化并做主图标题AB测试，突出核心卖点与高频搜索词。".to_string(),
        ),
        (false, TrafficChannelProfile::Search) => (
            "搜索点击率改善，说明搜索结果页竞争力提升。".to_string(),
            "沉淀高点击主图与标题模板，按核心词分组复用并周度迭代。".to_string(),
        ),
        (true, TrafficChannelProfile::Recommend) => (
            "推荐点击率回落，常见于主图吸引力下降或推荐位置等级下滑。".to_string(),
            "测试更高冲击力主图并复核推荐位置等级，优先修复推荐场景点击效率。".to_string(),
        ),
        (false, TrafficChannelProfile::Recommend) => (
            "推荐点击率改善，说明素材吸引力与推荐场景匹配度提升。".to_string(),
            "复用高点击推荐素材并保持周期迭代，持续稳住推荐位点击效率。".to_string(),
        ),
        (true, TrafficChannelProfile::KeywordAd) => (
            "关键词推广点击率回落，多由竞价排位下降或创意质量变弱引起。".to_string(),
            "检查关键词竞价排位与质量分，对主图文案做AB测试并优化高消耗低点击词。".to_string(),
        ),
        (false, TrafficChannelProfile::KeywordAd) => (
            "关键词推广点击率提升，创意吸引力和排位质量改善。".to_string(),
            "沉淀高点击创意模板，按词包表现复用并持续优化质量分。".to_string(),
        ),
        (true, TrafficChannelProfile::CrowdAd) => (
            "人群推广点击率回落，常见于创意与目标人群偏好不匹配。".to_string(),
            "按核心/扩展人群分组测试定制创意，校准人群包与素材卖点匹配度。".to_string(),
        ),
        (false, TrafficChannelProfile::CrowdAd) => (
            "人群推广点击率提升，说明创意与人群匹配度改善。".to_string(),
            "保留高点击人群创意组合，分层放量并持续监控人群边际质量。".to_string(),
        ),
        (true, TrafficChannelProfile::SceneAd) => (
            "场景推广点击率回落，场景流量与创意内容匹配度下降。".to_string(),
            "按高转化场景重做创意分组测试，优化场景与素材匹配。".to_string(),
        ),
        (false, TrafficChannelProfile::SceneAd) => (
            "场景推广点击率提升，场景与创意匹配度改善。".to_string(),
            "沉淀高点击场景创意模板，按时段和场景分层复用。".to_string(),
        ),
        (true, TrafficChannelProfile::FreeMixed) => (
            "自然流量点击率回落，搜索与推荐素材竞争力出现分化。".to_string(),
            "搜索侧优化标题主图，推荐侧优化推荐位素材，分渠道跟踪点击修复幅度。".to_string(),
        ),
        (false, TrafficChannelProfile::FreeMixed) => (
            "自然流量点击率提升，搜索与推荐素材匹配度改善。".to_string(),
            "沉淀搜索/推荐分场景素材模板，保持周度更新。".to_string(),
        ),
        (true, TrafficChannelProfile::PaidMixed) => (
            "付费流量点击率回落，排位质量与创意表现存在结构性短板。".to_string(),
            "分渠道复核排位、质量分与创意表现，优先修复高消耗低点击计划。".to_string(),
        ),
        (false, TrafficChannelProfile::PaidMixed) => (
            "付费流量点击率提升，创意与流量匹配度改善。".to_string(),
            "保留高点击创意与词包/人群组合，按ROI分层放量。".to_string(),
        ),
        (true, TrafficChannelProfile::Mixed | TrafficChannelProfile::Unknown) => (
            "商品点击率回落，创意吸引力与流量匹配度在不同渠道出现分化。".to_string(),
            "分渠道执行创意AB测试：自然侧优化标题/主图，付费侧同步校准排位与质量分。".to_string(),
        ),
        (false, TrafficChannelProfile::Mixed | TrafficChannelProfile::Unknown) => (
            "商品点击率提升，说明创意与流量匹配度整体改善。".to_string(),
            "沉淀高点击创意模板，按自然/付费渠道分别复用并保持周期性更新。".to_string(),
        ),
    }
}
