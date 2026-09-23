use once_cell::sync::Lazy;
use regex::Regex;

use super::super::Conclusions;

static ABSOLUTE_MAGNITUDE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(¥\s*\d+(?:\.\d+)?(?:万|亿|千|K)?)|(\d+(?:\.\d+)?\s*(?:万|亿|千|K|元|单|笔|人|次|件))",
    )
    .expect("valid absolute magnitude regex")
});

pub(in crate::reports) fn has_forbidden_placeholder_terms(conclusions: &Conclusions) -> bool {
    let mut texts: Vec<&str> = vec![conclusions.overall.as_str()];
    texts.extend(conclusions.highlights.iter().map(String::as_str));
    texts.extend(conclusions.risks.iter().map(String::as_str));

    let combined = texts.join(" ");
    let normalized = combined.to_lowercase();
    [
        "平台a",
        "平台b",
        "平台c",
        "渠道a",
        "渠道b",
        "渠道c",
        "platform a",
        "platform b",
        "platform c",
    ]
    .iter()
    .any(|term| normalized.contains(term))
}

pub(in crate::reports) fn validate_conclusions_quality(
    conclusions: &Conclusions,
) -> anyhow::Result<()> {
    let mut lines: Vec<&str> = Vec::new();
    lines.push(conclusions.overall.as_str());
    lines.extend(conclusions.highlights.iter().map(String::as_str));
    lines.extend(conclusions.risks.iter().map(String::as_str));
    let non_empty_lines = lines
        .into_iter()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if non_empty_lines.is_empty() {
        anyhow::bail!("llm output is empty");
    }

    let magnitude_hits = non_empty_lines
        .iter()
        .filter(|line| has_absolute_magnitude(line))
        .count();
    if magnitude_hits < 2 {
        anyhow::bail!("llm output lacks absolute magnitude details");
    }

    if !has_absolute_magnitude(conclusions.overall.as_str())
        && !is_data_unavailable_text(conclusions.overall.as_str())
    {
        anyhow::bail!("overall lacks absolute magnitude");
    }

    let action_hits = non_empty_lines
        .iter()
        .filter(|line| has_actionable_keyword(line))
        .count();
    if action_hits < 1 {
        anyhow::bail!("llm output lacks actionable suggestions");
    }

    Ok(())
}

fn has_absolute_magnitude(text: &str) -> bool {
    ABSOLUTE_MAGNITUDE_RE.is_match(text)
}

fn has_actionable_keyword(text: &str) -> bool {
    let normalized = text.to_lowercase();
    [
        "建议",
        "优先",
        "执行",
        "优化",
        "调整",
        "加大",
        "降低",
        "排查",
        "复盘",
        "推进",
        "聚焦",
        "提升",
        "控制",
        "补货",
        "投放",
        "出价",
        "人群",
        "素材",
        "承接页",
        "活动",
        "货品",
        "节奏",
        "optimize",
        "action",
        "execute",
    ]
    .iter()
    .any(|term| normalized.contains(term))
}

fn is_data_unavailable_text(text: &str) -> bool {
    let normalized = text.to_lowercase();
    normalized.contains("数据未提供")
        || normalized.contains("数据暂无")
        || normalized.contains("暂无数据")
        || normalized.contains("未提供")
}
