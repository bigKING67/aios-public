use tracing::error;

use crate::error::AppError;

pub(super) fn map_write_error(err: sqlx::Error, message: &str) -> AppError {
    if let sqlx::Error::Database(database_error) = &err {
        if database_error.code().as_deref() == Some("23505") {
            let constraint = database_error.constraint().unwrap_or_default();
            if constraint.contains("raw_sha256") || database_error.message().contains("raw_sha256")
            {
                return AppError::Conflict("该视频已存在于素材库，请勿重复上传。".to_string());
            }
            return AppError::Conflict("平台 ID / 素材 ID 已存在，不能重复绑定".to_string());
        }
        if database_error.code().as_deref() == Some("23503") {
            return AppError::bad_request("关联的内容资产或平台身份不存在");
        }
    }
    error!(?err, "{}", message);
    AppError::Internal
}
