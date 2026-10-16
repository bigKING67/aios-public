//! Disposable PostgreSQL contract for migration 036. Run through
//! `backend-rust/scripts/test-recruiting-postgres.sh`.
use chrono::{Duration, Utc};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

use super::domain::{validate_submission, AI_INTERN_QUESTION_SET_VERSION, AI_INTERN_TEST_KEY};
use super::repository::{self, NewSubmission};
use super::types::{CandidateInput, PublicSubmissionRequest, ReviewScores, SubmissionAnswers};
use crate::error::AppError;

async fn pool() -> PgPool {
    let url = std::env::var("RECRUITING_TEST_DATABASE_URL").expect("isolated test database");
    PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .unwrap()
}

async fn insert(pool: &PgPool, name: &str) -> Uuid {
    let now = Utc::now();
    let submission = validate_submission(
        PublicSubmissionRequest {
            submission_id: Uuid::new_v4(),
            test_key: AI_INTERN_TEST_KEY.into(),
            question_set_version: AI_INTERN_QUESTION_SET_VERSION,
            candidate: CandidateInput {
                name: name.into(),
                contact: "wechat: fixture".into(),
                school_and_grade: "某大学".into(),
                major: "计算机科学".into(),
                weekly_availability: "4 天".into(),
                earliest_start: "11 月初".into(),
                portfolio_url: Some("https://github.com/fixture".into()),
            },
            answers: SubmissionAnswers {
                project: "项目经历".into(),
                video_task_code: "async function generateVideo() {\n  return 'url';\n}".into(),
                video_task_notes: "设计思路".into(),
                ai_usage: "AI 写初稿".into(),
                remix_plan: "裂变方案".into(),
                workflow: "开发工作流".into(),
                workflow_rules: "规则".into(),
                agent_plan: "自己的 Agent".into(),
                video_practice: "视频实操验证".into(),
            },
            started_at: Some((now - Duration::minutes(42)).to_rfc3339()),
            website: None,
        },
        now,
    )
    .unwrap();
    let submission_id = Uuid::new_v4();
    repository::insert_submission(
        pool,
        NewSubmission {
            submission_id,
            test_key: AI_INTERN_TEST_KEY,
            question_set_version: AI_INTERN_QUESTION_SET_VERSION,
            submission: &submission,
            client_ip_hash: "fixture-hash",
        },
    )
    .await
    .unwrap();
    submission_id
}

#[tokio::test]
#[ignore = "requires RECRUITING_TEST_DATABASE_URL"]
async fn submission_round_trips_and_review_sets_verdict() {
    let pool = pool().await;
    let submission_id = insert(&pool, "往返候选人").await;

    let detail = repository::fetch_submission(&pool, submission_id)
        .await
        .unwrap();
    assert_eq!(detail.candidate.name, "往返候选人");
    assert_eq!(detail.answers.workflow, "开发工作流");
    assert_eq!(detail.candidate.major, "计算机科学");
    assert!(detail.candidate.weekly_availability.is_empty());
    let duration = detail.duration_seconds.unwrap();
    assert!(
        (42 * 60 - 5..=42 * 60 + 5).contains(&duration),
        "{duration}"
    );
    assert!(detail.review.is_none());

    let scores = ReviewScores {
        project: 15,
        async_logic: 24,
        robustness: 22,
        design: 15,
    };
    repository::save_review(&pool, submission_id, scores, Some("追问取消任务"), "admin")
        .await
        .unwrap();
    let review = repository::fetch_submission(&pool, submission_id)
        .await
        .unwrap()
        .review
        .unwrap();
    assert_eq!(review.total, 76);
    assert_eq!(review.verdict, "hold");
    assert_eq!(review.note.as_deref(), Some("追问取消任务"));
    assert_eq!(review.reviewed_by.as_deref(), Some("admin"));

    let total = repository::count_submissions(&pool, AI_INTERN_TEST_KEY)
        .await
        .unwrap();
    let items = repository::list_submissions(&pool, AI_INTERN_TEST_KEY, 100, 0)
        .await
        .unwrap();
    assert!(total >= 1);
    let listed = items
        .iter()
        .find(|item| item.submission_id == submission_id)
        .unwrap();
    assert_eq!(listed.review.as_ref().unwrap().total, 76);
}

#[tokio::test]
#[ignore = "requires RECRUITING_TEST_DATABASE_URL"]
async fn retried_insert_with_same_id_is_idempotent() {
    let pool = pool().await;
    let submission_id = insert(&pool, "重试候选人").await;
    let detail = repository::fetch_submission(&pool, submission_id)
        .await
        .unwrap();
    let submission = validate_submission(
        PublicSubmissionRequest {
            submission_id,
            test_key: AI_INTERN_TEST_KEY.into(),
            question_set_version: AI_INTERN_QUESTION_SET_VERSION,
            candidate: detail.candidate,
            answers: detail.answers,
            started_at: None,
            website: None,
        },
        Utc::now(),
    )
    .unwrap();
    repository::insert_submission(
        &pool,
        NewSubmission {
            submission_id,
            test_key: AI_INTERN_TEST_KEY,
            question_set_version: AI_INTERN_QUESTION_SET_VERSION,
            submission: &submission,
            client_ip_hash: "fixture-hash",
        },
    )
    .await
    .unwrap();
    let rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM ads.recruiting_test_submissions WHERE submission_id = $1",
    )
    .bind(submission_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rows, 1);
}

#[tokio::test]
#[ignore = "requires RECRUITING_TEST_DATABASE_URL"]
async fn missing_submission_reports_not_found() {
    let pool = pool().await;
    let unknown = Uuid::new_v4();
    assert!(matches!(
        repository::fetch_submission(&pool, unknown).await,
        Err(AppError::NotFound)
    ));
    let scores = ReviewScores {
        project: 1,
        async_logic: 1,
        robustness: 1,
        design: 1,
    };
    assert!(matches!(
        repository::save_review(&pool, unknown, scores, None, "admin").await,
        Err(AppError::NotFound)
    ));
}

#[tokio::test]
#[ignore = "requires RECRUITING_TEST_DATABASE_URL"]
async fn old_and_new_scores_keep_their_versioned_meaning() {
    let pool = pool().await;
    let v3 = insert(&pool, "V3 满分候选人").await;
    let full = ReviewScores {
        project: 20,
        async_logic: 30,
        robustness: 35,
        design: 15,
    };
    repository::save_review(&pool, v3, full, None, "admin")
        .await
        .unwrap();
    let detail = repository::fetch_submission(&pool, v3).await.unwrap();
    assert_eq!(detail.review.unwrap().total, 100);
    assert_eq!(detail.answers.video_practice, "视频实操验证");
    let v2 = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.recruiting_test_submissions (submission_id, test_key, question_set_version, candidate_name, contact, school_and_grade, weekly_availability, earliest_start, answers, client_ip_hash) VALUES ($1, 'ai-intern', 2, 'v2 fixture', 'fixture', 'fixture', '4', 'now', $2, 'fixture')")
        .bind(v2).bind(serde_json::json!({"workflow":"flow", "workflowRules":"", "project":"demo", "agentPlan":"agent", "aiUsage":"AI"})).execute(&pool).await.unwrap();
    repository::save_review(
        &pool,
        v2,
        ReviewScores {
            project: 25,
            async_logic: 25,
            robustness: 25,
            design: 25,
        },
        None,
        "admin",
    )
    .await
    .unwrap();
    let old_v2 = repository::fetch_submission(&pool, v2).await.unwrap();
    assert_eq!(old_v2.review.unwrap().total, 100);
    assert!(old_v2.answers.video_practice.is_empty());
    assert!(old_v2.candidate.major.is_empty());
    assert_eq!(old_v2.candidate.weekly_availability, "4");
    let v1 = Uuid::new_v4();
    let old_answers = serde_json::json!({"project":"old project", "videoTaskCode":"old code", "videoTaskNotes":"old notes", "aiUsage":"AI", "remixPlan":"old plan"});
    sqlx::query("INSERT INTO ads.recruiting_test_submissions (submission_id, test_key, question_set_version, candidate_name, contact, school_and_grade, weekly_availability, earliest_start, answers, client_ip_hash) VALUES ($1, 'ai-intern', 1, 'legacy fixture', 'fixture', 'fixture', '4', 'now', $2, 'fixture')")
        .bind(v1).bind(old_answers).execute(&pool).await.unwrap();
    let old_scores = ReviewScores {
        project: 20,
        async_logic: 15,
        robustness: 14,
        design: 20,
    };
    repository::save_review(&pool, v1, old_scores, None, "admin")
        .await
        .unwrap();
    let old = repository::fetch_submission(&pool, v1).await.unwrap();
    assert_eq!(old.answers.video_task_code, "old code");
    assert!(old.answers.workflow.is_empty());
    assert_eq!(old.review.unwrap().verdict, "reject");
    let listed = repository::list_submissions(&pool, AI_INTERN_TEST_KEY, 100, 0)
        .await
        .unwrap();
    assert_eq!(
        listed
            .iter()
            .find(|row| row.submission_id == v1)
            .unwrap()
            .review
            .as_ref()
            .unwrap()
            .verdict,
        "reject"
    );
}
