use once_cell::sync::Lazy;

use super::types::DataOpsStaticConfig;

pub(crate) static DATAOPS_CONFIG: Lazy<DataOpsStaticConfig> = Lazy::new(|| {
    serde_json::from_str(include_str!("../dataops_config.json"))
        .expect("dataops_config.json must be valid")
});
