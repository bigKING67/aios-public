use std::io::Cursor;

use axum::{
    http::{
        header::{CONTENT_DISPOSITION, CONTENT_TYPE},
        HeaderMap, HeaderValue,
    },
    response::{IntoResponse, Response},
};
use calamine::{Data, Reader, Xlsx};
use tracing::warn;

use crate::error::{AppError, AppResult};

const XLSX_CONTENT_TYPE: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

pub(crate) fn validate_xlsx_upload_metadata(
    file_name: Option<&str>,
    content_type: Option<&str>,
) -> AppResult<()> {
    let has_xlsx_name = file_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some_and(|value| value.to_ascii_lowercase().ends_with(".xlsx"));
    let has_xlsx_content_type = content_type
        .map(str::trim)
        .is_some_and(|value| value.eq_ignore_ascii_case(XLSX_CONTENT_TYPE));
    if has_xlsx_name || has_xlsx_content_type {
        return Ok(());
    }
    Err(AppError::bad_request("仅支持 XLSX 文件"))
}

pub(crate) fn parse_xlsx_rows(
    bytes: &[u8],
    max_bytes: usize,
    max_rows: usize,
    max_columns: usize,
    preferred_sheet: &str,
) -> AppResult<Vec<Vec<String>>> {
    if bytes.is_empty() {
        return Err(AppError::bad_request("XLSX 文件不能为空"));
    }
    if bytes.len() > max_bytes {
        return Err(AppError::bad_request("XLSX 文件不能超过 5 MB"));
    }
    let mut workbook = Xlsx::new(Cursor::new(bytes)).map_err(|error| {
        warn!(?error, "parse xlsx workbook failed");
        AppError::bad_request("XLSX 文件损坏或格式不受支持")
    })?;
    let sheet_names = workbook.sheet_names();
    let sheet_name = sheet_names
        .iter()
        .find(|name| name.as_str() == preferred_sheet)
        .or_else(|| sheet_names.first())
        .cloned()
        .ok_or_else(|| AppError::bad_request("XLSX 文件不包含工作表"))?;
    let range = workbook.worksheet_range(&sheet_name).map_err(|error| {
        warn!(?error, sheet_name, "read xlsx sheet failed");
        AppError::bad_request("XLSX 工作表读取失败")
    })?;
    let Some((end_row, end_column)) = range.end() else {
        return Ok(Vec::new());
    };
    if end_row as usize + 1 > max_rows + 1 {
        return Err(AppError::bad_request(format!("单次最多解析 {max_rows} 行")));
    }
    if end_column as usize + 1 > max_columns {
        return Err(AppError::bad_request(format!(
            "XLSX 工作表最多支持 {max_columns} 列"
        )));
    }
    let (start_row, start_column) = range.start().unwrap_or((0, 0));
    let mut rows = Vec::with_capacity(end_row as usize + 1);
    rows.resize_with(start_row as usize, Vec::new);
    rows.extend(range.rows().map(|row| {
        let mut cells = Vec::with_capacity(start_column as usize + row.len());
        cells.resize(start_column as usize, String::new());
        cells.extend(row.iter().map(cell_to_text));
        cells
    }));
    Ok(rows)
}

fn cell_to_text(value: &Data) -> String {
    value.to_string().trim().to_string()
}

pub(crate) fn xlsx_response(filename: &str, body: Vec<u8>) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static(XLSX_CONTENT_TYPE));
    let disposition = format!("attachment; filename=\"{filename}\"");
    if let Ok(value) = HeaderValue::from_str(disposition.as_str()) {
        headers.insert(CONTENT_DISPOSITION, value);
    }
    (headers, body).into_response()
}
