use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    marketing,
    state::AppState,
};

use super::{
    responses::json_message_response,
    validation::can_access_industry_material_inspiration_dashboard,
};

#[path = "industry_material_inspiration/brand_ai_backfill_enqueue.rs"]
mod brand_ai_backfill_enqueue;
#[path = "industry_material_inspiration/brand_ai_worker_trigger.rs"]
mod brand_ai_worker_trigger;
#[path = "industry_material_inspiration/brand_resolution_sql.rs"]
mod brand_resolution_sql;
#[path = "industry_material_inspiration/query_sql.rs"]
mod query_sql;
#[cfg(test)]
#[path = "industry_material_inspiration/tests.rs"]
mod tests;

use query_sql::{
    build_brand_ai_backfill_assets_sql, build_douyin_payload_sql, AVAILABLE_MONTHS_SQL,
    BRAND_AI_BACKFILL_SCOPE_SQL, LATEST_MONTH_SQL, VIDEO_UNDERSTANDING_STORAGE_READINESS_SQL,
};
#[cfg(test)]
use query_sql::{
    LATEST_ANALYSIS_CTE_MARKER, VIDEO_UNDERSTANDING_RESULTS_AVAILABLE_MARKER,
    VIDEO_UNDERSTANDING_STORAGE_READY_MARKER,
};

const DOUYIN_LIVE_LEAD_TAB: &str = "douyin_live_lead_short_video";
const DOUYIN_GOODS_TAB: &str = "douyin_goods_short_video";
const DEFAULT_TAB: &str = DOUYIN_LIVE_LEAD_TAB;
const XHS_TAB: &str = "xhs_note";

const LIVE_LEAD_VIDEO_TYPE: &str = "live_lead_short_video";
const GOODS_VIDEO_TYPE: &str = "goods_short_video";
const ALL_BRANDS_KEY: &str = "all";
const DEFAULT_BRAND_AI_BACKFILL_LIMIT: i64 = 100;
const MAX_BRAND_AI_BACKFILL_LIMIT: i64 = 100;

#[derive(Debug, Deserialize)]
pub(crate) struct IndustryMaterialInspirationQuery {
    tab: Option<String>,
    month: Option<String>,
    brand: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndustryMaterialInspirationResponse {
    tab: String,
    active_tab: String,
    tabs: Value,
    available_months: Value,
    month: String,
    selected_month: String,
    summary: Value,
    rows: Value,
    brand_options: Value,
    selected_brand: Value,
    brand_insight: Value,
    empty_state: Value,
    placeholder: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndustryMaterialBrandAiBackfillRequest {
    tab: String,
    month: String,
    brand: String,
    source: Option<String>,
    profile: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug)]
struct NormalizedIndustryMaterialBrandAiBackfill {
    tab: &'static str,
    month: String,
    video_type: &'static str,
    brand: String,
    source: String,
    profile: Option<String>,
    limit: i64,
}

#[derive(Debug)]
struct BrandAiBackfillScope {
    key: String,
    label: String,
    total_materials: i64,
    linked_assets: i64,
}

#[derive(Debug)]
struct BrandAiBackfillAsset {
    asset_id: Uuid,
    has_structured_video_understanding: bool,
    has_any_ai_analysis: bool,
    has_analysis_artifact: bool,
    has_input: bool,
    active_job_status: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct VideoUnderstandingStorageReadiness {
    results_table_available: bool,
    brand_resolution_table_available: bool,
    storage_ready: bool,
}

impl VideoUnderstandingStorageReadiness {
    fn storage_ready(self) -> bool {
        self.storage_ready
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndustryMaterialBrandAiBackfillBrand {
    key: String,
    label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndustryMaterialBrandAiBackfillResponse {
    brand: IndustryMaterialBrandAiBackfillBrand,
    tab: String,
    month: String,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<String>,
    scanned_assets: i64,
    candidate_assets: i64,
    limit: i64,
    limit_reached: bool,
    queued_jobs: i64,
    queued_cache_hydration_jobs: i64,
    queued_model_analysis_jobs: i64,
    existing_any_ai_assets: i64,
    existing_ai_artifact_assets: i64,
    structured_storage_ready: bool,
    skipped_ready_assets: i64,
    skipped_running_jobs: i64,
    skipped_no_input: i64,
    skipped_existing_jobs: i64,
    missing_analysis_before: Option<i64>,
    remaining_missing_after_click: i64,
    worker_trigger: brand_ai_worker_trigger::BrandAiBackfillWorkerTrigger,
    message: String,
}

pub(crate) async fn get_industry_material_inspiration(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<IndustryMaterialInspirationQuery>,
) -> Response {
    if !can_access_industry_material_inspiration_dashboard(&current_user) {
        return json_message_response(
            StatusCode::FORBIDDEN,
            "当前账号没有行业素材灵感看板访问权限",
        );
    }

    let tab = match normalize_tab(query.tab.as_deref()) {
        Ok(value) => value,
        Err(message) => return json_message_response(StatusCode::BAD_REQUEST, message),
    };
    let requested_month = match normalize_month(query.month.as_deref()) {
        Ok(value) => value,
        Err(message) => return json_message_response(StatusCode::BAD_REQUEST, message),
    };
    let requested_brand = normalize_brand(query.brand.as_deref());

    let payload = match build_payload(
        &state.pool,
        tab,
        requested_month.as_deref(),
        requested_brand.as_deref(),
    )
    .await
    {
        Ok(value) => value,
        Err(raw_error) => {
            error!(
                target: "dashboard-industry-material-inspiration",
                raw_error = %raw_error,
                "query failed"
            );
            return json_message_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "行业素材灵感 ADS 查询失败，请确认迁移与 ADS 刷新已执行",
            );
        }
    };

    (StatusCode::OK, Json(payload)).into_response()
}

pub(crate) async fn post_industry_material_brand_ai_analysis_backfill(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<IndustryMaterialBrandAiBackfillRequest>,
) -> AppResult<Json<IndustryMaterialBrandAiBackfillResponse>> {
    if !can_access_industry_material_inspiration_dashboard(&current_user) {
        return Err(AppError::Forbidden);
    }
    marketing::ensure_content_asset_manage_permission(&current_user)?;

    let normalized = normalize_brand_ai_backfill_request(payload)?;
    let response =
        backfill_brand_ai_analysis_jobs(&state, normalized, current_user.username.as_deref())
            .await?;
    Ok(Json(response))
}

fn normalize_tab(value: Option<&str>) -> Result<&'static str, &'static str> {
    let Some(raw_value) = value else {
        return Ok(DEFAULT_TAB);
    };

    match raw_value.trim() {
        "" | DEFAULT_TAB => Ok(DEFAULT_TAB),
        DOUYIN_GOODS_TAB => Ok(DOUYIN_GOODS_TAB),
        XHS_TAB => Ok(XHS_TAB),
        _ => Err("参数校验失败：tab 仅支持 douyin_live_lead_short_video、douyin_goods_short_video 或 xhs_note"),
    }
}

fn tab_video_type(tab: &str) -> Option<&'static str> {
    match tab {
        DOUYIN_LIVE_LEAD_TAB => Some(LIVE_LEAD_VIDEO_TYPE),
        DOUYIN_GOODS_TAB => Some(GOODS_VIDEO_TYPE),
        _ => None,
    }
}

fn normalize_month(value: Option<&str>) -> Result<Option<String>, &'static str> {
    let Some(raw_value) = value else {
        return Ok(None);
    };
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.len() != 7 {
        return Err("参数校验失败：month 必须为 YYYY-MM");
    }

    let candidate = format!("{trimmed}-01");
    NaiveDate::parse_from_str(candidate.as_str(), "%Y-%m-%d")
        .map(|_| Some(trimmed.to_string()))
        .map_err(|_| "参数校验失败：month 必须为 YYYY-MM")
}

fn normalize_brand(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    (!trimmed.is_empty() && trimmed != ALL_BRANDS_KEY).then(|| trimmed.to_string())
}

fn normalize_brand_ai_backfill_request(
    payload: IndustryMaterialBrandAiBackfillRequest,
) -> AppResult<NormalizedIndustryMaterialBrandAiBackfill> {
    let tab = normalize_tab(Some(payload.tab.as_str())).map_err(AppError::bad_request)?;
    let Some(video_type) = tab_video_type(tab) else {
        return Err(AppError::bad_request(
            "视频理解补齐暂仅支持抖音千川素材，不支持当前 tab",
        ));
    };
    let month = normalize_month(Some(payload.month.as_str()))
        .map_err(AppError::bad_request)?
        .ok_or_else(|| AppError::bad_request("month 必须为 YYYY-MM"))?;
    let brand = normalize_brand(Some(payload.brand.as_str()))
        .ok_or_else(|| AppError::bad_request("请选择单个品牌后再补齐视频理解"))?;
    let source = normalize_brand_ai_backfill_source(payload.source)?;
    let profile = normalize_brand_ai_backfill_profile(payload.profile)?;
    let limit = payload.limit.unwrap_or(DEFAULT_BRAND_AI_BACKFILL_LIMIT);
    if !(1..=MAX_BRAND_AI_BACKFILL_LIMIT).contains(&limit) {
        return Err(AppError::bad_request(
            "视频理解补齐 limit 必须在 1 到 100 之间",
        ));
    }

    Ok(NormalizedIndustryMaterialBrandAiBackfill {
        tab,
        month,
        video_type,
        brand,
        source,
        profile,
        limit,
    })
}

fn normalize_brand_ai_backfill_source(value: Option<String>) -> AppResult<String> {
    let source = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("auto");
    match source {
        "preview" | "raw" | "auto" => Ok(source.to_string()),
        _ => Err(AppError::bad_request(
            "视频理解来源必须是 preview / raw / auto",
        )),
    }
}

fn normalize_brand_ai_backfill_profile(value: Option<String>) -> AppResult<Option<String>> {
    let Some(profile) = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    match profile {
        "preview_fast" | "raw_deep" | "action_detail" => Ok(Some(profile.to_string())),
        _ => Err(AppError::bad_request("视频理解 profile 不合法")),
    }
}

async fn build_payload(
    pool: &PgPool,
    tab: &str,
    requested_month: Option<&str>,
    requested_brand: Option<&str>,
) -> Result<IndustryMaterialInspirationResponse, String> {
    if tab == XHS_TAB {
        let selected_month = requested_month
            .map(ToString::to_string)
            .unwrap_or_else(current_month_label);
        let placeholder = json!({
            "title": "小红书笔记暂未接入",
            "description": "后续会按同一素材灵感口径接入小红书笔记 ADS 与归档链路。"
        });
        return Ok(IndustryMaterialInspirationResponse {
            tab: XHS_TAB.to_string(),
            active_tab: XHS_TAB.to_string(),
            tabs: tab_payload(),
            available_months: json!([]),
            month: selected_month.clone(),
            selected_month,
            summary: empty_summary(),
            rows: json!([]),
            brand_options: json!([]),
            selected_brand: Value::Null,
            brand_insight: Value::Null,
            empty_state: placeholder.clone(),
            placeholder,
        });
    }

    let Some(video_type) = tab_video_type(tab) else {
        return Err(format!(
            "unsupported industry material inspiration tab: {tab}"
        ));
    };

    let available_months = fetch_available_months(pool, video_type).await?;
    let selected_month = resolve_selected_month(pool, video_type, requested_month).await?;
    let (summary, rows, brand_options, selected_brand, brand_insight) =
        fetch_douyin_payload(pool, selected_month.as_str(), video_type, requested_brand).await?;

    Ok(IndustryMaterialInspirationResponse {
        tab: tab.to_string(),
        active_tab: tab.to_string(),
        tabs: tab_payload(),
        available_months,
        month: selected_month.clone(),
        selected_month,
        summary,
        rows,
        brand_options,
        selected_brand,
        brand_insight,
        empty_state: Value::Null,
        placeholder: Value::Null,
    })
}

async fn fetch_available_months(pool: &PgPool, video_type: &str) -> Result<Value, String> {
    let row = sqlx::query(AVAILABLE_MONTHS_SQL)
        .bind(video_type)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    row.try_get::<Value, _>("available_months")
        .map_err(|error| error.to_string())
}

async fn resolve_selected_month(
    pool: &PgPool,
    video_type: &str,
    requested_month: Option<&str>,
) -> Result<String, String> {
    if let Some(month) = requested_month {
        return Ok(month.to_string());
    }

    let row = sqlx::query(LATEST_MONTH_SQL)
        .bind(video_type)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    let latest_month = row
        .try_get::<Option<String>, _>("latest_month")
        .map_err(|error| error.to_string())?;

    Ok(latest_month.unwrap_or_else(current_month_label))
}

async fn fetch_douyin_payload(
    pool: &PgPool,
    month: &str,
    video_type: &str,
    requested_brand: Option<&str>,
) -> Result<(Value, Value, Value, Value, Value), String> {
    let month_start = format!("{month}-01");
    let storage_readiness = query_video_understanding_storage_readiness(pool).await?;
    let query_sql = build_douyin_payload_sql(storage_readiness);
    let row = sqlx::query(query_sql.as_str())
        .bind(month_start)
        .bind(video_type)
        .bind(requested_brand)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    let summary = row
        .try_get::<Value, _>("summary_payload")
        .map_err(|error| error.to_string())?;
    let rows = row
        .try_get::<Value, _>("rows_payload")
        .map_err(|error| error.to_string())?;
    let brand_options = row
        .try_get::<Value, _>("brand_options_payload")
        .map_err(|error| error.to_string())?;
    let selected_brand = row
        .try_get::<Option<Value>, _>("selected_brand_payload")
        .map_err(|error| error.to_string())?
        .unwrap_or(Value::Null);
    let brand_insight = row
        .try_get::<Option<Value>, _>("brand_insight_payload")
        .map_err(|error| error.to_string())?
        .unwrap_or(Value::Null);

    Ok((summary, rows, brand_options, selected_brand, brand_insight))
}

async fn backfill_brand_ai_analysis_jobs(
    state: &Arc<AppState>,
    request: NormalizedIndustryMaterialBrandAiBackfill,
    actor: Option<&str>,
) -> AppResult<IndustryMaterialBrandAiBackfillResponse> {
    let storage_readiness = query_video_understanding_storage_readiness(&state.pool)
        .await
        .map_err(|error| {
            error!(
                target: "dashboard-industry-material-inspiration",
                raw_error = %error,
                "check video understanding storage readiness failed"
            );
            AppError::Internal
        })?;
    if !storage_readiness.storage_ready() {
        return Err(AppError::Conflict(
            "结构化视频理解存储未就绪，未创建任务；请先应用 20260713_1100 migration 并通过 readiness check"
                .to_string(),
        ));
    }

    let scope = query_brand_ai_backfill_scope(&state.pool, &request, storage_readiness).await?;
    let Some(scope) = scope else {
        return Err(AppError::bad_request(
            "未找到当前品牌/月/内容类型范围内的素材，未创建视频理解任务",
        ));
    };
    let asset_rows = query_brand_ai_backfill_assets(
        &state.pool,
        &request,
        scope.key.as_str(),
        storage_readiness,
    )
    .await?;

    let ready_assets = asset_rows
        .iter()
        .filter(|asset| asset.has_structured_video_understanding)
        .count() as i64;
    let existing_ai_artifact_assets = asset_rows
        .iter()
        .filter(|asset| !asset.has_structured_video_understanding && asset.has_analysis_artifact)
        .count() as i64;
    let existing_any_ai_assets = asset_rows
        .iter()
        .filter(|asset| asset.has_any_ai_analysis)
        .count() as i64;
    let mut response = IndustryMaterialBrandAiBackfillResponse {
        brand: IndustryMaterialBrandAiBackfillBrand {
            key: scope.key.clone(),
            label: scope.label.clone(),
        },
        tab: request.tab.to_string(),
        month: request.month.clone(),
        source: request.source.clone(),
        profile: request.profile.clone(),
        scanned_assets: scope.linked_assets,
        candidate_assets: asset_rows
            .iter()
            .filter(|asset| !asset.has_structured_video_understanding)
            .count() as i64,
        limit: request.limit,
        limit_reached: false,
        queued_jobs: 0,
        queued_cache_hydration_jobs: 0,
        queued_model_analysis_jobs: 0,
        existing_any_ai_assets,
        existing_ai_artifact_assets,
        structured_storage_ready: true,
        skipped_ready_assets: ready_assets,
        skipped_running_jobs: 0,
        skipped_no_input: 0,
        skipped_existing_jobs: 0,
        missing_analysis_before: Some((asset_rows.len() as i64 - ready_assets).max(0)),
        remaining_missing_after_click: 0,
        worker_trigger: brand_ai_worker_trigger::BrandAiBackfillWorkerTrigger::not_requested(0),
        message: String::new(),
    };

    let enqueue_result = brand_ai_backfill_enqueue::enqueue_brand_ai_backfill_jobs(
        &state.pool,
        &asset_rows,
        &request,
        actor,
    )
    .await?;
    response.queued_jobs = enqueue_result.queued_jobs;
    response.queued_cache_hydration_jobs = enqueue_result.queued_cache_hydration_jobs;
    response.queued_model_analysis_jobs = enqueue_result.queued_model_analysis_jobs;
    response.skipped_ready_assets += enqueue_result.skipped_ready_assets;
    response.skipped_running_jobs = enqueue_result.skipped_running_jobs;
    response.skipped_no_input = enqueue_result.skipped_no_input;
    response.skipped_existing_jobs = enqueue_result.skipped_existing_jobs;

    let missing_before = response.missing_analysis_before.unwrap_or(0);
    response.remaining_missing_after_click = (missing_before - response.queued_jobs).max(0);
    response.limit_reached = response.queued_jobs >= request.limit;
    response.worker_trigger = brand_ai_worker_trigger::trigger(state, response.queued_jobs).await;
    response.message = build_brand_ai_backfill_message(&response, scope.total_materials);
    Ok(response)
}

async fn query_brand_ai_backfill_scope(
    pool: &PgPool,
    request: &NormalizedIndustryMaterialBrandAiBackfill,
    storage_readiness: VideoUnderstandingStorageReadiness,
) -> AppResult<Option<BrandAiBackfillScope>> {
    let month_start = format!("{}-01", request.month);
    let query_sql = brand_resolution_sql::inject(
        BRAND_AI_BACKFILL_SCOPE_SQL,
        storage_readiness.brand_resolution_table_available,
    );
    let row = sqlx::query(query_sql.as_str())
        .bind(month_start)
        .bind(request.video_type)
        .bind(request.brand.as_str())
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(
                target: "dashboard-industry-material-inspiration",
                raw_error = %error,
                "query brand ai backfill scope failed"
            );
            AppError::Internal
        })?;

    Ok(row.map(|row| BrandAiBackfillScope {
        key: row.try_get("key").unwrap_or_else(|_| request.brand.clone()),
        label: row
            .try_get("label")
            .unwrap_or_else(|_| request.brand.clone()),
        total_materials: row.try_get("total_materials").unwrap_or(0),
        linked_assets: row.try_get("linked_assets").unwrap_or(0),
    }))
}

async fn query_brand_ai_backfill_assets(
    pool: &PgPool,
    request: &NormalizedIndustryMaterialBrandAiBackfill,
    brand_key: &str,
    storage_readiness: VideoUnderstandingStorageReadiness,
) -> AppResult<Vec<BrandAiBackfillAsset>> {
    let query_sql = build_brand_ai_backfill_assets_sql(
        storage_readiness.results_table_available,
        storage_readiness.brand_resolution_table_available,
    );
    let month_start = format!("{}-01", request.month);
    let rows = sqlx::query(query_sql.as_str())
        .bind(month_start)
        .bind(request.video_type)
        .bind(brand_key)
        .bind(request.source.as_str())
        .fetch_all(pool)
        .await
        .map_err(|error| {
            error!(
                target: "dashboard-industry-material-inspiration",
                raw_error = %error,
                "query brand ai backfill assets failed"
            );
            AppError::Internal
        })?;

    Ok(rows
        .into_iter()
        .map(|row| BrandAiBackfillAsset {
            asset_id: row.get("asset_id"),
            has_structured_video_understanding: row
                .try_get("has_structured_video_understanding")
                .unwrap_or(false),
            has_any_ai_analysis: row.try_get("has_any_ai_analysis").unwrap_or(false),
            has_analysis_artifact: row.try_get("has_analysis_artifact").unwrap_or(false),
            has_input: row.try_get("has_input").unwrap_or(false),
            active_job_status: row.try_get("active_job_status").ok(),
        })
        .collect())
}

fn build_brand_ai_backfill_message(
    response: &IndustryMaterialBrandAiBackfillResponse,
    total_materials: i64,
) -> String {
    if response.queued_jobs > 0 {
        return format!(
            "已为 {brand} 新增排队 {queued} 个结构化视频理解任务，其中 {hydration} 个复用已有 AI 结果且不调用模型，{model} 个需要执行模型分析；本次只请求 1 个即时 Prefect flow run，单次处理上限 {immediate_limit} 条，其余任务由定时调度继续处理。",
            brand = response.brand.label,
            queued = response.queued_jobs,
            hydration = response.queued_cache_hydration_jobs,
            model = response.queued_model_analysis_jobs,
            immediate_limit = response.worker_trigger.immediate_limit,
        );
    }
    if total_materials == 0 {
        return format!(
            "{} 当前月份暂无素材行，未创建视频理解任务。",
            response.brand.label
        );
    }
    if response.scanned_assets == 0 {
        return format!(
            "{} 当前月份暂无已归档素材，需先完成素材归档后再补齐视频理解。",
            response.brand.label
        );
    }
    if response.candidate_assets == 0 {
        return format!("{} 当前已归档素材暂无缺失视频理解。", response.brand.label);
    }

    format!(
        "没有新增排队任务：{ready} 条已覆盖，{running} 条已有排队/运行任务，{no_input} 条缺少可分析输入；请稍后刷新或检查素材归档。",
        ready = response.skipped_ready_assets,
        running = response.skipped_running_jobs,
        no_input = response.skipped_no_input,
    )
}

async fn query_video_understanding_storage_readiness(
    pool: &PgPool,
) -> Result<VideoUnderstandingStorageReadiness, String> {
    let row = sqlx::query(VIDEO_UNDERSTANDING_STORAGE_READINESS_SQL)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    Ok(VideoUnderstandingStorageReadiness {
        results_table_available: row
            .try_get::<bool, _>("results_table_available")
            .map_err(|error| error.to_string())?,
        brand_resolution_table_available: row
            .try_get::<bool, _>("brand_resolution_table_available")
            .map_err(|error| error.to_string())?,
        storage_ready: row
            .try_get::<bool, _>("storage_ready")
            .map_err(|error| error.to_string())?,
    })
}

fn current_month_label() -> String {
    let now = Utc::now();
    format!("{:04}-{:02}", now.year(), now.month())
}

fn tab_payload() -> Value {
    json!([
        {
            "key": DOUYIN_LIVE_LEAD_TAB,
            "label": "抖音直播引流短视频",
            "status": "available"
        },
        {
            "key": DOUYIN_GOODS_TAB,
            "label": "抖音带货短视频",
            "status": "available"
        },
        {
            "key": XHS_TAB,
            "label": "小红书笔记",
            "status": "placeholder"
        }
    ])
}

fn empty_summary() -> Value {
    json!({
        "totalCount": 0,
        "brandCount": 0,
        "archivedCount": 0,
        "unarchivedCount": 0,
        "totalExposure": 0,
        "avgCompletionRate": null,
        "avgCtr": null,
        "avgCvr": null,
        "avgPlay3sRate": null,
        "avgPlay5sRate": null,
        "avgInteractionRate": null,
        "avgPvr": null,
        "updatedAt": null
    })
}
