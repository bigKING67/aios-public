use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

use super::super::types::{CREATOR_LIBRARY_TEMPLATE_HEADERS, TEMPLATE_SHEET_NAME};

pub(super) fn write_template_sheet(workbook: &mut Workbook) -> Result<(), XlsxError> {
    let header_format = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x2F6EEA))
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    let text_format = Format::new().set_num_format("@");

    let worksheet = workbook.add_worksheet().set_name(TEMPLATE_SHEET_NAME)?;
    worksheet.set_freeze_panes(1, 0)?;
    worksheet.autofilter(
        0,
        0,
        1000,
        (CREATOR_LIBRARY_TEMPLATE_HEADERS.len() - 1) as u16,
    )?;
    worksheet.set_row_height(0, 24)?;

    let widths = [18.0, 20.0, 12.0, 14.0, 24.0, 16.0, 18.0, 18.0, 16.0];
    for (index, header) in CREATOR_LIBRARY_TEMPLATE_HEADERS.iter().enumerate() {
        let col = index as u16;
        worksheet.set_column_width(col, widths[index])?;
        worksheet.set_column_format(col, &text_format)?;
        worksheet.write_string_with_format(0, col, *header, &header_format)?;
    }

    Ok(())
}
