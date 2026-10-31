//! 成片审核 against a disposable database (migrations 021–046): reviews follow the
//! output asset, counts roll up per batch, and only reviewable outputs of an
//! accessible batch take a review.
use super::error::StudioError;
use super::postgres_tests::{pool, user, OTHER, SCOPED};
use super::remix;
use super::remix_list;
use super::remix_postgres_tests::{asset, create_request, fixture, settings};
use super::remix_read;
use super::remix_review;
use super::remix_types::{RemixBatchListQuery, RemixOutputReviewRequest};
use crate::error::AppError;
use sqlx::PgPool;
use uuid::Uuid;

fn approve() -> RemixOutputReviewRequest {
    RemixOutputReviewRequest {
        decision: "approved".into(),
        reasons: vec![],
        note: None,
    }
}

fn reject(reason: &str) -> RemixOutputReviewRequest {
    RemixOutputReviewRequest {
        decision: "rejected".into(),
        reasons: vec![reason.into()],
        note: Some("第 2 段画面和第 4 段重复".into()),
    }
}

async fn deliver(pool: &PgPool, run_id: Uuid, output: Uuid) {
    sqlx::query("UPDATE ads.content_production_runs SET status = 'succeeded', stage = 'delivery' WHERE run_id = $1")
        .bind(run_id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("UPDATE ads.content_remix_batch_runs SET output_asset_id = $1 WHERE run_id = $2")
        .bind(output)
        .bind(run_id)
        .execute(pool)
        .await
        .unwrap();
}

fn status(result: Result<impl std::fmt::Debug, StudioError>) -> u16 {
    match result.unwrap_err() {
        StudioError::App(error) => error.status_code().as_u16(),
        other => panic!("unexpected studio error {other:?}"),
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–046"]
async fn reviews_follow_the_output_and_roll_up_per_batch() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let detail = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &create_request(&f, 2, "review"),
    )
    .await
    .unwrap();
    let batch_id = detail.batch.batch_id;
    let [first, second] = [0, 1].map(|i| detail.items[i].run_id);
    let review = |ordinal: i32, request: RemixOutputReviewRequest| {
        let pool = pool.clone();
        let owner = f.owner.clone();
        async move {
            remix_review::review(
                &pool,
                &settings(),
                &owner,
                Some(&owner),
                batch_id,
                ordinal,
                &request,
            )
            .await
        }
    };

    // A rendering output has nothing to review yet.
    assert_eq!(status(review(1, approve()).await), 409);

    let (output_1, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    let (output_2, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    deliver(&pool, first, output_1).await;
    deliver(&pool, second, output_2).await;
    let pending = remix_read::detail(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    assert_eq!(
        (
            pending.batch.reviewable_count,
            pending.batch.approved_count,
            pending.batch.rejected_count
        ),
        (2, 0, 0)
    );
    assert!(pending.items.iter().all(|item| item.review.is_none()));
    let pending_list = |review: Option<&str>| {
        let pool = pool.clone();
        let owner = f.owner.clone();
        let query = RemixBatchListQuery {
            review: review.map(str::to_owned),
            ..Default::default()
        };
        async move {
            remix_list::list(&pool, &settings(), &owner, Some(&owner), None, &query)
                .await
                .unwrap()
        }
    };
    let waiting = pending_list(Some("pending")).await;
    assert_eq!(
        waiting.items.iter().map(|b| b.batch_id).collect::<Vec<_>>(),
        vec![batch_id]
    );
    assert_eq!(waiting.counts.pending_review.all, 1);

    // Approve one, reject the other; the detail carries both and the counts.
    review(1, approve()).await.unwrap();
    let read = review(2, reject("duplicate_picture")).await.unwrap();
    let approved = read.items[0].review.as_ref().unwrap();
    assert_eq!(approved.decision, "approved");
    assert_eq!(approved.reviewer_user_id, f.owner);
    let rejected = read.items[1].review.as_ref().unwrap();
    assert_eq!(rejected.decision, "rejected");
    assert_eq!(rejected.reasons, vec!["duplicate_picture".to_owned()]);
    assert_eq!(rejected.note.as_deref(), Some("第 2 段画面和第 4 段重复"));
    assert_eq!(
        (read.batch.approved_count, read.batch.rejected_count),
        (1, 1)
    );

    // Repeating replaces: the rejected output is approved after all.
    let read = review(2, approve()).await.unwrap();
    assert_eq!(read.items[1].review.as_ref().unwrap().decision, "approved");
    assert!(read.items[1].review.as_ref().unwrap().reasons.is_empty());
    let listed = remix_list::list(
        &pool,
        &settings(),
        &f.owner,
        Some(&f.owner),
        None,
        &RemixBatchListQuery::default(),
    )
    .await
    .unwrap();
    let batch = listed
        .items
        .iter()
        .find(|b| b.batch_id == batch_id)
        .unwrap();
    assert_eq!((batch.reviewable_count, batch.approved_count), (2, 2));
    // Fully reviewed: out of 待审核, and its count drops to zero.
    let waiting = pending_list(Some("pending")).await;
    assert!(waiting.items.is_empty());
    assert_eq!(waiting.counts.pending_review.all, 0);

    // A review only counts for the asset it was given for: a re-rendered output is pending again.
    let (rerendered, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    deliver(&pool, second, rerendered).await;
    let read = remix_read::detail(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    assert!(read.items[1].review.is_none());
    assert_eq!(
        (read.batch.reviewable_count, read.batch.approved_count),
        (2, 1)
    );

    // A deleted output is no longer reviewable and its review drops out of the counts.
    sqlx::query("UPDATE ads.marketing_content_assets SET is_deleted = TRUE WHERE asset_id = $1")
        .bind(output_1)
        .execute(&pool)
        .await
        .unwrap();
    let read = remix_read::detail(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    assert!(read.items[0].review.is_none());
    assert_eq!(
        (read.batch.reviewable_count, read.batch.approved_count),
        (1, 0)
    );
    assert_eq!(status(review(1, approve()).await), 409);

    // Clearing goes back to 待审核 and is idempotent.
    review(2, approve()).await.unwrap();
    for _ in 0..2 {
        let read = remix_review::clear(&pool, &settings(), &f.owner, Some(&f.owner), batch_id, 2)
            .await
            .unwrap();
        assert!(read.items[1].review.is_none());
        assert_eq!(read.batch.approved_count, 0);
    }

    // Scoped access: another user cannot see or review the batch; unknown outputs are 404.
    let other = remix_review::review(
        &pool,
        &settings(),
        OTHER,
        Some(OTHER),
        batch_id,
        2,
        &approve(),
    )
    .await;
    assert_eq!(status(other), 404);
    assert_eq!(status(review(9, approve()).await), 404);
    // Validation runs before any read.
    assert!(matches!(
        review(2, reject("boring")).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with BQL 015"]
async fn qc_failures_are_visible_separately_and_only_delivered_outputs_accept_new_reasons() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let detail = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &create_request(&f, 2, "qc-review"),
    )
    .await
    .unwrap();
    let batch_id = detail.batch.batch_id;
    let [first, second] = [0, 1].map(|i| detail.items[i].run_id);
    let (output, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    deliver(&pool, first, output).await;
    sqlx::query("UPDATE ads.content_production_runs SET status='failed',stage='inspection',waiting_reason='remix_qc_failed' WHERE run_id=$1")
        .bind(second).execute(&pool).await.unwrap();
    let receipt = serde_json::json!({"host_inspection":{"sha256":"a".repeat(64)},"host_remix_qc":{
        "schema":"aios.remix-qc.v1","status":"failed","outputSha256":"a".repeat(64),
        "checks":{"freeze":{"status":"failed","events":[{"sourceExempt":false}]},
        "timing":{"status":"passed"},"pictures":{"status":"passed","pairCount":0},"sources":{"status":"passed"}},
        "privateUrl":"https://private/never-project"}});
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=(SELECT render_job_id FROM ads.content_production_runs WHERE run_id=$1)")
        .bind(second).bind(receipt).execute(&pool).await.unwrap();
    let query = RemixBatchListQuery {
        quality: Some("failed".into()),
        limit: Some(1),
        ..Default::default()
    };
    let page = remix_list::list(&pool, &settings(), &f.owner, Some(&f.owner), None, &query)
        .await
        .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].qc_failed_count, 1);
    assert_eq!(page.items[0].available_count, 1);
    assert_eq!(page.counts.qc_failed.all, 1);
    assert_eq!(page.counts.with_outputs.all, 1);
    assert_eq!(page.counts.without_outputs.all, 0);
    assert_eq!(page.counts.pending_review.all, 1);
    let read = remix_read::detail(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    let qc = read.items[1].qc.as_ref().unwrap();
    assert_eq!(qc.status, "failed");
    assert_eq!(qc.freeze_count, 1);
    assert_eq!(qc.reasons, ["frame_freeze"]);
    assert!(!serde_json::to_string(qc).unwrap().contains("private"));
    assert_eq!(
        status(
            remix_review::review(
                &pool,
                &settings(),
                &f.owner,
                Some(&f.owner),
                batch_id,
                2,
                &reject("wrong_framework")
            )
            .await
        ),
        409
    );
    let reviewed = remix_review::review(
        &pool,
        &settings(),
        &f.owner,
        Some(&f.owner),
        batch_id,
        1,
        &RemixOutputReviewRequest {
            decision: "rejected".into(),
            reasons: vec!["frame_drop".into(), "wrong_framework".into()],
            note: None,
        },
    )
    .await
    .unwrap();
    let review = reviewed.items[0].review.as_ref().unwrap();
    assert_eq!(review.reviewer_user_id, f.owner);
    assert_eq!(review.reasons, ["frame_drop", "wrong_framework"]);
    let hidden = remix_list::list(&pool, &settings(), OTHER, Some(OTHER), None, &query)
        .await
        .unwrap();
    assert!(hidden.items.is_empty());
    assert_eq!(hidden.counts.qc_failed.all, 0);
    let invalid = RemixBatchListQuery {
        quality: Some("everything".into()),
        ..Default::default()
    };
    assert_eq!(
        status(
            remix_list::list(&pool, &settings(), &f.owner, Some(&f.owner), None, &invalid).await
        ),
        400
    );
}
