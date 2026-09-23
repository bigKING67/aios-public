use super::super::{
    env::{env_var_or, parse_env_bool},
    network::{normalize_dragonfly_url, parse_cors_origins},
};

pub(super) struct ServerSettings {
    pub(super) host: String,
    pub(super) port: u16,
    pub(super) dragonfly_url: String,
    pub(super) cors_origins: Vec<String>,
}

pub(super) fn resolve_server_settings() -> ServerSettings {
    let host = env_var_or("RUST_API_HOST", "0.0.0.0");
    let port = env_var_or("RUST_API_PORT", "8000")
        .parse::<u16>()
        .unwrap_or(8000);

    let dragonfly_url =
        normalize_dragonfly_url(env_var_or("DRAGONFLY_URL", "dragonfly://localhost:6379"));

    let cors_origins_raw = env_var_or(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:3001",
    );

    ServerSettings {
        host,
        port,
        dragonfly_url,
        cors_origins: parse_cors_origins(&cors_origins_raw),
    }
}

pub(super) fn resolve_runtime_read_only() -> bool {
    parse_env_bool("AIOS_RUNTIME_READ_ONLY", false)
}
