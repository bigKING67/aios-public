use std::cmp;

use crate::state::AppState;

pub(super) fn resolve_effective_warmup_parallelism(state: &AppState) -> usize {
    let configured = state.settings.report_warmup_parallelism.max(1);
    let build_safe_cap = state.settings.report_build_concurrency.max(1) / 2;
    let db_safe_cap = (state.settings.db_max_connections as usize).max(1) / 8;

    cmp::max(
        1,
        cmp::min(
            configured,
            cmp::min(build_safe_cap.max(1), db_safe_cap.max(1)),
        ),
    )
}
