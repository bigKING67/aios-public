use sqlx::{PgPool, Row};

use crate::sample_inventory::types::{
    CreateSampleInventoryOutboundItem, CreateSampleInventoryOutboundRequest,
    RestoreSampleInventoryBackupRequest, SampleInventoryBackupFile,
    SampleInventoryBackupPlanResponse, TransitionSampleInventoryOutboundRequest,
};

use super::export_backup;

const TRANSACTION_SCHEMA: &str =
    include_str!("../../../../sql/migrations/014_sample_inventory_transaction_schema.sql");
const PUBLIC_UX_SCHEMA: &str =
    include_str!("../../../../sql/migrations/015_sample_inventory_public_ux_support.sql");
const MANUAL_RESERVATION_SCHEMA: &str = include_str!(
    "../../../../sql/migrations/016_sample_inventory_manual_reservation_semantics.sql"
);
const APPROVAL_STOCK_SCHEMA: &str =
    include_str!("../../../../sql/migrations/017_sample_inventory_approval_stock_deduction.sql");
pub(super) const ACTOR: &str = "fixture-user";

pub(super) async fn apply_schema(pool: &PgPool) {
    sqlx::raw_sql(TRANSACTION_SCHEMA)
        .execute(pool)
        .await
        .expect("apply sample inventory transaction schema");
    sqlx::raw_sql(PUBLIC_UX_SCHEMA)
        .execute(pool)
        .await
        .expect("apply sample inventory public UX schema");
    sqlx::raw_sql(MANUAL_RESERVATION_SCHEMA)
        .execute(pool)
        .await
        .expect("apply sample inventory manual reservation schema");
    sqlx::raw_sql(APPROVAL_STOCK_SCHEMA)
        .execute(pool)
        .await
        .expect("apply sample inventory approval stock schema");
}

pub(super) fn outbound_item(
    sample_id: i64,
    quantity: i32,
    label: &str,
) -> CreateSampleInventoryOutboundItem {
    CreateSampleInventoryOutboundItem {
        sample_id,
        quantity,
        applicant: format!("fixture-{label}"),
        department: "fixture-department".to_string(),
        purpose: "fixture-purpose".to_string(),
        receiver: format!("fixture-receiver-{label}"),
        shipping_address: format!("fixture-address-{label}"),
        tracking_number: None,
        requested_at: None,
    }
}

pub(super) fn outbound_request(
    sample_id: i64,
    quantity: i32,
    label: &str,
) -> CreateSampleInventoryOutboundRequest {
    let item = outbound_item(sample_id, quantity, label);
    CreateSampleInventoryOutboundRequest {
        submission_key: format!("fixture-outbound-{label}"),
        sample_id: item.sample_id,
        quantity: item.quantity,
        applicant: item.applicant,
        department: item.department,
        purpose: item.purpose,
        receiver: item.receiver,
        shipping_address: item.shipping_address,
        tracking_number: item.tracking_number,
        requested_at: item.requested_at,
    }
}

pub(super) fn transition_request(
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

pub(super) fn restore_request(
    submission_key: &str,
    backup: SampleInventoryBackupFile,
    plan: &SampleInventoryBackupPlanResponse,
) -> RestoreSampleInventoryBackupRequest {
    RestoreSampleInventoryBackupRequest {
        submission_key: submission_key.to_string(),
        expected_backup_sha256: plan.backup_sha256.clone(),
        expected_current_state_sha256: plan.current_state_sha256.clone(),
        expected_plan_sha256: plan.plan_sha256.clone(),
        backup,
    }
}

pub(super) async fn state_sha(pool: &PgPool) -> String {
    export_backup(pool)
        .await
        .expect("export fixture backup")
        .state_sha256
}

pub(super) async fn audit_counts(pool: &PgPool) -> (i64, i64, i64) {
    let row = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM sample_inventory.inventory_movements) AS movements,
          (SELECT COUNT(*) FROM sample_inventory.business_events) AS events,
          (SELECT COUNT(*) FROM sample_inventory.mutation_requests) AS mutations
        "#,
    )
    .fetch_one(pool)
    .await
    .expect("count fixture audit rows");
    (
        row.get("movements"),
        row.get("events"),
        row.get("mutations"),
    )
}
