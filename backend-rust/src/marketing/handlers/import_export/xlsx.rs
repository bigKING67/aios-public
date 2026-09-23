use axum::{
    extract::{
        multipart::{MultipartError, MultipartRejection},
        Multipart,
    },
    http::StatusCode,
    Json,
};
use tracing::warn;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    marketing::creator_library_xlsx::{
        parse_creator_library_xlsx, validate_creator_library_xlsx_upload_metadata,
        CreatorLibraryXlsxParseResponse,
    },
};

use super::super::authz::ensure_write_permission;

pub(in crate::marketing::handlers) async fn parse_creator_library_xlsx_upload(
    current_user: CurrentUser,
    multipart: Result<Multipart, MultipartRejection>,
) -> AppResult<Json<CreatorLibraryXlsxParseResponse>> {
    ensure_write_permission(&current_user)?;
    let mut multipart = multipart.map_err(|error| {
        warn!(?error, "reject creator library xlsx multipart request");
        AppError::bad_request("XLSX 上传请求格式不合法")
    })?;

    while let Some(field) = multipart.next_field().await.map_err(map_multipart_error)? {
        if field.name() != Some("file") {
            continue;
        }

        let file_name = field.file_name().map(str::to_string);
        let content_type = field.content_type().map(str::to_string);
        validate_creator_library_xlsx_upload_metadata(
            file_name.as_deref(),
            content_type.as_deref(),
        )?;
        let bytes = field.bytes().await.map_err(map_multipart_error)?;
        let rows = parse_creator_library_xlsx(&bytes)?;
        return Ok(Json(CreatorLibraryXlsxParseResponse { rows }));
    }

    Err(AppError::bad_request("缺少 XLSX 文件字段 file"))
}

fn map_multipart_error(error: MultipartError) -> AppError {
    let status = error.status();
    warn!(?error, %status, "read creator library xlsx multipart field failed");
    match status {
        StatusCode::PAYLOAD_TOO_LARGE => AppError::bad_request("XLSX 文件不能超过 5 MB"),
        StatusCode::BAD_REQUEST => AppError::bad_request("XLSX 上传请求格式不合法"),
        _ => AppError::Internal,
    }
}
