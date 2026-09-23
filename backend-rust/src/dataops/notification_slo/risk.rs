use super::super::types::DataOpsNotificationTraceSloScanItem;

pub(in crate::dataops) fn get_dataops_notification_trace_slo_risk_score(
    item: &DataOpsNotificationTraceSloScanItem,
) -> i64 {
    if !item.breached {
        return if item.warning.is_some() { 15 } else { 0 };
    }

    let mut score = 60;
    if item.triggered_count > 0 {
        score += 120 + (item.triggered_count * 12).min(120);
    } else if item.cooldown_count > 0 {
        score += 80 + (item.cooldown_count * 8).min(80);
    } else {
        score += 50;
    }

    score += item.event_count.min(60);
    if item.warning.is_some() {
        score += 20;
    }

    score
}

pub(in crate::dataops) fn resolve_dataops_notification_trace_slo_risk_level(
    item: &DataOpsNotificationTraceSloScanItem,
    risk_score: i64,
) -> String {
    if !item.breached {
        return if item.warning.is_some() {
            "watch".to_string()
        } else {
            "normal".to_string()
        };
    }

    if item.triggered_count > 0 || risk_score >= 220 {
        return "critical".to_string();
    }
    if item.cooldown_count > 0 || risk_score >= 160 {
        return "warning".to_string();
    }

    "watch".to_string()
}
