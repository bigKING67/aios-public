mod constants;
mod help_sheet;
mod response;
mod template_sheet;

use rust_xlsxwriter::{Workbook, XlsxError};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::types::CreatorLibraryFilterOptions;
use help_sheet::write_help_sheet;
pub(super) use response::xlsx_response;
use template_sheet::write_template_sheet;

pub(super) fn build_creator_library_template_xlsx(
    filter_options: &CreatorLibraryFilterOptions,
) -> AppResult<Vec<u8>> {
    let mut workbook = Workbook::new();

    write_template_sheet(&mut workbook).map_err(map_xlsx_error)?;
    write_help_sheet(&mut workbook, filter_options).map_err(map_xlsx_error)?;

    workbook.save_to_buffer().map_err(map_xlsx_error)
}

fn map_xlsx_error(error: XlsxError) -> AppError {
    error!(?error, "build creator library template xlsx failed");
    AppError::Internal
}
