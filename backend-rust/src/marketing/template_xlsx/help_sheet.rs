use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

use super::super::types::{CreatorLibraryFilterOptions, TEMPLATE_HELP_SHEET_NAME};
use super::constants::{FIELD_GUIDE_ROWS, LEVEL_GUIDE_HEADERS, LEVEL_GUIDE_ROWS};

pub(super) fn write_help_sheet(
    workbook: &mut Workbook,
    filter_options: &CreatorLibraryFilterOptions,
) -> Result<(), XlsxError> {
    let title_format = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0x1A1A1A))
        .set_background_color(Color::RGB(0xF2F6FF))
        .set_border(FormatBorder::Thin);
    let header_format = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x2F6EEA))
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    let wrap_format = Format::new()
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::VerticalCenter);

    let worksheet = workbook
        .add_worksheet()
        .set_name(TEMPLATE_HELP_SHEET_NAME)?;
    worksheet.set_freeze_panes(1, 0)?;
    worksheet.set_column_width(0, 12)?;
    worksheet.set_column_width(1, 18)?;
    worksheet.set_column_width(2, 18)?;
    worksheet.set_column_width(3, 54)?;
    worksheet.set_column_width(4, 66)?;

    let mut row = 0u32;
    worksheet.write_string_with_format(row, 0, "达人库导入模板填写说明", &title_format)?;
    row += 2;

    for (field, guide) in FIELD_GUIDE_ROWS {
        worksheet.write_string_with_format(row, 0, field, &header_format)?;
        worksheet.write_string_with_format(row, 1, guide, &wrap_format)?;
        row += 1;
    }

    row += 1;
    worksheet.write_string_with_format(row, 0, "主播类型等级策略表", &title_format)?;
    row += 1;
    write_row(worksheet, row, &LEVEL_GUIDE_HEADERS, &header_format)?;
    row += 1;
    for guide_row in LEVEL_GUIDE_ROWS {
        write_row(worksheet, row, &guide_row, &wrap_format)?;
        worksheet.set_row_height(row, 42)?;
        row += 1;
    }

    row += 1;
    worksheet.write_string_with_format(row, 0, "主播标签参考值", &title_format)?;
    row += 1;
    worksheet.write_string_with_format(row, 0, "当前系统参考值", &header_format)?;
    let anchor_tag_text = build_reference_text(&filter_options.anchor_tags);
    worksheet.write_string_with_format(row, 1, anchor_tag_text.as_str(), &wrap_format)?;
    row += 2;

    worksheet.write_string_with_format(row, 0, "归属BD参考值", &title_format)?;
    row += 1;
    worksheet.write_string_with_format(row, 0, "姓名/别名", &header_format)?;
    worksheet.write_string_with_format(row, 1, "账号", &header_format)?;
    for bd_user in &filter_options.bd_users {
        let alias = if bd_user.aliases.is_empty() {
            bd_user.display_name.clone()
        } else {
            bd_user.aliases.join("、")
        };
        row += 1;
        worksheet.write_string_with_format(row, 0, alias.as_str(), &wrap_format)?;
        worksheet.write_string_with_format(row, 1, bd_user.username.as_str(), &wrap_format)?;
    }

    Ok(())
}

fn write_row(
    worksheet: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    values: &[&str],
    format: &Format,
) -> Result<(), XlsxError> {
    for (index, value) in values.iter().enumerate() {
        worksheet.write_string_with_format(row, index as u16, *value, format)?;
    }
    Ok(())
}

fn build_reference_text(values: &[String]) -> String {
    if values.is_empty() {
        return "暂无参考值；可按实际主播垂类填写。".to_string();
    }
    values.join("、")
}
