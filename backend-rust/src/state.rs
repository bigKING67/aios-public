use std::sync::Arc;

use dragonfly_client::aio::MultiplexedConnection;
use reqwest::Client;
use sqlx::PgPool;
use tokio::sync::Semaphore;

use crate::config::Settings;
use crate::marketing::CreatorLibraryFilterOptionsCache;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub creator_library_filter_cache: CreatorLibraryFilterOptionsCache,
    pub dragonfly_connection: MultiplexedConnection,
    pub report_build_semaphore: Arc<Semaphore>,
    pub http_client: Client,
    pub settings: Arc<Settings>,
}
