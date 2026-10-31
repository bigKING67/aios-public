//! Real batch/Run/job persistence in disposable PostgreSQL, no renderer calls.
use super::{
    daily_remix::{self, SYSTEM_USER},
    daily_remix_types::FrozenPlan,
    postgres_tests::pool,
    remix, remix_postgres_tests as f,
    structure_pool_types::{StructurePoolResponse, StructurePoolRow},
};
use chrono::{Days, NaiveDate};
use serde_json::json;
use sqlx::{PgPool, Row};

async fn fixture(pool: &PgPool, day: u32) -> (NaiveDate, crate::config::Settings) {
    let date = NaiveDate::from_ymd_opt(2022, 4, day).unwrap();
    let product = format!("daily-{}", uuid::Uuid::new_v4());
    let structures = [
        vec!["mixed_voiceover", "live_demo"],
        vec!["live_demo", "promotion"],
        vec!["promotion", "mixed_voiceover"],
        vec!["mixed_voiceover", "promotion"],
    ];
    for _ in 0..8 {
        let (id, sha) = f::asset(pool, "daily-fixture", &product, "authorized").await;
        for (index, label) in ["mixed_voiceover", "live_demo", "promotion"]
            .iter()
            .enumerate()
        {
            f::segment(
                pool,
                (id, &sha),
                label,
                (index as i32 * 10_000, index as i32 * 10_000 + 5000),
                &product,
            )
            .await;
        }
    }
    let frozen = FrozenPlan {
        preset_key: "framework".into(),
        preset_version: 1,
        enterprise_tag: None,
        pool: StructurePoolResponse {
            date: date.to_string(),
            as_of: Some((daily_remix::today() - Days::new(1)).to_string()),
            window_from: None,
            window_to: None,
            product_name: product,
            status: "ready".into(),
            pending: false,
            requested_count: 100,
            planned_count: 100,
            shortfall: 0,
            rows: structures
                .iter()
                .map(|labels| StructurePoolRow {
                    labels: labels.iter().map(|v| (*v).into()).collect(),
                    label_names: vec![],
                    source: "both".into(),
                    share: 0.25,
                    planned_count: 25,
                    available_combinations: 64,
                    available_is_lower_bound: false,
                    reason: None,
                })
                .collect(),
        },
    };
    sqlx::query("INSERT INTO ads.content_daily_remix_plans(plan_date,snapshot) VALUES ($1,$2)")
        .bind(date)
        .bind(json!(frozen))
        .execute(pool)
        .await
        .unwrap();
    let mut settings = f::settings();
    settings.daily_remix.enabled = true;
    settings.content_ai_studio_remix_max_active = 20;
    (date, settings)
}

async fn finish(pool: &PgPool, date: NaiveDate) {
    sqlx::query("UPDATE ads.content_production_runs r SET status='succeeded' FROM ads.content_remix_batch_runs br JOIN ads.content_daily_remix_batches d USING(batch_id) WHERE r.run_id=br.run_id AND d.plan_date=$1")
        .bind(date).execute(pool).await.unwrap();
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_resume_and_concurrent_triggers_reach_100_with_frozen_proportions() {
    let pool = pool().await;
    let (date, settings) = fixture(&pool, 1).await;
    let (a, b) = tokio::join!(
        daily_remix::run(&pool, &settings, date),
        daily_remix::run(&pool, &settings, date)
    );
    assert_eq!(a.unwrap().planned_count, 20);
    assert_eq!(b.unwrap().planned_count, 20);
    for expected in [40, 60, 80, 100] {
        finish(&pool, date).await;
        let next = daily_remix::run(&pool, &settings, date).await.unwrap();
        assert_eq!(next.planned_count, expected);
        assert_eq!(next.active_count, 20);
    }
    let replay = daily_remix::run(&pool, &settings, date).await.unwrap();
    assert_eq!(replay.planned_count, 100);
    assert!(replay.dispatch_complete);
    assert_eq!(replay.estimated_cost_yuan, 1.0);
    for index in 0..4 {
        assert_eq!(
            replay
                .batches
                .iter()
                .filter(|b| b.structure_index == index)
                .map(|b| b.planned_count)
                .sum::<i32>(),
            25
        );
    }
    let uniqueness: (i64,i64) = sqlx::query_as("SELECT COUNT(*), COUNT(DISTINCT br.combination_hash) FROM ads.content_remix_batch_runs br JOIN ads.content_daily_remix_batches d USING(batch_id) WHERE d.plan_date=$1")
        .bind(date).fetch_one(&pool).await.unwrap();
    assert_eq!(uniqueness, (100, 100));
    finish(&pool, date).await;
    assert_eq!(
        daily_remix::run(&pool, &settings, date)
            .await
            .unwrap()
            .status,
        "done"
    );
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_budget_pause_and_queue_limits_do_not_duplicate_batches() {
    let pool = pool().await;
    let (date, mut settings) = fixture(&pool, 2).await;
    settings.daily_remix.enabled = false;
    assert!(daily_remix::run(&pool, &settings, date).await.is_err());
    settings.daily_remix.enabled = true;
    sqlx::query("UPDATE ads.content_daily_remix_plans SET paused=TRUE WHERE plan_date=$1")
        .bind(date)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        daily_remix::run(&pool, &settings, date)
            .await
            .unwrap()
            .planned_count,
        0
    );
    sqlx::query("UPDATE ads.content_daily_remix_plans SET paused=FALSE WHERE plan_date=$1")
        .bind(date)
        .execute(&pool)
        .await
        .unwrap();
    settings.daily_remix.budget_micros = Some(25_000);
    let limited = daily_remix::run(&pool, &settings, date).await.unwrap();
    assert_eq!(limited.planned_count, 2);
    assert_eq!(limited.status, "over_budget");
    assert_eq!(limited.estimated_cost_yuan, 0.02);
    assert_eq!(
        daily_remix::run(&pool, &settings, date)
            .await
            .unwrap()
            .planned_count,
        2
    );
    settings.daily_remix.budget_micros = None;
    assert_eq!(
        daily_remix::run(&pool, &settings, date)
            .await
            .unwrap()
            .planned_count,
        20
    );
    finish(&pool, date).await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_missing_structure_redistributes_without_exceeding_30_per_structure() {
    let pool = pool().await;
    let (date, mut settings) = fixture(&pool, 3).await;
    settings.content_ai_studio_remix_max_active = 100;
    // One frozen structure loses all usable sources after the snapshot.
    sqlx::query("UPDATE ads.content_daily_remix_plans SET snapshot=jsonb_set(snapshot,'{pool,rows,0,labels}', '[\"street_interview\"]') WHERE plan_date=$1")
        .bind(date).execute(&pool).await.unwrap();
    let result = daily_remix::run(&pool, &settings, date).await.unwrap();
    assert_eq!(result.planned_count, 90);
    assert_eq!(result.shortfall, 10);
    assert_eq!(result.structures[0].planned_count, 0);
    assert!(result.structures[0]
        .reason
        .as_deref()
        .is_some_and(|s| s.contains("没有")));
    assert_eq!(result.stop_reason.as_deref(), Some("insufficient_sources"));
    for index in 1..4 {
        assert_eq!(
            result
                .batches
                .iter()
                .filter(|b| b.structure_index == index)
                .map(|b| b.planned_count)
                .sum::<i32>(),
            30
        );
    }
    finish(&pool, date).await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_history_is_30_days_across_owners_while_manual_history_stays_permanent() {
    let pool = pool().await;
    let (date, settings) = fixture(&pool, 4).await;
    let result = daily_remix::run(&pool, &settings, date).await.unwrap();
    let batch = result.batches[0].batch_id;
    let hash: String = sqlx::query_scalar(
        "SELECT combination_hash FROM ads.content_remix_batch_runs WHERE batch_id=$1 LIMIT 1",
    )
    .bind(batch)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE ads.content_remix_batches SET created_at=($2::DATE-31)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai' WHERE batch_id=$1")
        .bind(batch).bind(date).execute(&pool).await.unwrap();
    let mut db = pool.acquire().await.unwrap();
    assert!(remix::used_hashes(&mut db, SYSTEM_USER)
        .await
        .unwrap()
        .contains(&hash));
    assert!(
        !remix::used_hashes_since(&mut db, None, Some(date - Days::new(30)))
            .await
            .unwrap()
            .contains(&hash)
    );
    sqlx::query("UPDATE ads.content_remix_batches SET owner_user_id='human-fixture', created_at=($2::DATE-29)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai' WHERE batch_id=$1")
        .bind(batch).bind(date).execute(&mut *db).await.unwrap();
    assert!(
        remix::used_hashes_since(&mut db, None, Some(date - Days::new(30)))
            .await
            .unwrap()
            .contains(&hash)
    );
    drop(db);
    finish(&pool, date).await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_new_plan_without_spend_waits_without_jobs_and_identity_cannot_log_in() {
    let pool = pool().await;
    let mut settings = f::settings();
    settings.daily_remix.enabled = true;
    let result = daily_remix::run(
        &pool,
        &settings,
        NaiveDate::from_ymd_opt(2020, 1, 1).unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(result.status, "waiting_sources");
    assert_eq!(result.planned_count, 0);
    let account =
        sqlx::query("SELECT is_active,password_hash FROM auth_users WHERE CAST(id AS TEXT)=$1")
            .bind(SYSTEM_USER)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!account.get::<bool, _>("is_active"));
    assert!(account.get::<Option<String>, _>("password_hash").is_none());
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_fresh_plan_freezes_live_pool_and_keeps_enterprise_scope() {
    let pool = pool().await;
    let date = daily_remix::today();
    let tag = format!("企业:daily-{}", uuid::Uuid::new_v4());
    for _ in 0..2 {
        let (id, sha) = f::asset(&pool, "daily-fixture", "百雀羚香粉", "authorized").await;
        sqlx::query("UPDATE ads.marketing_content_assets SET tags=ARRAY[$2] WHERE asset_id=$1")
            .bind(id)
            .bind(&tag)
            .execute(&pool)
            .await
            .unwrap();
        for (i, label) in ["mixed_voiceover", "live_demo", "promotion"]
            .iter()
            .enumerate()
        {
            f::segment(
                &pool,
                (id, &sha),
                label,
                (i as i32 * 10000, i as i32 * 10000 + 5000),
                "百雀羚香粉",
            )
            .await;
        }
    }
    sqlx::query("INSERT INTO competitor.stat_snapshots(cohort,period,stats_version,taxonomy_version,normalization_version,input_snapshot,source_watermark,films,families,payload) VALUES ('loose_powder',$1,'daily-fixture','v1','v1','fixture','fixture',0,0,$2)")
        .bind(format!("{}..{}",date-Days::new(30),date-Days::new(1)))
        .bind(json!({"structures":{"framework":{"rows":[]}}})).execute(&pool).await.unwrap();
    let mut settings = f::settings();
    settings.daily_remix.enabled = true;
    settings.content_ai_studio_enterprise_tag = Some(tag);
    let result = daily_remix::run(&pool, &settings, date).await.unwrap();
    assert_eq!(result.planned_count, 8);
    assert_eq!(
        result.structure_pool.as_ref().unwrap().as_of,
        Some((date - Days::new(1)).to_string())
    );
    assert!(result.dispatch_complete);
    settings.content_ai_studio_enterprise_tag = Some("企业:elsewhere".into());
    assert!(super::daily_remix_read::read(&pool, &settings, date)
        .await
        .is_err());
    finish(&pool, date).await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn daily_mid_dispatch_failure_rolls_back_new_batches_and_cost() {
    let pool = pool().await;
    let (date, settings) = fixture(&pool, 5).await;
    sqlx::query("UPDATE ads.content_daily_remix_plans SET snapshot=jsonb_set(snapshot,'{pool,rows,1,labels}', '[\"retired_label\"]') WHERE plan_date=$1")
        .bind(date).execute(&pool).await.unwrap();
    assert!(daily_remix::run(&pool, &settings, date).await.is_err());
    let batches: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_daily_remix_batches WHERE plan_date=$1",
    )
    .bind(date)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(batches, 0);
    let cost: i64 = sqlx::query_scalar(
        "SELECT estimated_cost_micros FROM ads.content_daily_remix_plans WHERE plan_date=$1",
    )
    .bind(date)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(cost, 0);
}
