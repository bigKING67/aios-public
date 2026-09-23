use tracing::warn;

pub(super) fn warn_slow_pipeline_item(pipeline_id: &str, elapsed_ms: u128) {
    if elapsed_ms >= 2_000 {
        warn!(
            pipeline_id,
            elapsed_ms, "slow dataops runtime prefect pipeline item"
        );
    }
}
