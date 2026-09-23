use std::{sync::Arc, time::Duration as StdDuration};

use tracing::{info, warn};

use crate::state::AppState;

use super::warmup_report_cache;

pub(in crate::reports) fn spawn_report_cache_warmup(state: Arc<AppState>) {
    tokio::spawn(async move {
        let interval_seconds = state.settings.report_warmup_interval_seconds;
        if interval_seconds > 0 {
            info!(
                interval_seconds,
                "report cache periodic warmup scheduler started"
            );
        }

        loop {
            if let Err(error) = warmup_report_cache(Arc::clone(&state)).await {
                warn!(?error, "report cache warmup failed");
            }

            if interval_seconds == 0 {
                break;
            }

            tokio::time::sleep(StdDuration::from_secs(interval_seconds)).await;
        }
    });
}
