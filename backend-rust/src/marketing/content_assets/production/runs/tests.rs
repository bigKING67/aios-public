use super::{
    adopt, attempts, domain, repository as repo,
    transitions::{self, Control},
    types::*,
};
use crate::{
    error::AppError,
    marketing::content_assets::production::{
        repository as projects,
        types::{BoundAsset, Clip, Snapshot},
    },
};
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

pub(super) fn input() -> CreateRunRequest {
    CreateRunRequest {
        narration_asset_id: None,
        generate_captions: false,
        max_auto_repairs: 0,
        idempotency_key: Uuid::new_v4().to_string(),
        title: "口播初剪".into(),
        brief: "保留原意，提炼完整语句".into(),
        task_type: "talking_head".into(),
        asset_ids: vec![Uuid::nil()],
        aspect: "portrait".into(),
        target_seconds: 30,
        review_before_production: true,
        model_call_confirmed: true,
        rights_confirmed: true,
    }
}
pub(super) fn document() -> PlanDocument {
    PlanDocument {
        summary: "问题到演示".into(),
        clips: vec![Clip {
            id: "clip-1".into(),
            asset_id: Uuid::nil(),
            start_ms: 1000,
            end_ms: 3000,
            caption: "原片台词".into(),
            volume: 1.0,
        }],
        reasons: vec!["完整原声句子".into()],
        gaps: vec![],
        locked_clip_ids: vec![],
        narration_captions: None,
    }
}
pub(super) fn snapshot() -> Snapshot {
    Snapshot {
        derived_assets: Vec::new(),
        render_binding: Some(super::super::render_binding::current()),
        edit_document: None,
        output_profile: super::super::types::OutputProfile::LegacyV1,
        title: "scope".into(),
        aspect: "portrait".into(),
        clips: vec![],
        assets: vec![BoundAsset {
            asset_id: Uuid::nil(),
            object_key: "private/source.mp4".into(),
            sha256: "a".repeat(64),
            duration_ms: 10_000,
        }],
        rights_confirmed: true,
    }
}
pub(super) async fn database() -> PgPool {
    let url = std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL")
        .expect("disposable fixture database required");
    assert!(
        url.contains("@127.0.0.1:"),
        "tests must use loopback fixture"
    );
    PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .unwrap()
}

#[test]
fn bounds_sources_and_locks_are_enforced() {
    let mut r = input();
    let p = document();
    assert!(domain::validate_request(&r).is_ok());
    assert!(domain::validate_plan(&p, &r, &snapshot()).is_ok());
    r.asset_ids.push(Uuid::nil());
    assert!(domain::validate_request(&r).is_err());
    let mut bad = p.clone();
    bad.clips[0].asset_id = Uuid::new_v4();
    assert!(domain::validate_plan(&bad, &input(), &snapshot()).is_err());
    bad = p.clone();
    bad.clips[0].end_ms = 11_000;
    assert!(domain::validate_plan(&bad, &input(), &snapshot()).is_err());
    let mut locked = p.clone();
    locked.locked_clip_ids = vec!["clip-1".into()];
    bad = locked.clone();
    bad.clips[0].caption = "偷偷改字幕".into();
    assert!(domain::preserve_locks(&locked, &bad, &[]).is_err());
    assert!(domain::preserve_locks(&locked, &bad, &["clip-1".into()]).is_ok());
    assert!(domain::preserve_locks(&locked, &p, &[]).is_err());
    assert!(domain::preserve_locks(&locked, &p, &["nonexistent".into()]).is_err());
}

#[test]
fn locked_relative_order_and_request_schema_are_preserved() {
    let mut p = document();
    let mut second = p.clips[0].clone();
    second.id = "clip-2".into();
    p.clips.push(second);
    p.locked_clip_ids = vec!["clip-1".into(), "clip-2".into()];
    let mut changed = p.clone();
    changed.clips.reverse();
    assert!(domain::preserve_locks(&p, &changed, &[]).is_err());
    let mut request = serde_json::to_value(input()).unwrap();
    request["sourceUrl"] = json!("file:///etc/passwd");
    assert!(serde_json::from_value::<CreateRunRequest>(request).is_err());
}

#[tokio::test]
#[ignore = "requires disposable content production PostgreSQL fixture with 026"]
async fn postgres_idempotency_ownership_and_concurrent_versions() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let r = input();
    let sources = snapshot();
    let (a, b) = tokio::join!(
        repo::create(&pool, &owner, &r, &sources),
        repo::create(&pool, &owner, &r, &sources)
    );
    let a = a.unwrap();
    assert_eq!(a.run_id, b.unwrap().run_id);
    let encoded = serde_json::to_value(&a).unwrap().to_string();
    assert!(!encoded.contains("private/source.mp4"));
    let mut changed = r.clone();
    changed.brief = "不同任务".into();
    assert!(matches!(
        repo::create(&pool, &owner, &changed, &snapshot()).await,
        Err(AppError::Conflict(_))
    ));
    assert!(matches!(
        repo::get(&pool, "another-owner", a.run_id).await,
        Err(AppError::NotFound)
    ));
    assert!(repo::list(&pool, "another-owner").await.unwrap().is_empty());
    let (one, two) = tokio::join!(
        transitions::control(&pool, &owner, a.run_id, 1, Control::Pause),
        transitions::control(&pool, &owner, a.run_id, 1, Control::Cancel)
    );
    assert_eq!(usize::from(one.is_ok()) + usize::from(two.is_ok()), 1);
    assert_eq!(repo::get(&pool, &owner, a.run_id).await.unwrap().version, 2);
}

#[tokio::test]
#[ignore = "requires disposable content production PostgreSQL fixture with 026"]
async fn postgres_late_model_cannot_overwrite_user_plan_and_adopt_is_atomic() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let run = repo::create(&pool, &owner, &input(), &snapshot())
        .await
        .unwrap();
    let id = run.run_id;
    let (_, token) = begin(&pool, &owner, id, 1).await.unwrap();
    assert!(begin(&pool, &owner, id, 2).await.is_err());
    transitions::control(&pool, &owner, id, 2, Control::Pause)
        .await
        .unwrap();
    let mut plan = document();
    plan.locked_clip_ids = vec!["clip-1".into()];
    let revised = transitions::revise(
        &pool,
        &owner,
        id,
        RevisePlanRequest {
            expected_version: 3,
            expected_plan_revision: 0,
            document: plan.clone(),
            unlock_clip_ids: vec![],
        },
    )
    .await
    .unwrap();
    assert_eq!(revised.run.version, 4);
    assert_eq!(revised.run.execution_version, 2);
    assert!(!attempts::finish(
        &pool,
        &owner,
        id,
        token,
        Ok((document(), json!({"model":"fixture","old":true})))
    )
    .await
    .unwrap());
    let stored = repo::detail(&pool, &owner, id).await.unwrap();
    assert_eq!(stored.run.version, 4);
    assert_eq!(
        stored.plan.unwrap().document.locked_clip_ids,
        vec!["clip-1"]
    );
    let late: serde_json::Value = sqlx::query_scalar(
        "SELECT result FROM ads.content_production_plan_attempts WHERE attempt_id=$1",
    )
    .bind(token)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(late["old"], true);
    transitions::control(&pool, &owner, id, 4, Control::Resume)
        .await
        .unwrap();
    let adopted = adopt::adopt(
        &pool,
        &owner,
        id,
        AdoptPlanRequest {
            expected_version: 5,
            expected_plan_revision: 1,
            expected_project_revision: None,
        },
    )
    .await
    .unwrap();
    let project = adopted.run.project_id.unwrap();
    assert_eq!(adopted.run.version, 6);
    let before = projects::snapshot(&pool, &owner, project, 1).await.unwrap();
    assert_eq!(before.clips, plan.clips);
    let mut manually_edited = before;
    manually_edited.title = "人工修改".into();
    projects::save(&pool, &owner, Some(project), Some(1), manually_edited)
        .await
        .unwrap();
    assert!(matches!(
        adopt::adopt(
            &pool,
            &owner,
            id,
            AdoptPlanRequest {
                expected_version: 6,
                expected_plan_revision: 1,
                expected_project_revision: Some(1)
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    assert_eq!(repo::get(&pool, &owner, id).await.unwrap().version, 6);
    assert_eq!(
        projects::get_project(&pool, &owner, project)
            .await
            .unwrap()
            .title,
        "人工修改"
    );
    let revisions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_revisions WHERE project_id=$1",
    )
    .bind(project)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(revisions, 2);
}

#[tokio::test]
#[ignore = "requires disposable content production PostgreSQL fixture with 026"]
async fn postgres_pause_completion_cancel_and_expiry_recovery() {
    let pool = database().await;
    let owner = Uuid::new_v4().to_string();
    let run = repo::create(&pool, &owner, &input(), &snapshot())
        .await
        .unwrap();
    let id = run.run_id;
    let (_, token) = begin(&pool, &owner, id, 1).await.unwrap();
    transitions::control(&pool, &owner, id, 2, Control::Pause)
        .await
        .unwrap();
    assert!(attempts::finish(
        &pool,
        &owner,
        id,
        token,
        Ok((document(), json!({"model":"fixture"})))
    )
    .await
    .unwrap());
    let paused = repo::detail(&pool, &owner, id).await.unwrap();
    assert_eq!(paused.run.status, "paused");
    assert_eq!(paused.run.plan_revision, 1);
    let resumed = transitions::control(&pool, &owner, id, 4, Control::Resume)
        .await
        .unwrap();
    assert_eq!(resumed.run.status, "waiting");
    transitions::control(&pool, &owner, id, 5, Control::Cancel)
        .await
        .unwrap();
    assert!(!attempts::finish(
        &pool,
        &owner,
        id,
        token,
        Ok((document(), json!({"late":true})))
    )
    .await
    .unwrap());
    assert_eq!(
        repo::get(&pool, &owner, id).await.unwrap().status,
        "cancelled"
    );
    assert!(transitions::control(&pool, &owner, id, 6, Control::Resume)
        .await
        .is_err());

    let retry = repo::create(&pool, &owner, &input(), &snapshot())
        .await
        .unwrap();
    let id = retry.run_id;
    let (_, failed) = begin(&pool, &owner, id, 1).await.unwrap();
    assert!(
        attempts::finish(&pool, &owner, id, failed, Err("planning_failed"))
            .await
            .unwrap()
    );
    let waiting = repo::detail(&pool, &owner, id).await.unwrap();
    assert_eq!(waiting.run.status, "waiting");
    assert_eq!(
        waiting.run.waiting_reason.as_deref(),
        Some("planning_failed")
    );
    assert!(begin(&pool, &owner, id, 3).await.is_err());
    transitions::control(&pool, &owner, id, 3, Control::Resume)
        .await
        .unwrap();
    let (_, active) = begin(&pool, &owner, id, 4).await.unwrap();
    transitions::control(&pool, &owner, id, 5, Control::Cancel)
        .await
        .unwrap();
    assert!(!attempts::finish(
        &pool,
        &owner,
        id,
        active,
        Ok((document(), json!({"afterCancel":true})))
    )
    .await
    .unwrap());
    let cancelled = repo::detail(&pool, &owner, id).await.unwrap();
    assert_eq!(cancelled.run.status, "cancelled");
    assert_eq!(cancelled.run.version, 6);
    assert!(cancelled.plan.is_none());

    let fresh = repo::create(&pool, &owner, &input(), &snapshot())
        .await
        .unwrap();
    let id = fresh.run_id;
    let (_, expired) = begin(&pool, &owner, id, 1).await.unwrap();
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=NOW()-INTERVAL '1 second' WHERE attempt_id=$1").bind(expired).execute(&pool).await.unwrap();
    let restored = transitions::control(&pool, &owner, id, 2, Control::Resume)
        .await
        .unwrap();
    assert_eq!(restored.run.status, "queued");
    assert!(!attempts::finish(
        &pool,
        &owner,
        id,
        expired,
        Ok((document(), json!({"expired":true})))
    )
    .await
    .unwrap());
    let (_, current) = begin(&pool, &owner, id, 3).await.unwrap();
    assert_ne!(current, expired);
    assert!(attempts::finish(
        &pool,
        &owner,
        id,
        current,
        Ok((document(), json!({"model":"fixture"})))
    )
    .await
    .unwrap());
    assert_eq!(
        repo::detail(&pool, &owner, id)
            .await
            .unwrap()
            .run
            .plan_revision,
        1
    );
}

// Existing settlement tests start after dispatch. Queue claiming is covered by
// planning_queue_tests with real competing PostgreSQL transactions.
pub(super) async fn begin(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    expected: i32,
) -> crate::error::AppResult<(Run, Uuid)> {
    let (run, token) = attempts::enqueue(pool, owner, id, expected).await?;
    sqlx::query("UPDATE ads.content_production_plan_attempts SET status='running',expires_at=clock_timestamp()+INTERVAL '210 seconds' WHERE attempt_id=$1")
        .bind(token).execute(pool).await.unwrap();
    Ok((run, token))
}
