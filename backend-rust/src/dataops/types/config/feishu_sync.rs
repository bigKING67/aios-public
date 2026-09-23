use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsFeishuSyncServiceDefinition {
    pub(crate) id: String,
    pub(crate) service_name: String,
    pub(crate) job_name: String,
    pub(crate) source_table: String,
    #[serde(default)]
    pub(crate) note: Option<String>,
    #[serde(default)]
    pub(crate) cli_flag: Option<String>,
}
