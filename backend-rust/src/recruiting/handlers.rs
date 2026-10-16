use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{SecondsFormat, Utc};
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    cors::validate_mutation_origin,
    error::{AppError, AppResult},
    state::AppState,
};

use super::domain::{
    is_honeypot_filled, normalize_review_note, validate_scores, validate_submission,
    AI_INTERN_TEST_KEY,
};
use super::intake_guard::{client_ip, enforce_submission_limit, hash_client_ip};
use super::repository::{self, NewSubmission};
use super::rubric::rubric;
use super::types::{
    PublicSubmissionRequest, PublicSubmissionResponse, RubricQuery, RubricResponse,
    SaveReviewRequest, SubmissionDetail, SubmissionListQuery, SubmissionListResponse, DEFAULT_PAGE,
    DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE,
};

/// Submissions hold candidate contact details; only admins may read or review.
fn ensure_admin(current_user: &CurrentUser) -> AppResult<()> {
    if current_user.is_admin() {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub(super) async fn create_public_submission(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PublicSubmissionRequest>,
) -> AppResult<(StatusCode, Json<PublicSubmissionResponse>)> {
    validate_mutation_origin(&state.settings.cors_origins, &headers)?;
    let now = Utc::now();

    if is_honeypot_filled(&request) {
        // Look successful so bots do not learn which field gave them away.
        return Ok((
            StatusCode::CREATED,
            Json(PublicSubmissionResponse {
                submission_id: request.submission_id,
                submitted_at: now.to_rfc3339_opts(SecondsFormat::Secs, true),
            }),
        ));
    }

    let submission_id = request.submission_id;
    let test_key = request.test_key.clone();
    let question_set_version = request.question_set_version;
    let submission = validate_submission(request, now)?;
    let ip_hash = hash_client_ip(&client_ip(&headers), &state.settings.secret_key);
    enforce_submission_limit(&state, &ip_hash, now).await?;
    let submitted_at = repository::insert_submission(
        &state.pool,
        NewSubmission {
            submission_id,
            test_key: &test_key,
            question_set_version,
            submission: &submission,
            client_ip_hash: &ip_hash,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(PublicSubmissionResponse {
            submission_id,
            submitted_at: submitted_at.to_rfc3339_opts(SecondsFormat::Secs, true),
        }),
    ))
}

pub(super) async fn list_submissions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SubmissionListQuery>,
    current_user: CurrentUser,
) -> AppResult<Json<SubmissionListResponse>> {
    ensure_admin(&current_user)?;
    let page = query.page.unwrap_or(DEFAULT_PAGE).clamp(1, MAX_PAGE);
    let page_size = query
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    let (total, items) = tokio::try_join!(
        repository::count_submissions(&state.pool, AI_INTERN_TEST_KEY),
        repository::list_submissions(
            &state.pool,
            AI_INTERN_TEST_KEY,
            page_size,
            (page - 1) * page_size,
        ),
    )?;
    Ok(Json(SubmissionListResponse {
        items,
        total,
        page,
        page_size,
    }))
}

pub(super) async fn get_submission(
    State(state): State<Arc<AppState>>,
    Path(submission_id): Path<Uuid>,
    current_user: CurrentUser,
) -> AppResult<Json<SubmissionDetail>> {
    ensure_admin(&current_user)?;
    Ok(Json(
        repository::fetch_submission(&state.pool, submission_id).await?,
    ))
}

pub(super) async fn save_review(
    State(state): State<Arc<AppState>>,
    Path(submission_id): Path<Uuid>,
    current_user: CurrentUser,
    Json(request): Json<SaveReviewRequest>,
) -> AppResult<Json<SubmissionDetail>> {
    ensure_admin(&current_user)?;
    let submission = repository::fetch_submission(&state.pool, submission_id).await?;
    let scores = validate_scores(request.scores, submission.question_set_version)?;
    let note = normalize_review_note(request.note)?;
    let reviewer = current_user
        .username
        .as_deref()
        .unwrap_or(current_user.user_id.as_str());
    repository::save_review(
        &state.pool,
        submission_id,
        scores,
        note.as_deref(),
        reviewer,
    )
    .await?;
    Ok(Json(
        repository::fetch_submission(&state.pool, submission_id).await?,
    ))
}

pub(super) async fn get_rubric(
    current_user: CurrentUser,
    Query(query): Query<RubricQuery>,
) -> AppResult<Json<RubricResponse>> {
    ensure_admin(&current_user)?;
    Ok(Json(rubric(query.question_set_version.unwrap_or(1))?))
}

#[cfg(test)]
mod tests {
    use super::ensure_admin;
    use crate::{auth::CurrentUser, error::AppError};

    fn user(roles: &[&str], permissions: &[&str]) -> CurrentUser {
        CurrentUser {
            user_id: "recruiting-user".into(),
            username: Some("recruiting-user".into()),
            roles: roles.iter().map(|role| (*role).to_string()).collect(),
            permissions: permissions
                .iter()
                .map(|permission| (*permission).to_string())
                .collect(),
        }
    }

    #[test]
    fn only_admin_roles_pass() {
        assert!(ensure_admin(&user(&["admin"], &[])).is_ok());
        assert!(ensure_admin(&user(&["super_admin"], &[])).is_ok());
        assert!(matches!(
            ensure_admin(&user(&["content_ops"], &["user:list:all", "audit:view"])),
            Err(AppError::Forbidden)
        ));
    }
}
