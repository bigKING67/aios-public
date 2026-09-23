import type { ChannelQuantReasonAction } from './platform-tab-diagnostic-types';
import type { ChannelQuantType } from './platform-tab-types';

export function buildClickRateChannelQuantReasonAndAction(
  channelType: ChannelQuantType,
  channelLabel: string,
  isNegative: boolean
): ChannelQuantReasonAction {
  switch (channelType) {
    case 'search':
      return isNegative
        ? {
            reason: `${channelLabel}点击率回落，常见于搜索排位后移或主图标题卖点吸引力下降。`,
            action: '核查搜索排位变化并执行主图/标题AB测试，突出核心卖点与高频词。',
          }
        : {
            reason: `${channelLabel}点击率改善，说明搜索结果页竞争力提升。`,
            action: '沉淀高点击主图与标题模板，按核心词分组复用并周度迭代。',
          };
    case 'recommend':
      return isNegative
        ? {
            reason: `${channelLabel}点击率回落，常见于主图吸引力下降或推荐位置等级下滑。`,
            action: '测试高冲击主图并复核推荐位置等级，优先修复推荐场景点击效率。',
          }
        : {
            reason: `${channelLabel}点击率改善，素材吸引力与推荐场景匹配度提升。`,
            action: '复用高点击推荐素材并保持周期迭代，持续稳住推荐位点击效率。',
          };
    case 'keywordAd':
      return isNegative
        ? {
            reason: `${channelLabel}点击率回落，多由竞价排位下降或创意质量变弱引起。`,
            action: '检查竞价排位与质量分，对主图文案做AB测试并清理高消耗低点击词。',
          }
        : {
            reason: `${channelLabel}点击率提升，创意吸引力和排位质量改善。`,
            action: '沉淀高点击创意模板，按词包表现复用并持续优化质量分。',
          };
    case 'crowdAd':
      return isNegative
        ? {
            reason: `${channelLabel}点击率回落，常见于创意与目标人群偏好不匹配。`,
            action: '按核心/扩展人群分组测试定制创意，校准人群与素材卖点匹配度。',
          }
        : {
            reason: `${channelLabel}点击率提升，说明创意与人群匹配度改善。`,
            action: '保留高点击人群创意组合，分层放量并持续监控人群质量。',
          };
    case 'sceneAd':
      return isNegative
        ? {
            reason: `${channelLabel}点击率回落，场景流量与创意内容匹配度下降。`,
            action: '按高转化场景重做创意分组测试，优化场景与素材匹配。',
          }
        : {
            reason: `${channelLabel}点击率提升，场景与创意匹配度改善。`,
            action: '沉淀高点击场景创意模板，按时段和场景分层复用。',
          };
    default:
      return isNegative
        ? {
            reason: `${channelLabel}点击率回落，创意吸引力与流量匹配度不足。`,
            action: `对${channelLabel}主图文案做AB测试，并跟踪3天点击率修复幅度。`,
          }
        : {
            reason: `${channelLabel}点击率改善，说明创意与流量匹配度提升。`,
            action: `沉淀${channelLabel}高点击素材模板，按计划分组复用并周度迭代。`,
          };
  }
}
