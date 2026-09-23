import type { ChannelQuantReasonAction } from './platform-tab-diagnostic-types';
import type { ChannelQuantType } from './platform-tab-types';

export function buildVisitorChannelQuantReasonAndAction(
  channelType: ChannelQuantType,
  channelLabel: string,
  isNegative: boolean
): ChannelQuantReasonAction {
  switch (channelType) {
    case 'search':
      return isNegative
        ? {
            reason: `${channelLabel}访客规模回落，核心搜索词排位与词权重走弱导致自然入口下滑。`,
            action: '优先修复核心词排位与标题关键词权重，核查竞品挤压并跟踪48小时。',
          }
        : {
            reason: `${channelLabel}访客规模增长，自然搜索入口扩张对GMV形成正向支撑。`,
            action: '持续优化高相关关键词布局与标题稳定性，提升高意向搜索访客占比。',
          };
    case 'recommend':
      return isNegative
        ? {
            reason: `${channelLabel}访客规模回落，推荐分发缩量通常由库存、动销或评价指标走弱触发。`,
            action: '先补库存并核查动销与评价波动，必要时用活动促销恢复推荐分发强度。',
          }
        : {
            reason: `${channelLabel}访客规模增长，推荐分发扩张对GMV形成正向支撑。`,
            action: '维持库存和动销稳定，持续优化主图素材与互动信号，稳住推荐流量质量。',
          };
    case 'keywordAd':
      return isNegative
        ? {
            reason: `${channelLabel}访客规模回落，关键词投放覆盖与引流效率下降。`,
            action: '核对预算出价并排查低质词占比，优先恢复高转化词计划保量。',
          }
        : {
            reason: `${channelLabel}访客规模增长，关键词投放引流扩张形成正向拉动。`,
            action: '保持高ROI词包预算稳定，控制低意向宽泛词占比，防止流量质量下滑。',
          };
    case 'crowdAd':
      return isNegative
        ? {
            reason: `${channelLabel}访客规模回落，人群精度或预算配置走弱导致引流不足。`,
            action: '优先排查人群包质量与重叠度，收敛低效人群并恢复核心人群触达。',
          }
        : {
            reason: `${channelLabel}访客规模增长，人群定向覆盖扩大带来增量流量。`,
            action: '保持核心与扩展人群分层投放，持续监控人群边际质量。',
          };
    case 'sceneAd':
      return isNegative
        ? {
            reason: `${channelLabel}访客规模回落，场景覆盖与时段触达效率下降。`,
            action: '优先恢复高转化场景覆盖并优化时段溢价，修复场景承接链路。',
          }
        : {
            reason: `${channelLabel}访客规模增长，场景流量覆盖扩张形成正向支撑。`,
            action: '延续高转化场景策略并清理低效场景，稳定高意向访客占比。',
          };
    default:
      return isNegative
        ? {
            reason: `${channelLabel}访客规模回落，流量入口与承接链路存在短板。`,
            action: `优先排查${channelLabel}上游入口与落地承接，先修复贡献绝对值最大的损耗因子。`,
          }
        : {
            reason: `${channelLabel}访客规模增长，流量入口扩张对GMV形成正向支撑。`,
            action: `保持${channelLabel}高质量访客结构稳定，避免低意向泛流量稀释转化。`,
          };
  }
}
