use once_cell::sync::Lazy;
use regex::Regex;

use super::{
    numeric::round_to,
    text_context::{ceil_char_boundary, floor_char_boundary, has_any_keyword},
};

static PERCENT_LITERAL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?P<sign>[+-]?)(?P<num>\d+(?:\.\d+)?)\s*%").expect("valid percent regex")
});

pub(crate) fn normalize_summary_text_percentages(text: &str) -> String {
    let mut rebuilt = String::with_capacity(text.len());
    let mut cursor = 0usize;

    for captures in PERCENT_LITERAL_RE.captures_iter(text) {
        let Some(matched) = captures.get(0) else {
            continue;
        };
        rebuilt.push_str(&text[cursor..matched.start()]);

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
            let left = floor_char_boundary(text, matched.start().saturating_sub(18));
            let right = ceil_char_boundary(text, (matched.end() + 12).min(text.len()));
            let context = text[left..right].to_lowercase();

            if let Some(decimals) = resolve_percent_decimals_by_context(context.as_str()) {
                rebuilt.push_str(format_percent_with_decimals(sign, raw_value, decimals).as_str());
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

fn resolve_percent_decimals_by_context(context: &str) -> Option<i32> {
    // 规则优先级：环比/涨幅类（整数）优先于“点击率等率值”。
    if has_any_keyword(
        context,
        &[
            "环比",
            "同比",
            "涨幅",
            "降幅",
            "增幅",
            "增长",
            "下降",
            "提升",
            "下滑",
            "回落",
            "贡献率",
            "贡献",
            "wow",
            "mom",
            "yoy",
            "growth",
            "change",
        ],
    ) {
        return Some(0);
    }

    if has_any_keyword(
        context,
        &[
            "点击率",
            "点击加购率",
            "加购率",
            "加购转化率",
            "转化率",
            "访客支付转化率",
            "支付转化率",
            "ctr",
            "cvr",
            "click-to-cart",
            "cart-to-pay",
            "conversion",
        ],
    ) {
        return Some(2);
    }

    None
}

fn format_percent_with_decimals(raw_sign: &str, raw_value: f64, decimals: i32) -> String {
    let signed = if raw_sign == "-" {
        -raw_value.abs()
    } else {
        raw_value.abs()
    };
    let rounded = round_to(signed, decimals);
    let abs_value = rounded.abs();
    let number_text = if decimals <= 0 {
        format!("{abs_value:.0}")
    } else {
        format!("{abs_value:.2}")
    };

    let sign_prefix = if rounded < 0.0 {
        "-"
    } else if raw_sign == "+" {
        "+"
    } else {
        ""
    };

    format!("{sign_prefix}{number_text}%")
}
