//! Incremental daily dispatch. One transaction locks the day and creates only
//! available queue slots; Prefect repeats it as jobs finish. Never renders here.
use super::{
    access::StudioAccess, daily_remix_types::*, error::StudioResult, remix,
    remix_types::RemixBatchPreviewRequest, repository::db_error, structure_pool,
    structure_pool_types::StructurePoolQuery,
};
use crate::{auth::CurrentUser, config::Settings, error::AppError};
use chrono::{Days, NaiveDate, Utc};
use sqlx::{PgConnection, PgPool, Row};

pub(super) const SYSTEM_USER: &str = "6ccf6f96-07f3-4bec-91a4-79ec7cc58bad";
pub(super) fn today() -> NaiveDate {
    (Utc::now() + chrono::Duration::hours(8)).date_naive()
}

pub(super) fn actor() -> CurrentUser {
    CurrentUser {
        user_id: SYSTEM_USER.into(),
        username: None,
        roles: Vec::new(),
        permissions: vec!["marketing:content_assets:manage".into()],
    }
}

pub(super) async fn lock_day(db: &mut PgConnection, date: NaiveDate) -> StudioResult<()> {
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended('daily-remix:' || $1::DATE::TEXT, 0))",
    )
    .bind(date)
    .execute(&mut *db)
    .await
    .map_err(db_error)?;
    Ok(())
}

async fn freeze(
    pool: &PgPool,
    settings: &Settings,
    date: NaiveDate,
    user: &CurrentUser,
) -> StudioResult<Option<FrozenPlan>> {
    let preview = structure_pool::preview_with_history(
        pool,
        settings,
        user,
        StudioAccess::from_settings(settings),
        StructurePoolQuery {
            date: Some(date.to_string()),
        },
        Some(date - Days::new(30)),
    )
    .await?;
    if preview.as_of.is_none() || preview.status == "pending" {
        return Ok(None);
    }
    let preset = sqlx::query("SELECT preset_key, version FROM ads.content_segment_presets WHERE dimension='framework' AND status='active' ORDER BY version DESC, preset_key LIMIT 1")
        .fetch_optional(pool).await.map_err(db_error)?;
    Ok(preset.map(|p| FrozenPlan {
        pool: preview,
        preset_key: p.get("preset_key"),
        preset_version: p.get("version"),
        enterprise_tag: settings.content_ai_studio_enterprise_tag.clone(),
    }))
}

/// Prefer the frozen allocation, then redistribute missing slots by share.
fn next_structure(frozen: &FrozenPlan, counts: &[usize], exhausted: &[bool]) -> Option<usize> {
    (0..frozen.pool.rows.len())
        .filter(|&i| counts[i] < 30 && !exhausted[i])
        .max_by(|&a, &b| {
            let rows = &frozen.pool.rows;
            let deficit = |i: usize| (rows[i].planned_count as usize).saturating_sub(counts[i]);
            deficit(a)
                .cmp(&deficit(b))
                .then_with(|| {
                    let score = |i: usize| rows[i].share / (counts[i] + 1) as f64;
                    score(a).total_cmp(&score(b))
                })
                .then_with(|| b.cmp(&a))
        })
}

// Public 1080P price 0.06 yuan/minute = one micro-yuan per output millisecond.
// This is an estimate and is never presented as a provider bill.
fn run_cost(run: &super::remix_points_plan::PlannedRun) -> i64 {
    run.clips
        .iter()
        .map(|c| i64::from(c.end_ms - c.start_ms))
        .sum()
}

pub(super) async fn run(
    pool: &PgPool,
    settings: &Settings,
    date: NaiveDate,
) -> StudioResult<DailyRemixPlanResponse> {
    remix::ensure_enabled(settings)?;
    if !settings.daily_remix.enabled {
        return Err(AppError::ServiceUnavailable("每日混剪尚未启用".into()).into());
    }
    if settings.daily_remix.budget_micros == Some(0) {
        return Err(AppError::ServiceUnavailable("每日混剪预算配置无效".into()).into());
    }
    let mut tx = pool.begin().await.map_err(db_error)?;
    lock_day(&mut tx, date).await?;
    sqlx::query("INSERT INTO ads.content_daily_remix_plans(plan_date, budget_micros) VALUES ($1,$2) ON CONFLICT DO NOTHING")
        .bind(date).bind(settings.daily_remix.budget_micros).execute(&mut *tx).await.map_err(db_error)?;
    let row = sqlx::query("SELECT snapshot, paused, dispatch_complete, estimated_cost_micros FROM ads.content_daily_remix_plans WHERE plan_date=$1 FOR UPDATE")
        .bind(date).fetch_one(&mut *tx).await.map_err(db_error)?;
    if row.get::<bool, _>("paused") || row.get::<bool, _>("dispatch_complete") {
        tx.commit().await.map_err(db_error)?;
        return super::daily_remix_read::read(pool, settings, date).await;
    }
    let user = actor();
    let frozen: Option<FrozenPlan> = match row.get::<Option<serde_json::Value>, _>("snapshot") {
        Some(value) => Some(serde_json::from_value(value).map_err(|error| {
            tracing::error!(?error, "invalid daily remix snapshot");
            AppError::Internal
        })?),
        None => freeze(pool, settings, date, &user).await?,
    };
    let Some(frozen) = frozen else {
        sqlx::query("UPDATE ads.content_daily_remix_plans SET stop_reason='waiting_sources', updated_at=NOW() WHERE plan_date=$1")
            .bind(date).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        return super::daily_remix_read::read(pool, settings, date).await;
    };
    if frozen.enterprise_tag != settings.content_ai_studio_enterprise_tag {
        return Err(AppError::Forbidden.into());
    }
    let as_of = frozen
        .pool
        .as_of
        .as_deref()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .ok_or(AppError::Internal)?;
    // Same owner lock as manual creation, protecting the existing active-run cap.
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended('content-remix-batches:' || $1, 0))",
    )
    .bind(SYSTEM_USER)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    let mut counts = vec![0; frozen.pool.rows.len()];
    for r in sqlx::query("SELECT d.structure_index, SUM(b.planned_count)::BIGINT AS count FROM ads.content_daily_remix_batches d JOIN ads.content_remix_batches b USING(batch_id) WHERE d.plan_date=$1 GROUP BY d.structure_index")
        .bind(date).fetch_all(&mut *tx).await.map_err(db_error)? {
        let index = r.get::<i32,_>("structure_index") as usize;
        *counts.get_mut(index).ok_or(AppError::Internal)? = r.get::<i64,_>("count") as usize;
    }
    let mut used = remix::used_hashes_since(&mut tx, None, Some(date - Days::new(30))).await?;
    let mut active = remix::active_runs(&mut tx, SYSTEM_USER).await?;
    let mut total: usize = counts.iter().sum();
    let mut cost: i64 = row.get("estimated_cost_micros");
    let mut exhausted: Vec<bool> = frozen
        .pool
        .rows
        .iter()
        .map(|r| r.available_combinations == 0)
        .collect();
    let mut reason = None;
    let mut complete = false;
    let mut reasons: Vec<Option<String>> =
        frozen.pool.rows.iter().map(|r| r.reason.clone()).collect();
    while total < 100 && active < settings.content_ai_studio_remix_max_active {
        let Some(index) = next_structure(&frozen, &counts, &exhausted) else {
            reason = Some("insufficient_sources");
            complete = true;
            break;
        };
        let deficit =
            (frozen.pool.rows[index].planned_count as usize).saturating_sub(counts[index]);
        let allocation = if deficit > 0 {
            deficit
        } else {
            30 - counts[index]
        };
        let request_count = (100 - total)
            .min(allocation)
            .min(settings.content_ai_studio_remix_max_active - active)
            .min(settings.content_ai_studio_remix_max_per_batch)
            .min(10);
        let mut n = remix::normalize(
            &RemixBatchPreviewRequest {
                mode: None,
                preset_key: frozen.preset_key.clone(),
                preset_version: frozen.preset_version,
                labels: Some(frozen.pool.rows[index].labels.clone()),
                source_asset_id: None,
                product_name: frozen.pool.product_name.clone(),
                count: request_count as i32,
            },
            10,
        )?;
        n.admission_as_of = Some(as_of);
        let mut plan = remix::build_plan(
            pool,
            settings,
            &mut tx,
            &user,
            StudioAccess::from_settings(settings),
            &n,
            &used,
        )
        .await?;
        if plan.runs.is_empty() {
            reasons[index] = remix::shortfall_reason(&plan, request_count);
            exhausted[index] = true;
            continue;
        }
        let mut batch_cost = 0;
        let affordable = plan
            .runs
            .iter()
            .take_while(|r| {
                let next = batch_cost + run_cost(r);
                if settings
                    .daily_remix
                    .budget_micros
                    .is_some_and(|limit| cost + next > limit)
                {
                    return false;
                }
                batch_cost = next;
                true
            })
            .count();
        let budget_stopped = affordable < plan.runs.len();
        plan.runs.truncate(affordable);
        if affordable > 0 {
            let key = format!("daily-{date}-{index}-{total}");
            let shortfall = if budget_stopped {
                Some(format!("受当日金额上限限制，本批只安排 {affordable} 条"))
            } else {
                remix::shortfall_reason(&plan, n.count)
            };
            let batch =
                remix::persist_plan(&mut tx, settings, SYSTEM_USER, &key, &n, &plan, shortfall)
                    .await?;
            sqlx::query("INSERT INTO ads.content_daily_remix_batches(plan_date,batch_id,structure_index,estimated_cost_micros) VALUES ($1,$2,$3,$4)")
                .bind(date).bind(batch).bind(index as i32).bind(batch_cost).execute(&mut *tx).await.map_err(db_error)?;
            used.extend(plan.runs.iter().map(|r| r.hash.clone()));
            total += affordable;
            active += affordable;
            counts[index] += affordable;
            cost += batch_cost;
        }
        if budget_stopped {
            reason = Some("over_budget");
            break;
        }
    }
    complete |= total == 100;
    if !complete && reason.is_none() {
        reason = Some("active_limit");
    }
    let structures: Vec<_> = frozen
        .pool
        .rows
        .iter()
        .enumerate()
        .map(|(i, row)| DailyRemixStructureResult {
            structure_index: i as i32,
            target_count: row.planned_count,
            planned_count: counts[i] as i32,
            reason: if counts[i] >= row.planned_count as usize && row.planned_count > 0 {
                None
            } else {
                reasons[i].clone().or_else(|| {
                    reason.map(|r| match r {
                        "active_limit" => "等待在途任务完成后继续排队".into(),
                        "over_budget" => "达到当日金额上限，剩余名额暂未安排".into(),
                        _ => "当前可用素材不足，未补足该结构名额".into(),
                    })
                })
            },
        })
        .collect();
    sqlx::query("UPDATE ads.content_daily_remix_plans SET snapshot=$2, dispatch_complete=$3, stop_reason=$4, budget_micros=$5, estimated_cost_micros=$6, structure_results=$7, updated_at=NOW() WHERE plan_date=$1")
        .bind(date).bind(serde_json::to_value(&frozen).map_err(|_| AppError::Internal)?).bind(complete).bind(reason)
        .bind(settings.daily_remix.budget_micros).bind(cost).bind(serde_json::to_value(structures).map_err(|_| AppError::Internal)?)
        .execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    super::daily_remix_read::read(pool, settings, date).await
}
