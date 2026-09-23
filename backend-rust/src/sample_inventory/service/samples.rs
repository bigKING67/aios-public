use std::collections::HashSet;

use chrono::Utc;
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
    repository::{get_sample_in_tx, is_unique_violation},
    types::{
        ArchiveSampleInventorySampleRequest, BatchArchiveSampleInventorySamplesRequest,
        CreateSampleInventorySampleRequest, ImportSampleInventorySamplesRequest,
        SampleInventoryAdjustmentRequest, SampleInventorySampleBatchMutationResponse,
        SampleInventorySampleImportResponse, SampleInventorySampleImportRow,
        SampleInventorySampleItem, UpdateSampleInventorySampleRequest,
    },
};

struct NewSampleInput {
    sample_code: String,
    sample_name: String,
    model: Option<String>,
    category: Option<String>,
    location: Option<String>,
    remark: Option<String>,
    initial_quantity: i32,
    reserved_quantity: i32,
}

impl From<&CreateSampleInventorySampleRequest> for NewSampleInput {
    fn from(input: &CreateSampleInventorySampleRequest) -> Self {
        Self {
            sample_code: input.sample_code.clone(),
            sample_name: input.sample_name.clone(),
            model: input.model.clone(),
            category: input.category.clone(),
            location: input.location.clone(),
            remark: input.remark.clone(),
            initial_quantity: input.initial_quantity.unwrap_or(0),
            reserved_quantity: input.reserved_quantity.unwrap_or(0),
        }
    }
}

impl From<SampleInventorySampleImportRow> for NewSampleInput {
    fn from(input: SampleInventorySampleImportRow) -> Self {
        Self {
            sample_code: input.sample_code,
            sample_name: input.sample_name,
            model: input.model,
            category: input.category,
            location: input.location,
            remark: input.remark,
            initial_quantity: input.initial_quantity,
            reserved_quantity: 0,
        }
    }
}

async fn insert_sample_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: &NewSampleInput,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleItem> {
    let initial_quantity = input.initial_quantity;
    let reserved_quantity = input.reserved_quantity;
    if initial_quantity < 0 {
        return Err(AppError::bad_request("期初库存不能为负数"));
    }
    if reserved_quantity < 0 {
        return Err(AppError::bad_request("预留数量不能为负数"));
    }
    if reserved_quantity > initial_quantity {
        return Err(AppError::bad_request("预留数量不能超过期初库存"));
    }
    let row = sqlx::query(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          model,
          category,
          location,
          remark,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        RETURNING id
        "#,
    )
    .bind(&input.sample_code)
    .bind(&input.sample_name)
    .bind(input.model.as_deref())
    .bind(input.category.as_deref())
    .bind(input.location.as_deref())
    .bind(input.remark.as_deref())
    .bind(initial_quantity)
    .bind(reserved_quantity)
    .bind(actor_user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| {
        if is_unique_violation(&error) {
            return AppError::Conflict("样品编码已存在".to_string());
        }
        database_error(error, "insert_sample")
    })?;
    let sample_id: i64 = row
        .try_get("id")
        .map_err(|error| database_error(error, "map_inserted_sample"))?;
    let now = Utc::now();

    record_business_event(
        tx,
        "sample",
        sample_id,
        "sample.created",
        json!({
            "sampleId": sample_id,
            "sampleCode": input.sample_code,
            "initialQuantity": initial_quantity,
            "reservedQuantity": reserved_quantity,
        }),
        now,
        actor_user_id,
    )
    .await?;
    if initial_quantity > 0 {
        record_movement(
            tx,
            sample_id,
            &input.sample_code,
            "sample_opening",
            initial_quantity,
            0,
            initial_quantity,
            0,
            "sample",
            sample_id,
            now,
            actor_user_id,
            json!({"reason": "initial_quantity"}),
        )
        .await?;
    }
    if reserved_quantity > 0 {
        record_movement(
            tx,
            sample_id,
            &input.sample_code,
            "manual_reservation_adjustment",
            0,
            reserved_quantity,
            initial_quantity,
            reserved_quantity,
            "sample",
            sample_id,
            now,
            actor_user_id,
            json!({"reason": "sample_create"}),
        )
        .await?;
    }
    get_sample_in_tx(tx, sample_id).await
}

pub(crate) async fn create_sample(
    pool: &PgPool,
    mut input: CreateSampleInventorySampleRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&input)?;
    let new_sample = NewSampleInput::from(&input);
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_create_sample"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "sample.create",
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
                .map_err(|error| database_error(error, "commit_replay_create_sample"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let item = insert_sample_in_tx(&mut tx, &new_sample, actor_user_id).await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_create_sample"))?;
    Ok(item)
}

pub(crate) async fn import_sample_rows(
    pool: &PgPool,
    mut input: ImportSampleInventorySamplesRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleImportResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    let mut seen_codes = HashSet::with_capacity(input.rows.len());
    if input
        .rows
        .iter()
        .any(|row| !seen_codes.insert(row.sample_code.clone()))
    {
        return Err(AppError::bad_request("导入文件包含重复样品编码"));
    }
    let request_sha = request_sha256(&input)?;
    let rows = input
        .rows
        .into_iter()
        .map(NewSampleInput::from)
        .collect::<Vec<_>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_import_samples"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "sample.import_xlsx",
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
                .map_err(|error| database_error(error, "commit_replay_import_samples"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let mut items = Vec::with_capacity(rows.len());
    for row in &rows {
        items.push(insert_sample_in_tx(&mut tx, row, actor_user_id).await?);
    }
    let response = SampleInventorySampleImportResponse {
        created_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_import_samples"))?;
    Ok(response)
}

pub(crate) async fn update_sample(
    pool: &PgPool,
    sample_id: i64,
    mut input: UpdateSampleInventorySampleRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&json!({ "sampleId": sample_id, "input": &input }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_update_sample"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "sample.update",
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
                .map_err(|error| database_error(error, "commit_replay_update_sample"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_sample(&mut tx, sample_id).await?;
    if locked.version != input.expected_version {
        return Err(AppError::Conflict(
            "样品资料已被其他人更新，请刷新后重试".to_string(),
        ));
    }
    let resulting_reserved = input.reserved_quantity.unwrap_or(locked.reserved_quantity);
    if resulting_reserved < 0 {
        return Err(AppError::bad_request("预留数量不能为负数"));
    }
    if resulting_reserved > locked.on_hand_quantity {
        return Err(AppError::bad_request("预留数量不能超过当前库存"));
    }
    let reserved_delta = resulting_reserved - locked.reserved_quantity;
    let updated_id: Option<i64> = sqlx::query_scalar(
        r#"
        UPDATE sample_inventory.samples
        SET
          sample_code = $2,
          sample_name = $3,
          model = $4,
          category = $5,
          location = $6,
          remark = $7,
          reserved_quantity = $8,
          updated_by = $9,
          version = version + 1
        WHERE id = $1 AND version = $10 AND archived_at IS NULL
        RETURNING id
        "#,
    )
    .bind(sample_id)
    .bind(&input.sample_code)
    .bind(&input.sample_name)
    .bind(input.model.as_deref())
    .bind(input.category.as_deref())
    .bind(input.location.as_deref())
    .bind(input.remark.as_deref())
    .bind(resulting_reserved)
    .bind(actor_user_id)
    .bind(input.expected_version)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| {
        if is_unique_violation(&error) {
            return AppError::Conflict("样品编码已存在".to_string());
        }
        database_error(error, "update_sample")
    })?;
    if updated_id.is_none() {
        return Err(AppError::Conflict(
            "样品资料已被其他人更新，请刷新后重试".to_string(),
        ));
    }
    let now = Utc::now();
    if reserved_delta != 0 {
        record_movement(
            &mut tx,
            sample_id,
            &input.sample_code,
            "manual_reservation_adjustment",
            0,
            reserved_delta,
            locked.on_hand_quantity,
            resulting_reserved,
            "sample",
            sample_id,
            now,
            actor_user_id,
            json!({
                "reason": "sample_update",
                "previousReservedQuantity": locked.reserved_quantity,
            }),
        )
        .await?;
    }
    record_business_event(
        &mut tx,
        "sample",
        sample_id,
        "sample.updated",
        json!({
            "sampleId": sample_id,
            "sampleCode": input.sample_code,
            "previousReservedQuantity": locked.reserved_quantity,
            "reservedQuantity": resulting_reserved,
        }),
        now,
        actor_user_id,
    )
    .await?;
    let item = get_sample_in_tx(&mut tx, sample_id).await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_update_sample"))?;
    Ok(item)
}

pub(crate) async fn adjust_sample(
    pool: &PgPool,
    sample_id: i64,
    mut input: SampleInventoryAdjustmentRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleItem> {
    normalize_submission_key(&mut input.submission_key)?;
    if input.expected_version <= 0 || input.quantity_delta == 0 {
        return Err(AppError::bad_request("版本或调整数量无效"));
    }
    input.reason = input.reason.trim().to_string();
    let normalized_reason = input.reason.as_str();
    if normalized_reason.is_empty() || normalized_reason.chars().count() > 500 {
        return Err(AppError::bad_request("调整原因不能为空且不能超过500个字符"));
    }
    let request_sha = request_sha256(&json!({ "sampleId": sample_id, "input": &input }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_adjust_sample"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "sample.adjust",
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
                .map_err(|error| database_error(error, "commit_replay_adjust_sample"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_sample(&mut tx, sample_id).await?;
    if locked.version != input.expected_version {
        return Err(AppError::Conflict(
            "库存已发生变化，请刷新后重试".to_string(),
        ));
    }
    let resulting_on_hand = locked
        .on_hand_quantity
        .checked_add(input.quantity_delta)
        .ok_or_else(|| AppError::bad_request("调整后库存超出范围"))?;
    if resulting_on_hand < locked.reserved_quantity {
        return Err(AppError::Conflict(
            "调整后在手库存不能低于已预留库存".to_string(),
        ));
    }
    sqlx::query(
        r#"
        UPDATE sample_inventory.samples
        SET on_hand_quantity = $2, updated_by = $3, version = version + 1
        WHERE id = $1 AND version = $4
        "#,
    )
    .bind(sample_id)
    .bind(resulting_on_hand)
    .bind(actor_user_id)
    .bind(input.expected_version)
    .execute(&mut *tx)
    .await
    .map_err(|error| database_error(error, "adjust_sample"))?;
    let now = Utc::now();
    record_movement(
        &mut tx,
        sample_id,
        &locked.sample_code,
        "manual_adjustment",
        input.quantity_delta,
        0,
        resulting_on_hand,
        locked.reserved_quantity,
        "sample",
        sample_id,
        now,
        actor_user_id,
        json!({"reason": normalized_reason}),
    )
    .await?;
    record_business_event(
        &mut tx,
        "sample",
        sample_id,
        "sample.adjusted",
        json!({
            "sampleId": sample_id,
            "sampleCode": locked.sample_code,
            "quantityDelta": input.quantity_delta,
            "reason": normalized_reason,
            "resultingOnHand": resulting_on_hand,
            "resultingReserved": locked.reserved_quantity,
        }),
        now,
        actor_user_id,
    )
    .await?;
    let item = get_sample_in_tx(&mut tx, sample_id).await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_adjust_sample"))?;
    Ok(item)
}

pub(crate) async fn archive_sample(
    pool: &PgPool,
    sample_id: i64,
    mut input: ArchiveSampleInventorySampleRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleItem> {
    normalize_submission_key(&mut input.submission_key)?;
    if input.expected_version <= 0 {
        return Err(AppError::bad_request("expectedVersion无效"));
    }
    let request_sha = request_sha256(&json!({ "sampleId": sample_id, "input": &input }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_archive_sample"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "sample.archive",
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
                .map_err(|error| database_error(error, "commit_replay_archive_sample"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_sample(&mut tx, sample_id).await?;
    if locked.version != input.expected_version {
        return Err(AppError::Conflict(
            "样品资料已变化，请刷新后重试".to_string(),
        ));
    }
    if locked.on_hand_quantity != 0 || locked.reserved_quantity != 0 {
        return Err(AppError::Conflict(
            "仅零库存且无预留的样品可以归档".to_string(),
        ));
    }
    sqlx::query(
        r#"
        UPDATE sample_inventory.samples
        SET archived_at = NOW(), archived_by = $2, updated_by = $2, version = version + 1
        WHERE id = $1 AND version = $3
        "#,
    )
    .bind(sample_id)
    .bind(actor_user_id)
    .bind(input.expected_version)
    .execute(&mut *tx)
    .await
    .map_err(|error| database_error(error, "archive_sample"))?;
    record_business_event(
        &mut tx,
        "sample",
        sample_id,
        "sample.archived",
        json!({"sampleId": sample_id, "sampleCode": locked.sample_code}),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    let item = get_sample_in_tx(&mut tx, sample_id).await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_archive_sample"))?;
    Ok(item)
}

pub(crate) async fn archive_sample_batch(
    pool: &PgPool,
    mut input: BatchArchiveSampleInventorySamplesRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySampleBatchMutationResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    input.reason = input.reason.trim().to_string();
    input.items.sort_by_key(|item| item.id);
    let normalized_reason = input.reason.as_str();
    if normalized_reason.is_empty() || normalized_reason.chars().count() > 500 {
        return Err(AppError::bad_request("归档原因不能为空且不能超过500个字符"));
    }
    let request_sha = request_sha256(&input)?;
    let sample_ids = input.items.iter().map(|item| item.id).collect::<Vec<_>>();
    let versions = input
        .items
        .iter()
        .map(|item| (item.id, item.expected_version))
        .collect::<std::collections::HashMap<_, _>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_archive_sample_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "sample.archive_batch",
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
                .map_err(|error| database_error(error, "commit_replay_archive_sample_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    lock_sample_ids(&mut tx, &sample_ids).await?;

    let mut items = Vec::with_capacity(sample_ids.len());
    for sample_id in sample_ids {
        let locked = lock_sample(&mut tx, sample_id).await?;
        let expected_version = versions[&sample_id];
        if locked.version != expected_version {
            return Err(AppError::Conflict(format!(
                "样品 {} 已变化，请刷新后重试",
                locked.sample_code
            )));
        }
        if locked.reserved_quantity != 0 {
            return Err(AppError::Conflict(format!(
                "样品 {} 仍有预留库存，不能归档",
                locked.sample_code
            )));
        }
        let now = Utc::now();
        sqlx::query(
            r#"
            UPDATE sample_inventory.samples
            SET
              on_hand_quantity = 0,
              archived_at = $2,
              archived_by = $3,
              updated_by = $3,
              version = version + 1
            WHERE id = $1 AND version = $4 AND archived_at IS NULL
            "#,
        )
        .bind(sample_id)
        .bind(now)
        .bind(actor_user_id)
        .bind(expected_version)
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "archive_sample_batch_item"))?;
        if locked.on_hand_quantity > 0 {
            record_movement(
                &mut tx,
                sample_id,
                &locked.sample_code,
                "sample_archived_compensation",
                -locked.on_hand_quantity,
                0,
                0,
                0,
                "sample",
                sample_id,
                now,
                actor_user_id,
                json!({"reason": normalized_reason}),
            )
            .await?;
        }
        record_business_event(
            &mut tx,
            "sample",
            sample_id,
            "sample.archived",
            json!({
                "sampleId": sample_id,
                "sampleCode": locked.sample_code,
                "reason": normalized_reason,
                "compensatedOnHand": locked.on_hand_quantity,
            }),
            now,
            actor_user_id,
        )
        .await?;
        items.push(get_sample_in_tx(&mut tx, sample_id).await?);
    }
    let response = SampleInventorySampleBatchMutationResponse {
        updated_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_archive_sample_batch"))?;
    Ok(response)
}
