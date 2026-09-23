use sqlx::{postgres::PgPoolOptions, Row};

use crate::sample_inventory::types::{
    BatchArchiveSampleInventoryOutboundRequest, BatchEditSampleInventoryOutboundItem,
    BatchEditSampleInventoryOutboundRequest, BatchVoidSampleInventoryInboundsRequest,
    SampleInventoryVersionTarget, TransitionSampleInventoryOutboundRequest,
    UpdateSampleInventoryOutboundTrackingRequest,
};

use super::{
    archive_outbound_batch, edit_outbound_batch, transition_outbound, update_outbound_tracking,
    void_inbound_batch,
};

const TRANSACTION_SCHEMA: &str =
    include_str!("../../../../sql/migrations/014_sample_inventory_transaction_schema.sql");
const PUBLIC_UX_SCHEMA: &str =
    include_str!("../../../../sql/migrations/015_sample_inventory_public_ux_support.sql");
const MANUAL_RESERVATION_SCHEMA: &str = include_str!(
    "../../../../sql/migrations/016_sample_inventory_manual_reservation_semantics.sql"
);
const APPROVAL_STOCK_SCHEMA: &str =
    include_str!("../../../../sql/migrations/017_sample_inventory_approval_stock_deduction.sql");
const ACTOR: &str = "legacy-operations-fixture";

fn transition_request(
    submission_key: &str,
    expected_version: i64,
    target_status: &str,
) -> TransitionSampleInventoryOutboundRequest {
    TransitionSampleInventoryOutboundRequest {
        submission_key: submission_key.to_string(),
        expected_version,
        target_status: target_status.to_string(),
    }
}

#[tokio::test]
#[ignore = "run through backend-rust/scripts/test-sample-inventory-postgres.sh"]
async fn sample_inventory_legacy_operations_postgres_contract() {
    let database_url = std::env::var("SAMPLE_INVENTORY_TEST_DATABASE_URL")
        .expect("SAMPLE_INVENTORY_TEST_DATABASE_URL must target a disposable database");
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&database_url)
        .await
        .expect("connect disposable PostgreSQL fixture");
    sqlx::raw_sql(TRANSACTION_SCHEMA)
        .execute(&pool)
        .await
        .expect("apply sample inventory transaction schema");
    sqlx::raw_sql(PUBLIC_UX_SCHEMA)
        .execute(&pool)
        .await
        .expect("apply sample inventory public UX schema");
    sqlx::raw_sql(MANUAL_RESERVATION_SCHEMA)
        .execute(&pool)
        .await
        .expect("apply sample inventory manual reservation schema");
    sqlx::raw_sql(APPROVAL_STOCK_SCHEMA)
        .execute(&pool)
        .await
        .expect("apply sample inventory approval stock schema");

    let sample_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES ('LEGACY-OPS', 'Legacy operations fixture', 10, 2, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert legacy operations sample");

    let legacy_inbound_sample_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES ('LEGACY-INBOUND', 'Legacy inbound fixture', 10, 0, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert legacy inbound sample");

    let legacy_inbound_ids = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO sample_inventory.inbound_records (
          sample_id,
          quantity,
          operator_name,
          occurred_at,
          time_quality,
          source_kind,
          source_record_id,
          created_by
        )
        VALUES
          ($1, 2, 'legacy operator', '2026-07-20T08:00:00Z', 'legacy_local_minute',
           'fixture', 'legacy-inbound-1', $2),
          ($1, 3, 'legacy operator', '2026-07-21T08:00:00Z', 'legacy_local_minute',
           'fixture', 'legacy-inbound-2', $2)
        RETURNING id
        "#,
    )
    .bind(legacy_inbound_sample_id)
    .bind(ACTOR)
    .fetch_all(&pool)
    .await
    .expect("insert legacy inbound records");

    let deleted_legacy_inbounds = void_inbound_batch(
        &pool,
        BatchVoidSampleInventoryInboundsRequest {
            submission_key: "legacy-inbound-batch-delete".to_string(),
            items: legacy_inbound_ids
                .iter()
                .map(|id| SampleInventoryVersionTarget {
                    id: *id,
                    expected_version: 1,
                })
                .collect(),
            reason: "fixture legacy inbound delete".to_string(),
        },
        ACTOR,
    )
    .await
    .expect("delete legacy inbound records");
    assert_eq!(deleted_legacy_inbounds.updated_count, 2);
    assert!(deleted_legacy_inbounds
        .items
        .iter()
        .all(|item| item.voided_at.is_some()));

    let legacy_inbound_balance = sqlx::query(
        "SELECT on_hand_quantity, reserved_quantity FROM sample_inventory.samples WHERE id = $1",
    )
    .bind(legacy_inbound_sample_id)
    .fetch_one(&pool)
    .await
    .expect("read legacy inbound balance");
    assert_eq!(legacy_inbound_balance.get::<i32, _>("on_hand_quantity"), 5);
    assert_eq!(legacy_inbound_balance.get::<i32, _>("reserved_quantity"), 0);

    let legacy_inbound_source_ids = legacy_inbound_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    let legacy_inbound_audit = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM sample_inventory.inventory_movements
           WHERE source_type = 'inbound_record' AND source_id = ANY($1)) AS movements,
          (SELECT COUNT(*) FROM sample_inventory.business_events
           WHERE aggregate_type = 'inbound_record' AND aggregate_id = ANY($1)) AS events,
          (SELECT COUNT(*) FROM sample_inventory.inbound_records
           WHERE id = ANY($2) AND voided_at IS NOT NULL) AS deleted
        "#,
    )
    .bind(&legacy_inbound_source_ids)
    .bind(&legacy_inbound_ids)
    .fetch_one(&pool)
    .await
    .expect("read legacy inbound delete audit evidence");
    assert_eq!(legacy_inbound_audit.get::<i64, _>("movements"), 2);
    assert_eq!(legacy_inbound_audit.get::<i64, _>("events"), 2);
    assert_eq!(legacy_inbound_audit.get::<i64, _>("deleted"), 2);

    let request_ids = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO sample_inventory.outbound_requests (
          sample_id,
          quantity,
          applicant,
          department,
          purpose,
          receiver,
          shipping_address,
          status,
          requested_at,
          time_quality,
          source_kind,
          source_record_id,
          created_by,
          updated_by
        )
        VALUES
          ($1, 3, 'legacy applicant 1', 'legacy department', 'legacy purpose', NULL, NULL,
           'sampled', '2026-07-20T08:00:00Z', 'legacy_request_only', 'fixture', 'legacy-1', $2, $2),
          ($1, 2, 'legacy applicant 2', 'legacy department', 'legacy purpose', NULL, NULL,
           'sampled', '2026-07-21T08:00:00Z', 'legacy_request_only', 'fixture', 'legacy-2', $2, $2)
        RETURNING id
        "#,
    )
    .bind(sample_id)
    .bind(ACTOR)
    .fetch_all(&pool)
    .await
    .expect("insert legacy sampled requests");
    let mutable_id = request_ids[0];
    let archived_id = request_ids[1];

    let tracked = update_outbound_tracking(
        &pool,
        mutable_id,
        UpdateSampleInventoryOutboundTrackingRequest {
            submission_key: "legacy-tracking".to_string(),
            expected_version: 1,
            tracking_number: Some("LEGACY-TRACKING".to_string()),
        },
        ACTOR,
    )
    .await
    .expect("update legacy tracking");
    let approved = transition_outbound(
        &pool,
        mutable_id,
        transition_request("legacy-to-approved", tracked.version, "approved"),
        "approved",
        ACTOR,
    )
    .await
    .expect("return legacy sampled request to approved");
    let pending = transition_outbound(
        &pool,
        mutable_id,
        transition_request("legacy-to-pending", approved.version, "pending"),
        "pending",
        ACTOR,
    )
    .await
    .expect("return legacy approved request to pending");

    let edited = edit_outbound_batch(
        &pool,
        BatchEditSampleInventoryOutboundRequest {
            submission_key: "legacy-batch-edit".to_string(),
            items: vec![BatchEditSampleInventoryOutboundItem {
                id: mutable_id,
                expected_version: pending.version,
                applicant: Some("updated applicant".to_string()),
                department: None,
                purpose: None,
                receiver: Some("updated receiver".to_string()),
                shipping_address: Some("updated address".to_string()),
                tracking_number: None,
            }],
        },
        ACTOR,
    )
    .await
    .expect("batch edit legacy pending request");
    assert_eq!(edited.items[0].applicant, "updated applicant");
    assert_eq!(
        edited.items[0].receiver.as_deref(),
        Some("updated receiver")
    );
    assert_eq!(
        edited.items[0].shipping_address.as_deref(),
        Some("updated address")
    );
    assert_eq!(edited.items[0].time_quality, "legacy_request_only");

    archive_outbound_batch(
        &pool,
        BatchArchiveSampleInventoryOutboundRequest {
            submission_key: "legacy-archive".to_string(),
            items: vec![SampleInventoryVersionTarget {
                id: archived_id,
                expected_version: 1,
            }],
        },
        ACTOR,
    )
    .await
    .expect("archive legacy sampled request");

    let balance = sqlx::query(
        "SELECT on_hand_quantity, reserved_quantity FROM sample_inventory.samples WHERE id = $1",
    )
    .bind(sample_id)
    .fetch_one(&pool)
    .await
    .expect("read resulting sample balance");
    assert_eq!(balance.get::<i32, _>("on_hand_quantity"), 15);
    assert_eq!(balance.get::<i32, _>("reserved_quantity"), 2);

    let audit = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM sample_inventory.inventory_movements
           WHERE source_type = 'outbound_request') AS movements,
          (SELECT COUNT(*) FROM sample_inventory.business_events
           WHERE aggregate_type = 'outbound_request') AS events,
          (SELECT archived_at IS NOT NULL FROM sample_inventory.outbound_requests
           WHERE id = $1) AS archived
        "#,
    )
    .bind(archived_id)
    .fetch_one(&pool)
    .await
    .expect("read legacy operation audit evidence");
    assert_eq!(audit.get::<i64, _>("movements"), 2);
    assert_eq!(audit.get::<i64, _>("events"), 5);
    assert!(audit.get::<bool, _>("archived"));

    let batch_outbound_sample_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES ('BATCH-OUTBOUND', 'Batch outbound delete fixture', 20, 5, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert batch outbound sample");
    let batch_outbound_ids = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO sample_inventory.outbound_requests (
          sample_id,
          quantity,
          applicant,
          department,
          purpose,
          status,
          requested_at,
          time_quality,
          created_by,
          updated_by
        )
        VALUES
          ($1, 4, 'batch applicant 1', 'batch department', 'batch purpose',
           'sampled', NOW(), 'known', $2, $2),
          ($1, 6, 'batch applicant 2', 'batch department', 'batch purpose',
           'sampled', NOW(), 'known', $2, $2),
          ($1, 7, 'batch applicant 3', 'batch department', 'batch purpose',
           'approved', NOW(), 'known', $2, $2)
        RETURNING id
        "#,
    )
    .bind(batch_outbound_sample_id)
    .bind(ACTOR)
    .fetch_all(&pool)
    .await
    .expect("insert batch sampled outbound records");
    let batch_archived = archive_outbound_batch(
        &pool,
        BatchArchiveSampleInventoryOutboundRequest {
            submission_key: "batch-outbound-delete".to_string(),
            items: batch_outbound_ids
                .iter()
                .map(|id| SampleInventoryVersionTarget {
                    id: *id,
                    expected_version: 1,
                })
                .collect(),
        },
        ACTOR,
    )
    .await
    .expect("batch delete sampled outbound records");
    assert_eq!(batch_archived.updated_count, 3);
    let batch_outbound_balance = sqlx::query(
        "SELECT on_hand_quantity, reserved_quantity FROM sample_inventory.samples WHERE id = $1",
    )
    .bind(batch_outbound_sample_id)
    .fetch_one(&pool)
    .await
    .expect("read batch outbound balance");
    assert_eq!(batch_outbound_balance.get::<i32, _>("on_hand_quantity"), 37);
    assert_eq!(batch_outbound_balance.get::<i32, _>("reserved_quantity"), 5);
    let batch_compensation_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sample_inventory.inventory_movements WHERE sample_id = $1 AND movement_type = 'outbound_archived_compensation'",
    )
    .bind(batch_outbound_sample_id)
    .fetch_one(&pool)
    .await
    .expect("count debited outbound archive compensations");
    assert_eq!(batch_compensation_count, 3);

    let protected_sample_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code, sample_name, on_hand_quantity, reserved_quantity, created_by, updated_by
        )
        VALUES ('MANUAL-RESERVE-GUARD', 'Manual reservation guard fixture', 5, 4, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert manual reservation guard sample");
    let protected_outbound_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.outbound_requests (
          sample_id, quantity, applicant, department, purpose, status, requested_at,
          time_quality, created_by, updated_by
        )
        VALUES ($1, 2, 'guard applicant', 'guard department', 'guard purpose',
          'pending', NOW(), 'known', $2, $2)
        RETURNING id
        "#,
    )
    .bind(protected_sample_id)
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert manual reservation guard outbound");
    transition_outbound(
        &pool,
        protected_outbound_id,
        transition_request("manual-reserve-guard", 1, "approved"),
        "approved",
        ACTOR,
    )
    .await
    .expect_err("approval cannot reduce stock below a manual reservation");
    let protected_state = sqlx::query(
        r#"
        SELECT sample.on_hand_quantity, sample.reserved_quantity, outbound.status
        FROM sample_inventory.samples AS sample
        JOIN sample_inventory.outbound_requests AS outbound ON outbound.sample_id = sample.id
        WHERE sample.id = $1 AND outbound.id = $2
        "#,
    )
    .bind(protected_sample_id)
    .bind(protected_outbound_id)
    .fetch_one(&pool)
    .await
    .expect("read rolled-back reservation guard state");
    assert_eq!(protected_state.get::<i32, _>("on_hand_quantity"), 5);
    assert_eq!(protected_state.get::<i32, _>("reserved_quantity"), 4);
    assert_eq!(protected_state.get::<String, _>("status"), "pending");

    let rollback_sample_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES ('BATCH-ROLLBACK', 'Batch inbound rollback fixture', 12, 0, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert batch rollback sample");
    let rollback_inbound_ids = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO sample_inventory.inbound_records (
          sample_id,
          quantity,
          occurred_at,
          time_quality,
          created_by
        )
        VALUES
          ($1, 2, NOW(), 'known', $2),
          ($1, 3, NOW(), 'known', $2)
        RETURNING id
        "#,
    )
    .bind(rollback_sample_id)
    .bind(ACTOR)
    .fetch_all(&pool)
    .await
    .expect("insert rollback inbound records");
    void_inbound_batch(
        &pool,
        BatchVoidSampleInventoryInboundsRequest {
            submission_key: "batch-inbound-rollback".to_string(),
            items: vec![
                SampleInventoryVersionTarget {
                    id: rollback_inbound_ids[0],
                    expected_version: 1,
                },
                SampleInventoryVersionTarget {
                    id: rollback_inbound_ids[1],
                    expected_version: 2,
                },
            ],
            reason: "fixture rollback proof".to_string(),
        },
        ACTOR,
    )
    .await
    .expect_err("stale batch item must roll back the whole inbound delete");
    let rollback_balance: i32 =
        sqlx::query_scalar("SELECT on_hand_quantity FROM sample_inventory.samples WHERE id = $1")
            .bind(rollback_sample_id)
            .fetch_one(&pool)
            .await
            .expect("read rollback sample balance");
    let rollback_voided_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sample_inventory.inbound_records WHERE id = ANY($1) AND voided_at IS NOT NULL",
    )
    .bind(&rollback_inbound_ids)
    .fetch_one(&pool)
    .await
    .expect("read rollback inbound records");
    assert_eq!(rollback_balance, 12);
    assert_eq!(rollback_voided_count, 0);
}
