use chrono::Utc;
use serde_json::json;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};

use super::{
    events::{
        database_error, lock_sample, lock_sample_ids, record_business_event, record_movement,
    },
    idempotency::{
        claim_mutation, complete_mutation, normalize_submission_key, replay_response,
        request_sha256, MutationClaim,
    },
    outbounds::{
        can_archive_outbound, create_outbound_in_tx, lock_outbound_ids, outbound_event_payload,
        transition_locked_outbound, update_tracking_in_tx,
    },
};
use crate::sample_inventory::{
    repository::get_outbound_in_tx,
    types::{
        BatchArchiveSampleInventoryOutboundRequest, BatchEditSampleInventoryOutboundRequest,
        BatchTransitionSampleInventoryOutboundRequest,
        BatchUpdateSampleInventoryOutboundTrackingItem,
        BatchUpdateSampleInventoryOutboundTrackingRequest,
        CreateSampleInventoryOutboundBatchRequest, SampleInventoryBatchMutationResponse,
        SampleInventoryOutboundBatchResponse,
    },
};

pub(crate) async fn create_outbound_batch(
    pool: &PgPool,
    mut input: CreateSampleInventoryOutboundBatchRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundBatchResponse> {
    if input.items.is_empty() || input.items.len() > 100 {
        return Err(AppError::bad_request("批量出库数量必须在1到100之间"));
    }
    normalize_submission_key(&mut input.submission_key)?;
    input.items.sort_by_key(|item| item.sample_id);
    let request_sha = request_sha256(&input)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_create_outbound_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.create_batch",
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
                .map_err(|error| database_error(error, "commit_replay_outbound_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };

    let sample_ids = input
        .items
        .iter()
        .map(|item| item.sample_id)
        .collect::<Vec<_>>();
    lock_sample_ids(&mut tx, &sample_ids).await?;
    let mut items = Vec::with_capacity(input.items.len());
    for item in &input.items {
        items.push(create_outbound_in_tx(&mut tx, item, actor_user_id).await?);
    }
    let response = SampleInventoryOutboundBatchResponse {
        created_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_create_outbound_batch"))?;
    Ok(response)
}

pub(crate) async fn update_outbound_tracking_batch(
    pool: &PgPool,
    mut input: BatchUpdateSampleInventoryOutboundTrackingRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryBatchMutationResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    input.items.sort_by_key(|item| item.id);
    let request_sha = request_sha256(&input)?;
    let ids = input.items.iter().map(|item| item.id).collect::<Vec<_>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_update_outbound_tracking_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.update_tracking_batch",
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
                .map_err(|error| database_error(error, "commit_replay_outbound_tracking_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound_ids(&mut tx, &ids).await?;
    let updates = input
        .items
        .iter()
        .map(|item| (item.id, item))
        .collect::<std::collections::HashMap<_, _>>();
    let mut items = Vec::with_capacity(locked.len());
    for outbound in &locked {
        let update: &BatchUpdateSampleInventoryOutboundTrackingItem = updates[&outbound.id];
        items.push(
            update_tracking_in_tx(
                &mut tx,
                outbound,
                update.expected_version,
                update.tracking_number.as_deref(),
                actor_user_id,
            )
            .await?,
        );
    }
    let response = SampleInventoryBatchMutationResponse {
        updated_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_update_outbound_tracking_batch"))?;
    Ok(response)
}

pub(crate) async fn transition_outbound_batch(
    pool: &PgPool,
    mut input: BatchTransitionSampleInventoryOutboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryBatchMutationResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    input.items.sort_by_key(|item| item.id);
    let request_sha = request_sha256(&input)?;
    let ids = input.items.iter().map(|item| item.id).collect::<Vec<_>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_transition_outbound_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.transition_batch",
        &input.submission_key,
        &request_sha,
        actor_user_id,
    )
    .await?
    {
        MutationClaim::Replay(response) => {
            let response = replay_response(response)?;
            tx.commit().await.map_err(|error| {
                database_error(error, "commit_replay_transition_outbound_batch")
            })?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound_ids(&mut tx, &ids).await?;
    let sample_ids = locked.iter().map(|item| item.sample_id).collect::<Vec<_>>();
    lock_sample_ids(&mut tx, &sample_ids).await?;
    let versions = input
        .items
        .iter()
        .map(|item| (item.id, item.expected_version))
        .collect::<std::collections::HashMap<_, _>>();
    let mut items = Vec::with_capacity(locked.len());
    for request in &locked {
        let expected_version = versions[&request.id];
        items.push(
            transition_locked_outbound(
                &mut tx,
                request,
                expected_version,
                &input.target_status,
                actor_user_id,
            )
            .await?,
        );
    }
    let response = SampleInventoryBatchMutationResponse {
        updated_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_transition_outbound_batch"))?;
    Ok(response)
}

pub(crate) async fn edit_outbound_batch(
    pool: &PgPool,
    mut input: BatchEditSampleInventoryOutboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryBatchMutationResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    input.items.sort_by_key(|item| item.id);
    let request_sha = request_sha256(&input)?;
    let ids = input.items.iter().map(|item| item.id).collect::<Vec<_>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_edit_outbound_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.edit_batch",
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
                .map_err(|error| database_error(error, "commit_replay_edit_outbound_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound_ids(&mut tx, &ids).await?;
    let edit_map = input
        .items
        .iter()
        .map(|item| (item.id, item))
        .collect::<std::collections::HashMap<_, _>>();
    let mut items = Vec::with_capacity(locked.len());
    for request in &locked {
        let edit = edit_map[&request.id];
        if request.version != edit.expected_version {
            return Err(AppError::Conflict(format!(
                "出库申请 {} 已变化，请刷新后重试",
                request.id
            )));
        }
        if !matches!(request.status.as_str(), "pending" | "rejected") {
            return Err(AppError::bad_request("批量编辑仅支持待审批或已驳回申请"));
        }
        sqlx::query(
            r#"
            UPDATE sample_inventory.outbound_requests
            SET
              applicant = COALESCE($2, applicant),
              department = COALESCE($3, department),
              purpose = COALESCE($4, purpose),
              receiver = COALESCE($5, receiver),
              shipping_address = COALESCE($6, shipping_address),
              tracking_number = COALESCE($7, tracking_number),
              updated_by = $8,
              version = version + 1
            WHERE id = $1 AND version = $9
            "#,
        )
        .bind(request.id)
        .bind(edit.applicant.as_deref())
        .bind(edit.department.as_deref())
        .bind(edit.purpose.as_deref())
        .bind(edit.receiver.as_deref())
        .bind(edit.shipping_address.as_deref())
        .bind(edit.tracking_number.as_deref())
        .bind(actor_user_id)
        .bind(edit.expected_version)
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "edit_outbound_batch_item"))?;
        let item = get_outbound_in_tx(&mut tx, request.id).await?;
        record_business_event(
            &mut tx,
            "outbound_request",
            request.id,
            "outbound.updated",
            outbound_event_payload(&item, Some(&request.status)),
            Utc::now(),
            actor_user_id,
        )
        .await?;
        items.push(item);
    }
    let response = SampleInventoryBatchMutationResponse {
        updated_count: items.len() as i64,
        items,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_edit_outbound_batch"))?;
    Ok(response)
}

pub(crate) async fn archive_outbound_batch(
    pool: &PgPool,
    mut input: BatchArchiveSampleInventoryOutboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryBatchMutationResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    input.items.sort_by_key(|item| item.id);
    let request_sha = request_sha256(&input)?;
    let ids = input.items.iter().map(|item| item.id).collect::<Vec<_>>();
    let versions = input
        .items
        .iter()
        .map(|item| (item.id, item.expected_version))
        .collect::<std::collections::HashMap<_, _>>();
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_archive_outbound_batch"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.archive_batch",
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
                .map_err(|error| database_error(error, "commit_replay_archive_outbound_batch"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound_ids(&mut tx, &ids).await?;
    let sample_ids = locked
        .iter()
        .filter(|item| matches!(item.status.as_str(), "approved" | "sampled"))
        .map(|item| item.sample_id)
        .collect::<Vec<_>>();
    if !sample_ids.is_empty() {
        lock_sample_ids(&mut tx, &sample_ids).await?;
    }
    let mut archived = Vec::with_capacity(locked.len());
    for request in &locked {
        if request.version != versions[&request.id] {
            return Err(AppError::Conflict(format!(
                "出库申请 {} 已变化，请刷新后重试",
                request.id
            )));
        }
        if !can_archive_outbound(&request.status, &request.time_quality) {
            return Err(AppError::bad_request("当前出库状态不能归档"));
        }
        let item = get_outbound_in_tx(&mut tx, request.id).await?;
        let now = Utc::now();
        if matches!(request.status.as_str(), "approved" | "sampled") {
            let sample = lock_sample(&mut tx, request.sample_id).await?;
            let on_hand_delta = request.quantity;
            let reserved_delta = 0;
            let resulting_on_hand = sample
                .on_hand_quantity
                .checked_add(on_hand_delta)
                .ok_or_else(|| {
                    AppError::Conflict("当前库存状态与出库记录不一致，无法归档".to_string())
                })?;
            let resulting_reserved = sample.reserved_quantity + reserved_delta;
            if resulting_on_hand < 0
                || resulting_reserved < 0
                || resulting_reserved > resulting_on_hand
            {
                return Err(AppError::Conflict(
                    "当前库存状态与出库记录不一致，无法归档".to_string(),
                ));
            }
            sqlx::query(
                r#"
                UPDATE sample_inventory.samples
                SET
                  on_hand_quantity = $2,
                  reserved_quantity = $3,
                  updated_by = $4,
                  version = version + 1
                WHERE id = $1
                "#,
            )
            .bind(sample.id)
            .bind(resulting_on_hand)
            .bind(resulting_reserved)
            .bind(actor_user_id)
            .execute(&mut *tx)
            .await
            .map_err(|error| database_error(error, "compensate_archived_outbound"))?;
            record_movement(
                &mut tx,
                sample.id,
                &sample.sample_code,
                "outbound_archived_compensation",
                on_hand_delta,
                reserved_delta,
                resulting_on_hand,
                resulting_reserved,
                "outbound_request",
                request.id,
                now,
                actor_user_id,
                json!({"archivedStatus": request.status}),
            )
            .await?;
        }
        sqlx::query(
            r#"
            UPDATE sample_inventory.outbound_requests
            SET archived_at = NOW(), archived_by = $2, updated_by = $2, version = version + 1
            WHERE id = $1 AND version = $3
            "#,
        )
        .bind(request.id)
        .bind(actor_user_id)
        .bind(request.version)
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error(error, "archive_outbound_batch_item"))?;
        record_business_event(
            &mut tx,
            "outbound_request",
            request.id,
            "outbound.archived",
            outbound_event_payload(&item, Some(&request.status)),
            now,
            actor_user_id,
        )
        .await?;
        archived.push(item);
    }
    let response = SampleInventoryBatchMutationResponse {
        updated_count: archived.len() as i64,
        items: archived,
    };
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_archive_outbound_batch"))?;
    Ok(response)
}
