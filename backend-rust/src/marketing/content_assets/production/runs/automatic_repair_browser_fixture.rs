//! Test-only loopback API. Synthetic identity injection is not a login acceptance test.
use super::{
    repository,
    types::{CreateRunRequest, Run},
};
use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use axum::{
    extract::Request,
    middleware::{self, Next},
};
use serde_json::json;
use std::{path::PathBuf, time::Duration};

pub(super) struct BrowserFixture {
    path: PathBuf,
    server: tokio::task::JoinHandle<()>,
}
impl Drop for BrowserFixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}
impl BrowserFixture {
    pub(super) async fn start(
        state: &AppState,
        expected: &CreateRunRequest,
    ) -> Option<(Self, Run)> {
        let path = PathBuf::from(std::env::var_os("AIOS_TEST_AUTO_BROWSER_HANDOFF")?);
        assert!(!path.exists(), "use a new test handoff path");
        let token =
            crate::marketing::content_assets::handlers::qianchuan_http_route_tests::access_token();
        let app = build_app(
            state.clone().into(),
            build_cors_layer(&state.settings).unwrap(),
        )
        .layer(middleware::from_fn(
            move |mut request: Request, next: Next| {
                let token = token.clone();
                async move {
                    request.headers_mut().insert(
                        axum::http::header::AUTHORIZATION,
                        format!("Bearer {token}").parse().unwrap(),
                    );
                    next.run(request).await
                }
            },
        ));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        // Publish only loopback address and non-sensitive fixture fields, never auth material.
        std::fs::write(&path, serde_json::to_vec_pretty(&json!({"baseUrl":base,"request":expected,"phase":"create","identity":"synthetic fixture user"})).unwrap()).unwrap();
        let fixture = Self { path, server };
        let id = tokio::time::timeout(Duration::from_secs(600), async {
            loop {
                let id: Option<uuid::Uuid> = sqlx::query_scalar("SELECT run_id FROM ads.content_production_runs WHERE owner_user_id='90000001' AND request->>'title'=$1 AND active_attempt IS NOT NULL ORDER BY created_at DESC LIMIT 1")
                    .bind(&expected.title).fetch_optional(&state.pool).await.unwrap();
                if let Some(id) = id { break id; }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }).await.expect("browser did not create the task within 10 minutes");
        let run = repository::get(&state.pool, "90000001", id).await.unwrap();
        let mut actual = run.request.clone();
        actual.idempotency_key = expected.idempotency_key.clone();
        assert_eq!(
            serde_json::to_value(actual).unwrap(),
            serde_json::to_value(expected).unwrap()
        );
        Some((fixture, run))
    }
    pub(super) async fn wait_for_readback(&self) {
        let done = self.path.with_extension("done");
        tokio::time::timeout(Duration::from_secs(600), async {
            while !done.exists() {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await
        .expect("browser did not confirm API readback");
    }
}
