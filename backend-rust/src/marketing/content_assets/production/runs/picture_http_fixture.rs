//! Disposable real HTTP -> plan -> frozen v2 -> Worker -> delivery acceptance.
use super::{http_fixture::poll_plan, planner};
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

pub(in crate::marketing::content_assets::production) async fn exercise(
    state: &AppState,
    client: &Client,
    base: &str,
    token: &str,
    voice: &str,
    voice_hash: &str,
) {
    let picture = Uuid::new_v4();
    let picture_bytes =
        std::fs::read(std::env::var("CONTENT_PRODUCTION_TEST_PICTURE").unwrap()).unwrap();
    let hash = hex::encode(Sha256::digest(picture_bytes));
    sqlx::query("INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds,repurpose_allowed,authorization_status) VALUES ($1,'画面混剪隔离原片','ready','127','picture.mp4',$2,3,TRUE,'authorized')")
        .bind(picture).bind(&hash).execute(&state.pool).await.unwrap();
    let job = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_jobs(job_id,asset_id,media_hash,storage_key,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,status) VALUES ($1,$2,$3,'picture.mp4','picture-fixture','v1','2.1','picture-snapshot','picture-cache','succeeded')")
        .bind(job).bind(picture).bind(&hash).execute(&state.pool).await.unwrap();
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_results(result_id,asset_id,media_hash,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,result_json) VALUES ($1,$2,$3,'picture-fixture','v1','2.1','picture-snapshot','picture-cache',$4)")
        .bind(Uuid::new_v4()).bind(picture).bind(&hash).bind(json!({"inputSnapshot":{"modelInputRole":"raw","modelInputObjectKey":"picture.mp4"},"analysis":{"timeline":(0..3).map(|i|json!({"start_time":format!("00:00:0{i}"),"end_time":format!("00:00:0{}",i+1),"visual":"隔离夹具中的演示画面","purpose":"用于讲解对应画面"})).collect::<Vec<_>>()}})).execute(&state.pool).await.unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_asset_transcripts SET segments=$1 WHERE asset_id=$2::uuid",
    )
    .bind(json!((0..40)
        .map(|i| json!({"start_ms":i*75,"end_ms":(i+1)*75,"text":format!("主讲片段{i}")}))
        .collect::<Vec<_>>()))
    .bind(voice)
    .execute(&state.pool)
    .await
    .unwrap();
    let request = json!({"idempotencyKey":Uuid::new_v4().to_string(),"title":"画面混剪验收","brief":"picture-remix-fixture","taskType":"picture_remix","assetIds":[voice,picture],"narrationAssetId":voice,"aspect":"portrait","targetSeconds":3,"rightsConfirmed":true,"modelCallConfirmed":true,"reviewBeforeProduction":true});
    let mut invalid = request.clone();
    invalid["narrationAssetId"] = json!(Uuid::new_v4());
    assert_eq!(
        client
            .post(format!("{base}/runs"))
            .bearer_auth(token)
            .json(&invalid)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    let created: Value = client
        .post(format!("{base}/runs"))
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let url = format!("{base}/runs/{}", created["run"]["runId"].as_str().unwrap());
    client
        .post(format!("{url}/plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert!(planner::step(state).await.unwrap());
    let planned = poll_plan(client, &url, token).await;
    assert_eq!(
        planned["plan"]["document"]["clips"][0]["assetId"],
        picture.to_string()
    );
    assert_eq!(planned["plan"]["document"]["clips"][0]["volume"], 0.0);
    for (field, value) in [("volume", json!(1)), ("endMs", json!(2000))] {
        let mut bad = planned["plan"]["document"].clone();
        bad["clips"][0][field] = value;
        assert_eq!(client.post(format!("{url}/plan-revisions")).bearer_auth(token).json(&json!({"expectedVersion":planned["run"]["version"],"expectedPlanRevision":1,"document":bad})).send().await.unwrap().status(),400);
    }
    let produced: Value = client
        .post(format!("{url}/produce"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":planned["run"]["version"],"expectedPlanRevision":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_url = format!(
        "{base}/projects/{}",
        produced["run"]["projectId"].as_str().unwrap()
    );
    let project: Value = client
        .get(&project_url)
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
        project["project"]["snapshot"]["editDocument"]["schema"],
        "datahub.edit-document.v2"
    );
    assert_eq!(
        project["project"]["snapshot"]["assets"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(client.put(&project_url).bearer_auth(token).json(&json!({"expectedRevision":1,"title":"旧编辑器覆盖","aspect":"portrait","rightsConfirmed":true,"clips":planned["plan"]["document"]["clips"]})).send().await.unwrap().status(),409);
    let worker =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(
        worker.status.success(),
        "{}",
        String::from_utf8_lossy(&worker.stderr)
    );
    let worker: Value = serde_json::from_slice(&worker.stdout).unwrap();
    assert_eq!(worker["status"], "completed", "{worker}");
    let mut result: Value = client
        .get(format!("{url}/result"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result["ready"], false);
    assert!(result["playbackUrl"].is_null());
    let after: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(after["run"]["waitingReason"], "caption_quality_pending");
    let row = sqlx::query(
        "SELECT receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=$1::uuid",
    )
    .bind(produced["run"]["renderJobId"].as_str().unwrap())
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let receipt: Value = row.get("receipt");
    assert_eq!(receipt["caption_quality"]["captionCount"], 0);
    assert_eq!(
        receipt["caption_quality"]["sourceTextRouting"]["inspectionFrames"],
        90
    );
    assert_eq!(receipt["host_inspection"]["durationSeconds"], 3.0);
    let key: String = row.get("output_object_key");
    // Privileged fixture inspection only; the public result correctly has no playback URL.
    let inspection_url =
        crate::marketing::content_assets::delivery::build_object_read_url(&state.settings, &key)
            .unwrap();
    let bytes = client
        .get(inspection_url)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("picture-remix-video.mp4"), bytes).unwrap();
    result["playbackUrl"] = Value::Null;
    std::fs::write(
        root.join("picture-remix-result.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    // Keys are fixture-local, but omit storage bindings from exported evidence.
    std::fs::write(
        root.join("picture-remix-edit.json"),
        serde_json::to_vec_pretty(&project["project"]["snapshot"]["editDocument"]).unwrap(),
    )
    .unwrap();
    super::treatment_http_fixture::exercise(state, client, &url, token, &after).await;
    fallback(state, client, &url, token, &after, voice, &root).await;
    super::caption_http_fixture::exercise(state, client, base, token, request, voice_hash).await;
    sqlx::query(
        "UPDATE ads.marketing_content_asset_transcripts SET segments=$1 WHERE asset_id=$2::uuid",
    )
    .bind(json!([{"start_ms":0,"end_ms":1000,"text":"验收片段"}]))
    .bind(voice)
    .execute(&state.pool)
    .await
    .unwrap();
}

async fn fallback(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    after: &Value,
    voice: &str,
    root: &std::path::Path,
) {
    // The loopback planner selects the host-provided preservation option; no manual revision.
    let base = url.rsplit_once("/runs/").unwrap().0;
    let mut request = after["run"]["request"].clone();
    request["idempotencyKey"] = json!(Uuid::new_v4().to_string());
    request["brief"] =
        json!("picture-remix-fixture keep-original repair-once 无可靠替代时允许保留原画面");
    request["reviewBeforeProduction"] = json!(false);
    let alternate = request["assetIds"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v.as_str() != Some(voice))
        .unwrap()
        .as_str()
        .unwrap();
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_jobs SET status='failed' WHERE asset_id=$1::uuid AND model_name='picture-fixture'")
        .bind(alternate).execute(&state.pool).await.unwrap();
    let created: Value = client
        .post(format!("{base}/runs"))
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let url = format!("{base}/runs/{}", created["run"]["runId"].as_str().unwrap());
    client
        .post(format!("{url}/plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert!(planner::step(state).await.unwrap());
    let produced = poll_plan(client, &url, token).await;
    assert_eq!(produced["run"]["stage"], "production");
    let plan_receipt: Value = sqlx::query_scalar("SELECT result FROM ads.content_production_plan_attempts WHERE run_id=$1::uuid AND status='succeeded'")
        .bind(produced["run"]["runId"].as_str().unwrap()).fetch_one(&state.pool).await.unwrap();
    assert_eq!(plan_receipt["correction"]["calls"], 2);
    assert_eq!(produced["plan"]["document"]["clips"][0]["assetId"], voice);
    let worker =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(
        worker.status.success(),
        "{}",
        String::from_utf8_lossy(&worker.stderr)
    );
    let worker: Value = serde_json::from_slice(&worker.stdout).unwrap();
    assert_eq!(worker["status"], "completed");
    let done: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(done["run"]["status"], "succeeded");
    let mut result: Value = client
        .get(format!("{url}/result"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result["ready"], true);
    let receipt: Value =
        sqlx::query_scalar("SELECT receipt FROM ads.content_production_jobs WHERE job_id=$1::uuid")
            .bind(produced["run"]["renderJobId"].as_str().unwrap())
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(
        receipt["caption_quality"]["sourceTextRouting"]["status"],
        "original_preserved"
    );
    assert_eq!(
        receipt["caption_quality"]["sourceTextRouting"]["inspectionFrames"],
        0
    );
    let bytes = client
        .get(result["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    std::fs::write(root.join("picture-retained-video.mp4"), bytes).unwrap();
    result["playbackUrl"] = Value::Null;
    std::fs::write(root.join("picture-retained-result.json"),serde_json::to_vec_pretty(&json!({"result":result,"sourceTextRouting":receipt["caption_quality"]["sourceTextRouting"],"scope":"planner-selected host preservation; loopback decision, not real-model quality"})).unwrap()).unwrap();
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_jobs SET status='succeeded' WHERE asset_id=$1::uuid AND model_name='picture-fixture'")
        .bind(alternate).execute(&state.pool).await.unwrap();
}
