use super::FactorGuidance;

pub(super) fn build_click_to_cart_rate_reason(is_negative: bool) -> FactorGuidance {
    if is_negative {
        (
            "点击加购率偏弱，通常是详情页首屏卖点、价格利益点与用户预期不匹配。".to_string(),
            "优化详情页前3屏信息结构，强化利益点露出，并按渠道做落地页差异化。".to_string(),
        )
    } else {
        (
            "点击加购率走强，说明落地页承接和利益点表达有效。".to_string(),
            "复盘高加购素材与页面模块，复制到同品类或同人群计划中。".to_string(),
        )
    }
}

pub(super) fn build_cart_to_pay_rate_reason(is_negative: bool) -> FactorGuidance {
    if is_negative {
        (
            "加购转化率下行，常见于优惠门槛不匹配、库存/履约预期不稳或支付激励不足。".to_string(),
            "排查库存和优惠券门槛，补充限时权益与催付动作，降低加购流失。".to_string(),
        )
    } else {
        (
            "加购转化率改善，支付环节阻力减小。".to_string(),
            "保留有效的支付激励策略，并持续监控库存与履约稳定性。".to_string(),
        )
    }
}

pub(super) fn build_avg_order_value_reason(is_negative: bool) -> FactorGuidance {
    if is_negative {
        (
            "客单价回落，通常由低价SKU占比提升、折扣加深或高客单组合曝光不足导致。".to_string(),
            "增加套装和连带购曝光，控制低毛利SKU引流占比，修复客单价结构。".to_string(),
        )
    } else {
        (
            "客单价提升，对GMV有放大作用。".to_string(),
            "继续强化高客单商品组合与加价购策略，稳住高价值订单占比。".to_string(),
        )
    }
}
