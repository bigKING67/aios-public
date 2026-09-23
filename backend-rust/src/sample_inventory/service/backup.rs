use std::collections::{HashMap, HashSet};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::error::{AppError, AppResult};

use super::{events::database_error, idempotency::request_sha256};
use crate::sample_inventory::types::{
    ParseSampleInventoryBackupRequest, SampleInventoryBackupFile, SampleInventoryBackupInbound,
    SampleInventoryBackupOutbound, SampleInventoryBackupPlanCounts,
    SampleInventoryBackupPlanResponse, SampleInventoryBackupSample, SampleInventoryBackupSettings,
    SampleInventoryBackupState,
};

pub(super) const BACKUP_SCHEMA_VERSION: &str = "sample-inventory-backup.v2";
const LEGACY_BACKUP_SCHEMA_VERSION: &str = "sample-inventory-backup.v1";
pub(crate) const BACKUP_BODY_LIMIT_BYTES: usize = 8 * 1024 * 1024;
const MAX_BACKUP_SAMPLES: usize = 5_000;
const MAX_BACKUP_RECORDS: usize = 20_000;

fn canonical_timestamp(value: &str, field: &str) -> AppResult<String> {
    DateTime::parse_from_rfc3339(value.trim())
        .map(|value| {
            value
                .with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Micros, true)
        })
        .map_err(|_| AppError::bad_request(format!("{field}必须是RFC3339时间")))
}

fn timestamp_string(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Micros, true)
}

fn validate_required(value: &str, field: &str, max_chars: usize) -> AppResult<()> {
    let length = value.chars().count();
    if value.trim().is_empty() || length > max_chars {
        return Err(AppError::bad_request(format!(
            "{field}不能为空且不能超过{max_chars}个字符"
        )));
    }
    Ok(())
}

fn validate_optional(value: Option<&str>, field: &str, max_chars: usize) -> AppResult<()> {
    if value.is_some_and(|value| value.chars().count() > max_chars) {
        return Err(AppError::bad_request(format!(
            "{field}不能超过{max_chars}个字符"
        )));
    }
    Ok(())
}

fn validate_sha256(value: &str, field: &str) -> AppResult<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(AppError::bad_request(format!("{field}不是有效SHA-256")));
    }
    Ok(())
}

pub(super) fn state_sha256(state: &SampleInventoryBackupState) -> AppResult<String> {
    request_sha256(state)
}

pub(super) fn backup_sha256(backup: &SampleInventoryBackupFile) -> AppResult<String> {
    request_sha256(backup)
}

pub(super) fn normalize_backup(backup: &mut SampleInventoryBackupFile) -> AppResult<()> {
    let is_legacy_backup = match backup.schema_version.as_str() {
        BACKUP_SCHEMA_VERSION => false,
        LEGACY_BACKUP_SCHEMA_VERSION => true,
        _ => return Err(AppError::bad_request("备份版本不受支持")),
    };
    backup.exported_at = canonical_timestamp(&backup.exported_at, "exportedAt")?;
    validate_sha256(&backup.database_identity_sha256, "databaseIdentitySha256")?;
    validate_sha256(&backup.state_sha256, "stateSha256")?;
    if backup.state.samples.len() > MAX_BACKUP_SAMPLES
        || backup.state.inbound_records.len() > MAX_BACKUP_RECORDS
        || backup.state.outbound_requests.len() > MAX_BACKUP_RECORDS
    {
        return Err(AppError::bad_request("备份记录数量超过恢复上限"));
    }
    if backup.state.settings.low_stock_threshold < 0
        || !(0..=3_600).contains(&backup.state.settings.refresh_interval_seconds)
    {
        return Err(AppError::bad_request("备份设置超出允许范围"));
    }

    backup.state.samples.sort_by_key(|item| item.id);
    backup.state.inbound_records.sort_by_key(|item| item.id);
    backup.state.outbound_requests.sort_by_key(|item| item.id);

    let mut sample_ids = HashSet::with_capacity(backup.state.samples.len());
    let mut sample_codes = HashSet::with_capacity(backup.state.samples.len());
    for sample in &backup.state.samples {
        if sample.id <= 0
            || !sample_ids.insert(sample.id)
            || !sample_codes.insert(sample.sample_code.clone())
        {
            return Err(AppError::bad_request("备份包含重复或无效样品标识"));
        }
        validate_required(&sample.sample_code, "样品编码", 120)?;
        validate_required(&sample.sample_name, "样品名称", 200)?;
        validate_optional(sample.model.as_deref(), "规格型号", 500)?;
        validate_optional(sample.category.as_deref(), "分类", 120)?;
        validate_optional(sample.location.as_deref(), "存放位置", 500)?;
        validate_optional(sample.remark.as_deref(), "备注", 2_000)?;
        if sample.on_hand_quantity < 0
            || sample.reserved_quantity < 0
            || sample.reserved_quantity > sample.on_hand_quantity
        {
            return Err(AppError::bad_request("备份样品库存余额无效"));
        }
    }

    let mut inbound_ids = HashSet::with_capacity(backup.state.inbound_records.len());
    for inbound in &mut backup.state.inbound_records {
        if inbound.id <= 0
            || inbound.quantity <= 0
            || !inbound_ids.insert(inbound.id)
            || !sample_ids.contains(&inbound.sample_id)
        {
            return Err(AppError::bad_request("备份包含无效入库记录"));
        }
        validate_optional(inbound.tracking_number.as_deref(), "物流单号", 200)?;
        validate_optional(inbound.remark.as_deref(), "入库备注", 2_000)?;
        validate_optional(inbound.operator_name.as_deref(), "操作人", 120)?;
        if !matches!(
            inbound.time_quality.as_str(),
            "known" | "legacy_local_minute"
        ) {
            return Err(AppError::bad_request("备份入库时间质量无效"));
        }
        inbound.occurred_at = canonical_timestamp(&inbound.occurred_at, "occurredAt")?;
    }

    let mut outbound_ids = HashSet::with_capacity(backup.state.outbound_requests.len());
    for outbound in &mut backup.state.outbound_requests {
        if outbound.id <= 0
            || outbound.quantity <= 0
            || !outbound_ids.insert(outbound.id)
            || !sample_ids.contains(&outbound.sample_id)
        {
            return Err(AppError::bad_request("备份包含无效出库记录"));
        }
        validate_required(&outbound.applicant, "申领人", 120)?;
        validate_required(&outbound.department, "部门", 120)?;
        validate_required(&outbound.purpose, "用途", 1_000)?;
        validate_optional(outbound.receiver.as_deref(), "收货人", 120)?;
        validate_optional(outbound.shipping_address.as_deref(), "收货地址", 1_000)?;
        validate_optional(outbound.tracking_number.as_deref(), "物流单号", 200)?;
        if !matches!(
            outbound.status.as_str(),
            "pending" | "approved" | "sampled" | "rejected"
        ) || !matches!(
            outbound.time_quality.as_str(),
            "known" | "legacy_request_only"
        ) {
            return Err(AppError::bad_request("备份出库状态或时间质量无效"));
        }
        outbound.requested_at = canonical_timestamp(&outbound.requested_at, "requestedAt")?;
        outbound.approved_at = outbound
            .approved_at
            .as_deref()
            .map(|value| canonical_timestamp(value, "approvedAt"))
            .transpose()?;
        outbound.sampled_at = outbound
            .sampled_at
            .as_deref()
            .map(|value| canonical_timestamp(value, "sampledAt"))
            .transpose()?;
        outbound.rejected_at = outbound
            .rejected_at
            .as_deref()
            .map(|value| canonical_timestamp(value, "rejectedAt"))
            .transpose()?;
    }

    let computed_state_sha = state_sha256(&backup.state)?;
    if backup.state_sha256 != computed_state_sha {
        return Err(AppError::Conflict(
            "备份内容与stateSha256不一致".to_string(),
        ));
    }
    if is_legacy_backup {
        for sample in &mut backup.state.samples {
            sample.reserved_quantity = 0;
        }
        backup.schema_version = BACKUP_SCHEMA_VERSION.to_string();
        backup.state_sha256 = state_sha256(&backup.state)?;
    }
    Ok(())
}

pub(super) async fn database_identity_sha256(
    tx: &mut Transaction<'_, Postgres>,
) -> AppResult<String> {
    let identity: String = sqlx::query_scalar(
        r#"
        SELECT current_database() || '|' || oid::TEXT
        FROM pg_database
        WHERE datname = current_database()
        "#,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "sample_inventory_database_identity"))?;
    request_sha256(&identity)
}

pub(super) async fn load_active_backup_state(
    tx: &mut Transaction<'_, Postgres>,
) -> AppResult<SampleInventoryBackupState> {
    let counts = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM sample_inventory.samples WHERE archived_at IS NULL) AS samples,
          (SELECT COUNT(*) FROM sample_inventory.inbound_records WHERE voided_at IS NULL) AS inbounds,
          (SELECT COUNT(*) FROM sample_inventory.outbound_requests WHERE archived_at IS NULL) AS outbounds
        "#,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "count_sample_inventory_backup"))?;
    let sample_count: i64 = counts
        .try_get("samples")
        .map_err(|error| database_error(error, "map_sample_inventory_backup_counts"))?;
    let inbound_count: i64 = counts
        .try_get("inbounds")
        .map_err(|error| database_error(error, "map_sample_inventory_backup_counts"))?;
    let outbound_count: i64 = counts
        .try_get("outbounds")
        .map_err(|error| database_error(error, "map_sample_inventory_backup_counts"))?;
    if sample_count > MAX_BACKUP_SAMPLES as i64
        || inbound_count > MAX_BACKUP_RECORDS as i64
        || outbound_count > MAX_BACKUP_RECORDS as i64
    {
        return Err(AppError::bad_request("当前样品库存规模超过备份上限"));
    }

    let settings_row = sqlx::query(
        r#"
        SELECT low_stock_threshold, refresh_interval_seconds
        FROM sample_inventory.settings
        WHERE id = 1
        "#,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "backup_settings"))?;
    let settings = SampleInventoryBackupSettings {
        low_stock_threshold: settings_row
            .try_get("low_stock_threshold")
            .map_err(|error| database_error(error, "map_backup_settings"))?,
        refresh_interval_seconds: settings_row
            .try_get("refresh_interval_seconds")
            .map_err(|error| database_error(error, "map_backup_settings"))?,
    };

    let sample_rows = sqlx::query(
        r#"
        SELECT id, sample_code, sample_name, model, category, location, remark,
          on_hand_quantity, reserved_quantity
        FROM sample_inventory.samples
        WHERE archived_at IS NULL
        ORDER BY id
        "#,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "backup_samples"))?;
    let samples = sample_rows
        .iter()
        .map(|row| {
            Ok(SampleInventoryBackupSample {
                id: row.try_get("id")?,
                sample_code: row.try_get("sample_code")?,
                sample_name: row.try_get("sample_name")?,
                model: row.try_get("model")?,
                category: row.try_get("category")?,
                location: row.try_get("location")?,
                remark: row.try_get("remark")?,
                on_hand_quantity: row.try_get("on_hand_quantity")?,
                reserved_quantity: row.try_get("reserved_quantity")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(|error| database_error(error, "map_backup_samples"))?;

    let inbound_rows = sqlx::query(
        r#"
        SELECT id, sample_id, quantity, tracking_number, remark, operator_name,
          occurred_at, time_quality
        FROM sample_inventory.inbound_records
        WHERE voided_at IS NULL
        ORDER BY id
        "#,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "backup_inbounds"))?;
    let inbound_records = inbound_rows
        .iter()
        .map(|row| {
            Ok(SampleInventoryBackupInbound {
                id: row.try_get("id")?,
                sample_id: row.try_get("sample_id")?,
                quantity: row.try_get("quantity")?,
                tracking_number: row.try_get("tracking_number")?,
                remark: row.try_get("remark")?,
                operator_name: row.try_get("operator_name")?,
                occurred_at: timestamp_string(row.try_get("occurred_at")?),
                time_quality: row.try_get("time_quality")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(|error| database_error(error, "map_backup_inbounds"))?;

    let outbound_rows = sqlx::query(
        r#"
        SELECT id, sample_id, quantity, applicant, department, purpose, receiver,
          shipping_address, tracking_number, status, requested_at, approved_at,
          sampled_at, rejected_at, time_quality
        FROM sample_inventory.outbound_requests
        WHERE archived_at IS NULL
        ORDER BY id
        "#,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "backup_outbounds"))?;
    let outbound_requests = outbound_rows
        .iter()
        .map(|row| {
            Ok(SampleInventoryBackupOutbound {
                id: row.try_get("id")?,
                sample_id: row.try_get("sample_id")?,
                quantity: row.try_get("quantity")?,
                applicant: row.try_get("applicant")?,
                department: row.try_get("department")?,
                purpose: row.try_get("purpose")?,
                receiver: row.try_get("receiver")?,
                shipping_address: row.try_get("shipping_address")?,
                tracking_number: row.try_get("tracking_number")?,
                status: row.try_get("status")?,
                requested_at: timestamp_string(row.try_get("requested_at")?),
                approved_at: row
                    .try_get::<Option<DateTime<Utc>>, _>("approved_at")?
                    .map(timestamp_string),
                sampled_at: row
                    .try_get::<Option<DateTime<Utc>>, _>("sampled_at")?
                    .map(timestamp_string),
                rejected_at: row
                    .try_get::<Option<DateTime<Utc>>, _>("rejected_at")?
                    .map(timestamp_string),
                time_quality: row.try_get("time_quality")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(|error| database_error(error, "map_backup_outbounds"))?;

    Ok(SampleInventoryBackupState {
        settings,
        samples,
        inbound_records,
        outbound_requests,
    })
}

pub(super) async fn validate_backup_entities_exist(
    tx: &mut Transaction<'_, Postgres>,
    backup: &SampleInventoryBackupFile,
) -> AppResult<()> {
    let sample_ids = backup
        .state
        .samples
        .iter()
        .map(|item| item.id)
        .collect::<Vec<_>>();
    let existing_sample_ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM sample_inventory.samples WHERE id = ANY($1) ORDER BY id",
    )
    .bind(&sample_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "validate_backup_sample_identities"))?;
    if existing_sample_ids.len() != sample_ids.len() {
        return Err(AppError::Conflict(
            "备份包含当前数据库不存在的样品".to_string(),
        ));
    }

    let inbound_ids = backup
        .state
        .inbound_records
        .iter()
        .map(|item| item.id)
        .collect::<Vec<_>>();
    let inbound_rows = sqlx::query(
        "SELECT id, sample_id FROM sample_inventory.inbound_records WHERE id = ANY($1)",
    )
    .bind(&inbound_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "validate_backup_inbound_identities"))?;
    let inbound_samples = inbound_rows
        .iter()
        .map(|row| Ok((row.try_get("id")?, row.try_get("sample_id")?)))
        .collect::<Result<HashMap<i64, i64>, sqlx::Error>>()
        .map_err(|error| database_error(error, "map_backup_inbound_identities"))?;
    if backup
        .state
        .inbound_records
        .iter()
        .any(|item| inbound_samples.get(&item.id).copied() != Some(item.sample_id))
    {
        return Err(AppError::Conflict(
            "备份包含不存在或归属已变化的入库记录".to_string(),
        ));
    }

    let outbound_ids = backup
        .state
        .outbound_requests
        .iter()
        .map(|item| item.id)
        .collect::<Vec<_>>();
    let outbound_rows = sqlx::query(
        "SELECT id, sample_id FROM sample_inventory.outbound_requests WHERE id = ANY($1)",
    )
    .bind(&outbound_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "validate_backup_outbound_identities"))?;
    let outbound_samples = outbound_rows
        .iter()
        .map(|row| Ok((row.try_get("id")?, row.try_get("sample_id")?)))
        .collect::<Result<HashMap<i64, i64>, sqlx::Error>>()
        .map_err(|error| database_error(error, "map_backup_outbound_identities"))?;
    if backup
        .state
        .outbound_requests
        .iter()
        .any(|item| outbound_samples.get(&item.id).copied() != Some(item.sample_id))
    {
        return Err(AppError::Conflict(
            "备份包含不存在或归属已变化的出库记录".to_string(),
        ));
    }
    Ok(())
}

#[derive(Serialize)]
struct BackupPlanFingerprint<'a> {
    backup_sha256: &'a str,
    current_state_sha256: &'a str,
    changes: &'a SampleInventoryBackupPlanCounts,
}

pub(super) fn build_backup_plan(
    backup: &SampleInventoryBackupFile,
    current: &SampleInventoryBackupState,
) -> AppResult<SampleInventoryBackupPlanResponse> {
    let backup_sha = backup_sha256(backup)?;
    let current_state_sha = state_sha256(current)?;
    let current_samples = current
        .samples
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    let backup_samples = backup
        .state
        .samples
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    let current_inbounds = current
        .inbound_records
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    let backup_inbounds = backup
        .state
        .inbound_records
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    let current_outbounds = current
        .outbound_requests
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    let backup_outbounds = backup
        .state
        .outbound_requests
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();

    let changes = SampleInventoryBackupPlanCounts {
        settings_to_update: i64::from(current.settings != backup.state.settings),
        samples_to_update: backup_samples
            .iter()
            .filter(|(id, item)| current_samples.get(id).copied() != Some(*item))
            .count() as i64,
        samples_to_archive: current_samples
            .keys()
            .filter(|id| !backup_samples.contains_key(id))
            .count() as i64,
        inbounds_to_update: backup_inbounds
            .iter()
            .filter(|(id, item)| current_inbounds.get(id).copied() != Some(*item))
            .count() as i64,
        inbounds_to_void: current_inbounds
            .keys()
            .filter(|id| !backup_inbounds.contains_key(id))
            .count() as i64,
        outbounds_to_update: backup_outbounds
            .iter()
            .filter(|(id, item)| current_outbounds.get(id).copied() != Some(*item))
            .count() as i64,
        outbounds_to_archive: current_outbounds
            .keys()
            .filter(|id| !backup_outbounds.contains_key(id))
            .count() as i64,
    };
    let plan_sha = request_sha256(&BackupPlanFingerprint {
        backup_sha256: &backup_sha,
        current_state_sha256: &current_state_sha,
        changes: &changes,
    })?;
    Ok(SampleInventoryBackupPlanResponse {
        schema_version: BACKUP_SCHEMA_VERSION.to_string(),
        backup_sha256: backup_sha,
        backup_state_sha256: backup.state_sha256.clone(),
        current_state_sha256: current_state_sha,
        plan_sha256: plan_sha,
        sample_count: backup.state.samples.len() as i64,
        inbound_count: backup.state.inbound_records.len() as i64,
        outbound_count: backup.state.outbound_requests.len() as i64,
        changes,
    })
}

pub(crate) async fn export_backup(pool: &PgPool) -> AppResult<SampleInventoryBackupFile> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_export_backup"))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "configure_export_backup_transaction"))?;
    let database_identity_sha256 = database_identity_sha256(&mut tx).await?;
    let state = load_active_backup_state(&mut tx).await?;
    let state_sha256 = state_sha256(&state)?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_export_backup"))?;
    Ok(SampleInventoryBackupFile {
        schema_version: BACKUP_SCHEMA_VERSION.to_string(),
        exported_at: timestamp_string(Utc::now()),
        database_identity_sha256,
        state_sha256,
        state,
    })
}

pub(crate) async fn parse_backup(
    pool: &PgPool,
    mut input: ParseSampleInventoryBackupRequest,
) -> AppResult<SampleInventoryBackupPlanResponse> {
    normalize_backup(&mut input.backup)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_parse_backup"))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "configure_parse_backup_transaction"))?;
    let database_identity = database_identity_sha256(&mut tx).await?;
    if input.backup.database_identity_sha256 != database_identity {
        return Err(AppError::Conflict(
            "备份不属于当前数据库，已拒绝恢复".to_string(),
        ));
    }
    validate_backup_entities_exist(&mut tx, &input.backup).await?;
    let current = load_active_backup_state(&mut tx).await?;
    let plan = build_backup_plan(&input.backup, &current)?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_parse_backup"))?;
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::{normalize_backup, state_sha256, BACKUP_SCHEMA_VERSION};
    use crate::sample_inventory::types::{
        SampleInventoryBackupFile, SampleInventoryBackupSample, SampleInventoryBackupSettings,
        SampleInventoryBackupState,
    };

    fn fixture() -> SampleInventoryBackupFile {
        let state = SampleInventoryBackupState {
            settings: SampleInventoryBackupSettings {
                low_stock_threshold: 3,
                refresh_interval_seconds: 15,
            },
            samples: Vec::new(),
            inbound_records: Vec::new(),
            outbound_requests: Vec::new(),
        };
        SampleInventoryBackupFile {
            schema_version: BACKUP_SCHEMA_VERSION.to_string(),
            exported_at: "2026-07-27T08:00:00Z".to_string(),
            database_identity_sha256: "a".repeat(64),
            state_sha256: state_sha256(&state).unwrap(),
            state,
        }
    }

    #[test]
    fn backup_validation_rejects_state_drift_and_normalizes_timestamps() {
        let mut valid = fixture();
        normalize_backup(&mut valid).unwrap();
        assert_eq!(valid.exported_at, "2026-07-27T08:00:00.000000Z");

        let mut drifted = fixture();
        drifted.state.settings.low_stock_threshold = 4;
        assert!(normalize_backup(&mut drifted).is_err());
    }

    #[test]
    fn legacy_backup_verifies_original_state_before_normalizing_reservation() {
        let mut legacy = fixture();
        legacy.schema_version = "sample-inventory-backup.v1".to_string();
        legacy.state.samples.push(SampleInventoryBackupSample {
            id: 1,
            sample_code: "S-1".to_string(),
            sample_name: "Fixture".to_string(),
            model: None,
            category: None,
            location: Some("legacy-location".to_string()),
            remark: None,
            on_hand_quantity: 10,
            reserved_quantity: 3,
        });
        legacy.state_sha256 = state_sha256(&legacy.state).unwrap();
        let original_state_sha = legacy.state_sha256.clone();

        normalize_backup(&mut legacy).unwrap();

        assert_eq!(legacy.schema_version, BACKUP_SCHEMA_VERSION);
        assert_eq!(legacy.state.samples[0].reserved_quantity, 0);
        assert_ne!(legacy.state_sha256, original_state_sha);
        assert_eq!(legacy.state_sha256, state_sha256(&legacy.state).unwrap());

        let mut tampered = fixture();
        tampered.schema_version = "sample-inventory-backup.v1".to_string();
        tampered.state.samples = legacy.state.samples.clone();
        tampered.state.samples[0].reserved_quantity = 2;
        tampered.state_sha256 = original_state_sha;
        assert!(normalize_backup(&mut tampered).is_err());
    }
}
