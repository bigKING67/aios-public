use super::super::super::super::types::DataOpsPipelineRuntime;

pub(super) fn empty_pipeline_runtime() -> DataOpsPipelineRuntime {
    DataOpsPipelineRuntime {
        deployment_id: None,
        deployment_paused: None,
        deployment_status: None,
        work_pool_name: None,
        flow_run_id: None,
        flow_run_state_type: None,
        flow_run_state_name: None,
        flow_run_state_message: None,
        flow_run_at: None,
        operation_error: None,
    }
}
