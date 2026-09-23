use std::collections::HashSet;

use chrono::{DateTime, Utc};

use crate::error::{AppError, AppResult};

use super::types::{
    BatchEditSampleInventoryOutboundItem, BatchUpdateSampleInventoryOutboundTrackingItem,
    CreateSampleInventoryInboundItem, CreateSampleInventoryInboundRequest,
    CreateSampleInventoryOutboundItem, CreateSampleInventoryOutboundRequest,
    CreateSampleInventorySampleRequest, InboundListQuery, NormalizedInboundListQuery,
    NormalizedOutboundListQuery, NormalizedSampleListQuery, OutboundListQuery,
    SampleInventoryInboundImportRow, SampleInventorySampleImportRow, SampleInventoryVersionTarget,
    SampleListQuery, UpdateSampleInventoryOutboundRequest, UpdateSampleInventorySampleRequest,
};

const MAX_PAGE_SIZE: i64 = 100;
const MAX_BATCH_SIZE: usize = 100;
const MAX_IMPORT_ROWS: usize = 2_000;
const VALID_OUTBOUND_STATUSES: [&str; 4] = ["pending", "approved", "sampled", "rejected"];
const VALID_STOCK_STATUSES: [&str; 3] = ["in_stock", "low", "out"];
const VALID_PRODUCT_KINDS: [&str; 2] = ["primary", "gift"];
const SAMPLE_SORT_FIELDS: [&str; 4] =
    ["sampleCode", "sampleName", "availableQuantity", "updatedAt"];
const INBOUND_SORT_FIELDS: [&str; 4] = ["occurredAt", "sampleCode", "quantity", "trackingNumber"];
const OUTBOUND_SORT_FIELDS: [&str; 6] = [
    "requestedAt",
    "sampleCode",
    "applicant",
    "department",
    "status",
    "trackingNumber",
];
type NormalizedDateBounds = (Option<DateTime<Utc>>, Option<DateTime<Utc>>);

fn required_text(value: String, field: &str, max_chars: usize) -> AppResult<String> {
    let normalized = value.trim().to_string();
    let length = normalized.chars().count();
    if length == 0 {
        return Err(AppError::bad_request(format!("{field}不能为空")));
    }
    if length > max_chars {
        return Err(AppError::bad_request(format!(
            "{field}不能超过{max_chars}个字符"
        )));
    }
    Ok(normalized)
}

fn optional_text(
    value: Option<String>,
    field: &str,
    max_chars: usize,
) -> AppResult<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let normalized = value.trim().to_string();
    if normalized.is_empty() {
        return Ok(None);
    }
    required_text(normalized, field, max_chars).map(Some)
}

fn pagination(page: Option<i64>, page_size: Option<i64>) -> AppResult<(i64, i64)> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(20);
    if page < 1 || !(1..=MAX_PAGE_SIZE).contains(&page_size) {
        return Err(AppError::bad_request("分页参数超出允许范围"));
    }
    Ok((page, page_size))
}

fn normalize_sort(
    sort_by: Option<String>,
    sort_order: Option<String>,
    allowed_fields: &[&str],
    default_field: &str,
) -> AppResult<(String, String)> {
    let sort_by = sort_by
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_field.to_string());
    if !allowed_fields.contains(&sort_by.as_str()) {
        return Err(AppError::bad_request("sortBy不受支持"));
    }
    let sort_order = sort_order
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "desc".to_string());
    if !matches!(sort_order.as_str(), "asc" | "desc") {
        return Err(AppError::bad_request("sortOrder必须是asc或desc"));
    }
    Ok((sort_by, sort_order))
}

fn normalize_date_bounds(
    date_from: Option<String>,
    date_to: Option<String>,
) -> AppResult<NormalizedDateBounds> {
    let date_from = date_from
        .as_deref()
        .map(|value| parse_timestamp(value, "dateFrom"))
        .transpose()?;
    let date_to = date_to
        .as_deref()
        .map(|value| parse_timestamp(value, "dateTo"))
        .transpose()?;
    if matches!(
        (date_from.as_ref(), date_to.as_ref()),
        (Some(from), Some(to)) if from > to
    ) {
        return Err(AppError::bad_request("dateFrom不能晚于dateTo"));
    }
    Ok((date_from, date_to))
}

pub(crate) fn normalize_sample_query(
    query: SampleListQuery,
) -> AppResult<NormalizedSampleListQuery> {
    let (page, page_size) = pagination(query.page, query.page_size)?;
    let (date_from, date_to) = normalize_date_bounds(query.date_from, query.date_to)?;
    let (sort_by, sort_order) = normalize_sort(
        query.sort_by,
        query.sort_order,
        &SAMPLE_SORT_FIELDS,
        "updatedAt",
    )?;
    let stock_status = optional_text(query.stock_status, "库存状态", 32)?;
    if stock_status
        .as_deref()
        .is_some_and(|value| !VALID_STOCK_STATUSES.contains(&value))
    {
        return Err(AppError::bad_request("stockStatus不受支持"));
    }
    let product_kind = optional_text(query.product_kind, "产品类型", 32)?;
    if product_kind
        .as_deref()
        .is_some_and(|value| !VALID_PRODUCT_KINDS.contains(&value))
    {
        return Err(AppError::bad_request("productKind不受支持"));
    }
    Ok(NormalizedSampleListQuery {
        keyword: optional_text(query.keyword, "搜索关键词", 120)?,
        include_archived: query.include_archived.unwrap_or(false),
        stock_status,
        product_kind,
        page,
        page_size,
        date_from,
        date_to,
        sort_by,
        sort_order,
    })
}

pub(crate) fn normalize_inbound_query(
    query: InboundListQuery,
) -> AppResult<NormalizedInboundListQuery> {
    let (page, page_size) = pagination(query.page, query.page_size)?;
    let (date_from, date_to) = normalize_date_bounds(query.date_from, query.date_to)?;
    let (sort_by, sort_order) = normalize_sort(
        query.sort_by,
        query.sort_order,
        &INBOUND_SORT_FIELDS,
        "occurredAt",
    )?;
    if query.sample_id.is_some_and(|id| id <= 0) {
        return Err(AppError::bad_request("sample_id无效"));
    }
    Ok(NormalizedInboundListQuery {
        keyword: optional_text(query.keyword, "搜索关键词", 120)?,
        sample_id: query.sample_id,
        include_voided: query.include_voided.unwrap_or(false),
        page,
        page_size,
        date_from,
        date_to,
        sort_by,
        sort_order,
    })
}

pub(crate) fn normalize_outbound_query(
    query: OutboundListQuery,
) -> AppResult<NormalizedOutboundListQuery> {
    let (page, page_size) = pagination(query.page, query.page_size)?;
    let (date_from, date_to) = normalize_date_bounds(query.date_from, query.date_to)?;
    let (sort_by, sort_order) = normalize_sort(
        query.sort_by,
        query.sort_order,
        &OUTBOUND_SORT_FIELDS,
        "requestedAt",
    )?;
    if query.sample_id.is_some_and(|id| id <= 0) {
        return Err(AppError::bad_request("sample_id无效"));
    }
    let status = optional_text(query.status, "状态", 32)?
        .map(|value| normalize_status(&value))
        .transpose()?;
    Ok(NormalizedOutboundListQuery {
        keyword: optional_text(query.keyword, "搜索关键词", 120)?,
        status,
        sample_id: query.sample_id,
        page,
        page_size,
        date_from,
        date_to,
        sort_by,
        sort_order,
    })
}

pub(crate) fn normalize_sample_create(
    mut input: CreateSampleInventorySampleRequest,
) -> AppResult<CreateSampleInventorySampleRequest> {
    input.sample_code = required_text(input.sample_code, "样品编码", 120)?;
    input.sample_name = required_text(input.sample_name, "样品名称", 200)?;
    input.model = optional_text(input.model, "型号", 200)?;
    input.category = optional_text(input.category, "分类", 120)?;
    input.location = optional_text(input.location, "库位", 200)?;
    input.remark = optional_text(input.remark, "备注", 2_000)?;
    let initial_quantity = input.initial_quantity.unwrap_or(0);
    let reserved_quantity = input.reserved_quantity.unwrap_or(0);
    if initial_quantity < 0 {
        return Err(AppError::bad_request("期初库存不能为负数"));
    }
    if reserved_quantity < 0 {
        return Err(AppError::bad_request("预留数量不能为负数"));
    }
    if reserved_quantity > initial_quantity {
        return Err(AppError::bad_request("预留数量不能超过期初库存"));
    }
    input.reserved_quantity = Some(reserved_quantity);
    Ok(input)
}

pub(crate) fn normalize_sample_update(
    mut input: UpdateSampleInventorySampleRequest,
) -> AppResult<UpdateSampleInventorySampleRequest> {
    if input.expected_version <= 0 {
        return Err(AppError::bad_request("expectedVersion无效"));
    }
    input.sample_code = required_text(input.sample_code, "样品编码", 120)?;
    input.sample_name = required_text(input.sample_name, "样品名称", 200)?;
    input.model = optional_text(input.model, "型号", 200)?;
    input.category = optional_text(input.category, "分类", 120)?;
    input.location = optional_text(input.location, "库位", 200)?;
    input.remark = optional_text(input.remark, "备注", 2_000)?;
    if input.reserved_quantity.is_some_and(|quantity| quantity < 0) {
        return Err(AppError::bad_request("预留数量不能为负数"));
    }
    Ok(input)
}

pub(crate) fn normalize_inbound_create(
    mut input: CreateSampleInventoryInboundRequest,
) -> AppResult<CreateSampleInventoryInboundRequest> {
    let item = normalize_inbound_item(CreateSampleInventoryInboundItem {
        sample_id: input.sample_id,
        quantity: input.quantity,
        tracking_number: input.tracking_number,
        remark: input.remark,
        operator_name: input.operator_name,
        occurred_at: input.occurred_at,
    })?;
    input.sample_id = item.sample_id;
    input.quantity = item.quantity;
    input.tracking_number = item.tracking_number;
    input.remark = item.remark;
    input.operator_name = item.operator_name;
    input.occurred_at = item.occurred_at;
    Ok(input)
}

pub(crate) fn normalize_inbound_item(
    mut input: CreateSampleInventoryInboundItem,
) -> AppResult<CreateSampleInventoryInboundItem> {
    if input.sample_id <= 0 || input.quantity <= 0 {
        return Err(AppError::bad_request("样品和入库数量必须有效"));
    }
    input.tracking_number = optional_text(input.tracking_number, "物流单号", 200)?;
    input.remark = optional_text(input.remark, "备注", 2_000)?;
    input.operator_name = optional_text(input.operator_name, "操作人", 120)?;
    if let Some(value) = input.occurred_at.as_ref() {
        parse_timestamp(value, "入库时间")?;
    }
    Ok(input)
}

pub(crate) fn normalize_outbound_create(
    mut input: CreateSampleInventoryOutboundRequest,
) -> AppResult<CreateSampleInventoryOutboundRequest> {
    let item = normalize_outbound_item(CreateSampleInventoryOutboundItem {
        sample_id: input.sample_id,
        quantity: input.quantity,
        applicant: input.applicant,
        department: input.department,
        purpose: input.purpose,
        receiver: input.receiver,
        shipping_address: input.shipping_address,
        tracking_number: input.tracking_number,
        requested_at: input.requested_at,
    })?;
    input.sample_id = item.sample_id;
    input.quantity = item.quantity;
    input.applicant = item.applicant;
    input.department = item.department;
    input.purpose = item.purpose;
    input.receiver = item.receiver;
    input.shipping_address = item.shipping_address;
    input.tracking_number = item.tracking_number;
    input.requested_at = item.requested_at;
    Ok(input)
}

pub(crate) fn normalize_outbound_item(
    mut input: CreateSampleInventoryOutboundItem,
) -> AppResult<CreateSampleInventoryOutboundItem> {
    if input.sample_id <= 0 || input.quantity <= 0 {
        return Err(AppError::bad_request("样品和领用数量必须有效"));
    }
    input.applicant = required_text(input.applicant, "申请人", 120)?;
    input.department = required_text(input.department, "部门", 120)?;
    input.purpose = required_text(input.purpose, "用途", 1_000)?;
    input.receiver = required_text(input.receiver, "收货人", 120)?;
    input.shipping_address = required_text(input.shipping_address, "收货地址", 1_000)?;
    input.tracking_number = optional_text(input.tracking_number, "物流单号", 200)?;
    if let Some(value) = input.requested_at.as_ref() {
        parse_timestamp(value, "申请时间")?;
    }
    Ok(input)
}

pub(crate) fn normalize_outbound_update(
    mut input: UpdateSampleInventoryOutboundRequest,
) -> AppResult<UpdateSampleInventoryOutboundRequest> {
    if input.expected_version <= 0 || input.sample_id <= 0 || input.quantity <= 0 {
        return Err(AppError::bad_request("版本、样品或领用数量无效"));
    }
    input.applicant = required_text(input.applicant, "申请人", 120)?;
    input.department = required_text(input.department, "部门", 120)?;
    input.purpose = required_text(input.purpose, "用途", 1_000)?;
    input.receiver = required_text(input.receiver, "收货人", 120)?;
    input.shipping_address = required_text(input.shipping_address, "收货地址", 1_000)?;
    input.tracking_number = optional_text(input.tracking_number, "物流单号", 200)?;
    Ok(input)
}

pub(crate) fn normalize_status(value: &str) -> AppResult<String> {
    let normalized = value.trim().to_ascii_lowercase();
    if VALID_OUTBOUND_STATUSES.contains(&normalized.as_str()) {
        return Ok(normalized);
    }
    Err(AppError::bad_request("不支持的出库状态"))
}

pub(crate) fn transition_deltas(from: &str, to: &str, quantity: i32) -> AppResult<(i32, i32)> {
    if quantity <= 0 {
        return Err(AppError::bad_request("领用数量无效"));
    }
    let deltas = match (from, to) {
        ("pending", "approved") => (-quantity, 0),
        ("pending", "rejected") | ("rejected", "pending") => (0, 0),
        ("approved", "sampled") | ("sampled", "approved") => (0, 0),
        ("approved", "pending") | ("approved", "rejected") => (quantity, 0),
        ("sampled", "pending") | ("sampled", "rejected") => (quantity, 0),
        _ => return Err(AppError::bad_request("不允许的出库状态转换")),
    };
    Ok(deltas)
}

pub(crate) fn parse_timestamp(value: &str, field: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value.trim())
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| AppError::bad_request(format!("{field}必须是带时区的ISO-8601时间")))
}

pub(crate) fn validate_version_targets(items: &[SampleInventoryVersionTarget]) -> AppResult<()> {
    if items.is_empty() || items.len() > MAX_BATCH_SIZE {
        return Err(AppError::bad_request("批量操作数量必须在1到100之间"));
    }
    let mut ids = HashSet::with_capacity(items.len());
    for item in items {
        if item.id <= 0 || item.expected_version <= 0 || !ids.insert(item.id) {
            return Err(AppError::bad_request("批量操作包含无效或重复记录"));
        }
    }
    Ok(())
}

pub(crate) fn validate_batch_edits(
    items: &mut [BatchEditSampleInventoryOutboundItem],
) -> AppResult<()> {
    if items.is_empty() || items.len() > MAX_BATCH_SIZE {
        return Err(AppError::bad_request("批量编辑数量必须在1到100之间"));
    }
    let mut ids = HashSet::with_capacity(items.len());
    for item in items {
        if item.id <= 0 || item.expected_version <= 0 || !ids.insert(item.id) {
            return Err(AppError::bad_request("批量编辑包含无效或重复记录"));
        }
        item.applicant = optional_text(item.applicant.take(), "申请人", 120)?;
        item.department = optional_text(item.department.take(), "部门", 120)?;
        item.purpose = optional_text(item.purpose.take(), "用途", 1_000)?;
        item.receiver = optional_text(item.receiver.take(), "收件人", 120)?;
        item.shipping_address = optional_text(item.shipping_address.take(), "收件地址", 1_000)?;
        item.tracking_number = optional_text(item.tracking_number.take(), "物流单号", 200)?;
        if item.applicant.is_none()
            && item.department.is_none()
            && item.purpose.is_none()
            && item.receiver.is_none()
            && item.shipping_address.is_none()
            && item.tracking_number.is_none()
        {
            return Err(AppError::bad_request("批量编辑至少需要一个变更字段"));
        }
    }
    Ok(())
}

pub(crate) fn normalize_tracking_number(value: Option<String>) -> AppResult<Option<String>> {
    optional_text(value, "物流单号", 200)
}

pub(crate) fn validate_batch_tracking_updates(
    items: &mut [BatchUpdateSampleInventoryOutboundTrackingItem],
) -> AppResult<()> {
    if items.is_empty() || items.len() > MAX_BATCH_SIZE {
        return Err(AppError::bad_request("批量物流更新数量必须在1到100之间"));
    }
    let mut ids = HashSet::with_capacity(items.len());
    for item in items {
        if item.id <= 0 || item.expected_version <= 0 || !ids.insert(item.id) {
            return Err(AppError::bad_request("批量物流更新包含无效或重复记录"));
        }
        item.tracking_number = normalize_tracking_number(item.tracking_number.take())?;
    }
    Ok(())
}

pub(crate) fn validate_sample_import_rows(
    rows: Vec<SampleInventorySampleImportRow>,
) -> AppResult<Vec<SampleInventorySampleImportRow>> {
    if rows.is_empty() || rows.len() > MAX_IMPORT_ROWS {
        return Err(AppError::bad_request("导入行数必须在1到2000之间"));
    }
    rows.into_iter()
        .map(|mut row| {
            row.sample_code = required_text(row.sample_code, "样品编码", 120)?;
            row.sample_name = required_text(row.sample_name, "样品名称", 200)?;
            row.model = optional_text(row.model, "型号", 200)?;
            row.category = optional_text(row.category, "分类", 120)?;
            row.location = optional_text(row.location, "库位", 200)?;
            row.remark = optional_text(row.remark, "备注", 2_000)?;
            if row.initial_quantity < 0 {
                return Err(AppError::bad_request("期初库存不能为负数"));
            }
            Ok(row)
        })
        .collect()
}

pub(crate) fn validate_inbound_import_rows(
    rows: Vec<SampleInventoryInboundImportRow>,
) -> AppResult<Vec<SampleInventoryInboundImportRow>> {
    if rows.is_empty() || rows.len() > MAX_IMPORT_ROWS {
        return Err(AppError::bad_request("导入行数必须在1到2000之间"));
    }
    rows.into_iter()
        .map(|mut row| {
            row.sample_code = required_text(row.sample_code, "样品编码", 120)?;
            if row.quantity <= 0 {
                return Err(AppError::bad_request("入库数量必须大于0"));
            }
            row.tracking_number = optional_text(row.tracking_number, "物流单号", 200)?;
            row.remark = optional_text(row.remark, "备注", 2_000)?;
            row.operator_name = optional_text(row.operator_name, "操作人", 120)?;
            if let Some(value) = row.occurred_at.as_deref() {
                parse_timestamp(value, "入库时间")?;
            }
            Ok(row)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_outbound_item, normalize_outbound_update, normalize_sample_create,
        normalize_sample_query, normalize_sample_update, normalize_status, transition_deltas,
        validate_batch_edits,
    };
    use crate::sample_inventory::types::{
        BatchEditSampleInventoryOutboundItem, CreateSampleInventoryOutboundItem,
        CreateSampleInventorySampleRequest, SampleListQuery, UpdateSampleInventoryOutboundRequest,
        UpdateSampleInventorySampleRequest,
    };

    #[test]
    fn outbound_transition_deltas_preserve_stock_equations() {
        assert_eq!(
            transition_deltas("pending", "approved", 3).unwrap(),
            (-3, 0)
        );
        assert_eq!(transition_deltas("approved", "sampled", 3).unwrap(), (0, 0));
        assert_eq!(transition_deltas("approved", "pending", 3).unwrap(), (3, 0));
        assert_eq!(
            transition_deltas("approved", "rejected", 3).unwrap(),
            (3, 0)
        );
        assert_eq!(transition_deltas("sampled", "approved", 3).unwrap(), (0, 0));
        assert_eq!(transition_deltas("sampled", "pending", 3).unwrap(), (3, 0));
        assert_eq!(transition_deltas("sampled", "rejected", 3).unwrap(), (3, 0));
        assert_eq!(transition_deltas("pending", "rejected", 3).unwrap(), (0, 0));
        assert_eq!(transition_deltas("rejected", "pending", 3).unwrap(), (0, 0));
    }

    #[test]
    fn rejects_unsupported_transition_and_status() {
        assert!(transition_deltas("pending", "sampled", 1).is_err());
        assert!(transition_deltas("approved", "approved", 1).is_err());
        assert!(normalize_status("cancelled").is_err());
    }

    #[test]
    fn manual_reservation_validation_uses_stock_bounds_and_update_omission() {
        let create = |reserved_quantity| CreateSampleInventorySampleRequest {
            submission_key: "fixture-create".to_string(),
            sample_code: "S-1".to_string(),
            sample_name: "Fixture".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(10),
            reserved_quantity,
        };
        assert_eq!(
            normalize_sample_create(create(None))
                .unwrap()
                .reserved_quantity,
            Some(0)
        );
        assert!(normalize_sample_create(create(Some(-1))).is_err());
        assert!(normalize_sample_create(create(Some(11))).is_err());

        let update = |reserved_quantity| UpdateSampleInventorySampleRequest {
            submission_key: "fixture-update".to_string(),
            expected_version: 1,
            sample_code: "S-1".to_string(),
            sample_name: "Fixture".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            reserved_quantity,
        };
        assert!(normalize_sample_update(update(None))
            .unwrap()
            .reserved_quantity
            .is_none());
        assert!(normalize_sample_update(update(Some(-1))).is_err());
    }

    #[test]
    fn batch_edit_normalizes_all_legacy_ui_fields() {
        let mut items = vec![BatchEditSampleInventoryOutboundItem {
            id: 7,
            expected_version: 2,
            applicant: Some("  申领人  ".to_string()),
            department: Some("  运营部  ".to_string()),
            purpose: Some("  展示  ".to_string()),
            receiver: Some("  收货人  ".to_string()),
            shipping_address: Some("  杭州市  ".to_string()),
            tracking_number: None,
        }];

        validate_batch_edits(&mut items).unwrap();

        assert_eq!(items[0].applicant.as_deref(), Some("申领人"));
        assert_eq!(items[0].receiver.as_deref(), Some("收货人"));
        assert_eq!(items[0].shipping_address.as_deref(), Some("杭州市"));
    }

    #[test]
    fn sample_query_accepts_only_documented_product_kinds() {
        let gift = normalize_sample_query(SampleListQuery {
            product_kind: Some(" gift ".to_string()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(gift.product_kind.as_deref(), Some("gift"));

        assert!(normalize_sample_query(SampleListQuery {
            product_kind: Some("bundle".to_string()),
            ..Default::default()
        })
        .is_err());
    }

    #[test]
    fn outbound_create_and_full_update_require_trimmed_shipping_fields() {
        let normalized = normalize_outbound_item(CreateSampleInventoryOutboundItem {
            sample_id: 7,
            quantity: 2,
            applicant: "  申请人  ".to_string(),
            department: "  运营部  ".to_string(),
            purpose: "  展示  ".to_string(),
            receiver: "  收货人  ".to_string(),
            shipping_address: "  杭州市  ".to_string(),
            tracking_number: None,
            requested_at: None,
        })
        .unwrap();
        assert_eq!(normalized.receiver, "收货人");
        assert_eq!(normalized.shipping_address, "杭州市");

        assert!(normalize_outbound_item(CreateSampleInventoryOutboundItem {
            receiver: "   ".to_string(),
            ..normalized.clone()
        })
        .is_err());

        assert!(
            normalize_outbound_update(UpdateSampleInventoryOutboundRequest {
                submission_key: "fixture-update".to_string(),
                expected_version: 1,
                sample_id: normalized.sample_id,
                quantity: normalized.quantity,
                applicant: normalized.applicant,
                department: normalized.department,
                purpose: normalized.purpose,
                receiver: normalized.receiver,
                shipping_address: "\t".to_string(),
                tracking_number: None,
            })
            .is_err()
        );
    }
}
