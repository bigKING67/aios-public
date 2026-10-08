use super::{
    attempts, planning_queue as queue, repository as repo,
    tests::{database, document, input, snapshot},
    transitions::{self, Control},
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

async fn submit(pool: &PgPool, owner: &str) -> Uuid {
    let run = repo::create(pool, owner, &input(), &snapshot())
        .await
        .unwrap();
    attempts::enqueue(pool, owner, run.run_id, 1).await.unwrap();
    run.run_id
}

#[tokio::test]
#[ignore = "requires isolated PostgreSQL with 028"]
async fn postgres_fallback_continuation_is_versioned_and_single_claimed() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let mut request = input();
    request.task_type = "picture_remix".into();
    request.narration_asset_id = Some(Uuid::nil());
    request.target_seconds = 2;
    let run = repo::create(&pool, &owner, &request, &snapshot())
        .await
        .unwrap();
    attempts::enqueue(&pool, &owner, run.run_id, run.version)
        .await
        .unwrap();
    let claim = queue::claim(&pool).await.unwrap().unwrap();
    let mut draft = document();
    draft.clips[0].start_ms = 0;
    draft.clips[0].end_ms = 2000;
    draft.clips[0].volume = 0.0;
    draft.clips[0].caption.clear();
    draft.gaps = vec!["必须换画面的业务目标未完成".into()];
    let receipt = json!({"correction":{"preservationFallback":{
        "schema":"aios.planning-preservation-fallback.v1","status":"draft_requires_review",
        "deliveryApproved":false,"replacedClipIds":["clip-1"]},
        "selectionTextReview":{"checks":[{"clipId":"clip-1","verdict":"conflict"}]}}});
    attempts::finish(
        &pool,
        &owner,
        run.run_id,
        claim.token,
        Ok((draft.clone(), receipt)),
    )
    .await
    .unwrap();
    let current = repo::get(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(current.plan_revision, 1);
    assert!(attempts::enqueue(&pool, &owner, run.run_id, run.version)
        .await
        .is_err());
    let (next, token) = attempts::enqueue(&pool, &owner, run.run_id, current.version)
        .await
        .unwrap();
    assert_eq!(next.execution_version, current.execution_version + 1);
    assert_eq!(next.plan_revision, 1);
    assert!(attempts::enqueue(&pool, &owner, run.run_id, next.version)
        .await
        .is_err());
    assert!(
        attempts::enqueue(&pool, "foreign-owner", run.run_id, next.version)
            .await
            .is_err()
    );
    sqlx::query("UPDATE ads.content_production_plan_attempts SET input=jsonb_set(input,'{planRevision}','2') WHERE attempt_id=$1")
        .bind(token).execute(&pool).await.unwrap();
    assert!(
        queue::claim(&pool).await.unwrap().is_none(),
        "stale continuation must not be claimed"
    );
    sqlx::query("UPDATE ads.content_production_plan_attempts SET input=jsonb_set(input,'{planRevision}','1') WHERE attempt_id=$1")
        .bind(token).execute(&pool).await.unwrap();
    let claim = queue::claim(&pool).await.unwrap().unwrap();
    assert_eq!(claim.token, token);
    assert!(queue::claim(&pool).await.unwrap().is_none());
    assert!(queue::ready(&pool, &claim).await.unwrap());
    let mut db = pool.acquire().await.unwrap();
    let context = super::planning_continuation::load(&mut db, &claim.run)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(context["fromPlanRevision"], 1);
    assert_eq!(context["previousDocument"]["gaps"][0], draft.gaps[0]);
    let mut wrong = claim.run;
    wrong.plan_revision = 2;
    assert!(super::planning_continuation::load(&mut db, &wrong)
        .await
        .is_err());
    drop(db);
    // A fresh result keeps the previous revision intact; unresolved gaps still block rendering.
    attempts::finish_and_dispatch(
        &pool,
        &owner,
        run.run_id,
        token,
        (draft.clone(), json!({"fixture":true})),
    )
    .await
    .unwrap();
    let detail = repo::detail(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(detail.run.plan_revision, 2);
    assert!(detail.run.render_job_id.is_none());
    assert_eq!(
        detail.run.waiting_reason.as_deref(),
        Some("missing_material")
    );
    assert!(
        attempts::enqueue(&pool, &owner, run.run_id, detail.run.version)
            .await
            .is_err(),
        "non-fallback receipt cannot restart"
    );
}

#[tokio::test]
#[ignore = "requires isolated PostgreSQL with 028, after settlement fixtures"]
async fn postgres_durable_claim_capacity_pause_recovery_and_fencing() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let unsubmitted = repo::create(&pool, &owner, &input(), &snapshot())
        .await
        .unwrap();
    assert!(queue::claim(&pool).await.unwrap().is_none());
    let first = submit(&pool, &owner).await;
    let second = submit(&pool, &owner).await;
    let third = submit(&pool, &owner).await;
    assert!(attempts::enqueue(&pool, &owner, first, 1).await.is_err());
    assert!(attempts::enqueue(&pool, &owner, first, 2).await.is_err());

    // Independent pools represent restarted/competing API workers. Neither has
    // request-local memory, a bearer token or a queue notification from submit.
    let other = database().await;
    let (a, b) = tokio::join!(queue::claim(&pool), queue::claim(&other));
    let mut claims: Vec<_> = [a.unwrap(), b.unwrap()].into_iter().flatten().collect();
    if claims.len() == 1 {
        claims.push(queue::claim(&other).await.unwrap().unwrap());
    }
    assert_eq!(claims.len(), 2);
    assert_ne!(claims[0].token, claims[1].token);
    assert!(
        queue::claim(&other).await.unwrap().is_none(),
        "global limit is two"
    );
    assert_eq!(
        repo::get(&pool, &owner, unsubmitted.run_id)
            .await
            .unwrap()
            .version,
        1
    );
    for claim in &claims {
        assert!(queue::ready(&pool, claim).await.unwrap());
        assert!(attempts::finish(
            &pool,
            &owner,
            claim.run.run_id,
            claim.token,
            Ok((document(), json!({"model":"loopback"})))
        )
        .await
        .unwrap());
    }
    let claim = queue::claim(&other).await.unwrap().unwrap();
    assert_eq!(claim.run.run_id, third);
    // Pause after claim but before dispatch safely returns the same attempt.
    transitions::control(&pool, &owner, third, 2, Control::Pause)
        .await
        .unwrap();
    assert!(!queue::ready(&pool, &claim).await.unwrap());
    assert!(queue::claim(&pool).await.unwrap().is_none());
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=NOW()-INTERVAL '1 hour' WHERE attempt_id=$1")
        .bind(claim.token).execute(&pool).await.unwrap();
    let resumed = transitions::control(&pool, &owner, third, 3, Control::Resume)
        .await
        .unwrap();
    assert_eq!(resumed.run.status, "running");
    let again = queue::claim(&other).await.unwrap().unwrap();
    assert_eq!(
        again.token, claim.token,
        "unstarted intent survives downtime and pause"
    );

    // A claimed/possibly dispatched call expires into waiting, never a retry.
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=NOW()-INTERVAL '1 second' WHERE attempt_id=$1")
        .bind(again.token).execute(&pool).await.unwrap();
    assert!(queue::claim(&other).await.unwrap().is_none());
    let recovered = repo::get(&pool, &owner, third).await.unwrap();
    assert_eq!(recovered.status, "waiting");
    assert_eq!(recovered.waiting_reason.as_deref(), Some("planning_failed"));
    assert!(recovered.active_attempt.is_none());
    assert!(!attempts::finish(
        &pool,
        &owner,
        third,
        again.token,
        Ok((document(), json!({"late":true})))
    )
    .await
    .unwrap());
    assert!(repo::detail(&pool, &owner, third)
        .await
        .unwrap()
        .plan
        .is_none());
    assert!(queue::claim(&pool).await.unwrap().is_none());
    let late: serde_json::Value = sqlx::query_scalar(
        "SELECT result FROM ads.content_production_plan_attempts WHERE attempt_id=$1",
    )
    .bind(again.token)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(late["late"], true);

    let paused = submit(&pool, &owner).await;
    transitions::control(&pool, &owner, paused, 2, Control::Pause)
        .await
        .unwrap();
    assert!(queue::claim(&pool).await.unwrap().is_none());
    transitions::control(&pool, &owner, paused, 3, Control::Cancel)
        .await
        .unwrap();
    assert!(queue::claim(&pool).await.unwrap().is_none());
    assert_eq!(
        repo::get(&pool, &owner, paused).await.unwrap().status,
        "cancelled"
    );
    assert_eq!(
        repo::get(&pool, &owner, second)
            .await
            .unwrap()
            .plan_revision,
        1
    );
    pool.close().await;
    other.close().await;
}
