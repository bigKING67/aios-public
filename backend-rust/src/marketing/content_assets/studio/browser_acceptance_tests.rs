//! Opt-in local full-page acceptance. No production binary entrypoint or auth bypass.
use super::postgres_tests::pool;
use crate::marketing::content_assets::handlers::qianchuan_http_route_tests::{
    access_token, fixture_settings,
};
use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use serde_json::{json, Value};
use sqlx::Row;
use std::{io::Write, path::PathBuf, sync::Arc, time::Duration};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires isolated loopback PostgreSQL/Redis and explicit browser fixture inputs"]
async fn selling_point_browser_acceptance() {
    let required = |key| std::env::var(key).expect(key);
    let db = required("CONTENT_PRODUCTION_TEST_DATABASE_URL");
    let parsed = reqwest::Url::parse(&db).unwrap();
    assert_eq!(parsed.host_str(), Some("127.0.0.1"));
    assert_eq!(parsed.path(), "/content_production_fixture");
    let redis_url = required("CONTENT_PRODUCTION_TEST_REDIS_URL");
    assert_eq!(
        reqwest::Url::parse(&redis_url).unwrap().host_str(),
        Some("127.0.0.1")
    );
    let output = PathBuf::from(required("CONTENT_STUDIO_BROWSER_OUTPUT"));
    let private = PathBuf::from(required("CONTENT_STUDIO_BROWSER_PRIVATE"));
    let samples: Vec<Value> =
        serde_json::from_slice(&std::fs::read(required("CONTENT_REMIX_MEDIA_INPUT")).unwrap())
            .unwrap();
    assert!((2..=10).contains(&samples.len()));
    let pool = pool().await;
    let owner = "90000001";
    let product = "蜜粉 · 本地待业务复核";
    let mut assets = Vec::new();
    for sample in &samples {
        let id = Uuid::new_v4();
        let film = sample["film"].as_str().unwrap();
        let sha = sample["sha256"].as_str().unwrap();
        let duration = sample["duration_ms"].as_i64().unwrap();
        assert_eq!(sha.len(), 64);
        sqlx::query("INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,bucket,raw_object_key,preview_object_key,raw_sha256,duration_seconds,product_name,owner_user_id,authorization_status,repurpose_allowed,width,height) VALUES ($1,$2,'ready','127',$3,$3,$4,$5::NUMERIC,$6,$7,'authorized',TRUE,1080,1920)")
            .bind(id).bind(film).bind(format!("{film}.mp4")).bind(sha)
            .bind(duration as f64 / 1000.0).bind(product).bind(owner)
            .execute(&pool).await.unwrap();
        for (preset, key, status) in [
            ("framework", "frames", "confirmed"),
            ("selling_point", "points", "suggested"),
        ] {
            for a in sample[key].as_array().unwrap() {
                let start = a["start_ms"].as_i64().unwrap() as i32;
                let end = a["end_ms"].as_i64().unwrap() as i32;
                assert!(0 <= start && start < end && i64::from(end) <= duration);
                sqlx::query("INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,source_duration_ms,start_ms,end_ms,preset_key,preset_version,label_key,product_name,origin,status,confirmed_by,confirmed_at,continues_previous) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,'ai',$11,CASE WHEN $11='confirmed' THEN $2 END,CASE WHEN $11='confirmed' THEN NOW() END,$12)")
                    .bind(Uuid::new_v4()).bind(owner).bind(id).bind(sha).bind(duration as i32)
                    .bind(start).bind(end).bind(preset).bind(a["label_key"].as_str().unwrap())
                    .bind(product).bind(status).bind(a["continues_previous"].as_bool().unwrap_or(false))
                    .execute(&pool).await.unwrap();
            }
        }
        assets.push(json!({"assetId":id,"film":film,"source":sample["source"],"sha256":sha,"durationMs":duration}));
    }
    let mut settings = fixture_settings(db);
    settings.content_ai_studio_enabled = true;
    settings.content_ai_studio_open_access = true;
    settings.content_ai_studio_remix_enabled = true;
    settings.content_production_enabled = true;
    settings.content_production_runs_enabled = true;
    settings.content_asset_delivery_provider = "tos_signed_url".into();
    settings.tos_bucket = "127".into();
    settings.tos_endpoint = required("TOS_ENDPOINT");
    assert_eq!(
        reqwest::Url::parse(&settings.tos_endpoint)
            .unwrap()
            .host_str(),
        Some("127.0.0.1")
    );
    settings.tos_region = required("TOS_REGION");
    settings.tos_access_key_id = required("TOS_ACCESS_KEY_ID");
    settings.tos_secret_access_key = required("TOS_SECRET_ACCESS_KEY");
    let settings = Arc::new(settings);
    let redis = dragonfly_client::Client::open(redis_url.as_str())
        .unwrap()
        .get_multiplexed_async_connection()
        .await
        .unwrap();
    let state = Arc::new(AppState {
        pool: pool.clone(),
        creator_library_filter_cache: Default::default(),
        dragonfly_connection: redis,
        report_build_semaphore: Arc::new(tokio::sync::Semaphore::new(1)),
        http_client: reqwest::Client::new(),
        settings: settings.clone(),
    });
    let app = build_app(state, build_cors_layer(&settings).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let handoff = private.join("browser.json");
    let mut file = std::fs::OpenOptions::new();
    file.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        file.mode(0o600);
    }
    file.open(&handoff)
        .unwrap()
        .write_all(
            serde_json::to_string(&json!({"url":url,"token":access_token()}))
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    std::fs::write(
        output.join("browser-ready.json"),
        serde_json::to_vec_pretty(
            &json!({"handoffPath":handoff,"assets":assets,"product":product}),
        )
        .unwrap(),
    )
    .unwrap();
    // The runner owns this bounded local test lifetime; no external worker is started here.
    for tick in 0..1800 {
        if output.join("finish.json").exists() {
            break;
        }
        if tick > 0 && tick % 60 == 0 {
            std::fs::write(
                &handoff,
                serde_json::to_vec(&json!({"url":url,"token":access_token()})).unwrap(),
            )
            .unwrap();
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let rows = sqlx::query("SELECT b.batch_id, TO_JSONB(b) AS batch FROM ads.content_remix_batches b WHERE owner_user_id=$1 ORDER BY created_at")
        .bind(owner).fetch_all(&pool).await.unwrap();
    let mut batches = Vec::new();
    for row in rows {
        let id: Uuid = row.get("batch_id");
        let runs: Vec<Value> = sqlx::query_scalar("SELECT JSONB_BUILD_OBJECT('item',TO_JSONB(br),'run',TO_JSONB(r),'snapshot',v.snapshot) FROM ads.content_remix_batch_runs br JOIN ads.content_production_runs r ON r.run_id=br.run_id JOIN ads.content_production_revisions v ON v.project_id=r.project_id AND v.revision=r.project_revision WHERE br.batch_id=$1 ORDER BY br.ordinal")
            .bind(id).fetch_all(&pool).await.unwrap();
        batches.push(json!({"batch":row.get::<Value,_>("batch"),"runs":runs}));
    }
    std::fs::write(
        output.join("frozen-batches.json"),
        serde_json::to_vec_pretty(&batches).unwrap(),
    )
    .unwrap();
    std::fs::remove_file(handoff).unwrap();
    server.abort();
    assert!(
        output.join("finish.json").exists(),
        "browser acceptance timeout"
    );
}
