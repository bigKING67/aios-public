use super::super::types::DataOpsNotificationTraceSloItem;
use super::config::SloConfig;

pub(super) fn build_slo_audit_detail(
    retry_group_id: &str,
    triggered_items: &[DataOpsNotificationTraceSloItem],
    config: &SloConfig,
) -> String {
    let mut lines = Vec::new();
    lines.push(format!("retryGroupId={}", retry_group_id));
    lines.push(format!(
        "阈值：恢复率<{}% 且 首次失败>={}",
        config.recovery_threshold, config.min_first_failed_count
    ));
    lines.push(format!("冷却：{} 分钟", config.cooldown_minutes));
    lines.push("命中项：".to_string());

    for (index, item) in triggered_items.iter().enumerate() {
        let reason_label = if item.reason_hash_label.is_empty() {
            item.reason_hash_key.clone()
        } else {
            item.reason_hash_label.clone()
        };

        lines.push(format!(
            "{}. reasonHash={}；首次失败={}；后续成功={}；仍失败={}；恢复率={}%；样例={}",
            index + 1,
            reason_label,
            item.first_failed_count,
            item.recovered_count,
            item.unresolved_count,
            item.recovery_rate,
            if item.sample_reason.is_empty() {
                "-".to_string()
            } else {
                item.sample_reason.clone()
            }
        ));
    }

    lines.join("\n")
}
