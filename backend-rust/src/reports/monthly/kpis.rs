use super::super::{
    metrics::{calculate_wow, format_currency, format_number},
    Conclusions, Kpi, MonthlyAggregate,
};

pub(crate) fn build_monthly_kpis(data: &MonthlyAggregate) -> Vec<Kpi> {
    let gmv_wow = calculate_wow(data.curr_gmv, data.prev_gmv);
    let gsv = data.curr_gmv - data.curr_refund_pay_time;
    let prev_gsv = data.prev_gmv - data.prev_refund_pay_time;
    let gsv_wow = calculate_wow(gsv, prev_gsv);

    let order_wow = calculate_wow(data.curr_orders as f64, data.prev_orders as f64);
    let buyer_wow = calculate_wow(data.curr_buyers as f64, data.prev_buyers as f64);

    let arpu = if data.curr_buyers > 0 {
        data.curr_gmv / data.curr_buyers as f64
    } else {
        0.0
    };
    let prev_arpu = if data.prev_buyers > 0 {
        data.prev_gmv / data.prev_buyers as f64
    } else {
        0.0
    };
    let arpu_wow = if data.prev_buyers > 0 {
        calculate_wow(arpu, prev_arpu)
    } else {
        None
    };

    let refund_wow = calculate_wow(data.curr_refund_refund_time, data.prev_refund_refund_time);

    vec![
        Kpi {
            key: "gmv".to_string(),
            label: "GMV".to_string(),
            value: data.curr_gmv,
            display_value: format_currency(data.curr_gmv),
            wow: gmv_wow,
        },
        Kpi {
            key: "gsv".to_string(),
            label: "GSV".to_string(),
            value: gsv,
            display_value: format_currency(gsv),
            wow: gsv_wow,
        },
        Kpi {
            key: "orders".to_string(),
            label: "订单数".to_string(),
            value: data.curr_orders as f64,
            display_value: format_number(data.curr_orders as f64),
            wow: order_wow,
        },
        Kpi {
            key: "buyers".to_string(),
            label: "成交用户".to_string(),
            value: data.curr_buyers as f64,
            display_value: format_number(data.curr_buyers as f64),
            wow: buyer_wow,
        },
        Kpi {
            key: "arpu".to_string(),
            label: "客单价".to_string(),
            value: arpu,
            display_value: format!("¥{arpu:.2}"),
            wow: arpu_wow,
        },
        Kpi {
            key: "refund".to_string(),
            label: "退款金额（退款时间）".to_string(),
            value: data.curr_refund_refund_time,
            display_value: format_currency(data.curr_refund_refund_time),
            wow: refund_wow,
        },
    ]
}

pub(crate) fn build_monthly_conclusions(data: &MonthlyAggregate) -> Conclusions {
    let gmv_wow = calculate_wow(data.curr_gmv, data.prev_gmv);
    let order_wow = calculate_wow(data.curr_orders as f64, data.prev_orders as f64);
    let refund_wow = calculate_wow(data.curr_refund_refund_time, data.prev_refund_refund_time);

    let overall = if let Some(growth) = gmv_wow {
        format!(
            "本月成交总额{}，环比增长{growth:.1}% 。",
            format_currency(data.curr_gmv)
        )
    } else {
        format!(
            "本月成交总额{}，环比数据暂无。",
            format_currency(data.curr_gmv)
        )
    };

    let mut highlights = Vec::new();
    if gmv_wow.unwrap_or(0.0) > 10.0 {
        highlights.push(format!(
            "GMV 创历史新高，成交总额达到{}",
            format_currency(data.curr_gmv)
        ));
    }
    if order_wow.unwrap_or(0.0) > 5.0 {
        highlights.push(format!("订单数环比增长{:.1}%", order_wow.unwrap_or(0.0)));
    }
    if highlights.is_empty() {
        highlights.push(format!(
            "成交总额达到{}，持续稳健增长",
            format_currency(data.curr_gmv)
        ));
    }

    let mut risks = Vec::new();
    if refund_wow.unwrap_or(0.0) > 15.0 {
        risks.push("退款金额环比上升，需关注售后质量".to_string());
    }
    if gmv_wow.unwrap_or(0.0) < 0.0 {
        risks.push("成交总额环比下降，需加强营销力度".to_string());
    }
    if risks.is_empty() {
        risks.push("整体趋势平稳，建议继续深化运营策略".to_string());
    }

    Conclusions {
        overall,
        highlights,
        risks,
    }
}
