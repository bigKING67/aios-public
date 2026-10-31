//! Delivery intents use scoped reads; only known failures can be requeued.
use super::{
    error::StudioError,
    postgres_tests::{pool, user, OTHER, SCOPED},
    remix, remix_delivery,
    remix_postgres_tests::{asset, create_request, fixture, settings},
    remix_read, remix_review,
    remix_types::RemixOutputReviewRequest,
};

fn status(result: Result<impl std::fmt::Debug, StudioError>) -> u16 {
    match result.unwrap_err() {
        StudioError::App(error) => error.status_code().as_u16(),
        other => panic!("unexpected error {other:?}"),
    }
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with BQL 016"]
async fn delivery_intents_are_scoped_disabled_by_default_and_never_replay_unknown_writes() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let mut settings = settings();
    assert!(!settings.content_ai_studio_delivery_enabled);
    let detail = remix::create(
        &pool,
        &settings,
        &user(&f.owner),
        SCOPED,
        &create_request(&f, 1, "delivery"),
    )
    .await
    .unwrap();
    let batch = detail.batch.batch_id;
    let run = detail.items[0].run_id;
    let (output, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    sqlx::query("UPDATE ads.content_production_runs SET status='succeeded',stage='delivery' WHERE run_id=$1").bind(run).execute(&pool).await.unwrap();
    sqlx::query("UPDATE ads.content_remix_batch_runs SET output_asset_id=$1 WHERE run_id=$2")
        .bind(output)
        .bind(run)
        .execute(&pool)
        .await
        .unwrap();
    let receipt = serde_json::json!({"host_inspection":{"sha256":"a".repeat(64)},"host_remix_qc":{
        "schema":"aios.remix-qc.v1","status":"passed","outputSha256":"a".repeat(64),
        "checks":{"freeze":{"status":"passed"},"timing":{"status":"passed"},
        "pictures":{"status":"passed"},"sources":{"status":"passed"}}}});
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=(SELECT render_job_id FROM ads.content_production_runs WHERE run_id=$1)").bind(run).bind(receipt).execute(&pool).await.unwrap();
    let approved = RemixOutputReviewRequest {
        decision: "approved".into(),
        reasons: vec![],
        note: None,
    };
    let detail = remix_review::review(
        &pool,
        &settings,
        &f.owner,
        Some(&f.owner),
        batch,
        1,
        &approved,
    )
    .await
    .unwrap();
    let delivery = detail.items[0].delivery.as_ref().unwrap();
    assert_eq!(delivery.status, "pending");
    assert!(!delivery.enabled);
    assert_eq!(
        status(
            remix_delivery::retry_output(&pool, &settings, &f.owner, Some(&f.owner), batch, 1)
                .await
        ),
        503
    );
    sqlx::query("INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at,status,error_code,attempts) VALUES ($1,$2,$3,NOW(),'failed','import_failed',4)").bind(output).bind(run).bind(&f.owner).execute(&pool).await.unwrap();
    settings.content_ai_studio_delivery_enabled = true;
    assert_eq!(
        status(remix_delivery::retry_output(&pool, &settings, OTHER, Some(OTHER), batch, 1).await),
        404
    );
    let retried =
        remix_delivery::retry_output(&pool, &settings, &f.owner, Some(&f.owner), batch, 1)
            .await
            .unwrap();
    assert_eq!(
        retried.items[0].delivery.as_ref().unwrap().status,
        "pending"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i32>(
            "SELECT retry_limit FROM cloud_video.pushes WHERE output_asset_id=$1"
        )
        .bind(output)
        .fetch_one(&pool)
        .await
        .unwrap(),
        8
    );
    // Repeated clicks, unknown outcomes and successes cannot generate new imports.
    for state in ["pending", "uncertain", "submitting", "succeeded"] {
        sqlx::query("UPDATE cloud_video.pushes SET status=$2,cloud_video_id=123456789,succeeded_at=NOW() WHERE output_asset_id=$1").bind(output).bind(state).execute(&pool).await.unwrap();
        assert_eq!(
            status(
                remix_delivery::retry_output(&pool, &settings, &f.owner, Some(&f.owner), batch, 1)
                    .await
            ),
            409
        );
        if state == "submitting" {
            assert_eq!(
                status(
                    remix_review::clear(&pool, &settings, &f.owner, Some(&f.owner), batch, 1).await
                ),
                409
            );
            assert_eq!(
                status(
                    remix_review::review(
                        &pool,
                        &settings,
                        &f.owner,
                        Some(&f.owner),
                        batch,
                        1,
                        &approved
                    )
                    .await
                ),
                409
            );
        }
    }
    sqlx::query("UPDATE cloud_video.pushes SET status='failed',cloud_video_id=NULL,succeeded_at=NULL WHERE output_asset_id=$1").bind(output).execute(&pool).await.unwrap();
    remix_review::clear(&pool, &settings, &f.owner, Some(&f.owner), batch, 1)
        .await
        .unwrap();
    assert_eq!(
        status(
            remix_delivery::retry_output(&pool, &settings, &f.owner, Some(&f.owner), batch, 1)
                .await
        ),
        409
    );
    let detail = remix_read::detail(&pool, &settings, &f.owner, Some(&f.owner), batch)
        .await
        .unwrap();
    assert!(!detail.items[0].delivery.as_ref().unwrap().can_retry);
}
