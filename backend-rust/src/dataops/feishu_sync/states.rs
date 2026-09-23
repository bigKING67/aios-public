use std::collections::HashMap;

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use sqlx::Row;

use crate::state::AppState;

use super::table::{is_undefined_table_or_column, resolve_feishu_sync_state_table};

#[derive(Debug, Clone)]
pub(super) struct FeishuSyncState {
    pub(super) service_name: String,
    pub(super) last_watermark: Option<String>,
    pub(super) last_primary_key: Option<String>,
    pub(super) updated_at: DateTime<Utc>,
}

pub(super) async fn fetch_feishu_sync_states(
    state: &AppState,
) -> Result<HashMap<String, FeishuSyncState>, String> {
    let table_name = resolve_feishu_sync_state_table()?;
    let query = format!(
        "SELECT service_name, last_watermark, last_primary_key, updated_at FROM {}",
        table_name
    );

    let rows = sqlx::query(query.as_str())
        .fetch_all(&state.pool)
        .await
        .map_err(|error| {
            if is_undefined_table_or_column(&error) {
                format!(
                    "飞书同步水位表 {} 不存在或字段不完整，无法读取运行态。",
                    table_name
                )
            } else {
                format!("飞书同步运行态读取失败：{}", error)
            }
        })?;

    let mut states = HashMap::new();
    for row in rows {
        let service_name = row
            .try_get::<String, _>("service_name")
            .unwrap_or_default()
            .trim()
            .to_string();
        if service_name.is_empty() {
            continue;
        }

        let Some(updated_at) = read_feishu_sync_updated_at(&row) else {
            continue;
        };

        states.insert(
            service_name.clone(),
            FeishuSyncState {
                service_name,
                last_watermark: row
                    .try_get::<Option<String>, _>("last_watermark")
                    .ok()
                    .flatten(),
                last_primary_key: row
                    .try_get::<Option<String>, _>("last_primary_key")
                    .ok()
                    .flatten(),
                updated_at,
            },
        );
    }

    Ok(states)
}

fn read_feishu_sync_updated_at(row: &sqlx::postgres::PgRow) -> Option<DateTime<Utc>> {
    if let Ok(value) = row.try_get::<DateTime<Utc>, _>("updated_at") {
        return Some(value);
    }

    let value = row.try_get::<NaiveDateTime, _>("updated_at").ok()?;
    let offset = FixedOffset::east_opt(8 * 3600).expect("+08 offset");
    offset
        .from_local_datetime(&value)
        .single()
        .map(|datetime| datetime.with_timezone(&Utc))
}
