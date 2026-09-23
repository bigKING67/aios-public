use chrono::Utc;
use serde_json::json;

use crate::state::AppState;

use super::super::periods::normalize_week_period_for_api;
use super::scope::normalize_weekly_summary_scope;

pub(crate) async fn cache_summary_status(
    state: &AppState,
    week_period: &str,
    summary_scope: &str,
    status: &str,
) {
    let mut connection = state.dragonfly_connection.clone();

    let normalized_scope = normalize_weekly_summary_scope(Some(summary_scope));
    let key = format!(
        "cache:weekly:summary:status:{}:{}",
        normalize_week_period_for_api(week_period),
        normalized_scope
    );
    let value = json!({
        "status": status,
        "summary_scope": normalized_scope,
        "updated_at": Utc::now().to_rfc3339(),
    })
    .to_string();

    let _ = dragonfly_client::cmd("SETEX")
        .arg(key)
        .arg(30)
        .arg(value)
        .query_async::<()>(&mut connection)
        .await;
}
