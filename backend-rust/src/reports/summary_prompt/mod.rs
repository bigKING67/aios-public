mod brief;
mod minimum;

use brief::build_summary_facts_brief;

pub(super) use minimum::has_minimum_summary_facts;

pub(super) fn build_summary_prompt(
    business_framework: &str,
    custom_prompt: &str,
    facts: serde_json::Value,
) -> (String, String) {
    let framework = if business_framework.trim().is_empty() {
        "围绕 GMV、订单、用户、平台贡献和风险给出可执行结论".to_string()
    } else {
        business_framework.trim().to_string()
    };

    let custom = if custom_prompt.trim().is_empty() {
        "".to_string()
    } else {
        format!("\n\n补充要求：{}", custom_prompt.trim())
    };

    let system_prompt = "你是资深电商经营分析师。请严格遵循以下规则：\
1) 只能使用“事实数据”中出现的信息，不得编造任何数字、平台名称、活动信息或结论依据。\
2) 若事实中缺失某信息，明确写“数据未提供”，不要猜测。\
3) 禁止使用“平台A/平台B/平台C、渠道A/渠道B”等占位词。\
4) 输出必须是严格 JSON 对象，字段仅允许 overall(string)、highlights(string[])、risks(string[])。\
5) 平台名称统一使用中文全称（天猫、抖音、小红书、微信、京东），禁止输出 taobao/wx/xhs 等英文缩写。\
6) 百分比格式强约束：环比/涨跌幅/贡献率等百分比统一用整数（如 +14%）；点击率/加购率/转化率/CTR/CVR 等百分比统一保留 2 位小数（如 12.34%）。\
7) 客单价/ARPU/金额/人数/订单等绝对量字段默认写整数（示例：客单价 168 元、支付人数 321 人），禁止输出冗长小数。\
8) 亮点与风险必须尽量“量级+幅度”同时出现：优先写绝对量（如金额/人数/订单）并配变化幅度；禁止只写涨跌百分比不写量级。\
9) 结论要可执行：至少给出可落地动作（如投放、人群、素材、出价、承接页、活动节奏、货品策略），避免空泛表述。\
10) 不要输出 markdown，不要输出额外字段。"
        .to_string();

    let facts_text = serde_json::to_string(&facts).unwrap_or_else(|_| "{}".to_string());
    let facts_brief = build_summary_facts_brief(&facts);
    let user_prompt = format!(
        "业务分析框架：{}\n\n可直接引用的事实速览：\n{}\n\n事实数据(JSON)：{}{}\n\n请只输出 JSON。",
        framework, facts_brief, facts_text, custom
    );

    (system_prompt, user_prompt)
}
