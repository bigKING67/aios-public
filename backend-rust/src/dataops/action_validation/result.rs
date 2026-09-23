use serde_json::{Map, Value};

use super::DataOpsTriggerParameterSpec;

#[derive(Debug, Default)]
pub(in crate::dataops) struct ParameterValidationResult {
    pub(in crate::dataops) parameters: Map<String, Value>,
    pub(in crate::dataops) errors: Vec<String>,
}

impl ParameterValidationResult {
    pub(super) fn reject_unsupported_parameters(&mut self) {
        self.errors
            .push("当前任务不支持 parameters 入参".to_string());
    }

    pub(super) fn reject_unknown_key(&mut self, key: &str) {
        self.errors.push(format!("参数 {} 不在允许列表中", key));
    }

    pub(super) fn reject_missing_required(&mut self, spec: &DataOpsTriggerParameterSpec) {
        if spec.required.unwrap_or(false) {
            self.errors.push(format!("参数 {} 必填", spec.key));
        }
    }
}
