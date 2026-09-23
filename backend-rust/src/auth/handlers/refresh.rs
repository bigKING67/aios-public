use std::sync::Arc;

use axum::{
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
    Extension, Json,
};
use chrono::{Duration, Utc};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    append_access_token_cookie_header, append_auth_clear_cookie_headers,
    append_auth_set_cookie_headers, extract_refresh_token_from_headers, persist_refresh_token,
    revoke_refresh_token, validate_refresh_token_storage, with_no_store_headers, AuthRuntimePolicy,
    AuthUserResponse, RefreshRequest, SessionRefreshResponse, TokenResponse, REFRESH_TOKEN_TYPE,
};
use super::super::{
    fetch_user_profile,
    tokens::{create_token, decode_token},
    ACCESS_TOKEN_TYPE,
};

pub(crate) async fn refresh_token(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshRequest>,
) -> AppResult<Json<TokenResponse>> {
    let tokens = refresh_tokens(state.as_ref(), payload.refresh_token.as_str()).await?;
    Ok(Json(tokens))
}

pub(crate) async fn session_refresh(
    Extension(runtime_policy): Extension<AuthRuntimePolicy>,
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if runtime_policy.read_only {
        return session_refresh_read_only(state.as_ref(), headers).await;
    }

    let Some(refresh_token) = extract_refresh_token_from_headers(&headers) else {
        let mut response = (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "刷新会话失败：缺少 refresh token" })),
        )
            .into_response();
        append_auth_clear_cookie_headers(response.headers_mut());
        return with_no_store_headers(response);
    };

    match refresh_tokens(state.as_ref(), refresh_token.as_str()).await {
        Ok(tokens) => {
            let body = SessionRefreshResponse {
                success: true,
                access_token: tokens.access_token.clone(),
            };

            let mut response = (axum::http::StatusCode::OK, Json(body)).into_response();
            append_auth_set_cookie_headers(response.headers_mut(), &tokens);
            with_no_store_headers(response)
        }
        Err(AppError::Unauthorized) | Err(AppError::Forbidden) => {
            let mut response = (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "刷新会话失败，请重新登录" })),
            )
                .into_response();
            append_auth_clear_cookie_headers(response.headers_mut());
            with_no_store_headers(response)
        }
        Err(_) => {
            let response = (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "message": "刷新会话失败，请稍后重试" })),
            )
                .into_response();
            with_no_store_headers(response)
        }
    }
}

async fn session_refresh_read_only(state: &AppState, headers: HeaderMap) -> Response {
    let Some(refresh_token) = extract_refresh_token_from_headers(&headers) else {
        let mut response = (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "刷新会话失败：缺少 refresh token" })),
        )
            .into_response();
        append_auth_clear_cookie_headers(response.headers_mut());
        return with_no_store_headers(response);
    };

    match refresh_access_token_read_only(state, refresh_token.as_str()).await {
        Ok(access) => {
            let body = SessionRefreshResponse {
                success: true,
                access_token: access.token.clone(),
            };
            let mut response = (axum::http::StatusCode::OK, Json(body)).into_response();
            append_access_token_cookie_header(
                response.headers_mut(),
                access.token.as_str(),
                access.expires_at.as_str(),
            );
            with_no_store_headers(response)
        }
        Err(AppError::Unauthorized) | Err(AppError::Forbidden) => {
            let mut response = (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "刷新会话失败，请重新登录" })),
            )
                .into_response();
            append_auth_clear_cookie_headers(response.headers_mut());
            with_no_store_headers(response)
        }
        Err(_) => {
            let response = (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "message": "刷新会话失败，请稍后重试" })),
            )
                .into_response();
            with_no_store_headers(response)
        }
    }
}

struct IssuedAccessToken {
    token: String,
    expires_at: String,
}

async fn validate_refresh_session(
    state: &AppState,
    refresh_token: &str,
) -> AppResult<AuthUserResponse> {
    let claims = decode_token(
        refresh_token,
        &state.settings.secret_key,
        REFRESH_TOKEN_TYPE,
    )?;

    let user_id = claims.sub;

    validate_refresh_token_storage(&state.pool, refresh_token, &user_id).await?;

    let profile = fetch_user_profile(&state.pool, &user_id)
        .await?
        .ok_or(AppError::Unauthorized)?;

    Ok(profile)
}

fn issue_access_token(
    state: &AppState,
    profile: &AuthUserResponse,
) -> AppResult<IssuedAccessToken> {
    let access_exp = Utc::now() + Duration::minutes(state.settings.access_token_expire_minutes);
    let access_token = create_token(
        &state.settings.secret_key,
        &profile.id,
        ACCESS_TOKEN_TYPE,
        access_exp,
        Some(profile.username.clone()),
        profile.roles.clone(),
        profile.permissions.clone(),
    )?;

    Ok(IssuedAccessToken {
        token: access_token,
        expires_at: access_exp.to_rfc3339(),
    })
}

async fn refresh_access_token_read_only(
    state: &AppState,
    refresh_token: &str,
) -> AppResult<IssuedAccessToken> {
    let profile = validate_refresh_session(state, refresh_token).await?;
    issue_access_token(state, &profile)
}

async fn refresh_tokens(state: &AppState, refresh_token: &str) -> AppResult<TokenResponse> {
    let profile = validate_refresh_session(state, refresh_token).await?;
    let access = issue_access_token(state, &profile)?;

    let refresh_exp = Utc::now() + Duration::days(state.settings.refresh_token_expire_days);
    let next_refresh_token = create_token(
        &state.settings.secret_key,
        &profile.id,
        REFRESH_TOKEN_TYPE,
        refresh_exp,
        Some(profile.username.clone()),
        profile.roles.clone(),
        profile.permissions.clone(),
    )?;

    revoke_refresh_token(&state.pool, refresh_token).await?;
    persist_refresh_token(&state.pool, &profile.id, &next_refresh_token, refresh_exp).await?;

    Ok(TokenResponse {
        access_token: access.token,
        refresh_token: next_refresh_token,
        token_type: "bearer".to_string(),
        expires_at: access.expires_at,
        refresh_expires_at: refresh_exp.to_rfc3339(),
        user: profile,
    })
}
