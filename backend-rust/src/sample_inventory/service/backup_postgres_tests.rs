use sqlx::{postgres::PgPoolOptions, Row};

use crate::{
    error::AppError,
    sample_inventory::types::{
        CreateSampleInventoryInboundBatchRequest, CreateSampleInventoryInboundItem,
        CreateSampleInventoryInboundRequest, CreateSampleInventoryOutboundBatchRequest,
        CreateSampleInventorySampleRequest, ParseSampleInventoryBackupRequest, SampleListQuery,
        UpdateSampleInventorySampleRequest, VoidSampleInventoryInboundRequest,
    },
};

use super::backup_postgres_test_support::{
    apply_schema, audit_counts, outbound_item, outbound_request, restore_request, state_sha,
    transition_request, ACTOR,
};
use super::{
    create_inbound, create_inbound_batch, create_outbound, create_outbound_batch, create_sample,
    export_backup, parse_backup, restore_backup, transition_outbound, update_sample, void_inbound,
};

#[tokio::test]
#[ignore = "run through backend-rust/scripts/test-sample-inventory-postgres.sh"]
async fn sample_inventory_backup_restore_postgres_contract() {
    let database_url = std::env::var("SAMPLE_INVENTORY_TEST_DATABASE_URL")
        .expect("SAMPLE_INVENTORY_TEST_DATABASE_URL must target a disposable database");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("connect disposable PostgreSQL fixture");
    apply_schema(&pool).await;

    let sample = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-sample-a".to_string(),
            sample_code: "FIXTURE-A".to_string(),
            sample_name: "Fixture sample A".to_string(),
            model: Some("Fixture model".to_string()),
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(50),
            reserved_quantity: Some(3),
        },
        ACTOR,
    )
    .await
    .expect("create fixture sample");
    assert_eq!(sample.on_hand_quantity, 50);
    assert_eq!(sample.reserved_quantity, 3);
    assert_eq!(sample.available_quantity, 47);

    let reservation_update = UpdateSampleInventorySampleRequest {
        submission_key: "fixture-update-sample-reservation".to_string(),
        expected_version: sample.version,
        sample_code: sample.sample_code.clone(),
        sample_name: sample.sample_name.clone(),
        model: sample.model.clone(),
        category: sample.category.clone(),
        location: Some("legacy-location".to_string()),
        remark: sample.remark.clone(),
        reserved_quantity: Some(5),
    };
    let sample = update_sample(&pool, sample.id, reservation_update.clone(), ACTOR)
        .await
        .expect("update fixture manual reservation");
    let audit_after_update = audit_counts(&pool).await;
    let replayed_sample = update_sample(&pool, sample.id, reservation_update, ACTOR)
        .await
        .expect("replay fixture manual reservation update");
    assert_eq!(replayed_sample.version, sample.version);
    assert_eq!(audit_counts(&pool).await, audit_after_update);
    assert_eq!(sample.reserved_quantity, 5);
    assert_eq!(sample.available_quantity, 45);

    let sample = update_sample(
        &pool,
        sample.id,
        UpdateSampleInventorySampleRequest {
            submission_key: "fixture-update-sample-without-reservation".to_string(),
            expected_version: sample.version,
            sample_code: sample.sample_code.clone(),
            sample_name: sample.sample_name.clone(),
            model: sample.model.clone(),
            category: sample.category.clone(),
            location: sample.location.clone(),
            remark: sample.remark.clone(),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("preserve omitted manual reservation");
    assert_eq!(sample.reserved_quantity, 5);
    let sample = update_sample(
        &pool,
        sample.id,
        UpdateSampleInventorySampleRequest {
            submission_key: "fixture-clear-sample-reservation".to_string(),
            expected_version: sample.version,
            sample_code: sample.sample_code.clone(),
            sample_name: sample.sample_name.clone(),
            model: sample.model.clone(),
            category: sample.category.clone(),
            location: sample.location.clone(),
            remark: sample.remark.clone(),
            reserved_quantity: Some(0),
        },
        ACTOR,
    )
    .await
    .expect("clear manual reservation");
    assert_eq!(sample.reserved_quantity, 0);
    assert!(matches!(
        update_sample(
            &pool,
            sample.id,
            UpdateSampleInventorySampleRequest {
                submission_key: "fixture-stale-sample-reservation".to_string(),
                expected_version: sample.version - 1,
                sample_code: sample.sample_code.clone(),
                sample_name: sample.sample_name.clone(),
                model: sample.model.clone(),
                category: sample.category.clone(),
                location: sample.location.clone(),
                remark: sample.remark.clone(),
                reserved_quantity: Some(2),
            },
            ACTOR,
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    let sample = update_sample(
        &pool,
        sample.id,
        UpdateSampleInventorySampleRequest {
            submission_key: "fixture-restore-sample-reservation".to_string(),
            expected_version: sample.version,
            sample_code: sample.sample_code.clone(),
            sample_name: sample.sample_name.clone(),
            model: sample.model.clone(),
            category: sample.category.clone(),
            location: sample.location.clone(),
            remark: sample.remark.clone(),
            reserved_quantity: Some(3),
        },
        ACTOR,
    )
    .await
    .expect("restore manual reservation for backup fixture");
    assert_eq!(sample.reserved_quantity, 3);
    let inbound = create_inbound(
        &pool,
        CreateSampleInventoryInboundRequest {
            submission_key: "fixture-create-inbound-a".to_string(),
            sample_id: sample.id,
            quantity: 5,
            tracking_number: None,
            remark: Some("fixture inbound".to_string()),
            operator_name: Some("fixture operator".to_string()),
            occurred_at: None,
        },
        ACTOR,
    )
    .await
    .expect("create fixture inbound");
    let zero_sample = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-sample-zero".to_string(),
            sample_code: "FIXTURE-ZERO".to_string(),
            sample_name: "Fixture zero stock".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(0),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create zero-stock fixture sample");
    let low_primary = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-low-primary".to_string(),
            sample_code: "FIXTURE-LOW-PRIMARY".to_string(),
            sample_name: "Fixture low primary".to_string(),
            model: Some("PRIMARY-MODEL".to_string()),
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(2),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create low-stock primary fixture sample");
    let low_gift = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-low-gift".to_string(),
            sample_code: "FIXTURE-LOW-GIFT".to_string(),
            sample_name: "Fixture low gift".to_string(),
            model: Some("   ".to_string()),
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(2),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create low-stock gift fixture sample");
    sqlx::query("UPDATE sample_inventory.samples SET model = '   ' WHERE id = $1")
        .bind(low_gift.id)
        .execute(&pool)
        .await
        .expect("persist whitespace-model gift fixture");
    let empty_model_gift = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-empty-model-gift".to_string(),
            sample_code: "FIXTURE-EMPTY-MODEL-GIFT".to_string(),
            sample_name: "Fixture empty-model gift".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(4),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create empty-model gift fixture sample");
    sqlx::query("UPDATE sample_inventory.samples SET model = '' WHERE id = $1")
        .bind(empty_model_gift.id)
        .execute(&pool)
        .await
        .expect("persist empty-model gift fixture");
    let blank_model_primary = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-blank-model-primary".to_string(),
            sample_code: "lihe".to_string(),
            sample_name: "Fixture blank-model primary".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(2),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create blank-model primary fixture sample");
    let blank_model_primary_two = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-blank-model-primary-two".to_string(),
            sample_code: "lihe2".to_string(),
            sample_name: "Fixture second blank-model primary".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(11),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create second blank-model primary fixture sample");
    let out_of_stock_query =
        crate::sample_inventory::validation::normalize_sample_query(SampleListQuery {
            stock_status: Some("out".to_string()),
            ..Default::default()
        })
        .expect("normalize stock filter");
    let out_of_stock =
        crate::sample_inventory::repository::list_samples(&pool, &out_of_stock_query)
            .await
            .expect("query zero-stock samples");
    assert_eq!(
        out_of_stock
            .items
            .iter()
            .map(|item| item.id)
            .collect::<Vec<_>>(),
        vec![zero_sample.id]
    );

    let primary_query =
        crate::sample_inventory::validation::normalize_sample_query(SampleListQuery {
            product_kind: Some("primary".to_string()),
            ..Default::default()
        })
        .expect("normalize primary product-kind filter");
    let primary_samples = crate::sample_inventory::repository::list_samples(&pool, &primary_query)
        .await
        .expect("query primary samples");
    assert_eq!(primary_samples.total, 4);
    assert!(primary_samples
        .items
        .iter()
        .all(|item| item.product_kind == "primary"));
    assert!(primary_samples
        .items
        .iter()
        .any(|item| item.id == low_primary.id && item.is_low_stock));
    assert!(primary_samples
        .items
        .iter()
        .any(|item| item.id == blank_model_primary.id && item.is_low_stock));
    assert!(primary_samples.items.iter().any(|item| {
        item.id == blank_model_primary_two.id
            && item.product_kind == "primary"
            && !item.is_low_stock
    }));

    let gift_page_two_query =
        crate::sample_inventory::validation::normalize_sample_query(SampleListQuery {
            product_kind: Some("gift".to_string()),
            page: Some(2),
            page_size: Some(1),
            ..Default::default()
        })
        .expect("normalize paginated gift product-kind filter");
    let gift_page_two =
        crate::sample_inventory::repository::list_samples(&pool, &gift_page_two_query)
            .await
            .expect("query paginated gift samples");
    assert_eq!(gift_page_two.total, 3);
    assert_eq!(gift_page_two.page, 2);
    assert_eq!(gift_page_two.page_size, 1);
    assert_eq!(gift_page_two.items.len(), 1);
    assert_eq!(gift_page_two.items[0].product_kind, "gift");
    assert!(!gift_page_two.items[0].is_low_stock);

    let low_stock_query =
        crate::sample_inventory::validation::normalize_sample_query(SampleListQuery {
            stock_status: Some("low".to_string()),
            ..Default::default()
        })
        .expect("normalize low-stock filter");
    let low_stock_samples =
        crate::sample_inventory::repository::list_samples(&pool, &low_stock_query)
            .await
            .expect("query low-stock samples");
    assert_eq!(low_stock_samples.total, 2);
    assert_eq!(low_stock_samples.summary.low_stock_count, 2);
    assert!(low_stock_samples
        .items
        .iter()
        .any(|item| item.id == low_primary.id));
    assert!(low_stock_samples
        .items
        .iter()
        .any(|item| item.id == blank_model_primary.id));
    assert!(!low_stock_samples
        .items
        .iter()
        .any(|item| item.id == low_gift.id));

    let batch_request = CreateSampleInventoryOutboundBatchRequest {
        submission_key: "fixture-outbound-batch".to_string(),
        items: vec![
            outbound_item(sample.id, 1, "pending"),
            outbound_item(sample.id, 2, "approved"),
        ],
    };
    let batch = create_outbound_batch(&pool, batch_request.clone(), ACTOR)
        .await
        .expect("create outbound batch");
    let batch_replay = create_outbound_batch(&pool, batch_request.clone(), ACTOR)
        .await
        .expect("replay outbound batch");
    assert_eq!(
        batch.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        batch_replay
            .items
            .iter()
            .map(|item| item.id)
            .collect::<Vec<_>>()
    );
    assert!(matches!(
        create_outbound_batch(&pool, batch_request, "fixture-other-actor").await,
        Err(AppError::Conflict(_))
    ));

    let pending = &batch.items[0];
    let approved = transition_outbound(
        &pool,
        batch.items[1].id,
        transition_request(
            "fixture-transition-approved",
            batch.items[1].version,
            "approved",
        ),
        "approved",
        ACTOR,
    )
    .await
    .expect("approve fixture outbound");
    let sampled_pending = create_outbound(&pool, outbound_request(sample.id, 3, "sampled"), ACTOR)
        .await
        .expect("create sampled fixture outbound");
    let sampled_approved = transition_outbound(
        &pool,
        sampled_pending.id,
        transition_request(
            "fixture-transition-sampled-approved",
            sampled_pending.version,
            "approved",
        ),
        "approved",
        ACTOR,
    )
    .await
    .expect("approve sampled fixture outbound");
    let sampled = transition_outbound(
        &pool,
        sampled_approved.id,
        transition_request(
            "fixture-transition-sampled-final",
            sampled_approved.version,
            "sampled",
        ),
        "sampled",
        ACTOR,
    )
    .await
    .expect("sample fixture outbound");
    let rejected_pending =
        create_outbound(&pool, outbound_request(sample.id, 4, "rejected"), ACTOR)
            .await
            .expect("create rejected fixture outbound");
    let rejected = transition_outbound(
        &pool,
        rejected_pending.id,
        transition_request(
            "fixture-transition-rejected",
            rejected_pending.version,
            "rejected",
        ),
        "rejected",
        ACTOR,
    )
    .await
    .expect("reject fixture outbound");

    let backup = export_backup(&pool).await.expect("export baseline backup");
    let zero_plan = parse_backup(
        &pool,
        ParseSampleInventoryBackupRequest {
            backup: backup.clone(),
        },
    )
    .await
    .expect("parse unchanged backup");
    assert_eq!(zero_plan.changes, Default::default());

    let added_sample = create_sample(
        &pool,
        CreateSampleInventorySampleRequest {
            submission_key: "fixture-create-sample-b".to_string(),
            sample_code: "FIXTURE-B".to_string(),
            sample_name: "Fixture sample B".to_string(),
            model: None,
            category: None,
            location: None,
            remark: None,
            initial_quantity: Some(4),
            reserved_quantity: None,
        },
        ACTOR,
    )
    .await
    .expect("create post-backup sample");
    let added_inbound_request = CreateSampleInventoryInboundBatchRequest {
        submission_key: "fixture-inbound-batch".to_string(),
        items: vec![CreateSampleInventoryInboundItem {
            sample_id: sample.id,
            quantity: 4,
            tracking_number: None,
            remark: None,
            operator_name: None,
            occurred_at: None,
        }],
    };
    let added_inbound_batch = create_inbound_batch(&pool, added_inbound_request.clone(), ACTOR)
        .await
        .expect("create post-backup inbound batch");
    let added_inbound_replay = create_inbound_batch(&pool, added_inbound_request.clone(), ACTOR)
        .await
        .expect("replay post-backup inbound batch");
    assert_eq!(
        added_inbound_batch.items[0].id,
        added_inbound_replay.items[0].id
    );
    assert!(matches!(
        create_inbound_batch(&pool, added_inbound_request, "fixture-other-actor").await,
        Err(AppError::Conflict(_))
    ));
    let added_inbound = &added_inbound_batch.items[0];
    let added_outbound =
        create_outbound(&pool, outbound_request(sample.id, 1, "post-backup"), ACTOR)
            .await
            .expect("create post-backup outbound");
    void_inbound(
        &pool,
        inbound.id,
        VoidSampleInventoryInboundRequest {
            submission_key: "fixture-void-inbound".to_string(),
            expected_version: inbound.version,
            reason: "fixture mutation".to_string(),
        },
        ACTOR,
    )
    .await
    .expect("void baseline inbound");
    transition_outbound(
        &pool,
        pending.id,
        transition_request("fixture-transition-pending", pending.version, "approved"),
        "approved",
        ACTOR,
    )
    .await
    .expect("mutate pending outbound");
    transition_outbound(
        &pool,
        approved.id,
        transition_request(
            "fixture-transition-approved-final",
            approved.version,
            "sampled",
        ),
        "sampled",
        ACTOR,
    )
    .await
    .expect("mutate approved outbound");
    transition_outbound(
        &pool,
        sampled.id,
        transition_request(
            "fixture-transition-sampled-back",
            sampled.version,
            "pending",
        ),
        "pending",
        ACTOR,
    )
    .await
    .expect("mutate sampled outbound");
    transition_outbound(
        &pool,
        rejected.id,
        transition_request(
            "fixture-transition-rejected-back",
            rejected.version,
            "pending",
        ),
        "pending",
        ACTOR,
    )
    .await
    .expect("mutate rejected outbound");
    sqlx::query(
        "UPDATE sample_inventory.settings SET low_stock_threshold = 7, updated_by = $1 WHERE id = 1",
    )
    .bind(ACTOR)
    .execute(&pool)
    .await
    .expect("mutate fixture settings");
    sqlx::query(
        "UPDATE sample_inventory.samples SET archived_at = NOW(), archived_by = $2 WHERE id = $1",
    )
    .bind(sample.id)
    .bind(ACTOR)
    .execute(&pool)
    .await
    .expect("archive baseline sample fixture");
    sqlx::query(
        "UPDATE sample_inventory.outbound_requests SET archived_at = NOW(), archived_by = $2 WHERE id = $1",
    )
    .bind(sampled.id)
    .bind(ACTOR)
    .execute(&pool)
    .await
    .expect("archive baseline outbound fixture");

    let plan = parse_backup(
        &pool,
        ParseSampleInventoryBackupRequest {
            backup: backup.clone(),
        },
    )
    .await
    .expect("parse changed backup");
    assert_eq!(plan.changes.settings_to_update, 1);
    assert_eq!(plan.changes.samples_to_update, 1);
    assert_eq!(plan.changes.samples_to_archive, 1);
    assert_eq!(plan.changes.inbounds_to_update, 1);
    assert_eq!(plan.changes.inbounds_to_void, 1);
    assert_eq!(plan.changes.outbounds_to_update, 4);
    assert_eq!(plan.changes.outbounds_to_archive, 1);

    let mut state_drift = backup.clone();
    state_drift.state.samples[0].sample_name = "drifted".to_string();
    assert!(matches!(
        parse_backup(
            &pool,
            ParseSampleInventoryBackupRequest {
                backup: state_drift
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    let mut wrong_database = backup.clone();
    wrong_database.database_identity_sha256 = "0".repeat(64);
    assert!(matches!(
        parse_backup(
            &pool,
            ParseSampleInventoryBackupRequest {
                backup: wrong_database
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));

    let before_failed_restore_sha = state_sha(&pool).await;
    let before_failed_restore_counts = audit_counts(&pool).await;
    sqlx::raw_sql(&format!(
        r#"
        CREATE FUNCTION sample_inventory.fail_fixture_restore()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.id = {} AND NEW.updated_by = 'fixture-fail' THEN
            RAISE EXCEPTION 'fixture restore failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER trg_sample_inventory_fail_fixture_restore
        BEFORE UPDATE ON sample_inventory.samples
        FOR EACH ROW EXECUTE FUNCTION sample_inventory.fail_fixture_restore();
        "#,
        sample.id
    ))
    .execute(&pool)
    .await
    .expect("install fixture failure trigger");
    assert!(restore_backup(
        &pool,
        restore_request("fixture-restore-fail", backup.clone(), &plan),
        "fixture-fail",
    )
    .await
    .is_err());
    assert_eq!(state_sha(&pool).await, before_failed_restore_sha);
    assert_eq!(audit_counts(&pool).await, before_failed_restore_counts);
    sqlx::raw_sql(
        r#"
        DROP TRIGGER trg_sample_inventory_fail_fixture_restore ON sample_inventory.samples;
        DROP FUNCTION sample_inventory.fail_fixture_restore();
        "#,
    )
    .execute(&pool)
    .await
    .expect("remove fixture failure trigger");

    let mut stale_plan_request = restore_request("fixture-stale-plan", backup.clone(), &plan);
    stale_plan_request.expected_plan_sha256 = "0".repeat(64);
    assert!(matches!(
        restore_backup(&pool, stale_plan_request, ACTOR).await,
        Err(AppError::Conflict(_))
    ));
    assert_eq!(state_sha(&pool).await, before_failed_restore_sha);

    let request = restore_request("fixture-restore-success", backup.clone(), &plan);
    let restored = restore_backup(&pool, request.clone(), ACTOR)
        .await
        .expect("restore backup");
    let replay = restore_backup(&pool, request.clone(), ACTOR)
        .await
        .expect("replay restore backup");
    assert_eq!(
        serde_json::to_value(&restored).expect("serialize restore response"),
        serde_json::to_value(&replay).expect("serialize replay response")
    );
    assert!(matches!(
        restore_backup(&pool, request, "fixture-other-actor").await,
        Err(AppError::Conflict(_))
    ));

    let restored_backup = export_backup(&pool).await.expect("export restored state");
    assert_eq!(restored_backup.state_sha256, backup.state_sha256);
    let original_sample_archived: bool = sqlx::query_scalar(
        "SELECT archived_at IS NOT NULL FROM sample_inventory.samples WHERE id = $1",
    )
    .bind(sample.id)
    .fetch_one(&pool)
    .await
    .expect("read restored baseline sample");
    let added_sample_archived: bool = sqlx::query_scalar(
        "SELECT archived_at IS NOT NULL FROM sample_inventory.samples WHERE id = $1",
    )
    .bind(added_sample.id)
    .fetch_one(&pool)
    .await
    .expect("read archived added sample");
    let added_inbound_voided: bool = sqlx::query_scalar(
        "SELECT voided_at IS NOT NULL FROM sample_inventory.inbound_records WHERE id = $1",
    )
    .bind(added_inbound.id)
    .fetch_one(&pool)
    .await
    .expect("read voided added inbound");
    let added_outbound_archived: bool = sqlx::query_scalar(
        "SELECT archived_at IS NOT NULL FROM sample_inventory.outbound_requests WHERE id = $1",
    )
    .bind(added_outbound.id)
    .fetch_one(&pool)
    .await
    .expect("read archived added outbound");
    assert!(!original_sample_archived);
    assert!(added_sample_archived);
    assert!(added_inbound_voided);
    assert!(added_outbound_archived);

    let movement_balance = sqlx::query(
        r#"
        SELECT
          SUM(on_hand_delta)::BIGINT AS on_hand,
          SUM(reserved_delta)::BIGINT AS reserved
        FROM sample_inventory.inventory_movements
        WHERE sample_id = $1
        "#,
    )
    .bind(sample.id)
    .fetch_one(&pool)
    .await
    .expect("sum fixture movements");
    let stored_balance = sqlx::query(
        "SELECT on_hand_quantity::BIGINT AS on_hand, reserved_quantity::BIGINT AS reserved FROM sample_inventory.samples WHERE id = $1",
    )
    .bind(sample.id)
    .fetch_one(&pool)
    .await
    .expect("read restored fixture balance");
    assert_eq!(
        movement_balance.get::<i64, _>("on_hand"),
        stored_balance.get::<i64, _>("on_hand")
    );
    assert_eq!(
        movement_balance.get::<i64, _>("reserved"),
        stored_balance.get::<i64, _>("reserved")
    );

    assert!(sqlx::query(
        "UPDATE sample_inventory.inventory_movements SET metadata = metadata WHERE id = (SELECT MIN(id) FROM sample_inventory.inventory_movements)",
    )
    .execute(&pool)
    .await
    .is_err());
    assert!(sqlx::query(
        "DELETE FROM sample_inventory.business_events WHERE id = (SELECT MIN(id) FROM sample_inventory.business_events)",
    )
    .execute(&pool)
    .await
    .is_err());
}
