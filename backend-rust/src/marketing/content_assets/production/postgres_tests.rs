use super::{repository, types::Snapshot};
use crate::error::AppError;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with production migration"]
async fn project_versions_are_owner_scoped_and_reject_stale_writes() {
    let url =
        std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").expect("isolated test database");
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .unwrap();
    let snapshot = |title: &str| -> Snapshot {
        serde_json::from_value(json!({"title":title,"aspect":"portrait","clips":[],"assets":[],"rightsConfirmed":true})).unwrap()
    };
    let first = repository::save(&pool, "fixture-owner", None, None, snapshot("version one"))
        .await
        .unwrap();
    assert_eq!(first.revision, 1);
    assert!(matches!(
        repository::get_project(&pool, "other-owner", first.project_id).await,
        Err(AppError::NotFound)
    ));
    assert!(repository::list_projects(&pool, "other-owner")
        .await
        .unwrap()
        .is_empty());
    let next = repository::save(
        &pool,
        "fixture-owner",
        Some(first.project_id),
        Some(1),
        snapshot("version two"),
    )
    .await
    .unwrap();
    assert_eq!(next.revision, 2);
    assert!(matches!(
        repository::save(
            &pool,
            "fixture-owner",
            Some(first.project_id),
            Some(1),
            snapshot("stale")
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    assert!(matches!(
        repository::save(
            &pool,
            "other-owner",
            Some(first.project_id),
            Some(2),
            snapshot("forbidden")
        )
        .await,
        Err(AppError::NotFound)
    ));
    assert_eq!(
        repository::snapshot(&pool, "fixture-owner", first.project_id, 1)
            .await
            .unwrap()
            .title,
        "version one"
    );
    assert_eq!(
        repository::get_project(&pool, "fixture-owner", first.project_id)
            .await
            .unwrap()
            .title,
        "version two"
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with production migration"]
async fn project_output_profile_survives_reopen_and_keeps_old_json_immutable() {
    use super::types::OutputProfile;
    let pool = PgPoolOptions::new()
        .connect(&std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    for profile in [OutputProfile::LegacyV1, OutputProfile::Hd1080V1] {
        let value = json!({"title":"profile","aspect":"portrait","outputProfile":profile,"clips":[],"assets":[],"rightsConfirmed":true});
        let first = repository::save(
            &pool,
            "profile-owner",
            None,
            None,
            serde_json::from_value(value).unwrap(),
        )
        .await
        .unwrap();
        if profile == OutputProfile::LegacyV1 {
            sqlx::query("UPDATE ads.content_production_revisions SET snapshot=snapshot-'outputProfile' WHERE project_id=$1")
                .bind(first.project_id).execute(&pool).await.unwrap();
        }
        let old: serde_json::Value = sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1 AND revision=1")
            .bind(first.project_id).fetch_one(&pool).await.unwrap();
        let mut edited: Snapshot = serde_json::from_value(old.clone()).unwrap();
        edited.aspect = "landscape".into();
        edited.output_profile = if profile == OutputProfile::LegacyV1 {
            OutputProfile::Hd1080V1
        } else {
            OutputProfile::LegacyV1
        };
        repository::save(
            &pool,
            "profile-owner",
            Some(first.project_id),
            Some(1),
            edited,
        )
        .await
        .unwrap();
        let next = repository::snapshot(&pool, "profile-owner", first.project_id, 2)
            .await
            .unwrap();
        assert_eq!(next.output_profile, profile);
        assert_eq!(next.aspect, "landscape");
        let original: serde_json::Value = sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1 AND revision=1")
            .bind(first.project_id).fetch_one(&pool).await.unwrap();
        assert_eq!(original, old);
    }
}
