use chrono::Utc;
use once_cell::sync::Lazy;
use sqlx::PgPool;
use tracing::warn;

use super::super::super::summary_storage::is_undefined_table;
use super::cache::{get_cached_data_version, set_cached_data_version, DataVersionCache};

static MONTHLY_REPORT_DATA_VERSION_CACHE: Lazy<DataVersionCache> =
    Lazy::new(|| tokio::sync::Mutex::new(None));

pub(in crate::reports) async fn resolve_monthly_report_data_version(pool: &PgPool) -> String {
    let now = Utc::now().timestamp();
    if let Some(cached_version) =
        get_cached_data_version(&MONTHLY_REPORT_DATA_VERSION_CACHE, now).await
    {
        return cached_version;
    }

    let resolved_version = match sqlx::query_scalar::<_, Option<i64>>(monthly_refresh_epoch_query())
        .fetch_one(pool)
        .await
    {
        Ok(Some(refresh_epoch)) => format!("rv{refresh_epoch}"),
        Ok(None) => "rv0".to_string(),
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "monthly report data version fallback because source table is missing"
            );
            "rv0".to_string()
        }
        Err(error) => {
            warn!(
                ?error,
                "monthly report data version fallback because source query failed"
            );
            "rv0".to_string()
        }
    };

    set_cached_data_version(
        &MONTHLY_REPORT_DATA_VERSION_CACHE,
        now,
        resolved_version.as_str(),
    )
    .await;
    resolved_version
}

fn monthly_refresh_epoch_query() -> &'static str {
    r#"
    WITH refreshes AS (
        SELECT MAX(COALESCE(last_refresh_at, updated_at)) AS refresh_ts
        FROM etl.all_trade_overview_refresh_state
        UNION ALL
        SELECT MAX(updated_at) AS refresh_ts
        FROM ads.report_all_trade_month
        UNION ALL
        SELECT MAX(updated_at) AS refresh_ts
        FROM ads.report_all_trade_month_platform
    )
    SELECT COALESCE(EXTRACT(EPOCH FROM MAX(refresh_ts))::BIGINT, 0) AS refresh_epoch
    FROM refreshes
    "#
}
