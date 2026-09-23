use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Deserialize)]
pub(crate) struct NotesQueryParams {
    pub(crate) start_date: Option<String>,
    pub(crate) end_date: Option<String>,
    pub(crate) platform: Option<String>,
    pub(crate) include_rows: Option<String>,
    pub(crate) note_date: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateDashboardNoteRequest {
    pub(crate) note_date: Option<String>,
    pub(crate) platform: Option<String>,
    pub(crate) metric_key: Option<String>,
    pub(crate) action_text: Option<String>,
    pub(crate) reason_text: Option<String>,
    pub(crate) summary_text: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct UpdateDashboardNoteRequest {
    pub(crate) metric_key: Option<String>,
    pub(crate) action_text: Option<String>,
    pub(crate) reason_text: Option<String>,
    pub(crate) summary_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DashboardDailyNoteRow {
    pub(super) id: i64,
    pub(super) note_date: String,
    pub(super) platform: String,
    pub(super) metric_key: Option<String>,
    pub(super) action_text: String,
    pub(super) reason_text: String,
    pub(super) summary_text: String,
    pub(super) created_by: String,
    pub(super) updated_by: String,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DashboardDailyNotesResponse {
    pub(crate) start_date: String,
    pub(crate) end_date: String,
    pub(crate) platform: String,
    pub(crate) include_rows: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub(crate) note_date: String,
    pub(crate) rows: Vec<DashboardDailyNoteRow>,
    pub(crate) counts_by_date: BTreeMap<String, i64>,
}

pub(super) fn note_entity_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<DashboardDailyNoteRow, String> {
    Ok(DashboardDailyNoteRow {
        id: row
            .try_get::<i64, _>("id")
            .map_err(|error| error.to_string())?,
        note_date: row
            .try_get::<String, _>("note_date")
            .map_err(|error| error.to_string())?,
        platform: row
            .try_get::<String, _>("platform")
            .map_err(|error| error.to_string())?,
        metric_key: row
            .try_get::<Option<String>, _>("metric_key")
            .unwrap_or(None),
        action_text: row
            .try_get::<String, _>("action_text")
            .map_err(|error| error.to_string())?,
        reason_text: row
            .try_get::<String, _>("reason_text")
            .map_err(|error| error.to_string())?,
        summary_text: row
            .try_get::<String, _>("summary_text")
            .map_err(|error| error.to_string())?,
        created_by: row
            .try_get::<String, _>("created_by")
            .map_err(|error| error.to_string())?,
        updated_by: row
            .try_get::<String, _>("updated_by")
            .map_err(|error| error.to_string())?,
        created_at: row
            .try_get::<String, _>("created_at")
            .map_err(|error| error.to_string())?,
        updated_at: row
            .try_get::<String, _>("updated_at")
            .map_err(|error| error.to_string())?,
    })
}
