import type { ChannelQuantReasonAction } from './platform-tab-diagnostic-types';

export function buildClickToCartChannelQuantReasonAndAction(
  channelLabel: string,
  isNegative: boolean
): ChannelQuantReasonAction {
  return isNegative
    ? {
        reason: `${channelLabel}点击加购率下滑，落地页承接与利益点表达偏弱。`,
        action: `优化${channelLabel}落地页首屏卖点与价格权益，提升点击后加购效率。`,
      }
    : {
        reason: `${channelLabel}点击加购率提升，落地承接与卖点表达有效。`,
        action: `复用${channelLabel}高加购页面结构与素材组合，扩大同人群覆盖。`,
      };
}

export function buildCartToPayChannelQuantReasonAndAction(
  channelLabel: string,
  isNegative: boolean
): ChannelQuantReasonAction {
  return isNegative
    ? {
        reason: `${channelLabel}加购转化率走弱，支付环节存在流失。`,
        action: `排查${channelLabel}库存/优惠门槛与催付链路，降低加购到支付损耗。`,
      }
    : {
        reason: `${channelLabel}加购转化率改善，支付环节阻力下降。`,
        action: `保持${channelLabel}有效支付激励与履约稳定性，持续监控转化波动。`,
      };
}

export function buildAvgOrderValueChannelQuantReasonAndAction(
  channelLabel: string,
  isNegative: boolean
): ChannelQuantReasonAction {
  return isNegative
    ? {
        reason: `${channelLabel}客单价回落，低价订单占比上升稀释GMV。`,
        action: `提高${channelLabel}高客单组合与连带购曝光，修复客单价结构。`,
      }
    : {
        reason: `${channelLabel}客单价提升，对GMV有放大作用。`,
        action: `延续${channelLabel}高客单商品组合与加价购策略，稳定高价值订单占比。`,
      };
}
