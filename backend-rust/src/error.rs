use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("too many requests")]
    TooManyRequests,
    #[error("service unavailable: {0}")]
    ServiceUnavailable(String),
    #[error("internal error")]
    Internal,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    detail: String,
}

impl AppError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
    }

    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn detail(&self) -> String {
        match self {
            Self::Unauthorized => "未授权，请重新登录".to_string(),
            Self::Forbidden => "没有权限访问此资源".to_string(),
            Self::NotFound => "请求的资源不存在".to_string(),
            Self::Conflict(message) => message.clone(),
            Self::BadRequest(message) => message.clone(),
            Self::TooManyRequests => "请求过于频繁，请稍后重试".to_string(),
            Self::ServiceUnavailable(message) => message.clone(),
            Self::Internal => "服务器出错，请稍后重试".to_string(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            detail: self.detail(),
        };

        (self.status_code(), Json(body)).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
