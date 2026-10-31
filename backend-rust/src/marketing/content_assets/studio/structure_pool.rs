//! Read-only production preview. Statistics come from the same sources as 爆款拆解;
//! missing competitor windows only enqueue the existing statistics worker, never render.
use super::{
    access::StudioAccess,
    competitor_own_structures::own_structures_for_product,
    error::StudioResult,
    remix,
    remix_types::RemixBatchPreviewRequest,
    repository::db_error,
    structure_pool_allocation::{allocate, merge, WeightedStructure},
    structure_pool_types::{StructurePoolQuery, StructurePoolResponse, StructurePoolRow},
};
use crate::{auth::CurrentUser, config::Settings, error::AppError};
use chrono::{Days, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::Value;
use sqlx::{PgPool, Row};

const PRODUCT: &str = "百雀羚香粉";
const TARGET: usize = 100;
const CAP: usize = 30;

#[derive(Deserialize)]
struct CompetitorRow {
    labels: Vec<String>,
    films: f64,
}

fn competitor_rows(payload: &Value) -> StudioResult<Vec<WeightedStructure>> {
    let Some(rows) = payload.pointer("/structures/framework/rows") else {
        return Ok(Vec::new());
    };
    let rows: Vec<CompetitorRow> = serde_json::from_value(rows.clone()).map_err(|error| {
        tracing::error!(?error, "invalid competitor framework statistics");
        AppError::Internal
    })?;
    Ok(rows.into_iter().map(|r| (r.labels, r.films)).collect())
}

async fn snapshot(pool: &PgPool, first: NaiveDate, last: NaiveDate) -> StudioResult<Option<Value>> {
    sqlx::query_scalar("SELECT payload FROM competitor.stat_snapshots WHERE cohort = 'loose_powder' AND period = $1 ORDER BY computed_at DESC LIMIT 1")
        .bind(format!("{first}..{last}")).fetch_optional(pool).await.map_err(db_error)
}

pub(super) async fn preview(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    query: StructurePoolQuery,
) -> StudioResult<StructurePoolResponse> {
    preview_with_history(pool, settings, user, access, query, None).await
}

pub(super) async fn preview_with_history(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    query: StructurePoolQuery,
    since: Option<NaiveDate>,
) -> StudioResult<StructurePoolResponse> {
    let today = (Utc::now() + chrono::Duration::hours(8)).date_naive();
    let date = query
        .date
        .as_deref()
        .map(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| AppError::bad_request("date 必须为 YYYY-MM-DD"))?
        .unwrap_or(today);
    if date > today || date < NaiveDate::from_ymd_opt(2020, 1, 1).unwrap() {
        return Err(AppError::bad_request("date 必须为 2020 年起且不晚于今天的日期").into());
    }
    let mut response = StructurePoolResponse {
        date: date.to_string(),
        as_of: None,
        window_from: None,
        window_to: None,
        product_name: PRODUCT.into(),
        status: "no_spend_data".into(),
        pending: false,
        requested_count: TARGET as i32,
        planned_count: 0,
        shortfall: TARGET as i32,
        rows: Vec::new(),
    };
    let mut db = pool.acquire().await.map_err(db_error)?;
    if !super::admission::installed(&mut db).await? {
        return Ok(response);
    }
    let as_of: Option<NaiveDate> = sqlx::query_scalar("SELECT MAX(stat_date) FROM cloud_video.spend_days WHERE one_level_type_id = 73180 AND stat_date < $1")
        .bind(date).fetch_one(&mut *db).await.map_err(db_error)?;
    let Some(as_of) = as_of else {
        return Ok(response);
    };
    response.as_of = Some(as_of.to_string());
    let mut last = as_of;
    let mut first = last - Days::new(u64::from(settings.content_ai_studio_structure_pool_days) - 1);
    let mut payload = snapshot(pool, first, last).await?;
    response.status = "ready".into();
    if payload.is_none() {
        response.pending = super::competitor_patterns::request_if_films(
            pool,
            "loose_powder",
            &format!("{first}..{last}"),
            first,
            last,
        )
        .await?;
        if response.pending {
            let previous_first = first - Days::new(1);
            let previous_last = last - Days::new(1);
            payload = snapshot(pool, previous_first, previous_last).await?;
            if payload.is_some() {
                first = previous_first;
                last = previous_last;
                response.status = "previous_window".into();
            } else {
                response.status = "pending".into();
            }
        } else {
            // No analysed competitor films means an empty side, not a job that can finish later.
            payload = Some(serde_json::json!({"structures": {"framework": {"rows": []}}}));
        }
    }
    response.window_from = Some(first.to_string());
    response.window_to = Some(last.to_string());
    let Some(payload) = payload else {
        return Ok(response);
    };
    let own = own_structures_for_product(
        pool,
        access.enterprise_tag(),
        Some((first, last)),
        Some(PRODUCT),
    )
    .await?;
    let shares = merge(
        competitor_rows(&payload)?,
        own.framework
            .rows
            .into_iter()
            .map(|row| (row.labels, row.spend))
            .collect(),
    );
    let preset = sqlx::query("SELECT preset_key, version FROM ads.content_segment_presets WHERE dimension = 'framework' AND status = 'active' ORDER BY version DESC, preset_key LIMIT 1")
        .fetch_optional(&mut *db).await.map_err(db_error)?;
    let Some(preset) = preset else {
        response.status = "pending".into();
        return Ok(response);
    };
    let preset_key: String = preset.get("preset_key");
    let preset_version: i32 = preset.get("version");
    let labels =
        super::repository::active_preset_labels(&mut db, &preset_key, preset_version).await?;
    let used = remix::used_hashes_since(
        &mut db,
        since.is_none().then_some(user.user_id.as_str()),
        since,
    )
    .await?;
    let mut capacities = Vec::new();
    for share in &shares {
        let unsupported = if share.labels.len() > remix::MAX_SLOTS {
            Some(format!("结构超过 {} 段，当前无法混剪", remix::MAX_SLOTS))
        } else if share
            .labels
            .iter()
            .any(|key| !labels.iter().any(|label| &label.key == key))
        {
            Some("结构含当前框架预设不支持的标签".to_string())
        } else {
            None
        };
        let (available, exact, reason) = if let Some(reason) = unsupported {
            (0, true, Some(reason))
        } else {
            let request = RemixBatchPreviewRequest {
                mode: None,
                preset_key: preset_key.clone(),
                preset_version,
                labels: Some(share.labels.clone()),
                source_asset_id: None,
                product_name: PRODUCT.into(),
                count: CAP as i32,
            };
            let mut n = remix::normalize(&request, CAP)?;
            n.admission_as_of = Some(as_of);
            let plan = remix::build_plan(pool, settings, &mut db, user, access, &n, &used).await?;
            (
                plan.available,
                plan.exact,
                remix::shortfall_reason(&plan, CAP),
            )
        };
        capacities.push(usize::try_from(available).unwrap_or(usize::MAX));
        response.rows.push(StructurePoolRow {
            labels: share.labels.clone(),
            label_names: share
                .labels
                .iter()
                .map(|key| {
                    own.framework
                        .labels
                        .get(key)
                        .cloned()
                        .unwrap_or_else(|| key.clone())
                })
                .collect(),
            source: if share.competitor && share.ours {
                "both"
            } else if share.ours {
                "ours"
            } else {
                "competitor"
            }
            .into(),
            share: share.weight,
            planned_count: 0,
            available_combinations: i64::try_from(available).unwrap_or(i64::MAX),
            available_is_lower_bound: !exact,
            reason,
        });
    }
    let counts = allocate(&shares, &capacities, TARGET, CAP);
    for (row, count) in response.rows.iter_mut().zip(counts) {
        row.planned_count = count as i32;
        response.planned_count += count as i32;
        if count > 0 && row.available_combinations >= CAP as i64 {
            row.reason = None;
        }
    }
    response.shortfall = TARGET as i32 - response.planned_count;
    Ok(response)
}
