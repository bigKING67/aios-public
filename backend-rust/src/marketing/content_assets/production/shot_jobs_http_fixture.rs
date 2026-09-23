use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

async fn worker() -> Value {
    let result =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.shot_worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(result.status.success(), "shot worker failed");
    serde_json::from_slice(&result.stdout).unwrap()
}
pub(super) async fn exercise(
    pool: &PgPool,
    client: &reqwest::Client,
    base: &str,
    token: &str,
    asset: &str,
) {
    sqlx::raw_sql(include_str!(
        "../../../../../sql/migrations/023_content_production_shot_jobs.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../../../../../etl/groland_postgres/tests/sql/test_content_production_shot_jobs.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    let catalog: Value = serde_json::from_slice(
        &std::fs::read(std::env::var("CONTENT_PRODUCTION_TEST_CATALOG").unwrap()).unwrap(),
    )
    .unwrap();
    let duration = catalog["source"]["durationMs"].as_u64().unwrap() as f64 / 1000.0;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=$1 WHERE asset_id=$2::uuid",
    )
    .bind(duration)
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    let url = format!("{base}/shot-jobs");
    let body = json!({"assetId":asset,"rightsConfirmed":true});
    assert_eq!(
        client.post(&url).json(&body).send().await.unwrap().status(),
        401
    );
    let first: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let duplicate: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(first["jobId"], duplicate["jobId"]);
    assert_eq!(worker().await["status"], "completed");
    let list: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list["items"][0]["status"], "completed");
    let id = list["items"][0]["catalogId"].as_str().unwrap();
    let detail: Value = client
        .get(format!("{base}/shot-catalogs/{id}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        detail["clips"].as_array().unwrap().len(),
        catalog["shots"].as_array().unwrap().len()
    );
    let imported: Value = client
        .post(format!("{base}/shot-catalogs"))
        .bearer_auth(token)
        .json(&json!({"catalog":catalog,"rightsConfirmed":true}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        imported["catalogId"], id,
        "Python worker and Rust import must canonicalize identically"
    );
    let next: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        client
            .post(format!("{url}/{}/cancel", next["jobId"].as_str().unwrap()))
            .bearer_auth(token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(worker().await["status"], "idle");
    let bad: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET raw_sha256=repeat('0',64) WHERE asset_id=$1::uuid",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    assert_eq!(worker().await["status"], "failed");
    let state: (String, Option<Uuid>) = sqlx::query_as(
        "SELECT status,catalog_id FROM ads.content_production_shot_jobs WHERE job_id=$1",
    )
    .bind(Uuid::parse_str(bad["jobId"].as_str().unwrap()).unwrap())
    .fetch_one(pool)
    .await
    .unwrap();
    assert_eq!(state, ("failed".into(), None));
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256=$1 WHERE asset_id=$2::uuid")
        .bind(catalog["rawSha256"].as_str().unwrap())
        .bind(asset)
        .execute(pool)
        .await
        .unwrap();
    let check =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .current_dir(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .unwrap(),
            )
            .args([
                "-m",
                "unittest",
                "discover",
                "-s",
                "etl/groland_postgres/tests/content_production",
                "-p",
                "test_shot_queue_postgres.py",
            ])
            .output()
            .await
            .unwrap();
    assert!(
        check.status.success(),
        "{}",
        String::from_utf8_lossy(&check.stderr)
    );
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=3 WHERE asset_id=$1::uuid",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
}
