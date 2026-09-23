use std::collections::HashSet;

use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::error::{AppError, AppResult};

use super::events::{
    database_error, lock_sample, lock_sample_ids, record_business_event, record_movement,
};
use super::idempotency::{
    claim_mutation, complete_mutation, normalize_submission_key, replay_response, request_sha256,
    MutationClaim,
};
use crate::sample_inventory::{
    repository::{get_inbound_in_tx, sample_id_by_code_in_tx},
    types::{
        BatchVoidSampleInventoryInboundsRequest, CreateSampleInventoryInboundBatchRequest,
        CreateSampleInventoryInboundItem, CreateSampleInventoryInboundRequest,
        ImportSampleInventoryInboundsRequest, SampleInventoryInboundBatchMutationResponse,
        SampleInventoryInboundBatchResponse, SampleInventoryInboundItem,
        VoidSampleInventoryInboundRequest,
    },
    validation::parse_timestamp,
};

fn inbound_time(value: Option<&str>) -> AppResult<DateTime<Utc>> {
    value
        .map(|text| parse_timestamp(text, "入库时间"))
        .transpose()
        .map(|value| value.unwrap_or_else(Utc::now))
}

async fn create_inbound_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: &CreateSampleInventoryInboundItem,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundItem> {
    let locked = lock_sample(tx, input.sample_id).await?;
    let occurred_at = inbound_time(input.occurred_at.as_deref())?;
    let resulting_on_hand = locked
        .on_hand_quantity
        .checked_add(input.quantity)
        .ok_or_else(|| AppError::bad_request("入库后库存超出范围"))?;
    sqlx::query(
        r#"
        UPDATE sample_inventory.samples
        SET on_hand_quantity = $2, updated_by = $3, version = version + 1
        WHERE id = $1
        "#,
    )
    .bind(input.sample_id)
    .bind(resulting_on_hand)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "increase_sample_stock"))?;
    let inbound_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.inbound_records (
          sample_id,
          quantity,
          tracking_number,
          remark,
          operator_name,
          occurred_at,
          time_quality,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'known', $7)
        RETURNING id
        "#,
    )
    .bind(input.sample_id)
    .bind(input.quantity)
    .bind(input.tracking_number.as_deref())
    .bind(input.remark.as_deref())
    .bind(input.operator_name.as_deref())
    .bind(occurred_at)
    .bind(actor_user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "insert_inbound"))?;
    record_movement(
        tx,
        input.sample_id,
        &locked.sample_code,
        "inbound_received",
        input.quantity,
        0,
        resulting_on_hand,
        locked.reserved_quantity,
        "inbound_record",
        inbound_id,
        occurred_at,
        actor_user_id,
        json!({"trackingNumber": input.tracking_number}),
    )
    .await?;
    record_business_event(
        tx,
        "inbound_record",
        inbound_id,
        "inbound.created",
        json!({
            "inboundId": inbound_id,
            "sampleId": input.sample_id,
            "sampleCode": locked.sample_code,
            "quantity": input.quantity,
            "occurredAt": occurred_at.to_rfc3339(),
            "timeQuality": "known",
        }),
        occurred_at,
        actor_user_id,
    )
    .await?;
    get_inbound_in_tx(tx, inbound_id).await
}

pub(crate) async fn create_inbound(
    pool: &PgPool,
    mut input: CreateSampleInventoryInboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&input)?;
    let item_input = CreateSampleInventoryInboundItem {
        sample_id: input.sample_id,
        quantity: input.quantity,
        tracking_number: input.tracking_number,
        remark: input.remark,
        operator_name: input.operator_name,
        occurred_at: input.occurred_at,
    };
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_create_inbound"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "inbound.create",
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
                .map_err(|error| database_error(error, "commit_replay_create_inbound"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let item = create_inbound_in_tx(&mut tx, &item_input, actor_user_id).await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_create_inbound"))?;
    Ok(item)
}

pub(crate) async fn create_inbound_batch(
    pool: &PgPool,
    mut input: CreateSampleInventoryInboundBatchRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundBatchResponse> {
    if input.items.is_empty() || input.items.len() > 100 {
        return Err(AppError::bad_request("批量入库数量必须在1到100之间"));
    }
    normalize_submission_key(&mut input.submission_key)?;
    input.items.sort_by_key(|item| item.sample_id);
    let mut unique_sample_ids = HashSet::with_capacity(input.items.len());
    if input
        .items
        .iter()
        .any(|item| !unique_sample_ids.insert(item.sample_id))
    {
        return Err(AppError::bad_request("批量入库不能重复选择同一个样品"));
    }
    let request_sha = request_sha256(&input)?;
    let sample_ids = input
        .items
        .iter()
        .map(|item| item.sample_id)
        .collect::<Vec<_>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_create_inbound_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "inbound.create_batch",
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
                .map_err(|error| database_error(error, "commit_replay_inbound_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    lock_sample_ids(&mut tx, &sample_ids).await?;
    let mut items = Vec::with_capacity(input.items.len());
    for item in &input.items {
        items.push(create_inbound_in_tx(&mut tx, item, actor_user_id).await?);
    }
    let response = SampleInventoryInboundBatchResponse {
        created_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_create_inbound_batch"))?;
    Ok(response)
}

pub(crate) async fn import_inbound_rows(
    pool: &PgPool,
    mut input: ImportSampleInventoryInboundsRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundBatchResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&input)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_import_inbounds"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "inbound.import_xlsx",
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
                .map_err(|error| database_error(error, "commit_replay_import_inbounds"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let mut inputs = Vec::with_capacity(input.rows.len());
    for row in input.rows {
        let sample_code = row.sample_code.trim().to_string();
        let sample_id = sample_id_by_code_in_tx(&mut tx, &sample_code).await?;
        inputs.push(CreateSampleInventoryInboundItem {
            sample_id,
            quantity: row.quantity,
            tracking_number: row.tracking_number,
            remark: row.remark,
            operator_name: row.operator_name,
            occurred_at: row.occurred_at,
        });
    }
    let sample_ids = inputs.iter().map(|item| item.sample_id).collect::<Vec<_>>();
    lock_sample_ids(&mut tx, &sample_ids).await?;
    let mut items = Vec::with_capacity(inputs.len());
    for input in &inputs {
        items.push(create_inbound_in_tx(&mut tx, input, actor_user_id).await?);
    }
    let response = SampleInventoryInboundBatchResponse {
        created_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_import_inbounds"))?;
    Ok(response)
}

async fn void_inbound_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    inbound_id: i64,
    expected_version: i64,
    reason: &str,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundItem> {
    let normalized_reason = reason.trim();
    if expected_version <= 0
        || normalized_reason.is_empty()
        || normalized_reason.chars().count() > 500
    {
        return Err(AppError::bad_request("版本或作废原因无效"));
    }
    let row = sqlx::query(
        r#"
        SELECT sample_id, quantity, version, voided_at
        FROM sample_inventory.inbound_records
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(inbound_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "lock_inbound"))?
    .ok_or(AppError::NotFound)?;
    let sample_id: i64 = row
        .try_get("sample_id")
        .map_err(|error| database_error(error, "map_locked_inbound"))?;
    let quantity: i32 = row
        .try_get("quantity")
        .map_err(|error| database_error(error, "map_locked_inbound"))?;
    let version: i64 = row
        .try_get("version")
        .map_err(|error| database_error(error, "map_locked_inbound"))?;
    let voided_at: Option<chrono::DateTime<Utc>> = row
        .try_get("voided_at")
        .map_err(|error| database_error(error, "map_locked_inbound"))?;
    if voided_at.is_some() {
        return Err(AppError::Conflict("该入库记录已作废".to_string()));
    }
    if version != expected_version {
        return Err(AppError::Conflict(
            "入库记录已变化，请刷新后重试".to_string(),
        ));
    }
    let locked = lock_sample(tx, sample_id).await?;
    let resulting_on_hand = locked.on_hand_quantity - quantity;
    if resulting_on_hand < locked.reserved_quantity {
        return Err(AppError::Conflict(
            "当前可用库存不足，不能作废该入库记录".to_string(),
        ));
    }
    sqlx::query(
        r#"
        UPDATE sample_inventory.inbound_records
        SET voided_at = NOW(), voided_by = $2, void_reason = $3, version = version + 1
        WHERE id = $1 AND version = $4
        "#,
    )
    .bind(inbound_id)
    .bind(actor_user_id)
    .bind(normalized_reason)
    .bind(expected_version)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "void_inbound"))?;
    sqlx::query(
        r#"
        UPDATE sample_inventory.samples
        SET on_hand_quantity = $2, updated_by = $3, version = version + 1
        WHERE id = $1
        "#,
    )
    .bind(sample_id)
    .bind(resulting_on_hand)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "reverse_inbound_stock"))?;
    let now = Utc::now();
    record_movement(
        tx,
        sample_id,
        &locked.sample_code,
        "inbound_voided",
        -quantity,
        0,
        resulting_on_hand,
        locked.reserved_quantity,
        "inbound_record",
        inbound_id,
        now,
        actor_user_id,
        json!({"reason": normalized_reason}),
    )
    .await?;
    record_business_event(
        tx,
        "inbound_record",
        inbound_id,
        "inbound.voided",
        json!({
            "inboundId": inbound_id,
            "sampleId": sample_id,
            "sampleCode": locked.sample_code,
            "quantity": quantity,
            "reason": normalized_reason,
        }),
        now,
        actor_user_id,
    )
    .await?;
    get_inbound_in_tx(tx, inbound_id).await
}

pub(crate) async fn void_inbound(
    pool: &PgPool,
    inbound_id: i64,
    mut input: VoidSampleInventoryInboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundItem> {
    normalize_submission_key(&mut input.submission_key)?;
    input.reason = input.reason.trim().to_string();
    let request_sha = request_sha256(&json!({ "inboundId": inbound_id, "input": &input }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_void_inbound"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "inbound.void",
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
                .map_err(|error| database_error(error, "commit_replay_void_inbound"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let item = void_inbound_in_tx(
        &mut tx,
        inbound_id,
        input.expected_version,
        &input.reason,
        actor_user_id,
    )
    .await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_void_inbound"))?;
    Ok(item)
}

pub(crate) async fn void_inbound_batch(
    pool: &PgPool,
    mut input: BatchVoidSampleInventoryInboundsRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryInboundBatchMutationResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    input.reason = input.reason.trim().to_string();
    if input.reason.is_empty() || input.reason.chars().count() > 500 {
        return Err(AppError::bad_request("作废原因不能为空且不能超过500个字符"));
    }
    input.items.sort_by_key(|item| item.id);
    let request_sha = request_sha256(&input)?;
    let ids = input.items.iter().map(|item| item.id).collect::<Vec<_>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_void_inbound_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "inbound.void_batch",
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
                .map_err(|error| database_error(error, "commit_replay_void_inbound_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };

    let rows = sqlx::query(
        r#"
        SELECT id, sample_id
        FROM sample_inventory.inbound_records
        WHERE id = ANY($1)
        ORDER BY id
        FOR UPDATE
        "#,
    )
    .bind(&ids)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| database_error(error, "lock_inbound_batch"))?;
    if rows.len() != ids.len() {
        return Err(AppError::bad_request("批量作废包含不存在的入库记录"));
    }
    let sample_ids = rows
        .iter()
        .map(|row| row.try_get::<i64, _>("sample_id"))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| database_error(error, "map_inbound_batch_samples"))?;
    lock_sample_ids(&mut tx, &sample_ids).await?;

    let mut items = Vec::with_capacity(input.items.len());
    for target in &input.items {
        items.push(
            void_inbound_in_tx(
                &mut tx,
                target.id,
                target.expected_version,
                &input.reason,
                actor_user_id,
            )
            .await?,
        );
    }
    let response = SampleInventoryInboundBatchMutationResponse {
        updated_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_void_inbound_batch"))?;
    Ok(response)
}
