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
    append_auth_clear_cookie_headers, extract_refresh_token_from_headers, revoke_refresh_token,
    tokens::decode_token, with_no_store_headers, CurrentUser, LogoutRequest, SessionLogoutResponse,
    ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE,
};

pub(crate) async fn logout(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<LogoutRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let claims = decode_token(
        payload.refresh_token.as_str(),
        &state.settings.secret_key,
        REFRESH_TOKEN_TYPE,
    )?;

    if claims.sub != current_user.user_id {
        return Err(AppError::Forbidden);
    }

    revoke_refresh_token(&state.pool, payload.refresh_token.as_str()).await?;

    Ok(Json(serde_json::json!({ "message": "Logout successful" })))
}

pub(crate) async fn session_logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let refresh_token = extract_refresh_token_from_headers(&headers);
    let access_token = super::super::extract_access_token_from_headers(&headers);

    let Some(refresh_token) = refresh_token else {
        let mut response = (
            axum::http::StatusCode::OK,
            Json(SessionLogoutResponse {
                success: true,
                message: None,
            }),
        )
            .into_response();
        append_auth_clear_cookie_headers(response.headers_mut());
        return with_no_store_headers(response);
    };

    let Some(access_token) = access_token else {
        let mut response = (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(SessionLogoutResponse {
                success: false,
                message: Some("缺少 access token，无法完成服务端会话撤销".to_string()),
            }),
        )
            .into_response();
        append_auth_clear_cookie_headers(response.headers_mut());
        return with_no_store_headers(response);
    };

    let access_claims = match decode_token(
        access_token.as_str(),
        &state.settings.secret_key,
        ACCESS_TOKEN_TYPE,
    ) {
        Ok(claims) => claims,
        Err(_) => {
            let mut response = (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(SessionLogoutResponse {
                    success: false,
                    message: Some("access token 无效或已过期".to_string()),
                }),
            )
                .into_response();
            append_auth_clear_cookie_headers(response.headers_mut());
            return with_no_store_headers(response);
        }
    };

    let refresh_claims = match decode_token(
        refresh_token.as_str(),
        &state.settings.secret_key,
        REFRESH_TOKEN_TYPE,
    ) {
        Ok(claims) => claims,
        Err(_) => {
            let mut response = (
                axum::http::StatusCode::UNAUTHORIZED,
                Json(SessionLogoutResponse {
                    success: false,
                    message: Some("refresh token 无效或已过期".to_string()),
                }),
            )
                .into_response();
            append_auth_clear_cookie_headers(response.headers_mut());
            return with_no_store_headers(response);
        }
    };

    if access_claims.sub != refresh_claims.sub {
        let mut response = (
            axum::http::StatusCode::FORBIDDEN,
            Json(SessionLogoutResponse {
                success: false,
                message: Some("会话信息不匹配，拒绝登出".to_string()),
            }),
        )
            .into_response();
        append_auth_clear_cookie_headers(response.headers_mut());
        return with_no_store_headers(response);
    }

    let revoke_result = revoke_refresh_token(&state.pool, refresh_token.as_str()).await;
    let mut response = match revoke_result {
        Ok(_) => (
            axum::http::StatusCode::OK,
            Json(SessionLogoutResponse {
                success: true,
                message: None,
            }),
        )
            .into_response(),
        Err(_) => (
            axum::http::StatusCode::BAD_GATEWAY,
            Json(SessionLogoutResponse {
                success: false,
                message: Some("登出失败，请稍后重试".to_string()),
            }),
        )
            .into_response(),
    };
    append_auth_clear_cookie_headers(response.headers_mut());
    with_no_store_headers(response)
}
