use super::{
    daily_remix, daily_remix_read, daily_remix_types::*, error::StudioResult, repository::db_error,
};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    Json,
};
use chrono::NaiveDate;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::sync::Arc;

fn authenticate(headers: &HeaderMap, expected: Option<&str>) -> AppResult<()> {
    let expected = expected
        .filter(|s| s.len() >= 32)
        .ok_or(AppError::Unauthorized)?;
    let supplied = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|s| s.len() >= 32 && s.len() <= 4096)
        .ok_or(AppError::Unauthorized)?;
    // Compare fixed-length keyed digests with the library's constant-time verify.
    let mut given =
        Hmac::<Sha256>::new_from_slice(supplied.as_bytes()).map_err(|_| AppError::Unauthorized)?;
    given.update(b"aios-daily-remix-service-v1");
    let mut wanted =
        Hmac::<Sha256>::new_from_slice(expected.as_bytes()).map_err(|_| AppError::Unauthorized)?;
    wanted.update(b"aios-daily-remix-service-v1");
    wanted
        .verify_slice(&given.finalize().into_bytes())
        .map_err(|_| AppError::Unauthorized)
}

fn date(raw: &str) -> AppResult<NaiveDate> {
    let date = NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .map_err(|_| AppError::bad_request("日期必须为 YYYY-MM-DD"))?;
    if date.to_string() != raw
        || date < NaiveDate::from_ymd_opt(2020, 1, 1).unwrap()
        || date > daily_remix::today()
    {
        return Err(AppError::bad_request("日期必须在 2020 年至今天之间"));
    }
    Ok(date)
}

pub(super) async fn run(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DailyRemixRunRequest>,
) -> StudioResult<Json<DailyRemixPlanResponse>> {
    authenticate(
        &headers,
        state.settings.daily_remix.service_token.as_deref(),
    )?;
    super::guard(&state.settings, &daily_remix::actor(), true)?;
    let date = date(&request.date)?;
    if date != daily_remix::today() {
        return Err(AppError::bad_request("每日混剪只能触发北京时间当天的计划").into());
    }
    Ok(Json(
        daily_remix::run(&state.pool, &state.settings, date).await?,
    ))
}

pub(super) async fn get(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<DailyRemixQuery>,
) -> StudioResult<Json<DailyRemixPlanResponse>> {
    super::guard(&state.settings, &user, false)?;
    // Scoped deployments expose this system-owned plan only to content managers.
    if !state.settings.content_ai_studio_open_access {
        super::super::permissions::ensure_content_asset_manage_permission(&user)?;
    }
    let date = query
        .date
        .as_deref()
        .map(date)
        .transpose()?
        .unwrap_or_else(daily_remix::today);
    Ok(Json(
        daily_remix_read::read(&state.pool, &state.settings, date).await?,
    ))
}

pub(super) async fn pause(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<DailyRemixPauseRequest>,
) -> StudioResult<Json<DailyRemixPlanResponse>> {
    super::guard(&state.settings, &user, true)?;
    super::super::permissions::ensure_content_asset_manage_permission(&user)?;
    let date = date(&request.date)?;
    if date != daily_remix::today() {
        return Err(AppError::bad_request("只能暂停或恢复当天计划").into());
    }
    let mut tx = state.pool.begin().await.map_err(db_error)?;
    daily_remix::lock_day(&mut tx, date).await?;
    sqlx::query("INSERT INTO ads.content_daily_remix_plans(plan_date,paused) VALUES ($1,$2) ON CONFLICT(plan_date) DO UPDATE SET paused=$2, updated_at=NOW()")
        .bind(date).bind(request.paused).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(
        daily_remix_read::read(&state.pool, &state.settings, date).await?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn service_token_is_explicit_and_does_not_accept_user_cookie_or_wrong_token() {
        let token = "fixture-only-service-token-32bytes-long";
        let mut headers = HeaderMap::new();
        headers.insert("cookie", "aios_access_token=fixture".parse().unwrap());
        assert!(authenticate(&headers, Some(token)).is_err());
        headers.insert("authorization", format!("Bearer {token}").parse().unwrap());
        assert!(authenticate(&headers, None).is_err());
        assert!(authenticate(&headers, Some("short")).is_err());
        assert!(authenticate(&headers, Some(token)).is_ok());
        headers.insert(
            "authorization",
            "Bearer fixture-only-service-token-wrong-value"
                .parse()
                .unwrap(),
        );
        assert!(authenticate(&headers, Some(token)).is_err());
    }
    #[test]
    fn dates_are_canonical_and_bounded() {
        assert!(date("2026-1-1").is_err());
        assert!(date("2026-02-30").is_err());
        assert!(date("2019-01-01").is_err());
        assert!(date("-2026-01-01").is_err());
        assert!(date("9999-01-01").is_err());
        assert!(date("2020-01-01").is_ok());
    }
}
