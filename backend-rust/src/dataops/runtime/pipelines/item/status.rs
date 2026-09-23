use super::super::super::super::{
    time::format_shanghai_datetime,
    types::{DataOpsPipeline, DataOpsPipelineRuntime},
};
use super::super::super::status::derive_pipeline_status;

pub(super) fn finalize_pipeline_status(
    next_pipeline: &mut DataOpsPipeline,
    runtime: &DataOpsPipelineRuntime,
) {
    next_pipeline.status = derive_pipeline_status(next_pipeline.status.as_str(), runtime);
    if let Some(flow_run_at) = runtime.flow_run_at.clone() {
        if flow_run_at != "-" {
            next_pipeline.last_run_at = format_shanghai_datetime(flow_run_at.as_str());
        }
    }

    if runtime
        .flow_run_state_type
        .as_ref()
        .map(|item| item.eq_ignore_ascii_case("COMPLETED"))
        .unwrap_or(false)
    {
        next_pipeline.last_success_at = Some(next_pipeline.last_run_at.clone());
    }
}
