import { calcChangePercent } from './platform-tab-formatters';
import type { ReasonAction } from './platform-tab-douyin-diagnostic-types';
import type { DouyinShortvideoRow } from './platform-tab-types';

export function buildShortvideoDiagnosis(row: DouyinShortvideoRow): ReasonAction[] {
  const diagnosis: ReasonAction[] = [];
  const viewWoW = calcChangePercent(row.currVideoViewCount, row.prevVideoViewCount);
  const payWoW = calcChangePercent(row.currUserPayAmount, row.prevUserPayAmount);
  const refundWoW = calcChangePercent(row.currRefundAmount, row.prevRefundAmount);
  const liveRoomShare =
    row.currUserPayAmount > Number.EPSILON
      ? (row.currLiveRoomPayAmount / row.currUserPayAmount) * 100
      : undefined;
  const searchShare =
    row.currUserPayAmount > Number.EPSILON
      ? (row.currSearchAfterViewPayAmount / row.currUserPayAmount) * 100
      : undefined;

  if (typeof viewWoW === 'number' && viewWoW < 0) {
    diagnosis.push({
      reason: '视频观看次数回落，内容分发触达缩量是 GMV 走弱的上游主因。',
      action: '优先复用同题材高完播模板，补强封面标题并在高活跃时段加大发布频次。',
    });
  } else if (typeof viewWoW === 'number' && viewWoW > 0) {
    diagnosis.push({
      reason: '视频观看次数增长，流量端仍具备放量空间。',
      action: '延续当前选题与发布时间窗口，重点放大高转化视频版本。',
    });
  }

  if (typeof payWoW === 'number' && payWoW < 0) {
    diagnosis.push({
      reason: '用户支付金额下滑，说明内容到成交的承接效率不足。',
      action: '优化商品讲解和权益前置表达，针对高浏览低成交视频补充强交易 CTA。',
    });
  } else if (typeof payWoW === 'number' && payWoW > 0) {
    diagnosis.push({
      reason: '用户支付金额增长，内容与商品匹配度提升。',
      action: '沉淀高转化内容结构和脚本，扩大到同类商品投放计划。',
    });
  }

  if (typeof refundWoW === 'number' && refundWoW > 0) {
    diagnosis.push({
      reason: '退款金额上升，可能拖累净 GMV 贡献。',
      action: '复核短视频承诺与商品实际体验一致性，排查高退款 SKU 的描述偏差。',
    });
  }

  if (typeof liveRoomShare === 'number' && liveRoomShare > 45) {
    diagnosis.push({
      reason: `引流直播间支付占比 ${liveRoomShare.toFixed(1)}%，该视频更偏“导流型”贡献。`,
      action: '直播侧同步准备承接脚本与库存，确保导流后不在直播间二次流失。',
    });
  }

  if (typeof searchShare === 'number' && searchShare > 25) {
    diagnosis.push({
      reason: `看后搜支付占比 ${searchShare.toFixed(1)}%，说明视频触发了显著搜索需求。`,
      action: '补齐标题关键词和商品卡搜索词覆盖，放大“看后搜”链路转化。',
    });
  }

  if (diagnosis.length === 0) {
    diagnosis.push({
      reason: '短视频关键指标暂无明显异常波动，整体处于平稳区间。',
      action: '保持现有内容节奏，继续跟踪播放、支付和退款三项核心指标的日级变化。',
    });
  }

  return diagnosis.slice(0, 4);
}
