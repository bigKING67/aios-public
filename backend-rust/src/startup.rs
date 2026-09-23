use std::{sync::Arc, time::Duration};

use sqlx::postgres::PgPoolOptions;
use tracing::{info, warn};

use crate::{
    config::Settings, content_live_center, cors::build_cors_layer, marketing, reports,
    routes::build_app_with_runtime_mode, schema_compat, state::AppState,
};

pub(crate) async fn run() -> anyhow::Result<()> {
    init_tracing();

    let settings = Arc::new(Settings::from_env()?);
    let runtime_read_only = Settings::runtime_read_only_from_env();
    let startup_policy = RuntimeStartupPolicy::for_read_only(runtime_read_only);
    if startup_policy.enforce_db_read_only {
        warn!(
            "AIOS_RUNTIME_READ_ONLY is enabled; database sessions reject writes and startup mutations are disabled"
        );
    }
    let pool = PgPoolOptions::new()
        .max_connections(settings.db_max_connections)
        .min_connections(settings.db_min_connections)
        .acquire_timeout(Duration::from_secs(settings.db_acquire_timeout_seconds))
        .test_before_acquire(settings.db_test_before_acquire)
        .after_connect(move |connection, _metadata| {
            Box::pin(async move {
                if startup_policy.enforce_db_read_only {
                    sqlx::query("SET default_transaction_read_only = on")
                        .execute(connection)
                        .await?;
                }
                Ok(())
            })
        })
        .connect(settings.database_url.as_str())
        .await?;
    if startup_policy.run_schema_compat {
        schema_compat::ensure_runtime_schema(&pool).await?;
    }

    let dragonfly_client = dragonfly_client::Client::open(settings.dragonfly_url.as_str())?;
    let dragonfly_connection = dragonfly_client.get_multiplexed_tokio_connection().await?;
    let http_client = reqwest::Client::builder().build()?;

    let state = Arc::new(AppState {
        pool,
        creator_library_filter_cache: Default::default(),
        dragonfly_connection,
        report_build_semaphore: Arc::new(tokio::sync::Semaphore::new(
            settings.report_build_concurrency,
        )),
        http_client,
        settings: Arc::clone(&settings),
    });
    if startup_policy.spawn_background_tasks {
        reports::spawn_report_cache_warmup(Arc::clone(&state));
        marketing::spawn_content_asset_stale_upload_cleanup(Arc::clone(&state));
        content_live_center::spawn_stale_upload_cleanup(Arc::clone(&state));
    }

    let cors = build_cors_layer(&settings)?;
    let app = build_app_with_runtime_mode(state, cors, runtime_read_only);
    let bind_address = format!("{}:{}", settings.host, settings.port);
    info!(%bind_address, "aios rust backend listening");

    let listener = tokio::net::TcpListener::bind(bind_address).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

#[derive(Clone, Copy)]
struct RuntimeStartupPolicy {
    enforce_db_read_only: bool,
    run_schema_compat: bool,
    spawn_background_tasks: bool,
}

impl RuntimeStartupPolicy {
    fn for_read_only(read_only: bool) -> Self {
        Self {
            enforce_db_read_only: read_only,
            run_schema_compat: !read_only,
            spawn_background_tasks: !read_only,
        }
    }
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "aios_backend_rust=info,tower_http=info".to_string()),
        )
        .init();
}

#[cfg(test)]
mod tests {
    use super::RuntimeStartupPolicy;

    #[test]
    fn read_only_runtime_disables_every_startup_mutation_path() {
        let policy = RuntimeStartupPolicy::for_read_only(true);

        assert!(policy.enforce_db_read_only);
        assert!(!policy.run_schema_compat);
        assert!(!policy.spawn_background_tasks);
    }

    #[test]
    fn default_runtime_preserves_existing_startup_behavior() {
        let policy = RuntimeStartupPolicy::for_read_only(false);

        assert!(!policy.enforce_db_read_only);
        assert!(policy.run_schema_compat);
        assert!(policy.spawn_background_tasks);
    }
}
