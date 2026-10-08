use super::{
    attempts, execution, repository as repo,
    tests::{database, document, input, snapshot},
    transitions::{self, Control},
    types::*,
};
use crate::{error::AppError, marketing::content_assets::production::repository as projects};
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires disposable content production PostgreSQL with 027"]
async fn postgres_dispatch_is_atomic_and_protects_manual_project_revision() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let run = repo::create(&pool, &owner, &input(), &snapshot())
        .await
        .unwrap();
    let id = run.run_id;
    let (_, attempt) = super::tests::begin(&pool, &owner, id, 1).await.unwrap();
    attempts::finish_and_dispatch(&pool, &owner, id, attempt, (document(), json!({})))
        .await
        .unwrap();
    let held = repo::get(&pool, &owner, id).await.unwrap();
    assert!(held.render_job_id.is_none());
    assert_eq!(
        held.waiting_reason.as_deref(),
        Some("awaiting_plan_confirmation")
    );
    let adopted = super::adopt::adopt(
        &pool,
        &owner,
        id,
        AdoptPlanRequest {
            expected_version: 3,
            expected_plan_revision: 1,
            expected_project_revision: None,
        },
    )
    .await
    .unwrap();
    let project = adopted.run.project_id.unwrap();
    let mut manual = projects::snapshot(&pool, &owner, project, 1).await.unwrap();
    manual.title = "人工修改".into();
    projects::save(&pool, &owner, Some(project), Some(1), manual)
        .await
        .unwrap();
    let request = || AdoptPlanRequest {
        expected_version: 4,
        expected_plan_revision: 1,
        expected_project_revision: Some(1),
    };
    assert!(matches!(
        execution::produce(&pool, &owner, id, request()).await,
        Err(AppError::Conflict(_))
    ));
    assert_eq!(repo::get(&pool, &owner, id).await.unwrap().version, 4);
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    let request = || AdoptPlanRequest {
        expected_version: 4,
        expected_plan_revision: 1,
        expected_project_revision: Some(2),
    };
    let (a, b) = tokio::join!(
        execution::produce(&pool, &owner, id, request()),
        execution::produce(&pool, &owner, id, request())
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
#[ignore = "requires disposable content production PostgreSQL with 027"]
async fn postgres_auto_render_pause_waits_for_worker_and_cancel_revokes_delivery() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let mut request = input();
    request.review_before_production = false;
    let mut frozen = snapshot();
    frozen.render_binding.as_mut().unwrap().renderer_lock_sha256 = "f".repeat(64);
    let run = repo::create(&pool, &owner, &request, &frozen)
        .await
        .unwrap();
    let repeated = repo::create(&pool, &owner, &request, &snapshot())
        .await
        .unwrap();
    assert_eq!(repeated.sources.render_binding, frozen.render_binding);
    let id = run.run_id;
    let (_, attempt) = super::tests::begin(&pool, &owner, id, 1).await.unwrap();
    attempts::finish_and_dispatch(&pool, &owner, id, attempt, (document(), json!({})))
        .await
        .unwrap();
    let active = repo::get(&pool, &owner, id).await.unwrap();
    assert_eq!(active.status, "running");
    let first = active.render_job_id.unwrap();
    let paused = transitions::control(&pool, &owner, id, 3, Control::Pause)
        .await
        .unwrap();
    assert_eq!(paused.run.status, "paused");
    assert!(!paused.run.pause_requested);
    let resumed = transitions::control(&pool, &owner, id, 4, Control::Resume)
        .await
        .unwrap();
    let job = resumed.run.render_job_id.unwrap();
    assert_ne!(job, first);
    assert_eq!(resumed.run.project_revision, active.project_revision);
    let retried = projects::snapshot(
        &pool,
        &owner,
        resumed.run.project_id.unwrap(),
        resumed.run.project_revision.unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(retried.render_binding, frozen.render_binding);
    assert_eq!(resumed.run.sources.render_binding, frozen.render_binding);
    sqlx::query("UPDATE ads.content_production_jobs SET status='running',claim_token=$2,heartbeat_at=NOW() WHERE job_id=$1").bind(job).bind(Uuid::new_v4()).execute(&pool).await.unwrap();
    let stopping = transitions::control(&pool, &owner, id, 5, Control::Pause)
        .await
        .unwrap();
    assert_eq!(stopping.run.status, "running");
    assert!(stopping.run.pause_requested);
    assert!(transitions::control(&pool, &owner, id, 6, Control::Resume)
        .await
        .is_err());
    assert!(transitions::revise(
        &pool,
        &owner,
        id,
        RevisePlanRequest {
            expected_version: 6,
            expected_plan_revision: 1,
            document: document(),
            unlock_clip_ids: vec![]
        }
    )
    .await
    .is_err());
    let cancelled = transitions::control(&pool, &owner, id, 6, Control::Cancel)
        .await
        .unwrap();
    assert_eq!(cancelled.run.status, "cancelling");
    assert!(!cancelled.run.pause_requested);
    assert!(cancelled.run.execution_version > resumed.run.execution_version);
}

#[tokio::test]
#[ignore = "requires disposable content production PostgreSQL with 027"]
async fn postgres_resume_does_not_replace_a_concurrently_edited_project() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let mut request = input();
    request.review_before_production = false;
    let run = repo::create(&pool, &owner, &request, &snapshot())
        .await
        .unwrap();
    let (_, attempt) = super::tests::begin(&pool, &owner, run.run_id, 1)
        .await
        .unwrap();
    attempts::finish_and_dispatch(&pool, &owner, run.run_id, attempt, (document(), json!({})))
        .await
        .unwrap();
    let active = repo::get(&pool, &owner, run.run_id).await.unwrap();
    let paused = transitions::control(&pool, &owner, run.run_id, active.version, Control::Pause)
        .await
        .unwrap();
    let project = active.project_id.unwrap();
    let revision = active.project_revision.unwrap();
    let mut manual = projects::snapshot(&pool, &owner, project, revision)
        .await
        .unwrap();
    let old_binding = manual.render_binding.clone();
    manual.title = "人工调整后工程".into();
    manual.render_binding.as_mut().unwrap().renderer_lock_sha256 = "f".repeat(64);
    projects::save(&pool, &owner, Some(project), Some(revision), manual)
        .await
        .unwrap();
    let saved = projects::snapshot(&pool, &owner, project, revision + 1)
        .await
        .unwrap();
    assert_eq!(saved.render_binding, old_binding);
    assert!(matches!(
        transitions::control(
            &pool,
            &owner,
            run.run_id,
            paused.run.version,
            Control::Resume
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    let after = repo::get(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(after.status, "paused");
    assert_eq!(after.version, paused.run.version);
    assert_eq!(after.render_job_id, paused.run.render_job_id);
}
