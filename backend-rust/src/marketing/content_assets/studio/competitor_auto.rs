//! 罗盘 auto analyses: every imported traffic video (competitor.compass_*, imported on the GPU node)
//! is queued through the same path as a click on 爆款视频, regardless of room rank or ranking date.
//!
//! The queue stays shallow: the GPU node drains a few at a time, and an analysis queued over ten
//! minutes is claimed by the VPS fallback, which has no GPU and writes no structure. One automatic
//! first attempt per imported video, plus one persisted recovery attempt for unfinished history.

use std::{sync::Arc, time::Duration};

use sqlx::PgPool;
use tracing::{info, warn};

use super::{competitor, error::StudioResult, repository::db_error};
use crate::state::AppState;

pub(super) const AUTO_REQUESTER: &str = "compass-auto";
pub(super) const AUTO_REPAIR_REQUESTER: &str = "compass-auto-repair";
// Preserve the deployed emergency-off setting; positive legacy ranks no longer restrict coverage.
const LEGACY_TOP_RANK_ENV: &str = "COMPETITOR_AUTO_ANALYZE_TOP_RANK";
const MAX_ACTIVE: i64 = 6;
const INTERVAL: Duration = Duration::from_secs(10);

fn enabled(legacy_rank: Option<&str>) -> bool {
    legacy_rank.and_then(|raw| raw.trim().parse::<i32>().ok()) != Some(0)
}

pub(super) fn spawn(state: Arc<AppState>) {
    if !enabled(std::env::var(LEGACY_TOP_RANK_ENV).ok().as_deref()) {
        info!("competitor auto analysis disabled ({LEGACY_TOP_RANK_ENV}=0)");
        return;
    }
    tokio::spawn(async move {
        info!(
            scope = "all_imported",
            max_active = MAX_ACTIVE,
            poll_seconds = INTERVAL.as_secs(),
            "competitor auto analysis started"
        );
        loop {
            match tick(&state).await {
                Ok(0) => {}
                Ok(queued) => info!(queued, "competitor auto analyses queued"),
                Err(error) => warn!(?error, "competitor auto analysis tick failed"),
            }
            tokio::time::sleep(INTERVAL).await;
        }
    });
}

async fn tick(state: &Arc<AppState>) -> StudioResult<usize> {
    let active: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM competitor.analyses WHERE status IN ('queued', 'running')",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(db_error)?;
    let room = MAX_ACTIVE - active;
    if room <= 0 {
        return Ok(0);
    }
    let mut queued = 0;
    for (aweme_id, retry) in candidates(&state.pool, room).await? {
        let requester = if retry {
            AUTO_REPAIR_REQUESTER
        } else {
            AUTO_REQUESTER
        };
        let result = competitor::queue_analysis(state, requester, &aweme_id).await?;
        if matches!(result.status.as_str(), "queued" | "running") {
            queued += 1;
        }
    }
    Ok(queued)
}

/// New imports first, then unfinished requested analyses (including manual history). No date cutoff.
/// The unique repair index is the final concurrency fence; exhausted inline repairs are not requeued.
pub(super) async fn candidates(pool: &PgPool, limit: i64) -> StudioResult<Vec<(String, bool)>> {
    sqlx::query_as(
        "SELECT v.aweme_id, latest.analysis_id IS NOT NULL AS retry FROM competitor.videos v \
         LEFT JOIN LATERAL (SELECT analysis_id, card FROM competitor.analyses \
           WHERE aweme_id=v.aweme_id ORDER BY created_at DESC LIMIT 1) latest ON TRUE \
         LEFT JOIN LATERAL (SELECT max(data_date) AS data_date FROM competitor.compass_traffic_videos_daily \
           WHERE aweme_id=v.aweme_id) ranking ON TRUE \
         WHERE v.availability NOT IN ('removed', 'private') \
           AND (ranking.data_date IS NOT NULL OR latest.analysis_id IS NOT NULL) \
           AND NOT EXISTS (SELECT 1 FROM competitor.analyses a WHERE a.aweme_id = v.aweme_id AND ( \
             a.status IN ('queued', 'running') \
             OR (a.status = 'succeeded' AND a.card -> 'framework' ->> 'status' = 'ok' \
                 AND NOT (a.card -> 'framework' ?| ARRAY['transcriptError', 'sellingPointError'])) \
             OR a.requested_by = $1)) \
           AND COALESCE(latest.card #>> '{framework,sellingPointRecovery,exhausted}', 'false') <> 'true' \
         ORDER BY latest.analysis_id IS NOT NULL, ranking.data_date DESC NULLS LAST, v.aweme_id LIMIT $2",
    )
    .bind(AUTO_REPAIR_REQUESTER)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(db_error)
}

#[cfg(test)]
mod tests {
    use super::enabled;

    #[test]
    fn all_imports_are_enabled_unless_legacy_switch_is_zero() {
        for value in [None, Some("20"), Some("500"), Some(""), Some("invalid")] {
            assert!(enabled(value), "{value:?}");
        }
        assert!(!enabled(Some("0")));
        assert!(!enabled(Some(" 0 ")));
    }
}
