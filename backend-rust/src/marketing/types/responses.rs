use serde::Serialize;

use super::items::{
    CreatorLibraryFilterOptions, CreatorLibraryFollowLogItem, CreatorLibraryItem,
    CreatorLibrarySummary,
};

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryListResponse {
    pub(in crate::marketing) items: Vec<CreatorLibraryItem>,
    pub(in crate::marketing) total: i64,
    pub(in crate::marketing) page: i64,
    #[serde(rename = "pageSize")]
    pub(in crate::marketing) page_size: i64,
    pub(in crate::marketing) summary: CreatorLibrarySummary,
    #[serde(rename = "filterOptions")]
    pub(in crate::marketing) filter_options: CreatorLibraryFilterOptions,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryDetailResponse {
    pub(in crate::marketing) item: CreatorLibraryItem,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryImportResponse {
    pub(in crate::marketing) imported: usize,
    pub(in crate::marketing) failed: usize,
    pub(in crate::marketing) errors: Vec<CreatorLibraryImportError>,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryDeleteResponse {
    pub(in crate::marketing) deleted: bool,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryFollowLogListResponse {
    pub(in crate::marketing) items: Vec<CreatorLibraryFollowLogItem>,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryFollowLogDetailResponse {
    pub(in crate::marketing) item: CreatorLibraryFollowLogItem,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryFollowLogDeleteResponse {
    pub(in crate::marketing) deleted: bool,
}

#[derive(Debug, Serialize)]
pub(in crate::marketing) struct CreatorLibraryImportError {
    pub(in crate::marketing) row: usize,
    pub(in crate::marketing) message: String,
}
