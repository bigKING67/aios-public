use serde_json::{json, Value};
use sha2::{Digest, Sha256};
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
    sqlx::raw_sql(include_str!(
        "../../../../../sql/migrations/022_content_production_shot_catalogs.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../../../../../etl/groland_postgres/tests/sql/test_content_production_shot_catalogs.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    let shots:Vec<_>=[(0,1000),(1000,3000)].iter().map(|(s,e)|json!({"shotId":format!("{:x}",Sha256::digest(format!("{hash}:{s}:{e}")))[..24],"startMs":s,"endMs":e,"semanticStatus":"not_analyzed","observations":null,"representativeFrame":{"path":"/must-never-be-read/private.jpg"}})).collect();
    let mut body = json!({"rightsConfirmed":true,"catalog":{"schema":"aios.shot-catalog.v1","timebase":"raw-relative-ms","coverage":"complete","assetId":asset,"rawSha256":hash,"source":{"durationMs":3000},"shots":shots}});
    let url = format!("{base}/shot-catalogs");
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
    let second: Value = client
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
    assert_eq!(first, second);
    let id = Uuid::parse_str(first["catalogId"].as_str().unwrap()).unwrap();
    let detail = format!("{url}/{id}");
    let data: Value = client
        .get(&detail)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(data["clips"].as_array().unwrap().len(), 2);
    assert_eq!(data["clips"][1]["startMs"], 1000);
    assert_eq!(data["semanticStatus"], "not_analyzed");
    let stored: String = sqlx::query_scalar(
        "SELECT snapshot::TEXT FROM ads.content_production_shot_catalogs WHERE catalog_id=$1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap();
    assert!(!stored.contains("private.jpg"));
    let owner: String = sqlx::query_scalar(
        "SELECT owner_user_id FROM ads.content_production_shot_catalogs WHERE catalog_id=$1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query("UPDATE ads.content_production_shot_catalogs SET owner_user_id='another-user' WHERE catalog_id=$1").bind(id).execute(pool).await.unwrap();
    assert_eq!(
        client
            .get(&detail)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let list: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(list["items"].as_array().unwrap().is_empty());
    sqlx::query(
        "UPDATE ads.content_production_shot_catalogs SET owner_user_id=$1 WHERE catalog_id=$2",
    )
    .bind(owner)
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256=$1 WHERE asset_id=$2::uuid")
        .bind("0".repeat(64))
        .bind(asset)
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(
        client
            .get(&detail)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256=$1 WHERE asset_id=$2::uuid")
        .bind(hash)
        .bind(asset)
        .execute(pool)
        .await
        .unwrap();
    body["rightsConfirmed"] = json!(false);
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    body["rightsConfirmed"] = json!(true);
    body["catalog"]["shots"][0]["semanticStatus"] = json!("verified");
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    body["catalog"]["excess"] = json!("x".repeat(270000));
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap()
            .status(),
        413
    );
    // Consume the real Python CLI artifact, not only a hand-written DTO fixture.
    let generated: Value = serde_json::from_slice(
        &std::fs::read(std::env::var("CONTENT_PRODUCTION_TEST_CATALOG").unwrap()).unwrap(),
    )
    .unwrap();
    let duration = generated["source"]["durationMs"].as_u64().unwrap() as f64 / 1000.0;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=$1 WHERE asset_id=$2::uuid",
    )
    .bind(duration)
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    let imported: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&json!({"rightsConfirmed":true,"catalog":generated}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let real: Value = client
        .get(format!("{url}/{}", imported["catalogId"].as_str().unwrap()))
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
        real["clips"].as_array().unwrap().len(),
        generated["shots"].as_array().unwrap().len()
    );
    assert_eq!(real["clips"][0]["endMs"], generated["shots"][0]["endMs"]);
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=3 WHERE asset_id=$1::uuid",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
}
