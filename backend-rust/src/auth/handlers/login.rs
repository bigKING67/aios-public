use std::sync::Arc;

use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use bcrypt::verify;
use chrono::{Duration, Utc};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    append_auth_clear_cookie_headers, append_auth_set_cookie_headers, build_session_user,
    persist_refresh_token, update_last_login_at, AuthUserResponse, LoginRequest,
    SessionLoginResponse, TokenResponse, ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE,
};
use super::super::{
    fetch_user_by_username, fetch_user_permissions, fetch_user_roles, tokens::create_token,
    with_no_store_headers,
};

pub(crate) async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> AppResult<Json<TokenResponse>> {
    let tokens = authenticate_and_issue_tokens(state.as_ref(), payload).await?;
    Ok(Json(tokens))
}

pub(crate) async fn session_login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Response {
    match authenticate_and_issue_tokens(state.as_ref(), payload).await {
        Ok(tokens) => {
            let body = SessionLoginResponse {
                user: build_session_user(&tokens.user, Some(tokens.user.username.as_str())),
                permissions: tokens.user.permissions.clone(),
                access_token: tokens.access_token.clone(),
            };

            let mut response = (axum::http::StatusCode::OK, Json(body)).into_response();
            append_auth_set_cookie_headers(response.headers_mut(), &tokens);
            with_no_store_headers(response)
        }
        Err(AppError::BadRequest(message)) => {
            let response = (
                axum::http::StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "message": message })),
            )
                .into_response();
            with_no_store_headers(response)
        }
        Err(AppError::Unauthorized) | Err(AppError::Forbidden) => {
            let mut response = (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "登录失败，请检查账号或密码" })),
            )
                .into_response();
            append_auth_clear_cookie_headers(response.headers_mut());
            with_no_store_headers(response)
        }
        Err(_) => {
            let response = (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": "登录失败，请稍后重试" })),
            )
                .into_response();
            with_no_store_headers(response)
        }
    }
}

async fn authenticate_and_issue_tokens(
    state: &AppState,
    payload: LoginRequest,
) -> AppResult<TokenResponse> {
    let username = payload.username.trim();
    if username.is_empty() || payload.password.is_empty() {
        return Err(AppError::bad_request("用户名和密码不能为空"));
    }

    let maybe_user = fetch_user_by_username(&state.pool, username).await?;
    let user = maybe_user.ok_or(AppError::Unauthorized)?;

    if !user.is_active {
        return Err(AppError::Unauthorized);
    }

    let password_ok = verify(payload.password.as_str(), user.password_hash.as_str())
        .map_err(|_| AppError::Unauthorized)?;

    if !password_ok {
        return Err(AppError::Unauthorized);
    }

    let roles = fetch_user_roles(&state.pool, &user.id).await?;
    let permissions = fetch_user_permissions(&state.pool, &user.id).await?;

    let access_exp = Utc::now() + Duration::minutes(state.settings.access_token_expire_minutes);
    let refresh_exp = Utc::now() + Duration::days(state.settings.refresh_token_expire_days);

    let access_token = create_token(
        &state.settings.secret_key,
        &user.id,
        ACCESS_TOKEN_TYPE,
        access_exp,
        Some(user.username.clone()),
        roles.clone(),
        permissions.clone(),
    )?;
    let refresh_token = create_token(
        &state.settings.secret_key,
        &user.id,
        REFRESH_TOKEN_TYPE,
        refresh_exp,
        Some(user.username.clone()),
        roles.clone(),
        permissions.clone(),
    )?;

    persist_refresh_token(&state.pool, &user.id, &refresh_token, refresh_exp).await?;
    update_last_login_at(&state.pool, &user.id).await;

    Ok(TokenResponse {
        access_token,
        refresh_token,
        token_type: "bearer".to_string(),
        expires_at: access_exp.to_rfc3339(),
        refresh_expires_at: refresh_exp.to_rfc3339(),
        user: AuthUserResponse {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            is_active: true,
            last_login_at: user.last_login_at.map(|value| value.to_rfc3339()),
            roles,
            permissions,
        },
    })
}
