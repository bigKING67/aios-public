import type { ReasonAction } from './platform-tab-douyin-diagnostic-types';

export function buildCardSourceReasonAction(
  factorKey: string,
  contribution: number
): ReasonAction {
  const isNegative = contribution < 0;
  switch (factorKey) {
    case 'card_exposure_user_count':
      return isNegative
        ? {
            reason: '商品卡曝光人数下降，说明渠道入口供给走弱或推荐权重下降。',
            action: '优先排查对应来源渠道流量分发与投放配置，恢复高意向入口覆盖。',
          }
        : {
            reason: '商品卡曝光人数增长，渠道上游流量供给提升。',
            action: '保持高质量曝光来源占比，避免无效泛流量挤占推荐位。',
          };
    case 'card_click_rate':
      return isNegative
        ? {
            reason: '点击率下降，主图/标题/价格标签对目标人群吸引力减弱。',
            action: '做主图与标题 A/B 测试，并针对渠道特征补充利益点表达。',
          }
        : {
            reason: '点击率提升，素材吸引力与渠道匹配度改善。',
            action: '沉淀高点击素材模板，按来源渠道分组复用。',
          };
    case 'card_click_to_pay_rate':
      return isNegative
        ? {
            reason: '点击成交率下降，点击后的下单承接存在损耗。',
            action: '排查库存、评价、优惠门槛和详情页承接，优先修复高损耗环节。',
          }
        : {
            reason: '点击成交率提升，点击到支付链路更顺畅。',
            action: '保持有效承接页面与履约稳定性，持续放大高转化来源。',
          };
    default:
      return {
        reason: '商品卡关键因子出现波动，需要结合来源渠道定位继续排查。',
        action: '先修复贡献绝对值最大的拖累因子，再进行策略放大。',
      };
  }
}
