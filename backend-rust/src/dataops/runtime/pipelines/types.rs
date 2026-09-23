use super::super::super::types::DataOpsRuntimePipeline;

#[derive(Debug)]
pub(super) struct RuntimePipelineBuildResult {
    pub(super) pipeline: DataOpsRuntimePipeline,
    pub(super) warnings: Vec<String>,
    pub(super) prefect_reachable: bool,
}
