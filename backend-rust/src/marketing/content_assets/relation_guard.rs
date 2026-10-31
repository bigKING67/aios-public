//! Existence checks for optional groland warehouse relations. A database built
//! for AI 创作中心 alone (`bql_aios`) does not carry them, and reads that only
//! enrich an asset with Qianchuan / short-video data must degrade to "none".

use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) const DOUYIN_SHORTVIDEO_DETAIL: &str = "ads.douyin_shortvideo_detail";
pub(super) const QIANCHUAN_MATERIAL_PERFORMANCE_DAILY: &str =
    "dwd.marketing_content_qianchuan_material_performance_di";

pub(super) async fn relation_exists(pool: &PgPool, relation: &'static str) -> AppResult<bool> {
    let row = sqlx::query("SELECT to_regclass($1) IS NOT NULL AS exists")
        .bind(relation)
        .fetch_one(pool)
        .await
        .map_err(|err| {
            error!(?err, relation, "check optional relation failed");
            AppError::Internal
        })?;
    Ok(row.try_get::<bool, _>("exists").unwrap_or(false))
}
