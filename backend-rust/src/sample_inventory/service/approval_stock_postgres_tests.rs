use sqlx::{postgres::PgPoolOptions, Row};

use crate::sample_inventory::types::{
    BatchTransitionSampleInventoryOutboundRequest, SampleInventoryVersionTarget,
};

use super::{
    backup_postgres_test_support::{apply_schema, outbound_request, transition_request, ACTOR},
    create_outbound, transition_outbound, transition_outbound_batch,
};

#[tokio::test]
#[ignore = "run through backend-rust/scripts/test-sample-inventory-postgres.sh"]
async fn sample_inventory_approval_stock_postgres_contract() {
    let database_url = std::env::var("SAMPLE_INVENTORY_TEST_DATABASE_URL")
        .expect("SAMPLE_INVENTORY_TEST_DATABASE_URL must target a disposable database");
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&database_url)
        .await
        .expect("connect disposable PostgreSQL fixture");
    apply_schema(&pool).await;

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
        VALUES ('APPROVAL-RUNTIME', 'Approval runtime fixture', 10, 2, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_one(&pool)
    .await
    .expect("insert approval runtime sample");

    let pending = create_outbound(
        &pool,
        outbound_request(sample_id, 3, "approval-runtime"),
        ACTOR,
    )
    .await
    .expect("create pending approval runtime outbound");
    let approved = transition_outbound(
        &pool,
        pending.id,
        transition_request("approval-runtime-approve", pending.version, "approved"),
        "approved",
        ACTOR,
    )
    .await
    .expect("approve outbound and deduct stock");
    assert_eq!(approved.status, "approved");

    let after_approval = sqlx::query(
        r#"
        SELECT on_hand_quantity, reserved_quantity, available_quantity, version
        FROM sample_inventory.samples
        WHERE id = $1
        "#,
    )
    .bind(sample_id)
    .fetch_one(&pool)
    .await
    .expect("read approval-time balance");
    assert_eq!(after_approval.get::<i32, _>("on_hand_quantity"), 7);
    assert_eq!(after_approval.get::<i32, _>("reserved_quantity"), 2);
    assert_eq!(after_approval.get::<i32, _>("available_quantity"), 5);
    assert_eq!(after_approval.get::<i64, _>("version"), 2);

    let replayed = transition_outbound(
        &pool,
        pending.id,
        transition_request("approval-runtime-approve", pending.version, "approved"),
        "approved",
        ACTOR,
    )
    .await
    .expect("replay approval transition");
    assert_eq!(replayed.id, approved.id);
    assert_eq!(replayed.version, approved.version);
    assert_eq!(replayed.status, approved.status);

    let sampled = transition_outbound(
        &pool,
        approved.id,
        transition_request("approval-runtime-sample", approved.version, "sampled"),
        "sampled",
        ACTOR,
    )
    .await
    .expect("confirm sample without another stock deduction");
    let returned_to_approved = transition_outbound(
        &pool,
        sampled.id,
        transition_request(
            "approval-runtime-return-approved",
            sampled.version,
            "approved",
        ),
        "approved",
        ACTOR,
    )
    .await
    .expect("return sampled outbound to approved without stock change");
    let rejected = transition_outbound(
        &pool,
        returned_to_approved.id,
        transition_request(
            "approval-runtime-reject",
            returned_to_approved.version,
            "rejected",
        ),
        "rejected",
        ACTOR,
    )
    .await
    .expect("leave debited status set and restore stock");
    assert_eq!(rejected.status, "rejected");

    let after_reversal = sqlx::query(
        r#"
        SELECT on_hand_quantity, reserved_quantity, available_quantity, version
        FROM sample_inventory.samples
        WHERE id = $1
        "#,
    )
    .bind(sample_id)
    .fetch_one(&pool)
    .await
    .expect("read reversed approval balance");
    assert_eq!(after_reversal.get::<i32, _>("on_hand_quantity"), 10);
    assert_eq!(after_reversal.get::<i32, _>("reserved_quantity"), 2);
    assert_eq!(after_reversal.get::<i32, _>("available_quantity"), 8);
    assert_eq!(after_reversal.get::<i64, _>("version"), 3);

    let movements = sqlx::query(
        r#"
        SELECT movement_type, on_hand_delta, reserved_delta
        FROM sample_inventory.inventory_movements
        WHERE source_type = 'outbound_request' AND source_id = $1
        ORDER BY id
        "#,
    )
    .bind(pending.id.to_string())
    .fetch_all(&pool)
    .await
    .expect("read approval runtime movements");
    assert_eq!(movements.len(), 2);
    assert_eq!(
        movements[0].get::<String, _>("movement_type"),
        "outbound_pending_to_approved"
    );
    assert_eq!(movements[0].get::<i32, _>("on_hand_delta"), -3);
    assert_eq!(movements[0].get::<i32, _>("reserved_delta"), 0);
    assert_eq!(
        movements[1].get::<String, _>("movement_type"),
        "outbound_approved_to_rejected"
    );
    assert_eq!(movements[1].get::<i32, _>("on_hand_delta"), 3);
    assert_eq!(movements[1].get::<i32, _>("reserved_delta"), 0);

    let sample_ids = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES
          ('APPROVAL-BATCH-SAFE', 'Safe approval batch fixture', 10, 0, $1, $1),
          ('APPROVAL-BATCH-BLOCKED', 'Blocked approval batch fixture', 5, 4, $1, $1)
        RETURNING id
        "#,
    )
    .bind(ACTOR)
    .fetch_all(&pool)
    .await
    .expect("insert approval batch samples");
    let outbound_ids = sqlx::query_scalar::<_, i64>(
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
          ($1, 2, 'safe applicant', 'fixture department', 'fixture purpose',
           'pending', NOW(), 'known', $3, $3),
          ($2, 2, 'blocked applicant', 'fixture department', 'fixture purpose',
           'pending', NOW(), 'known', $3, $3)
        RETURNING id
        "#,
    )
    .bind(sample_ids[0])
    .bind(sample_ids[1])
    .bind(ACTOR)
    .fetch_all(&pool)
    .await
    .expect("insert approval batch outbounds");

    transition_outbound_batch(
        &pool,
        BatchTransitionSampleInventoryOutboundRequest {
            submission_key: "approval-batch-rollback".to_string(),
            items: outbound_ids
                .iter()
                .map(|id| SampleInventoryVersionTarget {
                    id: *id,
                    expected_version: 1,
                })
                .collect(),
            target_status: "approved".to_string(),
        },
        ACTOR,
    )
    .await
    .expect_err("one insufficient sample must roll back the full approval batch");

    let batch_samples = sqlx::query(
        r#"
        SELECT sample_code, on_hand_quantity, reserved_quantity, version
        FROM sample_inventory.samples
        WHERE id = ANY($1)
        ORDER BY id
        "#,
    )
    .bind(&sample_ids)
    .fetch_all(&pool)
    .await
    .expect("read rolled-back batch samples");
    assert_eq!(batch_samples[0].get::<i32, _>("on_hand_quantity"), 10);
    assert_eq!(batch_samples[0].get::<i32, _>("reserved_quantity"), 0);
    assert_eq!(batch_samples[0].get::<i64, _>("version"), 1);
    assert_eq!(batch_samples[1].get::<i32, _>("on_hand_quantity"), 5);
    assert_eq!(batch_samples[1].get::<i32, _>("reserved_quantity"), 4);
    assert_eq!(batch_samples[1].get::<i64, _>("version"), 1);

    let approved_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sample_inventory.outbound_requests WHERE id = ANY($1) AND status = 'approved'",
    )
    .bind(&outbound_ids)
    .fetch_one(&pool)
    .await
    .expect("count rolled-back approval batch statuses");
    let batch_movement_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sample_inventory.inventory_movements WHERE source_type = 'outbound_request' AND source_id = ANY($1)",
    )
    .bind(
        outbound_ids
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
    )
    .fetch_one(&pool)
    .await
    .expect("count rolled-back approval batch movements");
    let batch_mutation_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sample_inventory.mutation_requests WHERE operation = 'outbound.transition_batch' AND submission_key = 'approval-batch-rollback'",
    )
    .fetch_one(&pool)
    .await
    .expect("count rolled-back approval batch mutation claims");
    assert_eq!(approved_count, 0);
    assert_eq!(batch_movement_count, 0);
    assert_eq!(batch_mutation_count, 0);
}
