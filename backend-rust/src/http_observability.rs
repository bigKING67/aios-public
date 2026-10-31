//! Response-header latency and pool occupancy, without raw URLs, headers or bodies.
use std::time::Instant;

use axum::{
    extract::{MatchedPath, Request, State},
    middleware::Next,
    response::Response,
};
use sqlx::PgPool;

pub(crate) async fn observe(State(pool): State<PgPool>, request: Request, next: Next) -> Response {
    let started = Instant::now();
    // Never fall back to the URI: unmatched URLs may themselves contain secrets.
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_owned())
        .unwrap_or_else(|| "unmatched".to_owned());
    let method = request.method().clone();
    let response = next.run(request).await;
    tracing::info!(
        route,
        method = %method,
        status = response.status().as_u16(),
        duration_ms = started.elapsed().as_secs_f64() * 1000.0,
        db_pool_size = pool.size(),
        db_pool_idle = pool.num_idle(),
        "http_response"
    );
    response
}

#[cfg(test)]
mod tests {
    use std::{
        io::Write,
        sync::{Arc, Mutex},
    };

    use axum::{middleware, routing::get, Router};
    use sqlx::postgres::PgPoolOptions;

    use super::observe;

    #[derive(Clone)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);

    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn real_http_logs_templates_and_outcomes_without_request_secrets() {
        let buffer = Buffer(Arc::new(Mutex::new(Vec::new())));
        let writer = buffer.clone();
        let subscriber = tracing_subscriber::fmt()
            .without_time()
            .with_ansi(false)
            .with_writer(move || writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://fixture:fixture@127.0.0.1:1/fixture")
            .unwrap();
        let app = Router::new()
            .nest(
                "/v1",
                Router::new().route("/items/{id}", get(|| async { "ok" })),
            )
            .layer(middleware::from_fn_with_state(pool, observe));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let response = client
            .get(format!(
                "http://{address}/v1/items/private-id?token=private-query"
            ))
            .header("authorization", "Bearer private-header")
            .body("private-body")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.text().await.unwrap(), "ok");
        assert_eq!(
            client
                .get(format!("http://{address}/private-unmatched"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        server.abort();
        let logs = String::from_utf8(buffer.0.lock().unwrap().clone()).unwrap();
        assert!(logs.contains("/v1/items/{id}"), "{logs}");
        assert!(logs.contains("unmatched"));
        assert!(logs.contains("status=200"));
        assert!(logs.contains("status=404"));
        assert!(logs.contains("duration_ms="));
        assert!(logs.contains("db_pool_size=0"));
        assert!(!logs.contains("private-"), "{logs}");
    }
}
