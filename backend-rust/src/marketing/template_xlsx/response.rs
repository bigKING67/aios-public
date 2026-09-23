use axum::response::Response;

use crate::xlsx::xlsx_response as shared_xlsx_response;

pub(in crate::marketing) fn xlsx_response(filename: &str, body: Vec<u8>) -> Response {
    shared_xlsx_response(filename, body)
}
