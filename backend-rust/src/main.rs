mod audit_logs;
mod auth;
mod config;
mod content_live_center;
mod cors;
mod dashboard;
mod dataops;
mod error;
mod health;
mod llm;
mod marketing;
mod permissions;
mod reports;
mod roles;
mod routes;
mod sample_inventory;
mod schema_compat;
mod startup;
mod state;
mod users;
mod xlsx;

use tracing::error;

#[tokio::main]
async fn main() {
    if let Err(error) = startup::run().await {
        error!(?error, "aios rust backend failed to start");
        std::process::exit(1);
    }
}
