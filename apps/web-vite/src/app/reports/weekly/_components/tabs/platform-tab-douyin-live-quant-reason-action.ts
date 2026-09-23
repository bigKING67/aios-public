import type { ReasonAction } from './platform-tab-douyin-diagnostic-types';

export function buildLiveQuantReasonAction(
  factorKey: string,
  contribution: number
): ReasonAction {
  const isNegative = contribution < 0;
  switch (factorKey) {
    case 'live_exposure_user_count':
      return isNegative
        ? {
            reason: '直播间曝光人数下降，通常由排期时段偏移、投流不足或封面标题吸引力下降导致。',
            action: '优先恢复黄金时段排期与投流预算，联动优化封面标题并观察 2 场直播曝光恢复幅度。',
          }
        : {
            reason: '直播间曝光人数增长，为直播 GMV 带来上游流量增量。',
            action: '保持当前排期与流量分发策略，避免引入低意向泛流量稀释后续转化。',
          };
    case 'watch_rate':
      return isNegative
        ? {
            reason: '看播率下降，说明进入直播间后的停留吸引力不足。',
            action: '优化开场脚本、利益点前置与主播互动节奏，重点修复前 3 分钟留存。',
          }
        : {
            reason: '看播率提升，直播间内容吸引力增强。',
            action: '复用高留存话术与节奏模板，固化到同类场次开播 SOP。',
          };
    case 'product_exposure_rate':
      return isNegative
        ? {
            reason: '商品曝光率下降，常见于讲品节奏偏慢或商品挂链露出不足。',
            action: '提升讲品时长占比并优化挂链节奏，确保核心商品在高在线时段充分露出。',
          }
        : {
            reason: '商品曝光率提升，讲品链路承接改善。',
            action: '延续当前讲品节奏，并将高曝光商品组合扩展到后续场次。',
          };
    case 'product_click_rate':
      return isNegative
        ? {
            reason: '商品点击率下降，通常来自价格锚点不清或商品卖点表达不足。',
            action: '强化价格利益点和对比卖点，增加关键商品讲解时的 CTA 触发频次。',
          }
        : {
            reason: '商品点击率提升，商品讲解与权益表达有效。',
            action: '沉淀高点击话术与商品素材组合，并在同主播场次复用。',
          };
    case 'click_to_pay_rate':
      return isNegative
        ? {
            reason: '商品点击成交转化率下降，支付环节存在阻力。',
            action: '重点排查库存、优惠门槛、履约承诺和催付链路，降低点击到支付流失。',
          }
        : {
            reason: '商品点击成交转化率提升，支付承接更顺畅。',
            action: '保持当前转化链路配置，持续监控高峰时段支付稳定性。',
          };
    case 'avg_order_value':
      return isNegative
        ? {
            reason: '客单价下滑，低价订单占比上升稀释 GMV。',
            action: '提高高客单组合与连带购曝光，优化价格梯度，修复订单结构。',
          }
        : {
            reason: '客单价提升，对 GMV 起到放大作用。',
            action: '延续高客单组合与加价购策略，稳定高价值订单占比。',
          };
    default:
      return {
        reason: '关键因子发生波动，需要结合直播链路继续排查。',
        action: '先处理贡献绝对值最大的因子，再逐项验证策略效果。',
      };
  }
}
