use serde::Serialize;

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryXlsxParseResponse {
    pub(in crate::marketing) rows: Vec<Vec<String>>,
}
