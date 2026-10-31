//! Real anonymous HTTP/SQL/limiter contracts, using only disposable loopback services.
use std::{sync::Arc, time::Duration};

use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use crate::{
    config::ModuleProfile, cors::build_cors_layer, marketing::http_fixture_settings,
    routes::build_app_with_runtime_mode, state::AppState,
};

const ORIGIN: &str = "http://127.0.0.1:5173";

fn payload() -> Value {
    json!({
        "submissionId": Uuid::new_v4(), "testKey": "ai-intern", "questionSetVersion": 3,
        "candidate": {"name": "隔离候选人", "contact": "fixture", "schoolAndGrade": "测试学校", "major": "计算机"},
        "answers": {"project": "", "videoPractice": "代码、切点与预览均已验证", "workflow": format!("{}\n\n{}", "说".repeat(6000), "规".repeat(10000)), "aiUsage": ""}
    })
}

#[tokio::test]
#[ignore = "requires isolated RECRUITING_TEST_DATABASE_URL and RECRUITING_TEST_REDIS_URL"]
async fn public_intake_works_in_both_profiles_without_exposing_reviews() {
    let db = std::env::var("RECRUITING_TEST_DATABASE_URL").unwrap();
    let redis_url = std::env::var("RECRUITING_TEST_REDIS_URL").unwrap();
    for url in [&db, &redis_url] {
        assert_eq!(
            reqwest::Url::parse(url).unwrap().host_str(),
            Some("127.0.0.1")
        );
    }
    assert_eq!(
        reqwest::Url::parse(&db).unwrap().path(),
        "/recruiting_fixture"
    );
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db)
        .await
        .unwrap();
    let mut settings = http_fixture_settings(db);
    settings.dragonfly_url = redis_url.clone();
    let redis = dragonfly_client::Client::open(redis_url.as_str())
        .unwrap()
        .get_multiplexed_async_connection()
        .await
        .unwrap();
    let settings = Arc::new(settings);
    let state = Arc::new(AppState {
        pool: pool.clone(),
        creator_library_filter_cache: Default::default(),
        dragonfly_connection: redis,
        report_build_semaphore: Arc::new(tokio::sync::Semaphore::new(1)),
        http_client: Client::new(),
        settings: settings.clone(),
    });
    let client = Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();

    for (index, profile) in [ModuleProfile::Full, ModuleProfile::AiStudio]
        .into_iter()
        .enumerate()
    {
        let app = build_app_with_runtime_mode(
            state.clone(),
            build_cors_layer(&settings).unwrap(),
            false,
            profile,
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        for version in ["v1", "v2"] {
            let base = format!("{base}/{version}/recruiting");
            let post = |body: &Value| {
                client
                    .post(format!("{base}/public/submissions"))
                    .header("Origin", ORIGIN)
                    .header("X-Forwarded-For", format!("203.0.113.{}", 10 + index))
                    .json(body)
            };
            let submission = payload();
            let response = post(&submission).send().await.unwrap();
            assert_eq!(
                response.status(),
                StatusCode::CREATED,
                "{profile:?} {version}"
            );
            let created: Value = response.json().await.unwrap();
            assert_eq!(created["submissionId"], submission["submissionId"]);
            let retried = post(&submission).send().await.unwrap();
            assert_eq!(retried.status(), StatusCode::CREATED);
            assert_eq!(retried.json::<Value>().await.unwrap(), created);
            let id = Uuid::parse_str(submission["submissionId"].as_str().unwrap()).unwrap();
            let stored: (i64, String, String, String) = sqlx::query_as(
                "SELECT COUNT(*), MIN(answers->>'videoPractice'), MIN(answers->>'aiUsage'), MIN(answers->>'workflow') FROM ads.recruiting_test_submissions WHERE submission_id = $1",
            ).bind(id).fetch_one(&pool).await.unwrap();
            assert_eq!(
                stored,
                (
                    1,
                    submission["answers"]["videoPractice"]
                        .as_str()
                        .unwrap()
                        .into(),
                    String::new(),
                    submission["answers"]["workflow"].as_str().unwrap().into(),
                )
            );

            let mut invalid = payload();
            invalid["candidate"]["name"] = json!("");
            assert_eq!(
                post(&invalid).send().await.unwrap().status(),
                StatusCode::BAD_REQUEST
            );
            let mut oversized = payload();
            oversized["answers"]["workflowRules"] = json!("x".repeat(129 * 1024));
            assert_eq!(
                post(&oversized).send().await.unwrap().status(),
                StatusCode::PAYLOAD_TOO_LARGE
            );
            assert_eq!(
                client
                    .post(format!("{base}/public/submissions"))
                    .header("Origin", "https://other.invalid")
                    .json(&payload())
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );

            let private_status = if profile == ModuleProfile::Full {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::NOT_FOUND
            };
            for path in [
                "submissions".into(),
                format!("submissions/{id}"),
                "rubric".into(),
            ] {
                assert_eq!(
                    client
                        .get(format!("{base}/{path}"))
                        .send()
                        .await
                        .unwrap()
                        .status(),
                    private_status
                );
            }
            assert_eq!(
                client
                    .put(format!("{base}/submissions/{id}/review"))
                    .json(&json!({}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                private_status
            );
        }
        // A separate IP exercises the real limiter without consuming the intake checks' quota.
        for attempt in 0..6 {
            let response = client
                .post(format!("{base}/v2/recruiting/public/submissions"))
                .header("Origin", ORIGIN)
                .header("X-Forwarded-For", format!("203.0.113.{}", 20 + index))
                .json(&payload())
                .send()
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                if attempt < 5 {
                    StatusCode::CREATED
                } else {
                    StatusCode::TOO_MANY_REQUESTS
                }
            );
        }
        server.abort();
    }
}
