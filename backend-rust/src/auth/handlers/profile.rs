use std::sync::Arc;

use axum::{
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
    Json,
};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    build_session_user, fetch_user_profile, tokens::decode_token, with_no_store_headers,
    AuthUserResponse, CurrentUser, SessionMeResponse, ACCESS_TOKEN_TYPE,
};

pub(crate) async fn get_me(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<AuthUserResponse>> {
    let profile = fetch_user_profile(&state.pool, &current_user.user_id)
        .await?
        .ok_or(AppError::Unauthorized)?;

    Ok(Json(profile))
}

pub(crate) async fn session_me(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    let Some(access_token) = super::super::extract_access_token_from_headers(&headers) else {
        return with_no_store_headers(
            (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "未登录或会话已过期" })),
            )
                .into_response(),
        );
    };

    let claims = match decode_token(
        access_token.as_str(),
        &state.settings.secret_key,
        ACCESS_TOKEN_TYPE,
    ) {
        Ok(claims) => claims,
        Err(_) => {
            return with_no_store_headers(
                (
                    axum::http::StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "message": "未登录或会话已过期" })),
                )
                    .into_response(),
            );
        }
    };

    match fetch_user_profile(&state.pool, claims.sub.as_str()).await {
        Ok(Some(profile)) => with_no_store_headers(
            (
                axum::http::StatusCode::OK,
                Json(SessionMeResponse {
                    user: build_session_user(&profile, claims.username.as_deref()),
                    permissions: profile.permissions.clone(),
                }),
            )
                .into_response(),
        ),
        Ok(None) => with_no_store_headers(
            (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "未登录或会话已过期" })),
            )
                .into_response(),
        ),
        Err(_) => with_no_store_headers(
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": "获取用户信息失败" })),
            )
                .into_response(),
        ),
    }
}
