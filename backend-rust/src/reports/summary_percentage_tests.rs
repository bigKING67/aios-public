#![allow(clippy::items_after_test_module)]

use super::{
    factor_reason::build_factor_reason_and_action,
    summary_conclusions::{parse_conclusions_from_llm, validate_conclusions_quality},
    summary_jobs::{is_deepseek_reasoner_model, is_llm_empty_content_error, is_llm_timeout_error},
    summary_normalization::{
        is_integer_display_metric_key, is_integer_percent_key, is_two_decimal_rate_key,
        normalize_summary_text_numbers, normalize_summary_text_percentages,
    },
    traffic_channel::{
        channel_profile_to_nature, classify_traffic_channel_profile, TrafficChannelNature,
        TrafficChannelProfile,
    },
    Conclusions,
};

#[test]
fn key_classification_skips_non_percent_contribution_value() {
    assert!(!is_integer_percent_key("contribution_value"));
    assert!(is_integer_percent_key("contribution_rate"));
}

#[test]
fn channel_nature_classification_distinguishes_free_and_paid() {
    assert_eq!(
        channel_profile_to_nature(classify_traffic_channel_profile("搜索")),
        TrafficChannelNature::Free
    );
    assert_eq!(
        channel_profile_to_nature(classify_traffic_channel_profile("recommend")),
        TrafficChannelNature::Free
    );
    assert_eq!(
        channel_profile_to_nature(classify_traffic_channel_profile("关键词推广")),
        TrafficChannelNature::Paid
    );
    assert_eq!(
        channel_profile_to_nature(classify_traffic_channel_profile("crowdAd")),
        TrafficChannelNature::Paid
    );
}

#[test]
fn free_channel_visitor_copy_avoids_paid_delivery_wording() {
    let channel_profile = TrafficChannelProfile::Search;
    let (reason, action) = build_factor_reason_and_action(
        "visitor",
        0.12,
        "搜索",
        channel_profile,
        channel_profile_to_nature(channel_profile),
    );

    assert!(reason.contains("搜索"));
    assert!(!reason.contains("推荐分发"));
    assert!(!action.contains("投放"));
}

#[test]
fn paid_channel_visitor_copy_keeps_delivery_wording() {
    let channel_profile = TrafficChannelProfile::KeywordAd;
    let (_, action) = build_factor_reason_and_action(
        "visitor",
        0.12,
        "关键词推广",
        channel_profile,
        channel_profile_to_nature(channel_profile),
    );

    assert!(action.contains("词"));
    assert!(!action.contains("推荐"));
}

#[test]
fn channel_profile_classification_distinguishes_core_channels() {
    assert_eq!(
        classify_traffic_channel_profile("搜索"),
        TrafficChannelProfile::Search
    );
    assert_eq!(
        classify_traffic_channel_profile("推荐"),
        TrafficChannelProfile::Recommend
    );
    assert_eq!(
        classify_traffic_channel_profile("关键词推广"),
        TrafficChannelProfile::KeywordAd
    );
    assert_eq!(
        classify_traffic_channel_profile("人群推广"),
        TrafficChannelProfile::CrowdAd
    );
}

#[test]
fn recommend_visitor_copy_focuses_inventory_and_sell_through() {
    let channel_profile = TrafficChannelProfile::Recommend;
    let (reason, action) = build_factor_reason_and_action(
        "visitor",
        -0.21,
        "推荐",
        channel_profile,
        channel_profile_to_nature(channel_profile),
    );

    assert!(reason.contains("库存") || reason.contains("动销"));
    assert!(!action.contains("关键词推广"));
}

#[test]
fn crowd_click_rate_copy_emphasizes_creative_people_match() {
    let channel_profile = TrafficChannelProfile::CrowdAd;
    let (reason, action) = build_factor_reason_and_action(
        "click_rate",
        -0.11,
        "人群推广",
        channel_profile,
        channel_profile_to_nature(channel_profile),
    );

    assert!(reason.contains("人群"));
    assert!(action.contains("人群"));
}

#[test]
fn normalize_summary_text_formats_growth_and_rate_by_rule() {
    let text = "GMV环比+12.6%，点击率12.345%，加购转化率2%";
    let normalized = normalize_summary_text_percentages(text);

    assert!(normalized.contains("环比+13%"));
    assert!(normalized.contains("点击率12.35%"));
    assert!(normalized.contains("加购转化率2.00%"));
}

#[test]
fn parse_llm_output_applies_percent_normalization() {
    let raw = r#"{
          "overall":"本周GMV环比+9.8%，点击率11.239%",
          "highlights":["点击加购率3.2%","加购转化率1.4%"],
          "risks":["贡献率+6.6%"]
        }"#;

    let parsed = parse_conclusions_from_llm(raw).expect("parse llm output");
    assert!(parsed.overall.contains("环比+10%"));
    assert!(parsed.overall.contains("点击率11.24%"));
    assert!(parsed
        .highlights
        .iter()
        .any(|item| item.contains("点击加购率3.20%")));
    assert!(parsed
        .highlights
        .iter()
        .any(|item| item.contains("加购转化率1.40%")));
    assert!(parsed.risks.iter().any(|item| item.contains("贡献率+7%")));
}

#[test]
fn rate_key_detection_supports_channel_metric_alias() {
    assert!(is_two_decimal_rate_key("curr_click_to_cart_rate"));
    assert!(is_two_decimal_rate_key("访客支付转化率"));
}

#[test]
fn integer_display_metric_key_detects_amount_and_aov() {
    assert!(is_integer_display_metric_key("pay_amount"));
    assert!(is_integer_display_metric_key("avg_order_value"));
    assert!(!is_integer_display_metric_key("contribution_value"));
}

#[test]
fn normalize_summary_text_numbers_rounds_aov_and_strips_trailing_zero_decimal() {
    let text = "天猫GMV为9611.0，客单价123.8元，Shapley贡献值0.1234。";
    let normalized = normalize_summary_text_numbers(text);

    assert!(normalized.contains("GMV为9611"));
    assert!(normalized.contains("客单价124元"));
    assert!(normalized.contains("Shapley贡献值0.1234"));
}

#[test]
fn reasoner_model_detection_matches_expected_provider_and_model() {
    assert!(is_deepseek_reasoner_model("deepseek", "deepseek-reasoner"));
    assert!(is_deepseek_reasoner_model("deepseek", "DeepSeek-R1"));
    assert!(!is_deepseek_reasoner_model("deepseek", "deepseek-chat"));
    assert!(!is_deepseek_reasoner_model("kimi", "deepseek-reasoner"));
}

#[test]
fn timeout_error_detection_matches_common_timeout_strings() {
    let timeout_err = anyhow::anyhow!("llm request failed (timeout=660s)");
    let read_err = anyhow::anyhow!("llm response body read failed (timeout=660s)");
    let other_err = anyhow::anyhow!("llm http error 400: bad request");

    assert!(is_llm_timeout_error(&timeout_err));
    assert!(is_llm_timeout_error(&read_err));
    assert!(!is_llm_timeout_error(&other_err));
}

#[test]
fn empty_content_error_detection_matches_common_strings() {
    let empty_content_err = anyhow::anyhow!("llm content is empty");
    let wrapped_err =
        anyhow::anyhow!("llm response content missing: payload ...: llm content is empty");
    let other_err = anyhow::anyhow!("llm http error 401: unauthorized");

    assert!(is_llm_empty_content_error(&empty_content_err));
    assert!(is_llm_empty_content_error(&wrapped_err));
    assert!(!is_llm_empty_content_error(&other_err));
}

#[test]
fn conclusion_quality_requires_magnitude_and_action() {
    let conclusions = Conclusions {
        overall: "本周GMV ¥28766，环比+24%。".to_string(),
        highlights: vec!["关键词推广支付金额 ¥16880，环比+51%，建议提高高转化词预算。".to_string()],
        risks: vec!["搜索加购人数 321 人，环比-12%，建议排查承接页转化路径。".to_string()],
    };

    assert!(validate_conclusions_quality(&conclusions).is_ok());
}

#[test]
fn conclusion_quality_rejects_percent_only_copy() {
    let conclusions = Conclusions {
        overall: "本周环比+24%。".to_string(),
        highlights: vec!["点击率+2%。".to_string()],
        risks: vec!["转化率-1%。".to_string()],
    };

    assert!(validate_conclusions_quality(&conclusions).is_err());
}
