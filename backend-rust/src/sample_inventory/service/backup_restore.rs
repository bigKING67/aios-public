use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::error::{AppError, AppResult};

use super::{
    backup::{
        build_backup_plan, database_identity_sha256, load_active_backup_state, normalize_backup,
        state_sha256, validate_backup_entities_exist,
    },
    events::{database_error, record_business_event, record_movement},
    idempotency::{
        claim_mutation, complete_mutation, normalize_submission_key, replay_response,
        request_sha256, MutationClaim,
    },
};
use crate::sample_inventory::types::{
    RestoreSampleInventoryBackupRequest, SampleInventoryBackupInbound,
    SampleInventoryBackupOutbound, SampleInventoryBackupRestoreResponse,
    SampleInventoryBackupSample, SampleInventoryBackupState,
};

fn parse_timestamp(value: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| AppError::bad_request("备份时间格式无效"))
}

async fn restore_settings(
    tx: &mut Transaction<'_, Postgres>,
    backup: &SampleInventoryBackupState,
    current: &SampleInventoryBackupState,
    actor_user_id: &str,
) -> AppResult<()> {
    if current.settings == backup.settings {
        return Ok(());
    }
    let updated = sqlx::query(
        r#"
        UPDATE sample_inventory.settings
        SET low_stock_threshold = $1,
          refresh_interval_seconds = $2,
          updated_by = $3,
          version = version + 1
        WHERE id = 1
        "#,
    )
    .bind(backup.settings.low_stock_threshold)
    .bind(backup.settings.refresh_interval_seconds)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "restore_backup_settings"))?;
    if updated.rows_affected() != 1 {
        return Err(AppError::Internal);
    }
    record_business_event(
        tx,
        "settings",
        1,
        "settings.backup_restored",
        json!({
            "lowStockThreshold": backup.settings.low_stock_threshold,
            "refreshIntervalSeconds": backup.settings.refresh_interval_seconds,
        }),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    Ok(())
}

async fn restore_inbounds(
    tx: &mut Transaction<'_, Postgres>,
    backup: &SampleInventoryBackupState,
    current: &SampleInventoryBackupState,
    actor_user_id: &str,
) -> AppResult<()> {
    let backup_ids = backup
        .inbound_records
        .iter()
        .map(|item| item.id)
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        r#"
        UPDATE sample_inventory.inbound_records
        SET voided_at = NOW(),
          voided_by = $2,
          void_reason = 'backup_restore_absent',
          version = version + 1
        WHERE voided_at IS NULL AND NOT (id = ANY($1))
        RETURNING id, sample_id
        "#,
    )
    .bind(&backup_ids)
    .bind(actor_user_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "void_inbounds_absent_from_backup"))?;
    for row in rows {
        let inbound_id: i64 = row
            .try_get("id")
            .map_err(|error| database_error(error, "map_voided_backup_inbound"))?;
        let sample_id: i64 = row
            .try_get("sample_id")
            .map_err(|error| database_error(error, "map_voided_backup_inbound"))?;
        record_business_event(
            tx,
            "inbound_record",
            inbound_id,
            "inbound.backup_voided",
            json!({"inboundId": inbound_id, "sampleId": sample_id}),
            Utc::now(),
            actor_user_id,
        )
        .await?;
    }

    let current_items = current
        .inbound_records
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    for inbound in &backup.inbound_records {
        if current_items.get(&inbound.id).copied() == Some(inbound) {
            continue;
        }
        restore_inbound(tx, inbound, actor_user_id).await?;
    }
    Ok(())
}

async fn restore_inbound(
    tx: &mut Transaction<'_, Postgres>,
    inbound: &SampleInventoryBackupInbound,
    actor_user_id: &str,
) -> AppResult<()> {
    let occurred_at = parse_timestamp(&inbound.occurred_at)?;
    let restored_id: Option<i64> = sqlx::query_scalar(
        r#"
        UPDATE sample_inventory.inbound_records
        SET quantity = $3,
          tracking_number = $4,
          remark = $5,
          operator_name = $6,
          occurred_at = $7,
          time_quality = $8,
          voided_at = NULL,
          voided_by = NULL,
          void_reason = NULL,
          version = version + 1
        WHERE id = $1 AND sample_id = $2
        RETURNING id
        "#,
    )
    .bind(inbound.id)
    .bind(inbound.sample_id)
    .bind(inbound.quantity)
    .bind(inbound.tracking_number.as_deref())
    .bind(inbound.remark.as_deref())
    .bind(inbound.operator_name.as_deref())
    .bind(occurred_at)
    .bind(&inbound.time_quality)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "restore_backup_inbound"))?;
    if restored_id.is_none() {
        return Err(AppError::Conflict(format!(
            "备份入库记录 {} 在当前数据库不存在或归属已变化",
            inbound.id
        )));
    }
    record_business_event(
        tx,
        "inbound_record",
        inbound.id,
        "inbound.backup_restored",
        json!({
            "inboundId": inbound.id,
            "sampleId": inbound.sample_id,
            "quantity": inbound.quantity,
        }),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    Ok(())
}

async fn restore_outbounds(
    tx: &mut Transaction<'_, Postgres>,
    backup: &SampleInventoryBackupState,
    current: &SampleInventoryBackupState,
    actor_user_id: &str,
) -> AppResult<()> {
    let backup_ids = backup
        .outbound_requests
        .iter()
        .map(|item| item.id)
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        r#"
        UPDATE sample_inventory.outbound_requests
        SET archived_at = NOW(), archived_by = $2, updated_by = $2, version = version + 1
        WHERE archived_at IS NULL AND NOT (id = ANY($1))
        RETURNING id, sample_id, status
        "#,
    )
    .bind(&backup_ids)
    .bind(actor_user_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "archive_outbounds_absent_from_backup"))?;
    for row in rows {
        let outbound_id: i64 = row
            .try_get("id")
            .map_err(|error| database_error(error, "map_archived_backup_outbound"))?;
        let sample_id: i64 = row
            .try_get("sample_id")
            .map_err(|error| database_error(error, "map_archived_backup_outbound"))?;
        let status: String = row
            .try_get("status")
            .map_err(|error| database_error(error, "map_archived_backup_outbound"))?;
        record_business_event(
            tx,
            "outbound_request",
            outbound_id,
            "outbound.backup_archived",
            json!({"requestId": outbound_id, "sampleId": sample_id, "status": status}),
            Utc::now(),
            actor_user_id,
        )
        .await?;
    }

    let current_items = current
        .outbound_requests
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    for outbound in &backup.outbound_requests {
        if current_items.get(&outbound.id).copied() == Some(outbound) {
            continue;
        }
        restore_outbound(tx, outbound, actor_user_id).await?;
    }
    Ok(())
}

async fn restore_outbound(
    tx: &mut Transaction<'_, Postgres>,
    outbound: &SampleInventoryBackupOutbound,
    actor_user_id: &str,
) -> AppResult<()> {
    let requested_at = parse_timestamp(&outbound.requested_at)?;
    let approved_at = outbound
        .approved_at
        .as_deref()
        .map(parse_timestamp)
        .transpose()?;
    let sampled_at = outbound
        .sampled_at
        .as_deref()
        .map(parse_timestamp)
        .transpose()?;
    let rejected_at = outbound
        .rejected_at
        .as_deref()
        .map(parse_timestamp)
        .transpose()?;
    let restored_id: Option<i64> = sqlx::query_scalar(
        r#"
        UPDATE sample_inventory.outbound_requests
        SET quantity = $3,
          applicant = $4,
          department = $5,
          purpose = $6,
          receiver = $7,
          shipping_address = $8,
          tracking_number = $9,
          status = $10,
          requested_at = $11,
          approved_at = $12,
          approved_by = CASE WHEN $12::TIMESTAMPTZ IS NULL THEN NULL ELSE $16 END,
          sampled_at = $13,
          sampled_by = CASE WHEN $13::TIMESTAMPTZ IS NULL THEN NULL ELSE $16 END,
          rejected_at = $14,
          rejected_by = CASE WHEN $14::TIMESTAMPTZ IS NULL THEN NULL ELSE $16 END,
          time_quality = $15,
          archived_at = NULL,
          archived_by = NULL,
          updated_by = $16,
          version = version + 1
        WHERE id = $1 AND sample_id = $2
        RETURNING id
        "#,
    )
    .bind(outbound.id)
    .bind(outbound.sample_id)
    .bind(outbound.quantity)
    .bind(&outbound.applicant)
    .bind(&outbound.department)
    .bind(&outbound.purpose)
    .bind(outbound.receiver.as_deref())
    .bind(outbound.shipping_address.as_deref())
    .bind(outbound.tracking_number.as_deref())
    .bind(&outbound.status)
    .bind(requested_at)
    .bind(approved_at)
    .bind(sampled_at)
    .bind(rejected_at)
    .bind(&outbound.time_quality)
    .bind(actor_user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "restore_backup_outbound"))?;
    if restored_id.is_none() {
        return Err(AppError::Conflict(format!(
            "备份出库记录 {} 在当前数据库不存在或归属已变化",
            outbound.id
        )));
    }
    record_business_event(
        tx,
        "outbound_request",
        outbound.id,
        "outbound.backup_restored",
        json!({
            "requestId": outbound.id,
            "sampleId": outbound.sample_id,
            "quantity": outbound.quantity,
            "status": outbound.status,
        }),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    Ok(())
}

async fn restore_samples(
    tx: &mut Transaction<'_, Postgres>,
    backup: &SampleInventoryBackupState,
    current: &SampleInventoryBackupState,
    mutation_id: i64,
    actor_user_id: &str,
) -> AppResult<()> {
    let backup_ids = backup
        .samples
        .iter()
        .map(|item| item.id)
        .collect::<HashSet<_>>();
    for sample in current
        .samples
        .iter()
        .filter(|item| !backup_ids.contains(&item.id))
    {
        archive_sample_absent_from_backup(tx, sample, mutation_id, actor_user_id).await?;
    }

    let current_items = current
        .samples
        .iter()
        .map(|item| (item.id, item))
        .collect::<HashMap<_, _>>();
    for sample in &backup.samples {
        if current_items.get(&sample.id).copied() == Some(sample) {
            continue;
        }
        restore_sample(tx, sample, mutation_id, actor_user_id).await?;
    }
    Ok(())
}

async fn archive_sample_absent_from_backup(
    tx: &mut Transaction<'_, Postgres>,
    sample: &SampleInventoryBackupSample,
    mutation_id: i64,
    actor_user_id: &str,
) -> AppResult<()> {
    let updated = sqlx::query(
        r#"
        UPDATE sample_inventory.samples
        SET on_hand_quantity = 0,
          reserved_quantity = 0,
          archived_at = NOW(),
          archived_by = $2,
          updated_by = $2,
          version = version + 1
        WHERE id = $1 AND archived_at IS NULL
        "#,
    )
    .bind(sample.id)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "archive_sample_absent_from_backup"))?;
    if updated.rows_affected() != 1 {
        return Err(AppError::Conflict(format!(
            "样品 {} 在恢复期间发生变化",
            sample.sample_code
        )));
    }
    if sample.on_hand_quantity != 0 || sample.reserved_quantity != 0 {
        record_movement(
            tx,
            sample.id,
            &sample.sample_code,
            "backup_restore_reconcile",
            -sample.on_hand_quantity,
            -sample.reserved_quantity,
            0,
            0,
            "backup_restore",
            mutation_id,
            Utc::now(),
            actor_user_id,
            json!({"reason": "absent_from_backup"}),
        )
        .await?;
    }
    record_business_event(
        tx,
        "sample",
        sample.id,
        "sample.backup_archived",
        json!({"sampleId": sample.id, "sampleCode": sample.sample_code}),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    Ok(())
}

async fn restore_sample(
    tx: &mut Transaction<'_, Postgres>,
    target: &SampleInventoryBackupSample,
    mutation_id: i64,
    actor_user_id: &str,
) -> AppResult<()> {
    let row = sqlx::query(
        r#"
        SELECT sample_code, on_hand_quantity, reserved_quantity
        FROM sample_inventory.samples
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(target.id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "lock_backup_sample"))?
    .ok_or_else(|| AppError::Conflict(format!("备份样品 {} 在当前数据库不存在", target.id)))?;
    let current_code: String = row
        .try_get("sample_code")
        .map_err(|error| database_error(error, "map_backup_sample"))?;
    let current_on_hand: i32 = row
        .try_get("on_hand_quantity")
        .map_err(|error| database_error(error, "map_backup_sample"))?;
    let current_reserved: i32 = row
        .try_get("reserved_quantity")
        .map_err(|error| database_error(error, "map_backup_sample"))?;
    let updated = sqlx::query(
        r#"
        UPDATE sample_inventory.samples
        SET sample_code = $2,
          sample_name = $3,
          model = $4,
          category = $5,
          location = $6,
          remark = $7,
          on_hand_quantity = $8,
          reserved_quantity = $9,
          archived_at = NULL,
          archived_by = NULL,
          updated_by = $10,
          version = version + 1
        WHERE id = $1
        "#,
    )
    .bind(target.id)
    .bind(&target.sample_code)
    .bind(&target.sample_name)
    .bind(target.model.as_deref())
    .bind(target.category.as_deref())
    .bind(target.location.as_deref())
    .bind(target.remark.as_deref())
    .bind(target.on_hand_quantity)
    .bind(target.reserved_quantity)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "restore_backup_sample"))?;
    if updated.rows_affected() != 1 {
        return Err(AppError::Internal);
    }
    let on_hand_delta = target.on_hand_quantity - current_on_hand;
    let reserved_delta = target.reserved_quantity - current_reserved;
    if on_hand_delta != 0 || reserved_delta != 0 {
        record_movement(
            tx,
            target.id,
            &target.sample_code,
            "backup_restore_reconcile",
            on_hand_delta,
            reserved_delta,
            target.on_hand_quantity,
            target.reserved_quantity,
            "backup_restore",
            mutation_id,
            Utc::now(),
            actor_user_id,
            json!({"previousSampleCode": current_code}),
        )
        .await?;
    }
    record_business_event(
        tx,
        "sample",
        target.id,
        "sample.backup_restored",
        json!({"sampleId": target.id, "sampleCode": target.sample_code}),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    Ok(())
}

pub(crate) async fn restore_backup(
    pool: &PgPool,
    mut input: RestoreSampleInventoryBackupRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryBackupRestoreResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    normalize_backup(&mut input.backup)?;
    let request_sha = request_sha256(&input)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_restore_backup"))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "configure_restore_backup_transaction"))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('sample_inventory.backup_restore'))")
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "lock_sample_inventory_restore"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "backup.restore",
        &input.submission_key,
        &request_sha,
        actor_user_id,
    )
    .await?
    {
        MutationClaim::Replay(response) => {
            let response = replay_response(response)?;
            tx.commit()
                .await
                .map_err(|error| database_error(error, "commit_replay_restore_backup"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };

    sqlx::query(
        r#"
        LOCK TABLE
          sample_inventory.settings,
          sample_inventory.samples,
          sample_inventory.inbound_records,
          sample_inventory.outbound_requests
        IN SHARE ROW EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await
    .map_err(|error| database_error(error, "lock_sample_inventory_restore_tables"))?;

    let database_identity = database_identity_sha256(&mut tx).await?;
    if input.backup.database_identity_sha256 != database_identity {
        return Err(AppError::Conflict(
            "备份不属于当前数据库，已拒绝恢复".to_string(),
        ));
    }
    validate_backup_entities_exist(&mut tx, &input.backup).await?;
    let current = load_active_backup_state(&mut tx).await?;
    let plan = build_backup_plan(&input.backup, &current)?;
    if input.expected_backup_sha256 != plan.backup_sha256
        || input.expected_current_state_sha256 != plan.current_state_sha256
        || input.expected_plan_sha256 != plan.plan_sha256
    {
        return Err(AppError::Conflict(
            "备份、当前状态或恢复计划已变化，请重新预检".to_string(),
        ));
    }

    restore_settings(&mut tx, &input.backup.state, &current, actor_user_id).await?;
    restore_inbounds(&mut tx, &input.backup.state, &current, actor_user_id).await?;
    restore_outbounds(&mut tx, &input.backup.state, &current, actor_user_id).await?;
    restore_samples(
        &mut tx,
        &input.backup.state,
        &current,
        mutation_id,
        actor_user_id,
    )
    .await?;

    let restored = load_active_backup_state(&mut tx).await?;
    let restored_state_sha256 = state_sha256(&restored)?;
    if restored_state_sha256 != input.backup.state_sha256 {
        return Err(AppError::Conflict(
            "恢复后状态对账失败，事务已回滚".to_string(),
        ));
    }
    let response = SampleInventoryBackupRestoreResponse {
        backup_sha256: plan.backup_sha256,
        restored_state_sha256,
        plan_sha256: plan.plan_sha256,
        restored_at: Utc::now().to_rfc3339(),
        changes: plan.changes,
    };
    record_business_event(
        &mut tx,
        "backup_restore",
        mutation_id,
        "backup.restored",
        json!({
            "backupSha256": &response.backup_sha256,
            "restoredStateSha256": &response.restored_state_sha256,
            "planSha256": &response.plan_sha256,
            "changes": &response.changes,
        }),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_restore_backup"))?;
    Ok(response)
}
