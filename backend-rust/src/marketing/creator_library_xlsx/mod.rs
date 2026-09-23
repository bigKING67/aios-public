mod parser;
mod types;

pub(super) use parser::{
    parse_creator_library_xlsx, validate_creator_library_xlsx_upload_metadata,
};
pub(super) use types::CreatorLibraryXlsxParseResponse;

pub(super) const MAX_CREATOR_LIBRARY_XLSX_BYTES: usize = 5 * 1024 * 1024;
pub(super) const CREATOR_LIBRARY_XLSX_BODY_LIMIT_BYTES: usize =
    MAX_CREATOR_LIBRARY_XLSX_BYTES + 64 * 1024;

const MAX_CREATOR_LIBRARY_XLSX_COLUMNS: usize = 100;
