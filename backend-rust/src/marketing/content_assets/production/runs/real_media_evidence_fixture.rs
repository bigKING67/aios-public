//! Isolated persisted cached observations; not a production ingest or new model analysis.
use crate::{
    marketing::content_assets::handlers::qianchuan_http_route_tests::{
        fixture_settings, seed_route_fixture_schema_and_auth,
    },
    state::AppState,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub(super) async fn seed(
    pool: &PgPool,
    input: &Value,
    sources: &super::super::types::Snapshot,
) -> AppState {
    seed_route_fixture_schema_and_auth(pool).await;
    let migration=include_str!("../../../../../../etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql");
    let start = migration
        .find("CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_jobs")
        .unwrap();
    let end = start
        + migration[start..]
            .find("ALTER TABLE ads.marketing_content_asset_video_understanding_jobs")
            .unwrap();
    sqlx::raw_sql(&migration[start..end])
        .execute(pool)
        .await
        .unwrap();
    let stamp = |v: &Value| {
        let ms = v.as_u64().unwrap();
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            ms / 3600000,
            (ms / 60000) % 60,
            (ms / 1000) % 60,
            ms % 1000
        )
    };
    for asset in &sources.assets {
        let transcripts: Vec<_> = input["transcripts"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|t| t["assetId"] == asset.asset_id.to_string())
            .map(|t| json!({"start_ms":t["startMs"],"end_ms":t["endMs"],"text":t["text"]}))
            .collect();
        if !transcripts.is_empty() {
            sqlx::query("INSERT INTO ads.marketing_content_asset_transcripts(transcript_id,asset_id,source_object_key,status,transcript_text,segments) VALUES($1,$2,$3,'active','saved narration',$4)").bind(Uuid::new_v4()).bind(asset.asset_id).bind(&asset.object_key).bind(json!(transcripts)).execute(pool).await.unwrap();
        }
        sqlx::query("UPDATE ads.marketing_content_asset_transcripts SET metadata=metadata || jsonb_build_object('source_sha256',$2::text) WHERE asset_id=$1")
            .bind(asset.asset_id).bind(&asset.sha256).execute(pool).await.unwrap();
        let visuals: Vec<_> = input["visuals"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["assetId"] == asset.asset_id.to_string())
            .collect();
        if visuals.is_empty() {
            continue;
        }
        let mut observations = Vec::new();
        for v in &visuals {
            for o in v["visibleText"]["observations"].as_array().unwrap() {
                if !observations.contains(o) {
                    observations.push(o.clone());
                }
            }
        }
        let timeline:Vec<_>=visuals.iter().map(|v|json!({"start_time":stamp(&v["startMs"]),"end_time":stamp(&v["endMs"]),"visual":v["observation"],"quality_signal":v["qualitySignal"],"purpose":""})).collect();
        let mut visible = visuals[0]["visibleText"].clone();
        visible["observations"] = json!(observations);
        let data = json!({"inputSnapshot":{"modelInputRole":"raw","modelInputObjectKey":asset.object_key},"analysis":{"timeline":timeline,"video_understanding":{"visible_text":visible}}});
        sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_jobs(job_id,asset_id,media_hash,storage_key,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,status) VALUES($1,$2,$3,$4,'saved-fixture','saved-fixture','2.1','snapshot','cache','succeeded')").bind(Uuid::new_v4()).bind(asset.asset_id).bind(&asset.sha256).bind(&asset.object_key).execute(pool).await.unwrap();
        sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_results(result_id,asset_id,media_hash,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,result_json) VALUES($1,$2,$3,'saved-fixture','saved-fixture','2.1','snapshot','cache',$4)").bind(Uuid::new_v4()).bind(asset.asset_id).bind(&asset.sha256).bind(data).execute(pool).await.unwrap();
    }
    let mut settings =
        fixture_settings(std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").unwrap());
    settings.content_production_enabled = true;
    settings.content_production_runs_enabled = true;
    settings.content_production_planning_enabled = true;
    settings.tos_bucket = "fixture".into();
    settings.dragonfly_url = std::env::var("CONTENT_PRODUCTION_TEST_REDIS_URL").unwrap();
    let redis = dragonfly_client::Client::open(settings.dragonfly_url.as_str())
        .unwrap()
        .get_multiplexed_async_connection()
        .await
        .unwrap();
    AppState {
        pool: pool.clone(),
        creator_library_filter_cache: Default::default(),
        dragonfly_connection: redis,
        report_build_semaphore: Arc::new(tokio::sync::Semaphore::new(1)),
        http_client: reqwest::Client::new(),
        settings: Arc::new(settings),
    }
}
