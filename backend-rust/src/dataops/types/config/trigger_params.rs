use serde::Deserialize;
use serde_json::Value;

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsTriggerParameterOption {
    pub(crate) label: String,
    pub(crate) value: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsTriggerParameterSpec {
    pub(crate) key: String,
    pub(crate) label: String,
    #[serde(rename = "type")]
    pub(crate) param_type: String,
    #[serde(default)]
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) required: Option<bool>,
    #[serde(default)]
    pub(crate) integer: Option<bool>,
    #[serde(default)]
    pub(crate) min: Option<f64>,
    #[serde(default)]
    pub(crate) max: Option<f64>,
    #[serde(default)]
    pub(crate) placeholder: Option<String>,
    #[serde(default)]
    pub(crate) options: Vec<DataOpsTriggerParameterOption>,
    #[serde(default)]
    pub(crate) default_value: Option<Value>,
}
