use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

pub(super) async fn exercise(
    pool: &PgPool,
    client: &reqwest::Client,
    base: &str,
    token: &str,
    asset: &str,
    hash: &str,
) {
    let migration=include_str!("../../../../../etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql");
    let start = migration
        .find("CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_jobs")
        .unwrap();
    let end = migration[start..]
        .find("ALTER TABLE ads.marketing_content_asset_video_understanding_jobs")
        .unwrap()
        + start;
    sqlx::raw_sql(&migration[start..end])
        .execute(pool)
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let payload = json!({"inputSnapshot":{"modelInputRole":"raw","modelInputObjectKey":"source.mp4"},"analysis":{"timeline":[{"start_time":"00:00:00","end_time":"00:00:02","visual":"手持产品特写","purpose":"展示"}]}});
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_jobs(job_id,asset_id,media_hash,storage_key,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,status) VALUES ($1,$2::uuid,$3,'source.mp4','fixture-model','fixture-prompt','2.1','snapshot','cache','succeeded')").bind(Uuid::new_v4()).bind(asset).bind(hash).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_results(result_id,asset_id,media_hash,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,result_json) VALUES ($1,$2::uuid,$3,'fixture-model','fixture-prompt','2.1','snapshot','cache',$4)").bind(id).bind(asset).bind(hash).bind(&payload).execute(pool).await.unwrap();
    let url = format!("{base}/visual-clips");
    assert_eq!(
        client
            .get(&url)
            .query(&[("q", "特写")])
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let fetch = || async {
        client
            .get(&url)
            .bearer_auth(token)
            .query(&[("q", "特写")])
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json::<Value>()
            .await
            .unwrap()
    };
    let data = fetch().await;
    assert_eq!(data["items"].as_array().unwrap().len(), 1);
    assert_eq!(data["items"][0]["analysisResultId"], id.to_string());
    assert_eq!(data["items"][0]["endMs"], 2000);
    assert!(data["items"][0]["playbackUrl"]
        .as_str()
        .unwrap()
        .starts_with("https://"));
    for (path, value) in [
        (vec!["inputSnapshot", "modelInputRole"], json!("preview")),
        (
            vec!["inputSnapshot", "modelInputObjectKey"],
            json!("different-source.mp4"),
        ),
        (
            vec!["analysis", "timeline", "0", "end_time"],
            json!("00:00:30"),
        ),
        (vec!["analysis", "timeline", "0", "start_time"], json!("0s")),
    ] {
        sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET result_json=jsonb_set($1,$2::text[],$3) WHERE result_id=$4").bind(&payload).bind(path).bind(value).bind(id).execute(pool).await.unwrap();
        assert!(fetch().await["items"].as_array().unwrap().is_empty());
    }
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET result_json=$1,media_hash='stale-hash' WHERE result_id=$2").bind(&payload).bind(id).execute(pool).await.unwrap();
    assert!(fetch().await["items"].as_array().unwrap().is_empty());
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET media_hash=$1,input_snapshot_hash='stale-snapshot' WHERE result_id=$2").bind(hash).bind(id).execute(pool).await.unwrap();
    assert!(fetch().await["items"].as_array().unwrap().is_empty());
}
