use serde_json::json;
use sqlx::{postgres::PgPoolOptions, Row};

use crate::error::AppError;

use super::idempotency::{
    claim_mutation, complete_mutation, replay_response, request_sha256, MutationClaim,
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

#[tokio::test]
#[ignore = "run through backend-rust/scripts/test-sample-inventory-postgres.sh"]
async fn sample_inventory_idempotency_postgres_contract() {
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

    let request_sha = request_sha256(&json!({"sampleId": 7, "expectedVersion": 3}))
        .expect("hash fixture request");
    let expected_response = json!({"id": 7, "version": 4});

    let mut first_tx = pool.begin().await.expect("begin first mutation");
    let mutation_id = match claim_mutation(
        &mut first_tx,
        "fixture.update",
        "fixture-request-0001",
        &request_sha,
        "fixture-actor",
    )
    .await
    .expect("claim first mutation")
    {
        MutationClaim::New(id) => id,
        MutationClaim::Replay(_) => panic!("first mutation cannot replay"),
    };
    complete_mutation(&mut first_tx, mutation_id, &expected_response)
        .await
        .expect("complete first mutation");
    first_tx.commit().await.expect("commit first mutation");

    let mut replay_tx = pool.begin().await.expect("begin replay mutation");
    let replay = match claim_mutation(
        &mut replay_tx,
        "fixture.update",
        "fixture-request-0001",
        &request_sha,
        "fixture-actor",
    )
    .await
    .expect("claim exact replay")
    {
        MutationClaim::Replay(response) => {
            replay_response::<serde_json::Value>(response).expect("decode replay response")
        }
        MutationClaim::New(_) => panic!("exact replay cannot create a second mutation"),
    };
    replay_tx.commit().await.expect("commit replay transaction");
    assert_eq!(replay, expected_response);

    let mut collision_tx = pool.begin().await.expect("begin collision mutation");
    let collision_sha = request_sha256(&json!({"sampleId": 7, "expectedVersion": 4}))
        .expect("hash collision request");
    assert!(matches!(
        claim_mutation(
            &mut collision_tx,
            "fixture.update",
            "fixture-request-0001",
            &collision_sha,
            "fixture-actor",
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    collision_tx.rollback().await.expect("rollback collision");

    let mut failure_tx = pool.begin().await.expect("begin failure mutation");
    assert!(matches!(
        claim_mutation(
            &mut failure_tx,
            "fixture.create",
            "fixture-request-rollback",
            &request_sha,
            "fixture-actor",
        )
        .await
        .expect("claim rollback mutation"),
        MutationClaim::New(_)
    ));
    let insert_error = sqlx::query(
        r#"
        INSERT INTO sample_inventory.samples (
          sample_code,
          sample_name,
          on_hand_quantity,
          reserved_quantity,
          created_by,
          updated_by
        )
        VALUES ('ROLLBACK-FIXTURE', 'Rollback fixture', -1, 0, 'fixture-actor', 'fixture-actor')
        "#,
    )
    .execute(&mut *failure_tx)
    .await;
    assert!(insert_error.is_err());
    failure_tx
        .rollback()
        .await
        .expect("rollback failed domain write");

    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE operation = 'fixture.update') AS completed_count,
          COUNT(*) FILTER (WHERE operation = 'fixture.create') AS rolled_back_count
        FROM sample_inventory.mutation_requests
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("count mutation ledger rows");
    assert_eq!(row.get::<i64, _>("completed_count"), 1);
    assert_eq!(row.get::<i64, _>("rolled_back_count"), 0);
}
