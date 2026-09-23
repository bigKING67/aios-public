import type { ChannelQuantReasonAction } from './platform-tab-diagnostic-types';
import type { ChannelQuantType } from './platform-tab-types';

export function buildImpressionChannelQuantReasonAndAction(
  channelType: ChannelQuantType,
  channelLabel: string,
  isNegative: boolean
): ChannelQuantReasonAction {
  switch (channelType) {
    case 'search':
      return isNegative
        ? {
            reason: `${channelLabel}展现缩量，常见于搜索排位权重下滑或核心词覆盖减弱。`,
            action: '核查核心词排位与标题关键词权重，必要时用关键词推广做短期补流，防止自然搜索继续失位。',
          }
        : {
            reason: `${channelLabel}展现放量，搜索权重改善对GMV形成正向支撑。`,
            action: '保持核心词权重防守与标题稳定性，避免频繁改标题引发搜索波动。',
          };
    case 'recommend':
      return isNegative
        ? {
            reason: `${channelLabel}展现缩量，常见于库存低于安全线、动销率下降或评价质量走弱。`,
            action: '优先补库存并排查近7天动销与评价波动，先止住推荐分发下滑。',
          }
        : {
            reason: `${channelLabel}展现放量，推荐分发等级提升对GMV形成正向拉动。`,
            action: '维持库存绿线、动销节奏和评价质量，稳住推荐位置等级。',
          };
    case 'keywordAd':
      return isNegative
        ? {
            reason: `${channelLabel}展现缩量，通常来自预算削减、出价下调或质量分下降。`,
            action: '优先核对预算与出价，再排查关键词质量分和下线词，恢复高转化词保量。',
          }
        : {
            reason: `${channelLabel}展现放量，关键词竞价覆盖扩张带来增量流量。`,
            action: '保持高ROI词包预算稳定，避免盲目追求第一排位导致成本抬升。',
          };
    case 'crowdAd':
      return isNegative
        ? {
            reason: `${channelLabel}展现缩量，常见于人群精度下降、预算收缩或人群包透支。`,
            action: '先排查人群源质量并收敛低质大包，再校准预算出价，优先保障核心人群保量。',
          }
        : {
            reason: `${channelLabel}展现放量，人群定向覆盖扩大形成正向支撑。`,
            action: '维持核心与扩展人群分层投放，避免过快放大低质人群规模。',
          };
    case 'sceneAd':
      return isNegative
        ? {
            reason: `${channelLabel}展现缩量，常见于场景包覆盖不足或时段溢价竞争力下降。`,
            action: '核查场景包与时段配置，恢复高转化场景保量并校准出价。',
          }
        : {
            reason: `${channelLabel}展现放量，场景流量覆盖扩大带动上游基盘增长。`,
            action: '保留高转化场景与时段配置，持续清理低效场景流量。',
          };
    default:
      return isNegative
        ? {
            reason: `${channelLabel}流量入口缩量，导致GMV上游基盘走弱。`,
            action: `拆分${channelLabel}渠道来源定位损耗，优先修复贡献最大的入口。`,
          }
        : {
            reason: `${channelLabel}流量入口放量，对GMV形成正向拉动。`,
            action: `保持${channelLabel}高质量流量占比，避免低意向泛流量稀释转化。`,
          };
  }
}
