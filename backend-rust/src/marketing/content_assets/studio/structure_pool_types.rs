use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StructurePoolQuery {
    pub(super) date: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StructurePoolRow {
    pub(super) labels: Vec<String>,
    pub(super) label_names: Vec<String>,
    /// competitor / ours / both.
    pub(super) source: String,
    pub(super) share: f64,
    pub(super) planned_count: i32,
    pub(super) available_combinations: i64,
    pub(super) available_is_lower_bound: bool,
    pub(super) reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StructurePoolResponse {
    pub(super) date: String,
    pub(super) as_of: Option<String>,
    pub(super) window_from: Option<String>,
    pub(super) window_to: Option<String>,
    pub(super) product_name: String,
    /// ready / previous_window / pending / no_spend_data.
    pub(super) status: String,
    pub(super) pending: bool,
    pub(super) requested_count: i32,
    pub(super) planned_count: i32,
    pub(super) shortfall: i32,
    pub(super) rows: Vec<StructurePoolRow>,
}
