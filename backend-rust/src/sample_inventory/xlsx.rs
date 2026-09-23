use std::collections::HashSet;

use rust_xlsxwriter::{Format, FormatAlign, Workbook, XlsxError};
use tracing::error;

use crate::{
    error::{AppError, AppResult},
    xlsx::parse_xlsx_rows,
};

use super::types::{
    SampleInventoryImportIssue, SampleInventoryInboundImportRow, SampleInventoryInboundItem,
    SampleInventoryInboundXlsxParseResponse, SampleInventoryOutboundItem,
    SampleInventorySampleImportRow, SampleInventorySampleItem,
    SampleInventorySampleXlsxParseResponse,
};

pub(crate) const XLSX_BODY_LIMIT_BYTES: usize = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS: usize = 2_000;
const MAX_COLUMNS: usize = 12;
const SAMPLE_TEMPLATE_SHEET_NAME: &str = "新增样品";
const INBOUND_TEMPLATE_SHEET_NAME: &str = "批量入库";
const SAMPLE_EXPORT_SHEET_NAME: &str = "样品库存";
const INBOUND_EXPORT_SHEET_NAME: &str = "入库记录";
const OUTBOUND_EXPORT_SHEET_NAME: &str = "出库记录";
const OUTBOUND_EXPORT_HEADERS: [&str; 20] = [
    "申请ID",
    "样品编码",
    "样品名称",
    "数量",
    "申请人",
    "部门",
    "用途",
    "状态",
    "物流单号",
    "申请时间",
    "审批时间",
    "取样时间",
    "样品ID",
    "收货人",
    "收货地址",
    "驳回时间",
    "时间质量",
    "版本",
    "创建时间",
    "更新时间",
];
const SAMPLE_TEMPLATE_HEADERS: [&str; 6] =
    ["编码", "名称", "规格型号", "初始库存", "存放位置", "备注"];
const SAMPLE_TEMPLATE_ROWS: [[&str; 6]; 2] = [
    [
        "YP-20260720-001",
        "示例样品A",
        "A-100",
        "10",
        "A货架-1层",
        "测试样品",
    ],
    [
        "YP-20260720-002",
        "示例样品B",
        "B-200",
        "5",
        "B货架-2层",
        "",
    ],
];
const INBOUND_TEMPLATE_HEADERS: [&str; 2] = ["编码", "入库数量"];
const INBOUND_TEMPLATE_ROWS: [[&str; 2]; 2] = [["YP-20260717-001", "5"], ["YP-20260717-002", "3"]];
const PUBLISHED_SAMPLE_HEADERS: [&str; 7] = [
    "样品编码",
    "样品名称",
    "型号",
    "分类",
    "库位",
    "备注",
    "期初库存",
];
#[cfg(test)]
const PUBLISHED_INBOUND_HEADERS: [&str; 6] =
    ["样品编码", "数量", "物流单号", "备注", "操作人", "入库时间"];

fn map_xlsx_error(error_value: XlsxError, operation: &'static str) -> AppError {
    error!(error = ?error_value, operation, "sample inventory xlsx operation failed");
    AppError::Internal
}

fn build_template<const COLUMNS: usize>(
    sheet_name: &str,
    headers: &[&str; COLUMNS],
    example_rows: &[[&str; COLUMNS]],
) -> AppResult<Vec<u8>> {
    let mut workbook = Workbook::new();
    let header_format = Format::new().set_bold().set_align(FormatAlign::Center);
    let sheet = workbook.add_worksheet();
    sheet
        .set_name(sheet_name)
        .map_err(|error| map_xlsx_error(error, "set_template_sheet_name"))?;
    for (column, header) in headers.iter().enumerate() {
        sheet
            .write_with_format(0, column as u16, *header, &header_format)
            .map_err(|error| map_xlsx_error(error, "write_template_header"))?;
        sheet
            .set_column_width(column as u16, if column < 2 { 20 } else { 16 })
            .map_err(|error| map_xlsx_error(error, "set_template_column_width"))?;
    }
    sheet
        .set_freeze_panes(1, 0)
        .map_err(|error| map_xlsx_error(error, "freeze_template_header"))?;
    for (row_index, row) in example_rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            sheet
                .write_string(row_index as u32 + 1, column_index as u16, *value)
                .map_err(|error| map_xlsx_error(error, "write_template_example"))?;
        }
    }
    workbook
        .save_to_buffer()
        .map_err(|error| map_xlsx_error(error, "save_template"))
}

pub(crate) fn build_sample_template() -> AppResult<Vec<u8>> {
    build_template(
        SAMPLE_TEMPLATE_SHEET_NAME,
        &SAMPLE_TEMPLATE_HEADERS,
        &SAMPLE_TEMPLATE_ROWS,
    )
}

pub(crate) fn build_inbound_template() -> AppResult<Vec<u8>> {
    build_template(
        INBOUND_TEMPLATE_SHEET_NAME,
        &INBOUND_TEMPLATE_HEADERS,
        &INBOUND_TEMPLATE_ROWS,
    )
}

fn row_is_empty(row: &[String]) -> bool {
    row.iter().all(|cell| cell.trim().is_empty())
}

fn find_header(row: &[String], aliases: &[&str]) -> Option<usize> {
    row.iter()
        .position(|cell| aliases.iter().any(|alias| cell.trim() == *alias))
}

fn required_header(row: &[String], aliases: &[&str], display_name: &str) -> AppResult<usize> {
    find_header(row, aliases)
        .ok_or_else(|| AppError::bad_request(format!("缺少表头：{display_name}")))
}

fn cell(row: &[String], index: usize) -> String {
    row.get(index)
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

fn optional_cell(row: &[String], index: Option<usize>) -> Option<String> {
    let value = index.map(|value| cell(row, value)).unwrap_or_default();
    (!value.is_empty()).then_some(value)
}

struct SampleImportColumns {
    sample_code: usize,
    sample_name: usize,
    model: Option<usize>,
    category: Option<usize>,
    location: Option<usize>,
    remark: Option<usize>,
    initial_quantity: usize,
}

fn sample_import_columns(header: &[String]) -> AppResult<SampleImportColumns> {
    Ok(SampleImportColumns {
        sample_code: required_header(header, &["编码", "样品编码"], "编码")?,
        sample_name: required_header(header, &["名称", "样品名称"], "名称")?,
        model: find_header(header, &["规格型号", "型号"]),
        category: find_header(header, &["分类"]),
        location: find_header(header, &["存放位置", "库位"]),
        remark: find_header(header, &["备注"]),
        initial_quantity: required_header(header, &["初始库存", "期初库存"], "初始库存")?,
    })
}

struct InboundImportColumns {
    sample_code: usize,
    quantity: usize,
    tracking_number: Option<usize>,
    remark: Option<usize>,
    operator_name: Option<usize>,
    occurred_at: Option<usize>,
}

fn inbound_import_columns(header: &[String]) -> AppResult<InboundImportColumns> {
    Ok(InboundImportColumns {
        sample_code: required_header(header, &["编码", "样品编码"], "编码")?,
        quantity: required_header(header, &["入库数量", "数量"], "入库数量")?,
        tracking_number: find_header(header, &["物流单号"]),
        remark: find_header(header, &["备注"]),
        operator_name: find_header(header, &["操作人"]),
        occurred_at: find_header(header, &["入库时间"]),
    })
}

pub(crate) fn parse_sample_xlsx(bytes: &[u8]) -> AppResult<SampleInventorySampleXlsxParseResponse> {
    let raw_rows = parse_xlsx_rows(
        bytes,
        XLSX_BODY_LIMIT_BYTES,
        MAX_IMPORT_ROWS,
        MAX_COLUMNS,
        SAMPLE_TEMPLATE_SHEET_NAME,
    )?;
    let Some(header) = raw_rows.first() else {
        return Err(AppError::bad_request("XLSX 工作表为空"));
    };
    let columns = sample_import_columns(header)?;
    let mut rows = Vec::new();
    let mut issues = Vec::new();
    let mut invalid_count = 0_i64;
    let mut sample_codes = HashSet::new();
    for (index, raw) in raw_rows.iter().enumerate().skip(1) {
        if row_is_empty(raw) {
            continue;
        }
        let excel_row = index as i32 + 1;
        let sample_code = cell(raw, columns.sample_code);
        let sample_name = cell(raw, columns.sample_name);
        let quantity_text = cell(raw, columns.initial_quantity);
        let quantity = if quantity_text.is_empty() {
            Some(0)
        } else {
            quantity_text
                .parse::<i32>()
                .ok()
                .filter(|value| *value >= 0)
        };
        let mut row_valid = true;
        if sample_code.is_empty() {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "sampleCode".to_string(),
                message: "样品编码不能为空".to_string(),
            });
            row_valid = false;
        } else if !sample_codes.insert(sample_code.clone()) {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "sampleCode".to_string(),
                message: "文件内样品编码重复".to_string(),
            });
            row_valid = false;
        }
        if sample_name.is_empty() {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "sampleName".to_string(),
                message: "样品名称不能为空".to_string(),
            });
            row_valid = false;
        }
        if quantity.is_none() {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "initialQuantity".to_string(),
                message: "期初库存必须是非负整数".to_string(),
            });
            row_valid = false;
        }
        if row_valid {
            rows.push(SampleInventorySampleImportRow {
                sample_code,
                sample_name,
                model: optional_cell(raw, columns.model),
                category: optional_cell(raw, columns.category),
                location: optional_cell(raw, columns.location),
                remark: optional_cell(raw, columns.remark),
                initial_quantity: quantity.unwrap_or(0),
            });
        } else {
            invalid_count += 1;
        }
    }
    Ok(SampleInventorySampleXlsxParseResponse {
        valid_count: rows.len() as i64,
        invalid_count,
        rows,
        issues,
    })
}

pub(crate) fn parse_inbound_xlsx(
    bytes: &[u8],
) -> AppResult<SampleInventoryInboundXlsxParseResponse> {
    let raw_rows = parse_xlsx_rows(
        bytes,
        XLSX_BODY_LIMIT_BYTES,
        MAX_IMPORT_ROWS,
        MAX_COLUMNS,
        INBOUND_TEMPLATE_SHEET_NAME,
    )?;
    let Some(header) = raw_rows.first() else {
        return Err(AppError::bad_request("XLSX 工作表为空"));
    };
    let columns = inbound_import_columns(header)?;
    let mut rows = Vec::new();
    let mut issues = Vec::new();
    let mut invalid_count = 0_i64;
    for (index, raw) in raw_rows.iter().enumerate().skip(1) {
        if row_is_empty(raw) {
            continue;
        }
        let excel_row = index as i32 + 1;
        let sample_code = cell(raw, columns.sample_code);
        let quantity = cell(raw, columns.quantity)
            .parse::<i32>()
            .ok()
            .filter(|value| *value > 0);
        let occurred_at = optional_cell(raw, columns.occurred_at);
        let mut row_valid = true;
        if sample_code.is_empty() {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "sampleCode".to_string(),
                message: "样品编码不能为空".to_string(),
            });
            row_valid = false;
        }
        if quantity.is_none() {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "quantity".to_string(),
                message: "数量必须是正整数".to_string(),
            });
            row_valid = false;
        }
        if occurred_at
            .as_deref()
            .is_some_and(|value| chrono::DateTime::parse_from_rfc3339(value).is_err())
        {
            issues.push(SampleInventoryImportIssue {
                row: excel_row,
                field: "occurredAt".to_string(),
                message: "入库时间必须是带时区的ISO-8601时间".to_string(),
            });
            row_valid = false;
        }
        if row_valid {
            rows.push(SampleInventoryInboundImportRow {
                sample_code,
                quantity: quantity.unwrap_or(0),
                tracking_number: optional_cell(raw, columns.tracking_number),
                remark: optional_cell(raw, columns.remark),
                operator_name: optional_cell(raw, columns.operator_name),
                occurred_at,
            });
        } else {
            invalid_count += 1;
        }
    }
    Ok(SampleInventoryInboundXlsxParseResponse {
        valid_count: rows.len() as i64,
        invalid_count,
        rows,
        issues,
    })
}

pub(crate) fn build_sample_export(items: &[SampleInventorySampleItem]) -> AppResult<Vec<u8>> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet
        .set_name(SAMPLE_EXPORT_SHEET_NAME)
        .map_err(|error| map_xlsx_error(error, "set_sample_export_sheet"))?;
    for (column, header) in PUBLISHED_SAMPLE_HEADERS.iter().enumerate() {
        sheet
            .write_string(0, column as u16, *header)
            .map_err(|error| map_xlsx_error(error, "write_sample_export_header"))?;
    }
    for (index, item) in items.iter().enumerate() {
        let row = index as u32 + 1;
        sheet
            .write_string(row, 0, &item.sample_code)
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
        sheet
            .write_string(row, 1, &item.sample_name)
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
        sheet
            .write_string(row, 2, item.model.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
        sheet
            .write_string(row, 3, item.category.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
        sheet
            .write_string(row, 4, item.location.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
        sheet
            .write_string(row, 5, item.remark.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
        sheet
            .write_number(row, 6, item.available_quantity)
            .map_err(|error| map_xlsx_error(error, "write_sample_export"))?;
    }
    workbook
        .save_to_buffer()
        .map_err(|error| map_xlsx_error(error, "save_sample_export"))
}

pub(crate) fn build_inbound_export(items: &[SampleInventoryInboundItem]) -> AppResult<Vec<u8>> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet
        .set_name(INBOUND_EXPORT_SHEET_NAME)
        .map_err(|error| map_xlsx_error(error, "set_inbound_export_sheet"))?;
    let headers = [
        "记录ID",
        "样品编码",
        "样品名称",
        "数量",
        "物流单号",
        "操作人",
        "入库时间",
        "状态",
        "备注",
    ];
    for (column, header) in headers.iter().enumerate() {
        sheet
            .write_string(0, column as u16, *header)
            .map_err(|error| map_xlsx_error(error, "write_inbound_export_header"))?;
    }
    for (index, item) in items.iter().enumerate() {
        let row = index as u32 + 1;
        sheet
            .write_string(row, 0, item.id.to_string())
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(row, 1, &item.sample_code)
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(row, 2, &item.sample_name)
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_number(row, 3, item.quantity)
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(row, 4, item.tracking_number.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(row, 5, item.operator_name.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(row, 6, &item.occurred_at)
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(
                row,
                7,
                if item.voided_at.is_some() {
                    "已作废"
                } else {
                    "有效"
                },
            )
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
        sheet
            .write_string(row, 8, item.remark.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_inbound_export"))?;
    }
    workbook
        .save_to_buffer()
        .map_err(|error| map_xlsx_error(error, "save_inbound_export"))
}

pub(crate) fn build_outbound_export(items: &[SampleInventoryOutboundItem]) -> AppResult<Vec<u8>> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet
        .set_name(OUTBOUND_EXPORT_SHEET_NAME)
        .map_err(|error| map_xlsx_error(error, "set_outbound_export_sheet"))?;
    for (column, header) in OUTBOUND_EXPORT_HEADERS.iter().enumerate() {
        sheet
            .write_string(0, column as u16, *header)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export_header"))?;
    }
    for (index, item) in items.iter().enumerate() {
        let row = index as u32 + 1;
        sheet
            .write_string(row, 0, item.id.to_string())
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 1, &item.sample_code)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 2, &item.sample_name)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_number(row, 3, item.quantity)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 4, &item.applicant)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 5, &item.department)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 6, &item.purpose)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 7, &item.status)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 8, item.tracking_number.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 9, &item.requested_at)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(
                row,
                10,
                item.approved_at.as_deref().unwrap_or("历史时间未知"),
            )
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(
                row,
                11,
                item.sampled_at.as_deref().unwrap_or("历史时间未知"),
            )
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 12, item.sample_id.to_string())
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 13, item.receiver.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 14, item.shipping_address.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 15, item.rejected_at.as_deref().unwrap_or(""))
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 16, &item.time_quality)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 17, item.version.to_string())
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 18, &item.created_at)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
        sheet
            .write_string(row, 19, &item.updated_at)
            .map_err(|error| map_xlsx_error(error, "write_outbound_export"))?;
    }
    workbook
        .save_to_buffer()
        .map_err(|error| map_xlsx_error(error, "save_outbound_export"))
}

#[cfg(test)]
mod tests {
    use crate::xlsx::parse_xlsx_rows;

    use super::{
        build_inbound_template, build_outbound_export, build_sample_template, build_template,
        parse_inbound_xlsx, parse_sample_xlsx, SampleInventoryOutboundItem,
        OUTBOUND_EXPORT_HEADERS, OUTBOUND_EXPORT_SHEET_NAME, PUBLISHED_INBOUND_HEADERS,
        PUBLISHED_SAMPLE_HEADERS,
    };

    #[test]
    fn business_templates_round_trip_through_backend_parsers() {
        let body = build_sample_template().expect("build sample template");
        let parsed = parse_sample_xlsx(&body).expect("parse sample template");
        assert_eq!(parsed.valid_count, 2);
        assert_eq!(parsed.invalid_count, 0);
        assert_eq!(parsed.rows[0].sample_code, "YP-20260720-001");
        assert_eq!(parsed.rows[0].sample_name, "示例样品A");
        assert_eq!(parsed.rows[0].initial_quantity, 10);

        let body = build_inbound_template().expect("build inbound template");
        let parsed = parse_inbound_xlsx(&body).expect("parse inbound template");
        assert_eq!(parsed.valid_count, 2);
        assert_eq!(parsed.invalid_count, 0);
        assert_eq!(parsed.rows[0].sample_code, "YP-20260717-001");
        assert_eq!(parsed.rows[0].quantity, 5);
    }

    #[test]
    fn published_aios_headers_remain_compatible() {
        let body = build_template("样品库存", &PUBLISHED_SAMPLE_HEADERS, &[])
            .expect("build published sample template");
        let parsed = parse_sample_xlsx(&body).expect("parse published sample template");
        assert_eq!(parsed.valid_count, 0);
        assert_eq!(parsed.invalid_count, 0);

        let body = build_template("入库记录", &PUBLISHED_INBOUND_HEADERS, &[])
            .expect("build published inbound template");
        let parsed = parse_inbound_xlsx(&body).expect("parse published inbound template");
        assert_eq!(parsed.valid_count, 0);
        assert_eq!(parsed.invalid_count, 0);
    }

    #[test]
    fn outbound_export_contains_every_api_record_field() {
        let body = build_outbound_export(&[SampleInventoryOutboundItem {
            id: 101,
            sample_id: 202,
            sample_code: "850078910059".to_string(),
            sample_name: "白金精华20ml".to_string(),
            quantity: 3,
            applicant: "Ellen".to_string(),
            department: "高岚".to_string(),
            purpose: "上海四院整形外科".to_string(),
            receiver: Some("冷冰".to_string()),
            shipping_address: Some("上海市浦东新区金光小区57号102".to_string()),
            tracking_number: Some("SF1234567890".to_string()),
            status: "sampled".to_string(),
            requested_at: "2026-09-07T09:38:00+08:00".to_string(),
            approved_at: Some("2026-09-07T09:39:00+08:00".to_string()),
            sampled_at: Some("2026-09-07T09:40:00+08:00".to_string()),
            rejected_at: Some("2026-09-07T09:41:00+08:00".to_string()),
            time_quality: "known".to_string(),
            version: 4,
            created_at: "2026-09-07T09:37:00+08:00".to_string(),
            updated_at: "2026-09-07T09:41:00+08:00".to_string(),
        }])
        .expect("build outbound export");

        let rows = parse_xlsx_rows(
            &body,
            body.len(),
            1,
            OUTBOUND_EXPORT_HEADERS.len(),
            OUTBOUND_EXPORT_SHEET_NAME,
        )
        .expect("parse outbound export");
        let expected_headers = OUTBOUND_EXPORT_HEADERS
            .iter()
            .map(|header| (*header).to_string())
            .collect::<Vec<_>>();

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0], expected_headers);
        assert_eq!(
            rows[1],
            vec![
                "101",
                "850078910059",
                "白金精华20ml",
                "3",
                "Ellen",
                "高岚",
                "上海四院整形外科",
                "sampled",
                "SF1234567890",
                "2026-09-07T09:38:00+08:00",
                "2026-09-07T09:39:00+08:00",
                "2026-09-07T09:40:00+08:00",
                "202",
                "冷冰",
                "上海市浦东新区金光小区57号102",
                "2026-09-07T09:41:00+08:00",
                "known",
                "4",
                "2026-09-07T09:37:00+08:00",
                "2026-09-07T09:41:00+08:00",
            ]
        );
    }

    #[test]
    fn malformed_workbook_is_rejected() {
        assert!(parse_sample_xlsx(b"not-xlsx").is_err());
    }
}
