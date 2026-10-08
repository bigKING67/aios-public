//! Real Worker candidate, signed media read, versioned adoption and rerender.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    after: &Value,
    receipt: Value,
) {
    let run = &after["run"];
    let snapshot: Value=sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1::uuid AND revision=$2")
        .bind(run["projectId"].as_str().unwrap()).bind(run["projectRevision"].as_i64().unwrap() as i32)
        .fetch_one(&state.pool).await.unwrap();
    assert_eq!(
        receipt["host_caption_review"]["candidateRendered"], true,
        "{receipt}"
    );
    assert_eq!(receipt["host_caption_review"]["callsReserved"], 3);
    assert_eq!(receipt["host_caption_calls"].as_object().unwrap().len(), 3);
    let result: Value = client
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
    let candidate = &result["captionCandidate"];
    assert_eq!(candidate["deliveryApproved"], false);
    assert!(candidate["playbackUrl"]
        .as_str()
        .unwrap()
        .contains("caption-candidate.mp4"));
    assert!(candidate.get("objectKey").is_none());
    let video = client
        .get(candidate["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(
        format!("{:x}", Sha256::digest(&video)),
        receipt["host_caption_review"]["candidateRender"]["receipt"]["output"]["sha256"]
            .as_str()
            .unwrap()
    );
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("caption-candidate-video.mp4"), &video).unwrap();

    assert_eq!(
        client
            .get(format!("{url}/result"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let edit = json!({"expectedVersion":candidate["expectedVersion"],"expectedPlanRevision":candidate["expectedPlanRevision"],"document":candidate["planDocument"]});
    let adopted = if let Some(adopted) =
        super::caption_candidate_browser_fixture::wait_for_adoption(client, url, token, run, &root)
            .await
    {
        adopted
    } else {
        let revised: Value = client
            .post(format!("{url}/plan-revisions"))
            .bearer_auth(token)
            .json(&edit)
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        let adopted:Value=client.post(format!("{url}/adopt-plan")).bearer_auth(token).json(&json!({
        "expectedVersion":revised["run"]["version"],"expectedPlanRevision":revised["run"]["planRevision"],
        "expectedProjectRevision":candidate["expectedProjectRevision"]})).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();

        adopted
    };
    assert_eq!(
        client
            .post(format!("{url}/plan-revisions"))
            .bearer_auth(token)
            .json(&edit)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let newer:Value=sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1::uuid AND revision=$2")
        .bind(adopted["run"]["projectId"].as_str().unwrap()).bind(adopted["run"]["projectRevision"].as_i64().unwrap() as i32)
        .fetch_one(&state.pool).await.unwrap();
    assert_eq!(newer["editDocument"]["captions"][0]["text"], "完整\n字幕");
    assert_eq!(
        newer["editDocument"]["captions"][0]["style"],
        snapshot["editDocument"]["captions"][0]["style"]
    );
    assert!(
        adopted["run"]["projectRevision"].as_i64().unwrap()
            > run["projectRevision"].as_i64().unwrap()
    );
    let old:Value=sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1::uuid AND revision=$2")
        .bind(run["projectId"].as_str().unwrap()).bind(run["projectRevision"].as_i64().unwrap() as i32)
        .fetch_one(&state.pool).await.unwrap();
    assert_eq!(old, snapshot);
    let result: Value = client
        .get(format!("{url}/result"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(result.get("captionCandidate").is_none());
    super::caption_candidate_rerender_fixture::exercise(state, client, url, token, &adopted, &root)
        .await;
    std::fs::write(root.join("caption-candidate-http.json"),serde_json::to_vec_pretty(&json!({
        "fixture":"real worker and media; loopback model responses","browserAdoption":std::env::var_os("CONTENT_PRODUCTION_TEST_BROWSER_HANDOFF").is_some(),"candidateDownloadedAndHashVerified":true,"adoptedRerender":true,"candidateSigned":true,"deliveryReady":false,
        "staleWriteRejected":true,"adoptedProjectRevision":adopted["run"]["projectRevision"],"oldRevisionPreserved":true})).unwrap()).unwrap();
}
