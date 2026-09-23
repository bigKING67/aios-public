mod bootstrap;
mod errors;
mod statements;

use std::sync::atomic::{AtomicBool, Ordering};

use sqlx::PgPool;

use crate::error::AppResult;

pub(super) use errors::{is_legacy_week_unique_violation, is_undefined_table, is_unique_violation};

static WEEKLY_SUMMARY_STORAGE_READY: AtomicBool = AtomicBool::new(false);

pub(super) async fn ensure_weekly_summary_storage(pool: &PgPool) -> AppResult<()> {
    if WEEKLY_SUMMARY_STORAGE_READY.load(Ordering::Relaxed) {
        return Ok(());
    }

    bootstrap::bootstrap_weekly_summary_storage(pool).await?;
    WEEKLY_SUMMARY_STORAGE_READY.store(true, Ordering::Relaxed);
    Ok(())
}
