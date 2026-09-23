use super::super::super::env::resolve_usize_env;

const DEFAULT_PREFECT_RUNTIME_CONCURRENCY: usize = 6;
const MAX_PREFECT_RUNTIME_CONCURRENCY: usize = 16;

pub(super) fn resolve_runtime_prefect_concurrency() -> usize {
    resolve_usize_env(
        "DATAOPS_RUNTIME_PREFECT_CONCURRENCY",
        DEFAULT_PREFECT_RUNTIME_CONCURRENCY,
        1,
        MAX_PREFECT_RUNTIME_CONCURRENCY,
    )
}
