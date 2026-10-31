//! User-facing availability, admission and shortfall projection for manual and daily previews.
use super::remix::{Normalized, Plan, RemixMode};
use super::remix_types::{RemixBatchPreviewResponse, RemixSlotAvailability};

pub(super) fn label_name<'a>(plan: &'a Plan, key: &'a str) -> &'a str {
    plan.preset_labels
        .iter()
        .find(|label| label.key == key)
        .map_or(key, |label| label.name.as_str())
}

pub(super) fn shortfall_reason(plan: &Plan, requested: usize) -> Option<String> {
    let missing: Vec<String> = plan
        .labels
        .iter()
        .enumerate()
        .filter(|(index, _)| plan.slots[*index].candidates == 0)
        .map(|(index, key)| format!("第{}位·{}", index + 1, label_name(plan, key)))
        .collect();
    if !missing.is_empty() {
        return Some(format!(
            "以下框架槽位没有同产品{}的可用已确认片段：{}",
            if plan.slot_tolerance {
                "、时长在参考段 ±20% 内"
            } else {
                ""
            },
            missing.join("、")
        ));
    }
    if plan.runs.len() >= requested {
        return None;
    }
    if plan.admission_excluded > 0 {
        let deficit = requested - plan.runs.len();
        return Some(format!("{}素材准入排除 {} 个组合，本批少出 {deficit} 条（每条至少 1 段达标，低消耗含无数据最多 2 段）",
            if plan.exact { "因" } else { "抽样中因" }, plan.admission_excluded));
    }
    let counts: Vec<String> = plan
        .slots
        .iter()
        .map(|s| s.candidates.to_string())
        .collect();
    let rules = match plan.mode {
        RemixMode::Framework if plan.slot_tolerance => {
            "同一片段重复、槽位时长超出 ±20%、总时长越界"
        }
        RemixMode::Framework => "同一片段重复、总时长越界",
        RemixMode::SellingPoint => {
            "缺少必保卖点（滋润保湿、养肤护肤）、同一片段或卖点重复、槽位时长超出 ±20%、总时长越界"
        }
    };
    Some(format!(
        "可用组合{}{} 种，少于请求的 {requested} 条（各槽位候选 {}；已排除{rules}{}）",
        if plan.exact {
            "只有 "
        } else {
            "抽样只找到 "
        },
        plan.runs.len(),
        counts.join(" × "),
        if plan.previously_used > 0 {
            format!("及此前批次已用的 {} 种", plan.previously_used)
        } else {
            String::new()
        }
    ))
}

pub(super) fn preview_response(n: &Normalized, plan: &Plan) -> RemixBatchPreviewResponse {
    let to_i64 = |value: u64| i64::try_from(value).unwrap_or(i64::MAX);
    RemixBatchPreviewResponse {
        admission_excluded: (plan.mode == RemixMode::Framework)
            .then_some(to_i64(plan.admission_excluded)),
        admission_excluded_is_lower_bound: (plan.mode == RemixMode::Framework)
            .then_some(!plan.exact),
        mode: plan.mode.as_str().to_owned(),
        labels: plan.labels.clone(),
        source_asset_id: n.source_asset_id,
        product_name: n.product_name.clone(),
        slots: plan
            .labels
            .iter()
            .zip(&plan.slots)
            .enumerate()
            .map(|(index, (label, slot))| RemixSlotAvailability {
                spend_counts: slot.spend_counts.clone(),
                ordinal: index as i32 + 1,
                label_key: label.clone(),
                candidate_count: slot.candidates as i32,
                selling_points: slot.selling_points.clone(),
                fallback: slot.fallback,
            })
            .collect(),
        missing_labels: plan.missing_labels.clone(),
        excluded_asset_count: plan.excluded_assets as i32,
        theoretical_combinations: to_i64(plan.theoretical),
        available_combinations: to_i64(plan.available),
        available_is_lower_bound: !plan.exact,
        previously_used_combinations: to_i64(plan.previously_used),
        reference_combination_excluded: plan.reference_excluded,
        requested_count: n.count as i32,
        plannable_count: plan.runs.len() as i32,
        shortfall_reason: shortfall_reason(plan, n.count),
        seed: plan.seed as i64,
    }
}
