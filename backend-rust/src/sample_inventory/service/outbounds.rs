use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::error::{AppError, AppResult};

use super::events::{database_error, lock_sample, record_business_event, record_movement};
use super::idempotency::{
    claim_mutation, complete_mutation, normalize_submission_key, replay_response, request_sha256,
    MutationClaim,
};
use crate::sample_inventory::{
    repository::get_outbound_in_tx,
    types::{
        CreateSampleInventoryOutboundItem, CreateSampleInventoryOutboundRequest,
        SampleInventoryOutboundItem, TransitionSampleInventoryOutboundRequest,
        UpdateSampleInventoryOutboundRequest, UpdateSampleInventoryOutboundTrackingRequest,
    },
    validation::{parse_timestamp, transition_deltas},
};

#[derive(Debug, Clone)]
pub(super) struct LockedOutbound {
    pub(super) id: i64,
    pub(super) sample_id: i64,
    pub(super) quantity: i32,
    pub(super) status: String,
    pub(super) time_quality: String,
    pub(super) version: i64,
}

fn requested_time(value: Option<&str>) -> AppResult<DateTime<Utc>> {
    value
        .map(|text| parse_timestamp(text, "申请时间"))
        .transpose()
        .map(|value| value.unwrap_or_else(Utc::now))
}

fn outbound_from_locked_row(row: &sqlx::postgres::PgRow) -> Result<LockedOutbound, sqlx::Error> {
    Ok(LockedOutbound {
        id: row.try_get("id")?,
        sample_id: row.try_get("sample_id")?,
        quantity: row.try_get("quantity")?,
        status: row.try_get("status")?,
        time_quality: row.try_get("time_quality")?,
        version: row.try_get("version")?,
    })
}

pub(super) async fn lock_outbound(
    tx: &mut Transaction<'_, Postgres>,
    request_id: i64,
) -> AppResult<LockedOutbound> {
    let row = sqlx::query(
        r#"
        SELECT
          outbound.id,
          outbound.sample_id,
          outbound.quantity,
          outbound.status,
          outbound.time_quality,
          outbound.version
        FROM sample_inventory.outbound_requests AS outbound
        JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
        WHERE outbound.id = $1 AND outbound.archived_at IS NULL
        FOR UPDATE OF outbound
        "#,
    )
    .bind(request_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "lock_outbound"))?
    .ok_or(AppError::NotFound)?;
    outbound_from_locked_row(&row).map_err(|error| database_error(error, "map_locked_outbound"))
}

pub(super) async fn lock_outbound_ids(
    tx: &mut Transaction<'_, Postgres>,
    ids: &[i64],
) -> AppResult<Vec<LockedOutbound>> {
    let mut stable_ids = ids.to_vec();
    stable_ids.sort_unstable();
    stable_ids.dedup();
    let rows = sqlx::query(
        r#"
        SELECT
          outbound.id,
          outbound.sample_id,
          outbound.quantity,
          outbound.status,
          outbound.time_quality,
          outbound.version
        FROM sample_inventory.outbound_requests AS outbound
        JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
        WHERE outbound.id = ANY($1) AND outbound.archived_at IS NULL
        ORDER BY outbound.id
        FOR UPDATE OF outbound
        "#,
    )
    .bind(&stable_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "lock_outbound_ids"))?;
    if rows.len() != stable_ids.len() {
        return Err(AppError::bad_request(
            "批量操作包含不存在或已归档的出库申请",
        ));
    }
    rows.iter()
        .map(outbound_from_locked_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| database_error(error, "map_locked_outbounds"))
}

pub(super) fn outbound_event_payload(
    item: &SampleInventoryOutboundItem,
    from_status: Option<&str>,
) -> Value {
    json!({
        "requestId": item.id,
        "sampleId": item.sample_id,
        "sampleCode": item.sample_code,
        "fromStatus": from_status,
        "toStatus": item.status,
        "quantity": item.quantity,
        "department": item.department,
        "applicant": item.applicant,
        "requestedAt": item.requested_at,
        "approvedAt": item.approved_at,
        "sampledAt": item.sampled_at,
        "rejectedAt": item.rejected_at,
        "timeQuality": item.time_quality,
    })
}

pub(super) fn can_archive_outbound(status: &str, _time_quality: &str) -> bool {
    matches!(status, "pending" | "approved" | "sampled" | "rejected")
}

pub(super) async fn create_outbound_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: &CreateSampleInventoryOutboundItem,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    let sample = lock_sample(tx, input.sample_id).await?;
    let requested_at = requested_time(input.requested_at.as_deref())?;
    let request_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.outbound_requests (
          sample_id,
          quantity,
          applicant,
          department,
          purpose,
          receiver,
          shipping_address,
          tracking_number,
          status,
          requested_at,
          time_quality,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, 'known', $10, $10)
        RETURNING id
        "#,
    )
    .bind(input.sample_id)
    .bind(input.quantity)
    .bind(&input.applicant)
    .bind(&input.department)
    .bind(&input.purpose)
    .bind(&input.receiver)
    .bind(&input.shipping_address)
    .bind(input.tracking_number.as_deref())
    .bind(requested_at)
    .bind(actor_user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "insert_outbound"))?;
    let item = get_outbound_in_tx(tx, request_id).await?;
    record_business_event(
        tx,
        "outbound_request",
        request_id,
        "outbound.created",
        outbound_event_payload(&item, None),
        requested_at,
        actor_user_id,
    )
    .await?;
    record_business_event(
        tx,
        "sample",
        sample.id,
        "sample.outbound_requested",
        json!({
            "requestId": request_id,
            "sampleId": sample.id,
            "sampleCode": sample.sample_code,
            "quantity": input.quantity,
        }),
        requested_at,
        actor_user_id,
    )
    .await?;
    Ok(item)
}

pub(crate) async fn create_outbound(
    pool: &PgPool,
    mut input: CreateSampleInventoryOutboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&input)?;
    let item_input = CreateSampleInventoryOutboundItem {
        sample_id: input.sample_id,
        quantity: input.quantity,
        applicant: input.applicant,
        department: input.department,
        purpose: input.purpose,
        receiver: input.receiver,
        shipping_address: input.shipping_address,
        tracking_number: input.tracking_number,
        requested_at: input.requested_at,
    };
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_create_outbound"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.create",
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
                .map_err(|error| database_error(error, "commit_replay_create_outbound"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let item = create_outbound_in_tx(&mut tx, &item_input, actor_user_id).await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_create_outbound"))?;
    Ok(item)
}

pub(crate) async fn update_outbound(
    pool: &PgPool,
    request_id: i64,
    mut input: UpdateSampleInventoryOutboundRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&json!({ "requestId": request_id, "input": &input }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_update_outbound"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.update",
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
                .map_err(|error| database_error(error, "commit_replay_update_outbound"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound(&mut tx, request_id).await?;
    if locked.version != input.expected_version {
        return Err(AppError::Conflict(
            "出库申请已变化，请刷新后重试".to_string(),
        ));
    }
    if !matches!(locked.status.as_str(), "pending" | "rejected") {
        return Err(AppError::bad_request("仅待审批或已驳回申请可以编辑"));
    }
    lock_sample(&mut tx, input.sample_id).await?;
    sqlx::query(
        r#"
        UPDATE sample_inventory.outbound_requests
        SET
          sample_id = $2,
          quantity = $3,
          applicant = $4,
          department = $5,
          purpose = $6,
          receiver = $7,
          shipping_address = $8,
          tracking_number = $9,
          updated_by = $10,
          version = version + 1
        WHERE id = $1 AND version = $11 AND archived_at IS NULL
        "#,
    )
    .bind(request_id)
    .bind(input.sample_id)
    .bind(input.quantity)
    .bind(&input.applicant)
    .bind(&input.department)
    .bind(&input.purpose)
    .bind(&input.receiver)
    .bind(&input.shipping_address)
    .bind(input.tracking_number.as_deref())
    .bind(actor_user_id)
    .bind(input.expected_version)
    .execute(&mut *tx)
    .await
    .map_err(|error| database_error(error, "update_outbound"))?;
    let item = get_outbound_in_tx(&mut tx, request_id).await?;
    record_business_event(
        &mut tx,
        "outbound_request",
        request_id,
        "outbound.updated",
        outbound_event_payload(&item, Some(&locked.status)),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_update_outbound"))?;
    Ok(item)
}

pub(super) async fn update_tracking_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    locked: &LockedOutbound,
    expected_version: i64,
    tracking_number: Option<&str>,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    if locked.version != expected_version {
        return Err(AppError::Conflict(format!(
            "出库申请 {} 已变化，请刷新后重试",
            locked.id
        )));
    }
    sqlx::query(
        r#"
        UPDATE sample_inventory.outbound_requests
        SET tracking_number = $2, updated_by = $3, version = version + 1
        WHERE id = $1 AND version = $4 AND archived_at IS NULL
        "#,
    )
    .bind(locked.id)
    .bind(tracking_number)
    .bind(actor_user_id)
    .bind(expected_version)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "update_outbound_tracking"))?;
    let item = get_outbound_in_tx(tx, locked.id).await?;
    record_business_event(
        tx,
        "outbound_request",
        locked.id,
        "outbound.tracking_updated",
        json!({
            "requestId": locked.id,
            "sampleId": locked.sample_id,
            "trackingNumber": tracking_number,
        }),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    Ok(item)
}

pub(crate) async fn update_outbound_tracking(
    pool: &PgPool,
    request_id: i64,
    mut input: UpdateSampleInventoryOutboundTrackingRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&json!({ "requestId": request_id, "input": &input }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_update_outbound_tracking"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.update_tracking",
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
                .map_err(|error| database_error(error, "commit_replay_outbound_tracking"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound(&mut tx, request_id).await?;
    let item = update_tracking_in_tx(
        &mut tx,
        &locked,
        input.expected_version,
        input.tracking_number.as_deref(),
        actor_user_id,
    )
    .await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_update_outbound_tracking"))?;
    Ok(item)
}

pub(super) async fn transition_locked_outbound(
    tx: &mut Transaction<'_, Postgres>,
    locked: &LockedOutbound,
    expected_version: i64,
    target_status: &str,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    if locked.version != expected_version {
        return Err(AppError::Conflict(format!(
            "出库申请 {} 已变化，请刷新后重试",
            locked.id
        )));
    }
    let (on_hand_delta, reserved_delta) =
        transition_deltas(&locked.status, target_status, locked.quantity)?;
    let sample = lock_sample(tx, locked.sample_id).await?;
    let resulting_on_hand = sample
        .on_hand_quantity
        .checked_add(on_hand_delta)
        .ok_or_else(|| AppError::bad_request("状态流转后的在手库存超出范围"))?;
    let resulting_reserved = sample
        .reserved_quantity
        .checked_add(reserved_delta)
        .ok_or_else(|| AppError::bad_request("状态流转后的预留库存超出范围"))?;
    if resulting_on_hand < 0 || resulting_reserved < 0 || resulting_reserved > resulting_on_hand {
        return Err(AppError::Conflict(
            "可用库存不足，无法完成状态流转".to_string(),
        ));
    }
    let now = Utc::now();
    sqlx::query(
        r#"
        UPDATE sample_inventory.outbound_requests
        SET
          status = $2,
          approved_at = CASE
            WHEN $2 = 'approved' THEN $3
            WHEN $2 IN ('pending', 'rejected') THEN NULL
            ELSE approved_at
          END,
          approved_by = CASE
            WHEN $2 = 'approved' THEN $4
            WHEN $2 IN ('pending', 'rejected') THEN NULL
            ELSE approved_by
          END,
          sampled_at = CASE WHEN $2 = 'sampled' THEN $3 ELSE NULL END,
          sampled_by = CASE WHEN $2 = 'sampled' THEN $4 ELSE NULL END,
          rejected_at = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
          rejected_by = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
          updated_by = $4,
          version = version + 1
        WHERE id = $1 AND version = $5
        "#,
    )
    .bind(locked.id)
    .bind(target_status)
    .bind(now)
    .bind(actor_user_id)
    .bind(expected_version)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "transition_outbound"))?;
    if on_hand_delta != 0 || reserved_delta != 0 {
        record_movement(
            tx,
            sample.id,
            &sample.sample_code,
            &format!("outbound_{}_to_{target_status}", locked.status),
            on_hand_delta,
            reserved_delta,
            resulting_on_hand,
            resulting_reserved,
            "outbound_request",
            locked.id,
            now,
            actor_user_id,
            json!({"fromStatus": locked.status, "toStatus": target_status}),
        )
        .await?;
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
        .execute(&mut **tx)
        .await
        .map_err(|error| database_error(error, "apply_outbound_stock_delta"))?;
    }
    let item = get_outbound_in_tx(tx, locked.id).await?;
    record_business_event(
        tx,
        "outbound_request",
        locked.id,
        "outbound.transitioned",
        outbound_event_payload(&item, Some(&locked.status)),
        now,
        actor_user_id,
    )
    .await?;
    Ok(item)
}

pub(crate) async fn transition_outbound(
    pool: &PgPool,
    request_id: i64,
    mut input: TransitionSampleInventoryOutboundRequest,
    target_status: &str,
    actor_user_id: &str,
) -> AppResult<SampleInventoryOutboundItem> {
    normalize_submission_key(&mut input.submission_key)?;
    let request_sha = request_sha256(&json!({
        "requestId": request_id,
        "input": &input,
        "normalizedTargetStatus": target_status,
    }))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_transition_outbound"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "outbound.transition",
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
                .map_err(|error| database_error(error, "commit_replay_transition_outbound"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let locked = lock_outbound(&mut tx, request_id).await?;
    let item = transition_locked_outbound(
        &mut tx,
        &locked,
        input.expected_version,
        target_status,
        actor_user_id,
    )
    .await?;
    complete_mutation(&mut tx, mutation_id, &item).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_transition_outbound"))?;
    Ok(item)
}

#[cfg(test)]
mod tests {
    use super::can_archive_outbound;

    #[test]
    fn archive_accepts_legacy_time_provenance() {
        assert!(can_archive_outbound("pending", "known"));
        assert!(can_archive_outbound("rejected", "known"));
        assert!(can_archive_outbound("approved", "known"));
        assert!(can_archive_outbound("sampled", "known"));
        assert!(can_archive_outbound("pending", "legacy_request_only"));
        assert!(can_archive_outbound("rejected", "legacy_request_only"));
        assert!(can_archive_outbound("approved", "legacy_request_only"));
        assert!(can_archive_outbound("sampled", "legacy_request_only"));
    }
}
