//! Atomic collection and explicit metadata editing. Re-pasting is never an implicit edit.
use super::super::douyin_video_link::resolve_douyin_video_id;
use super::{
    competitor::{fetch_video, optional_text, valid_aweme_id},
    competitor_types::{
        CompetitorVideo, CreateCompetitorVideoRequest, UpdateCompetitorVideoRequest,
    },
    error::StudioResult,
    repository::db_error,
};
use crate::{auth::CurrentUser, config::Settings, error::AppError};
use sqlx::PgPool;

pub(super) async fn create_video(
    pool: &PgPool,
    settings: &Settings,
    user: &CurrentUser,
    request: CreateCompetitorVideoRequest,
) -> StudioResult<CompetitorVideo> {
    let resolved = resolve_douyin_video_id(request.share_url.as_str()).await?;
    collect(
        pool,
        settings,
        &user.user_id,
        &resolved.external_video_id,
        &resolved.source_url,
        request,
    )
    .await
}

pub(super) async fn collect(
    pool: &PgPool,
    settings: &Settings,
    user_id: &str,
    aweme_id: &str,
    share_url: &str,
    request: CreateCompetitorVideoRequest,
) -> StudioResult<CompetitorVideo> {
    if !valid_aweme_id(aweme_id) {
        return Err(AppError::bad_request("未解析到有效的抖音视频 ID").into());
    }
    let brand = optional_text(request.brand_name, "brandName", 120)?;
    let category = optional_text(request.product_category, "productCategory", 120)?;
    let notes = optional_text(request.notes, "notes", 500)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let inserted: Option<String> = sqlx::query_scalar(
        "INSERT INTO competitor.videos (aweme_id, share_url, brand_name, product_category, notes, created_by, manual_added_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (aweme_id) DO NOTHING RETURNING aweme_id")
        .bind(aweme_id).bind(share_url).bind(brand).bind(category).bind(notes).bind(user_id)
        .fetch_optional(&mut *tx).await.map_err(db_error)?;
    if inserted.is_none() {
        sqlx::query("UPDATE competitor.videos SET manual_added_at = COALESCE(manual_added_at, CASE WHEN source = 'manual' THEN first_seen_at ELSE NOW() END) WHERE aweme_id = $1 AND manual_added_at IS NULL")
            .bind(aweme_id).execute(&mut *tx).await.map_err(db_error)?;
    }
    tx.commit().await.map_err(db_error)?;
    let mut video = fetch_video(pool, Some(settings), aweme_id).await?;
    video.add_outcome = Some(
        if inserted.is_some() {
            "created"
        } else {
            "existing"
        }
        .to_string(),
    );
    Ok(video)
}

pub(super) async fn update_video(
    pool: &PgPool,
    settings: &Settings,
    aweme_id: &str,
    request: UpdateCompetitorVideoRequest,
) -> StudioResult<CompetitorVideo> {
    let brand = optional_text(Some(request.brand_name), "brandName", 120)?;
    let category = optional_text(Some(request.product_category), "productCategory", 120)?;
    let notes = optional_text(Some(request.notes), "notes", 500)?;
    let result = sqlx::query("UPDATE competitor.videos SET brand_name=$2, product_category=$3, notes=$4 WHERE aweme_id=$1")
        .bind(aweme_id).bind(brand).bind(category).bind(notes).execute(pool).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound.into());
    }
    fetch_video(pool, Some(settings), aweme_id).await
}
