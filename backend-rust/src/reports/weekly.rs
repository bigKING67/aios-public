use super::{
    metrics::{calculate_wow, format_currency, format_number},
    Conclusions, Kpi, WeeklyRow,
};

pub(super) fn build_weekly_kpis(row: &WeeklyRow) -> Vec<Kpi> {
    let gmv_wow = calculate_wow(row.curr_gmv, row.prev_gmv);
    let gsv = row.curr_gmv - row.curr_refund_amount_pay_time;
    let prev_gsv = row.prev_gmv - row.prev_refund_amount_pay_time;
    let gsv_wow = calculate_wow(gsv, prev_gsv);
    let order_wow = calculate_wow(row.curr_order_count as f64, row.prev_order_count as f64);
    let buyer_wow = calculate_wow(row.curr_buyer_count as f64, row.prev_buyer_count as f64);

    let arpu_value = if row.curr_buyer_count > 0 {
        row.curr_gmv / row.curr_buyer_count as f64
    } else {
        0.0
    };
    let prev_arpu = if row.prev_buyer_count > 0 {
        row.prev_gmv / row.prev_buyer_count as f64
    } else {
        0.0
    };
    let arpu_wow = if row.prev_buyer_count > 0 {
        calculate_wow(arpu_value, prev_arpu)
    } else {
        None
    };

    let refund_wow = calculate_wow(
        row.curr_refund_amount_refund_time,
        row.prev_refund_amount_refund_time,
    );

    vec![
        Kpi {
            key: "gmv".to_string(),
            label: "GMV".to_string(),
            value: row.curr_gmv,
            display_value: format_currency(row.curr_gmv),
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
            value: row.curr_order_count as f64,
            display_value: format_number(row.curr_order_count as f64),
            wow: order_wow,
        },
        Kpi {
            key: "buyers".to_string(),
            label: "成交用户".to_string(),
            value: row.curr_buyer_count as f64,
            display_value: format_number(row.curr_buyer_count as f64),
            wow: buyer_wow,
        },
        Kpi {
            key: "arpu".to_string(),
            label: "客单价".to_string(),
            value: arpu_value,
            display_value: format!("¥{arpu_value:.2}"),
            wow: arpu_wow,
        },
        Kpi {
            key: "refund".to_string(),
            label: "退款金额（退款时间）".to_string(),
            value: row.curr_refund_amount_refund_time,
            display_value: format_currency(row.curr_refund_amount_refund_time),
            wow: refund_wow,
        },
    ]
}

pub(super) fn build_weekly_conclusions(row: &WeeklyRow) -> Conclusions {
    let gmv_wow = calculate_wow(row.curr_gmv, row.prev_gmv);
    let order_wow = calculate_wow(row.curr_order_count as f64, row.prev_order_count as f64);
    let buyer_wow = calculate_wow(row.curr_buyer_count as f64, row.prev_buyer_count as f64);
    let refund_wow = calculate_wow(
        row.curr_refund_amount_refund_time,
        row.prev_refund_amount_refund_time,
    );

    let overall = if let Some(growth) = gmv_wow {
        format!(
            "本周成交总额{}，环比（同期）增长{growth:.1}% 。",
            format_currency(row.curr_gmv)
        )
    } else {
        format!(
            "本周成交总额{}，环比（同期）数据暂无。",
            format_currency(row.curr_gmv)
        )
    };

    let mut highlights = Vec::new();
    if gmv_wow.unwrap_or(0.0) > 10.0 {
        highlights.push(format!(
            "GMV 创新高，成交总额达到{}",
            format_currency(row.curr_gmv)
        ));
    }
    if order_wow.unwrap_or(0.0) > 5.0 {
        highlights.push(format!(
            "订单数环比（同期）增长{:.1}%",
            order_wow.unwrap_or(0.0)
        ));
    }
    if buyer_wow.unwrap_or(0.0) > 8.0 {
        highlights.push("成交用户数环比增长显著，新客拉新效果良好".to_string());
    }
    if highlights.is_empty() {
        highlights.push(format!("成交总额达到{}", format_currency(row.curr_gmv)));
    }

    let mut risks = Vec::new();
    if refund_wow.unwrap_or(0.0) > 15.0 {
        risks.push("退款金额呈快速上升趋势，需重点关注售后质量".to_string());
    }
    if gmv_wow.unwrap_or(0.0) < 0.0 {
        risks.push("成交总额环比（同期）下降，需加强营销和运营力度".to_string());
    }
    if risks.is_empty() {
        risks.push("部分平台增长动力不足，建议深化运营策略".to_string());
    }

    Conclusions {
        overall,
        highlights,
        risks,
    }
}
