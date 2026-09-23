use sqlx::{PgPool, Postgres, Row, Transaction};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::types::{
    NormalizedInboundListQuery, NormalizedOutboundListQuery, NormalizedSampleListQuery,
    SampleInventoryInboundItem, SampleInventoryInboundListResponse, SampleInventoryOutboundItem,
    SampleInventoryOutboundListResponse, SampleInventorySampleItem,
    SampleInventorySampleListResponse, SampleInventorySettingsResponse, SampleInventorySummary,
};

const SAMPLE_COLUMNS: &str = r#"
  sample.id,
  sample.sample_code,
  sample.sample_name,
  sample.model,
  sample.category,
  CASE
    WHEN sample_classification.is_primary THEN 'primary'
    ELSE 'gift'
  END AS product_kind,
  sample.location,
  sample.remark,
  sample.on_hand_quantity,
  sample.reserved_quantity,
  sample.available_quantity,
  sample_classification.is_primary
    AND sample.available_quantity > 0
    AND sample.available_quantity <= settings.low_stock_threshold AS is_low_stock,
  sample.version,
  sample.created_at::TEXT AS created_at,
  sample.updated_at::TEXT AS updated_at,
  sample.archived_at::TEXT AS archived_at
"#;

// The legacy source has no explicit product kind. These catalog items are primary
// despite a blank model.
const SAMPLE_CLASSIFICATION_JOIN: &str = r#"
  CROSS JOIN LATERAL (
    SELECT (
      NULLIF(BTRIM(sample.model), '') IS NOT NULL
      OR LOWER(BTRIM(sample.sample_code)) IN ('lihe', 'lihe2')
    ) AS is_primary
  ) AS sample_classification
"#;

const INBOUND_COLUMNS: &str = r#"
  inbound.id,
  inbound.sample_id,
  sample.sample_code,
  sample.sample_name,
  inbound.quantity,
  inbound.tracking_number,
  inbound.remark,
  inbound.operator_name,
  inbound.occurred_at::TEXT AS occurred_at,
  inbound.time_quality,
  inbound.version,
  inbound.created_at::TEXT AS created_at,
  inbound.voided_at::TEXT AS voided_at,
  inbound.void_reason
"#;

const OUTBOUND_COLUMNS: &str = r#"
  outbound.id,
  outbound.sample_id,
  sample.sample_code,
  sample.sample_name,
  outbound.quantity,
  outbound.applicant,
  outbound.department,
  outbound.purpose,
  outbound.receiver,
  outbound.shipping_address,
  outbound.tracking_number,
  outbound.status,
  outbound.requested_at::TEXT AS requested_at,
  outbound.approved_at::TEXT AS approved_at,
  outbound.sampled_at::TEXT AS sampled_at,
  outbound.rejected_at::TEXT AS rejected_at,
  outbound.time_quality,
  outbound.version,
  outbound.created_at::TEXT AS created_at,
  outbound.updated_at::TEXT AS updated_at
"#;

fn map_database_error(error_value: sqlx::Error, operation: &'static str) -> AppError {
    error!(error = ?error_value, operation, "sample inventory database operation failed");
    AppError::Internal
}

pub(crate) fn is_unique_violation(error_value: &sqlx::Error) -> bool {
    error_value
        .as_database_error()
        .and_then(|error| error.code())
        .is_some_and(|code| code == "23505")
}

fn sample_from_row(row: &sqlx::postgres::PgRow) -> Result<SampleInventorySampleItem, sqlx::Error> {
    Ok(SampleInventorySampleItem {
        id: row.try_get("id")?,
        sample_code: row.try_get("sample_code")?,
        sample_name: row.try_get("sample_name")?,
        model: row.try_get("model")?,
        category: row.try_get("category")?,
        product_kind: row.try_get("product_kind")?,
        location: row.try_get("location")?,
        remark: row.try_get("remark")?,
        on_hand_quantity: row.try_get("on_hand_quantity")?,
        reserved_quantity: row.try_get("reserved_quantity")?,
        available_quantity: row.try_get("available_quantity")?,
        is_low_stock: row.try_get("is_low_stock")?,
        version: row.try_get("version")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        archived_at: row.try_get("archived_at")?,
    })
}

fn inbound_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<SampleInventoryInboundItem, sqlx::Error> {
    Ok(SampleInventoryInboundItem {
        id: row.try_get("id")?,
        sample_id: row.try_get("sample_id")?,
        sample_code: row.try_get("sample_code")?,
        sample_name: row.try_get("sample_name")?,
        quantity: row.try_get("quantity")?,
        tracking_number: row.try_get("tracking_number")?,
        remark: row.try_get("remark")?,
        operator_name: row.try_get("operator_name")?,
        occurred_at: row.try_get("occurred_at")?,
        time_quality: row.try_get("time_quality")?,
        version: row.try_get("version")?,
        created_at: row.try_get("created_at")?,
        voided_at: row.try_get("voided_at")?,
        void_reason: row.try_get("void_reason")?,
    })
}

fn outbound_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<SampleInventoryOutboundItem, sqlx::Error> {
    Ok(SampleInventoryOutboundItem {
        id: row.try_get("id")?,
        sample_id: row.try_get("sample_id")?,
        sample_code: row.try_get("sample_code")?,
        sample_name: row.try_get("sample_name")?,
        quantity: row.try_get("quantity")?,
        applicant: row.try_get("applicant")?,
        department: row.try_get("department")?,
        purpose: row.try_get("purpose")?,
        receiver: row.try_get("receiver")?,
        shipping_address: row.try_get("shipping_address")?,
        tracking_number: row.try_get("tracking_number")?,
        status: row.try_get("status")?,
        requested_at: row.try_get("requested_at")?,
        approved_at: row.try_get("approved_at")?,
        sampled_at: row.try_get("sampled_at")?,
        rejected_at: row.try_get("rejected_at")?,
        time_quality: row.try_get("time_quality")?,
        version: row.try_get("version")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(crate) async fn get_settings(pool: &PgPool) -> AppResult<SampleInventorySettingsResponse> {
    let row = sqlx::query(
        r#"
        SELECT
          low_stock_threshold,
          refresh_interval_seconds,
          version,
          updated_at::TEXT AS updated_at
        FROM sample_inventory.settings
        WHERE id = 1
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| map_database_error(error, "get_settings"))?;

    Ok(SampleInventorySettingsResponse {
        low_stock_threshold: row
            .try_get("low_stock_threshold")
            .map_err(|error| map_database_error(error, "map_settings"))?,
        refresh_interval_seconds: row
            .try_get("refresh_interval_seconds")
            .map_err(|error| map_database_error(error, "map_settings"))?,
        version: row
            .try_get("version")
            .map_err(|error| map_database_error(error, "map_settings"))?,
        updated_at: row
            .try_get("updated_at")
            .map_err(|error| map_database_error(error, "map_settings"))?,
    })
}

pub(crate) async fn list_samples(
    pool: &PgPool,
    query: &NormalizedSampleListQuery,
) -> AppResult<SampleInventorySampleListResponse> {
    let offset = (query.page - 1) * query.page_size;
    let sort_column = match query.sort_by.as_str() {
        "sampleCode" => "sample.sample_code",
        "sampleName" => "sample.sample_name",
        "availableQuantity" => "sample.available_quantity",
        _ => "sample.updated_at",
    };
    let sort_order = if query.sort_order == "asc" {
        "ASC"
    } else {
        "DESC"
    };
    let sql = format!(
        r#"
        SELECT {SAMPLE_COLUMNS}
        FROM sample_inventory.samples AS sample
        CROSS JOIN sample_inventory.settings AS settings
        {SAMPLE_CLASSIFICATION_JOIN}
        WHERE ($1::TEXT IS NULL
          OR sample.sample_code ILIKE '%%' || $1 || '%%'
          OR sample.sample_name ILIKE '%%' || $1 || '%%'
          OR COALESCE(sample.model, '') ILIKE '%%' || $1 || '%%')
          AND ($2 OR sample.archived_at IS NULL)
          AND ($3::TIMESTAMPTZ IS NULL OR sample.updated_at >= $3)
          AND ($4::TIMESTAMPTZ IS NULL OR sample.updated_at <= $4)
          AND (
            $5::TEXT IS NULL
            OR ($5 = 'in_stock' AND sample.available_quantity > 0)
            OR ($5 = 'low' AND sample_classification.is_primary
              AND sample.available_quantity > 0
              AND sample.available_quantity <= settings.low_stock_threshold)
            OR ($5 = 'out' AND sample.available_quantity = 0)
          )
          AND (
            $6::TEXT IS NULL
            OR ($6 = 'primary' AND sample_classification.is_primary)
            OR ($6 = 'gift' AND NOT sample_classification.is_primary)
          )
        ORDER BY sample.archived_at NULLS FIRST, {sort_column} {sort_order} NULLS LAST, sample.id DESC
        LIMIT $7 OFFSET $8
        "#
    );
    let rows = sqlx::query(&sql)
        .bind(query.keyword.as_deref())
        .bind(query.include_archived)
        .bind(query.date_from.as_ref())
        .bind(query.date_to.as_ref())
        .bind(query.stock_status.as_deref())
        .bind(query.product_kind.as_deref())
        .bind(query.page_size)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|error| map_database_error(error, "list_samples"))?;
    let items = rows
        .iter()
        .map(sample_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error(error, "map_samples"))?;

    let total_sql = format!(
        r#"
        SELECT COUNT(*)
        FROM sample_inventory.samples AS sample
        CROSS JOIN sample_inventory.settings AS settings
        {SAMPLE_CLASSIFICATION_JOIN}
        WHERE ($1::TEXT IS NULL
          OR sample.sample_code ILIKE '%' || $1 || '%'
          OR sample.sample_name ILIKE '%' || $1 || '%'
          OR COALESCE(sample.model, '') ILIKE '%' || $1 || '%')
          AND ($2 OR sample.archived_at IS NULL)
          AND ($3::TIMESTAMPTZ IS NULL OR sample.updated_at >= $3)
          AND ($4::TIMESTAMPTZ IS NULL OR sample.updated_at <= $4)
          AND (
            $5::TEXT IS NULL
            OR ($5 = 'in_stock' AND sample.available_quantity > 0)
            OR ($5 = 'low' AND sample_classification.is_primary
              AND sample.available_quantity > 0
              AND sample.available_quantity <= settings.low_stock_threshold)
            OR ($5 = 'out' AND sample.available_quantity = 0)
          )
          AND (
            $6::TEXT IS NULL
            OR ($6 = 'primary' AND sample_classification.is_primary)
            OR ($6 = 'gift' AND NOT sample_classification.is_primary)
          )
        "#
    );
    let total: i64 = sqlx::query_scalar(&total_sql)
        .bind(query.keyword.as_deref())
        .bind(query.include_archived)
        .bind(query.date_from.as_ref())
        .bind(query.date_to.as_ref())
        .bind(query.stock_status.as_deref())
        .bind(query.product_kind.as_deref())
        .fetch_one(pool)
        .await
        .map_err(|error| map_database_error(error, "count_samples"))?;

    Ok(SampleInventorySampleListResponse {
        items,
        total,
        page: query.page,
        page_size: query.page_size,
        summary: get_summary(pool).await?,
    })
}

pub(crate) async fn get_summary(pool: &PgPool) -> AppResult<SampleInventorySummary> {
    let sql = format!(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE sample.archived_at IS NULL) AS sample_count,
          COUNT(*) FILTER (
            WHERE sample.archived_at IS NULL AND sample.available_quantity > 0
          ) AS available_sample_count,
          COUNT(*) FILTER (
            WHERE sample.archived_at IS NULL
              AND sample_classification.is_primary
              AND sample.available_quantity > 0
              AND sample.available_quantity <= settings.low_stock_threshold
          ) AS low_stock_count,
          COALESCE(SUM(sample.on_hand_quantity) FILTER (WHERE sample.archived_at IS NULL), 0)::BIGINT
            AS total_on_hand,
          COALESCE(SUM(sample.reserved_quantity) FILTER (WHERE sample.archived_at IS NULL), 0)::BIGINT
            AS total_reserved,
          COALESCE(SUM(sample.available_quantity) FILTER (WHERE sample.archived_at IS NULL), 0)::BIGINT
            AS total_available,
          (SELECT COUNT(*) FROM sample_inventory.outbound_requests
            WHERE status = 'pending' AND archived_at IS NULL) AS pending_outbound_count,
          (SELECT COUNT(*) FROM sample_inventory.outbound_requests
            WHERE status = 'approved' AND archived_at IS NULL) AS approved_outbound_count
          ,(SELECT COUNT(*) FROM sample_inventory.outbound_requests
            WHERE status = 'sampled' AND archived_at IS NULL) AS sampled_outbound_count
          ,(SELECT COUNT(*) FROM sample_inventory.outbound_requests
            WHERE status = 'rejected' AND archived_at IS NULL) AS rejected_outbound_count
          ,(SELECT COUNT(*) FROM sample_inventory.outbound_requests
            WHERE archived_at IS NULL) AS outbound_request_count
          ,(SELECT COALESCE(SUM(quantity), 0)::BIGINT
            FROM sample_inventory.outbound_requests
            WHERE status IN ('approved', 'sampled') AND archived_at IS NULL)
            AS total_outbound_quantity
          ,(SELECT COUNT(DISTINCT applicant) FROM sample_inventory.outbound_requests
            WHERE archived_at IS NULL AND btrim(applicant) <> '') AS outbound_applicant_count
          ,(SELECT COUNT(*) FROM sample_inventory.inbound_records
            WHERE voided_at IS NULL) AS inbound_record_count
          ,(SELECT COALESCE(SUM(quantity), 0)::BIGINT FROM sample_inventory.inbound_records
            WHERE voided_at IS NULL) AS total_inbound_quantity
          ,(SELECT COALESCE(SUM(quantity), 0)::BIGINT FROM sample_inventory.inbound_records
            WHERE voided_at IS NULL
              AND (occurred_at AT TIME ZONE 'Asia/Shanghai')::DATE =
                (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE) AS today_inbound_quantity
          ,(SELECT COUNT(DISTINCT operator_name) FROM sample_inventory.inbound_records
            WHERE voided_at IS NULL AND NULLIF(btrim(operator_name), '') IS NOT NULL)
            AS inbound_operator_count
        FROM sample_inventory.samples AS sample
        CROSS JOIN sample_inventory.settings AS settings
        {SAMPLE_CLASSIFICATION_JOIN}
        GROUP BY settings.low_stock_threshold
        "#
    );
    let row = sqlx::query(&sql)
        .fetch_optional(pool)
        .await
        .map_err(|error| map_database_error(error, "get_summary"))?;
    let Some(row) = row else {
        return Ok(SampleInventorySummary::default());
    };
    Ok(SampleInventorySummary {
        sample_count: row.try_get("sample_count").unwrap_or(0),
        available_sample_count: row.try_get("available_sample_count").unwrap_or(0),
        low_stock_count: row.try_get("low_stock_count").unwrap_or(0),
        total_on_hand: row.try_get("total_on_hand").unwrap_or(0),
        total_reserved: row.try_get("total_reserved").unwrap_or(0),
        total_available: row.try_get("total_available").unwrap_or(0),
        pending_outbound_count: row.try_get("pending_outbound_count").unwrap_or(0),
        approved_outbound_count: row.try_get("approved_outbound_count").unwrap_or(0),
        sampled_outbound_count: row.try_get("sampled_outbound_count").unwrap_or(0),
        rejected_outbound_count: row.try_get("rejected_outbound_count").unwrap_or(0),
        outbound_request_count: row.try_get("outbound_request_count").unwrap_or(0),
        total_outbound_quantity: row.try_get("total_outbound_quantity").unwrap_or(0),
        outbound_applicant_count: row.try_get("outbound_applicant_count").unwrap_or(0),
        inbound_record_count: row.try_get("inbound_record_count").unwrap_or(0),
        total_inbound_quantity: row.try_get("total_inbound_quantity").unwrap_or(0),
        today_inbound_quantity: row.try_get("today_inbound_quantity").unwrap_or(0),
        inbound_operator_count: row.try_get("inbound_operator_count").unwrap_or(0),
    })
}

pub(crate) async fn get_sample_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    sample_id: i64,
) -> AppResult<SampleInventorySampleItem> {
    let sql = format!(
        r#"
        SELECT {SAMPLE_COLUMNS}
        FROM sample_inventory.samples AS sample
        CROSS JOIN sample_inventory.settings AS settings
        {SAMPLE_CLASSIFICATION_JOIN}
        WHERE sample.id = $1
        "#
    );
    let row = sqlx::query(&sql)
        .bind(sample_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| map_database_error(error, "get_sample_in_tx"))?
        .ok_or(AppError::NotFound)?;
    sample_from_row(&row).map_err(|error| map_database_error(error, "map_sample"))
}

pub(crate) async fn list_inbounds(
    pool: &PgPool,
    query: &NormalizedInboundListQuery,
) -> AppResult<SampleInventoryInboundListResponse> {
    let offset = (query.page - 1) * query.page_size;
    let sort_column = match query.sort_by.as_str() {
        "sampleCode" => "sample.sample_code",
        "quantity" => "inbound.quantity",
        "trackingNumber" => "inbound.tracking_number",
        _ => "inbound.occurred_at",
    };
    let sort_order = if query.sort_order == "asc" {
        "ASC"
    } else {
        "DESC"
    };
    let sql = format!(
        r#"
        SELECT {INBOUND_COLUMNS}
        FROM sample_inventory.inbound_records AS inbound
        JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
        WHERE ($1::TEXT IS NULL
          OR sample.sample_code ILIKE '%%' || $1 || '%%'
          OR sample.sample_name ILIKE '%%' || $1 || '%%'
          OR COALESCE(inbound.tracking_number, '') ILIKE '%%' || $1 || '%%')
          AND ($2::BIGINT IS NULL OR inbound.sample_id = $2)
          AND ($3 OR inbound.voided_at IS NULL)
          AND ($4::TIMESTAMPTZ IS NULL OR inbound.occurred_at >= $4)
          AND ($5::TIMESTAMPTZ IS NULL OR inbound.occurred_at <= $5)
        ORDER BY {sort_column} {sort_order} NULLS LAST, inbound.id DESC
        LIMIT $6 OFFSET $7
        "#
    );
    let rows = sqlx::query(&sql)
        .bind(query.keyword.as_deref())
        .bind(query.sample_id)
        .bind(query.include_voided)
        .bind(query.date_from.as_ref())
        .bind(query.date_to.as_ref())
        .bind(query.page_size)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|error| map_database_error(error, "list_inbounds"))?;
    let items = rows
        .iter()
        .map(inbound_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error(error, "map_inbounds"))?;
    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM sample_inventory.inbound_records AS inbound
        JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
        WHERE ($1::TEXT IS NULL
          OR sample.sample_code ILIKE '%' || $1 || '%'
          OR sample.sample_name ILIKE '%' || $1 || '%'
          OR COALESCE(inbound.tracking_number, '') ILIKE '%' || $1 || '%')
          AND ($2::BIGINT IS NULL OR inbound.sample_id = $2)
          AND ($3 OR inbound.voided_at IS NULL)
          AND ($4::TIMESTAMPTZ IS NULL OR inbound.occurred_at >= $4)
          AND ($5::TIMESTAMPTZ IS NULL OR inbound.occurred_at <= $5)
        "#,
    )
    .bind(query.keyword.as_deref())
    .bind(query.sample_id)
    .bind(query.include_voided)
    .bind(query.date_from.as_ref())
    .bind(query.date_to.as_ref())
    .fetch_one(pool)
    .await
    .map_err(|error| map_database_error(error, "count_inbounds"))?;
    Ok(SampleInventoryInboundListResponse {
        items,
        total,
        page: query.page,
        page_size: query.page_size,
    })
}

pub(crate) async fn get_inbound_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    inbound_id: i64,
) -> AppResult<SampleInventoryInboundItem> {
    let sql = format!(
        r#"
        SELECT {INBOUND_COLUMNS}
        FROM sample_inventory.inbound_records AS inbound
        JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
        WHERE inbound.id = $1
        "#
    );
    let row = sqlx::query(&sql)
        .bind(inbound_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| map_database_error(error, "get_inbound_in_tx"))?
        .ok_or(AppError::NotFound)?;
    inbound_from_row(&row).map_err(|error| map_database_error(error, "map_inbound"))
}

pub(crate) async fn list_outbounds(
    pool: &PgPool,
    query: &NormalizedOutboundListQuery,
) -> AppResult<SampleInventoryOutboundListResponse> {
    let offset = (query.page - 1) * query.page_size;
    let sort_column = match query.sort_by.as_str() {
        "sampleCode" => "sample.sample_code",
        "applicant" => "outbound.applicant",
        "department" => "outbound.department",
        "status" => "outbound.status",
        "trackingNumber" => "outbound.tracking_number",
        _ => "outbound.requested_at",
    };
    let sort_order = if query.sort_order == "asc" {
        "ASC"
    } else {
        "DESC"
    };
    let sql = format!(
        r#"
        SELECT {OUTBOUND_COLUMNS}
        FROM sample_inventory.outbound_requests AS outbound
        JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
        WHERE outbound.archived_at IS NULL
          AND ($1::TEXT IS NULL
            OR sample.sample_code ILIKE '%%' || $1 || '%%'
            OR sample.sample_name ILIKE '%%' || $1 || '%%'
            OR outbound.applicant ILIKE '%%' || $1 || '%%'
            OR outbound.department ILIKE '%%' || $1 || '%%'
            OR COALESCE(outbound.tracking_number, '') ILIKE '%%' || $1 || '%%')
          AND ($2::TEXT IS NULL OR outbound.status = $2)
          AND ($3::BIGINT IS NULL OR outbound.sample_id = $3)
          AND ($4::TIMESTAMPTZ IS NULL OR outbound.requested_at >= $4)
          AND ($5::TIMESTAMPTZ IS NULL OR outbound.requested_at <= $5)
        ORDER BY {sort_column} {sort_order} NULLS LAST, outbound.id DESC
        LIMIT $6 OFFSET $7
        "#
    );
    let rows = sqlx::query(&sql)
        .bind(query.keyword.as_deref())
        .bind(query.status.as_deref())
        .bind(query.sample_id)
        .bind(query.date_from.as_ref())
        .bind(query.date_to.as_ref())
        .bind(query.page_size)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|error| map_database_error(error, "list_outbounds"))?;
    let items = rows
        .iter()
        .map(outbound_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error(error, "map_outbounds"))?;
    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM sample_inventory.outbound_requests AS outbound
        JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
        WHERE outbound.archived_at IS NULL
          AND ($1::TEXT IS NULL
            OR sample.sample_code ILIKE '%' || $1 || '%'
            OR sample.sample_name ILIKE '%' || $1 || '%'
            OR outbound.applicant ILIKE '%' || $1 || '%'
            OR outbound.department ILIKE '%' || $1 || '%'
            OR COALESCE(outbound.tracking_number, '') ILIKE '%' || $1 || '%')
          AND ($2::TEXT IS NULL OR outbound.status = $2)
          AND ($3::BIGINT IS NULL OR outbound.sample_id = $3)
          AND ($4::TIMESTAMPTZ IS NULL OR outbound.requested_at >= $4)
          AND ($5::TIMESTAMPTZ IS NULL OR outbound.requested_at <= $5)
        "#,
    )
    .bind(query.keyword.as_deref())
    .bind(query.status.as_deref())
    .bind(query.sample_id)
    .bind(query.date_from.as_ref())
    .bind(query.date_to.as_ref())
    .fetch_one(pool)
    .await
    .map_err(|error| map_database_error(error, "count_outbounds"))?;
    Ok(SampleInventoryOutboundListResponse {
        items,
        total,
        page: query.page,
        page_size: query.page_size,
    })
}

pub(crate) async fn get_outbound_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    request_id: i64,
) -> AppResult<SampleInventoryOutboundItem> {
    let sql = format!(
        r#"
        SELECT {OUTBOUND_COLUMNS}
        FROM sample_inventory.outbound_requests AS outbound
        JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
        WHERE outbound.id = $1 AND outbound.archived_at IS NULL
        "#
    );
    let row = sqlx::query(&sql)
        .bind(request_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| map_database_error(error, "get_outbound_in_tx"))?
        .ok_or(AppError::NotFound)?;
    outbound_from_row(&row).map_err(|error| map_database_error(error, "map_outbound"))
}

pub(crate) async fn sample_id_by_code_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    sample_code: &str,
) -> AppResult<i64> {
    sqlx::query_scalar(
        r#"
        SELECT id
        FROM sample_inventory.samples
        WHERE sample_code = $1 AND archived_at IS NULL
        "#,
    )
    .bind(sample_code)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| map_database_error(error, "sample_id_by_code"))?
    .ok_or_else(|| AppError::bad_request(format!("找不到样品编码：{sample_code}")))
}

pub(crate) async fn export_samples(pool: &PgPool) -> AppResult<Vec<SampleInventorySampleItem>> {
    let sql = format!(
        r#"
        SELECT {SAMPLE_COLUMNS}
        FROM sample_inventory.samples AS sample
        CROSS JOIN sample_inventory.settings AS settings
        {SAMPLE_CLASSIFICATION_JOIN}
        WHERE sample.archived_at IS NULL
        ORDER BY sample.sample_code
        LIMIT 10000
        "#
    );
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|error| map_database_error(error, "export_samples"))?;
    rows.iter()
        .map(sample_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error(error, "map_export_samples"))
}

pub(crate) async fn export_inbounds(pool: &PgPool) -> AppResult<Vec<SampleInventoryInboundItem>> {
    let sql = format!(
        r#"
        SELECT {INBOUND_COLUMNS}
        FROM sample_inventory.inbound_records AS inbound
        JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
        ORDER BY inbound.occurred_at DESC, inbound.id DESC
        LIMIT 10000
        "#
    );
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|error| map_database_error(error, "export_inbounds"))?;
    rows.iter()
        .map(inbound_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error(error, "map_export_inbounds"))
}

pub(crate) async fn export_outbounds(pool: &PgPool) -> AppResult<Vec<SampleInventoryOutboundItem>> {
    let sql = format!(
        r#"
        SELECT {OUTBOUND_COLUMNS}
        FROM sample_inventory.outbound_requests AS outbound
        JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
        WHERE outbound.archived_at IS NULL
        ORDER BY outbound.requested_at DESC, outbound.id DESC
        LIMIT 10000
        "#
    );
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|error| map_database_error(error, "export_outbounds"))?;
    rows.iter()
        .map(outbound_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error(error, "map_export_outbounds"))
}
