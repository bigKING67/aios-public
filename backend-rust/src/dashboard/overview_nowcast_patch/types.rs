use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub(crate) struct OverviewNowcastPatch {
    #[serde(rename = "asOfDate")]
    pub(crate) as_of_date: Option<String>,
    #[serde(rename = "nowcastQuality", default)]
    pub(crate) nowcast_quality: Value,
    #[serde(rename = "currentByDate", default)]
    pub(crate) current_by_date: Value,
    #[serde(rename = "previousByDate", default)]
    pub(crate) previous_by_date: Value,
    #[serde(rename = "currentTotal", default)]
    pub(crate) current_total: Value,
    #[serde(rename = "previousTotal", default)]
    pub(crate) previous_total: Value,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OverviewDetailsNowcastPatch {
    #[serde(rename = "asOfDate")]
    pub(crate) as_of_date: Option<String>,
    #[serde(rename = "byRow", default)]
    pub(crate) by_row: Value,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct SeriesPredictedTotals {
    pub(crate) predicted_total: f64,
    pub(crate) gmv_total: Option<f64>,
}
