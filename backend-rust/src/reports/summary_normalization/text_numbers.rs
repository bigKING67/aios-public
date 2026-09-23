use once_cell::sync::Lazy;
use regex::Regex;

use super::{
    numeric::round_to,
    text_context::{ceil_char_boundary, floor_char_boundary, has_any_keyword},
};

static NON_PERCENT_DECIMAL_LITERAL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?P<sign>[+-]?)(?P<num>\d+\.\d+)").expect("valid non-percent decimal regex")
});

pub(crate) fn normalize_summary_text_numbers(text: &str) -> String {
    let mut rebuilt = String::with_capacity(text.len());
    let mut cursor = 0usize;

    for captures in NON_PERCENT_DECIMAL_LITERAL_RE.captures_iter(text) {
        let Some(matched) = captures.get(0) else {
            continue;
        };
        rebuilt.push_str(&text[cursor..matched.start()]);

        let mut is_percent_literal = false;
        let trailing = &text[matched.end()..];
        for ch in trailing.chars() {
            if ch.is_whitespace() {
                continue;
            }
            if ch == '%' {
                is_percent_literal = true;
            }
            break;
        }
        if is_percent_literal {
            rebuilt.push_str(matched.as_str());
            cursor = matched.end();
            continue;
        }

        let sign = captures
            .name("sign")
            .map(|item| item.as_str())
            .unwrap_or_default();
        let numeric_text = captures
            .name("num")
            .map(|item| item.as_str())
            .unwrap_or_default();
        let parsed = numeric_text.parse::<f64>().ok();

        if let Some(raw_value) = parsed {
            let left = floor_char_boundary(text, matched.start().saturating_sub(16));
            let right = ceil_char_boundary(text, (matched.end() + 8).min(text.len()));
            let context = text[left..right].to_lowercase();

            let is_trailing_zero_decimal = numeric_text
                .split('.')
                .nth(1)
                .map(|fraction| fraction.chars().all(|ch| ch == '0'))
                .unwrap_or(false);

            if is_trailing_zero_decimal || resolve_integer_number_by_context(context.as_str()) {
                rebuilt.push_str(format_integer_with_sign(sign, raw_value).as_str());
            } else {
                rebuilt.push_str(matched.as_str());
            }
        } else {
            rebuilt.push_str(matched.as_str());
        }

        cursor = matched.end();
    }

    rebuilt.push_str(&text[cursor..]);
    rebuilt
}

fn resolve_integer_number_by_context(context: &str) -> bool {
    has_any_keyword(
        context,
        &[
            "客单价",
            "avg_order_value",
            "arpu",
            "gmv",
            "成交额",
            "销售额",
            "支付金额",
            "金额",
            "元",
            "订单",
            "访客",
            "加购",
            "支付人数",
            "买家",
            "人",
            "单",
            "笔",
            "件",
        ],
    )
}

fn format_integer_with_sign(raw_sign: &str, value: f64) -> String {
    let signed = if raw_sign == "-" { -value.abs() } else { value };
    let rounded = round_to(signed, 0);

    if rounded < 0.0 {
        format!("-{:.0}", rounded.abs())
    } else if raw_sign == "+" {
        format!("+{:.0}", rounded.abs())
    } else {
        format!("{:.0}", rounded.abs())
    }
}
