pub(super) fn resolve_feishu_sync_status(
    lag_minutes: i64,
    healthy_lag_minutes: i64,
    warning_lag_minutes: i64,
) -> String {
    if lag_minutes <= healthy_lag_minutes {
        return "healthy".to_string();
    }

    if lag_minutes <= warning_lag_minutes {
        return "warning".to_string();
    }

    "error".to_string()
}
