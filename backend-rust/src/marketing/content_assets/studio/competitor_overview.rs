//! 竞品爆款 · 爆款分析: counts over the same scope as the statistics snapshot (latest
//! succeeded or partial analysis per film, card category, Beijing first-seen date). The
//! structure rankings come from the snapshot through the patterns endpoint; nothing here
//! recomputes them. `opening_frame` also picks the 爆款视频 list thumbnails.

use serde_json::Value;
use sqlx::Row;

use super::{
    competitor_types::{
        CompetitorOverviewCounts, CompetitorOverviewResponse, CompetitorPatternsQuery,
    },
    competitor_window::resolve_scope,
    error::StudioResult,
    repository::db_error,
};
use crate::state::AppState;

// $1 category (`all` keeps every category). Mirrors snapshots.py LOAD_SQL + build().
pub(super) const SCOPED_CTE: &str = "WITH latest AS ( \
      SELECT DISTINCT ON (a.aweme_id) a.aweme_id, a.analysis_id, a.card, a.evidence_objects \
      FROM competitor.analyses a WHERE a.status IN ('succeeded', 'partial') \
      ORDER BY a.aweme_id, a.finished_at DESC NULLS LAST, a.created_at DESC), \
    scoped AS ( \
      SELECT l.aweme_id, l.analysis_id, l.card, l.evidence_objects, v.title, v.first_seen_at, \
        (v.first_seen_at AT TIME ZONE 'Asia/Shanghai')::DATE AS seen_date, \
        COALESCE(NULLIF(BTRIM(l.card->'product'->>'brand'), ''), NULLIF(BTRIM(v.brand_name), '')) AS brand \
      FROM latest l JOIN competitor.videos v ON v.aweme_id = l.aweme_id \
      WHERE $1 = 'all' OR l.card->'product'->>'category' = $1)";

// $2..$3 the window's first and last dates (NULL = all time); $4..$5 the period before (NULL = none).
pub(super) const COUNTS_SELECT: &str = "SELECT \
      COUNT(*) FILTER (WHERE $2::DATE IS NULL OR s.seen_date BETWEEN $2 AND $3) AS analyzed, \
      COUNT(DISTINCT s.brand) FILTER (WHERE $2::DATE IS NULL OR s.seen_date BETWEEN $2 AND $3) AS brands, \
      COUNT(*) FILTER (WHERE s.seen_date BETWEEN $4::DATE AND $5::DATE) AS previous_analyzed, \
      COUNT(DISTINCT s.brand) FILTER (WHERE s.seen_date BETWEEN $4::DATE AND $5::DATE) AS previous_brands \
    FROM scoped s";

const ANALYZING_SELECT: &str =
    "SELECT COUNT(*) AS analyzing FROM competitor.analyses WHERE status IN ('queued', 'running')";

/// The earliest stored evidence frame (key and time); only `competitor/evidence/` keys qualify.
pub(super) fn opening_frame(evidence: &Value) -> Option<(String, i64)> {
    evidence
        .as_array()?
        .iter()
        .filter(|item| item.get("kind").and_then(Value::as_str) == Some("frame"))
        .filter_map(|item| {
            let key = item.get("objectKey").and_then(Value::as_str)?;
            let at = item.get("startMs").and_then(Value::as_i64)?;
            key.starts_with("competitor/evidence/")
                .then(|| (key.to_string(), at))
        })
        .min_by_key(|(_, at)| *at)
}

pub(super) async fn overview(
    state: &AppState,
    query: CompetitorPatternsQuery,
) -> StudioResult<CompetitorOverviewResponse> {
    let scope = resolve_scope(&state.pool, &query).await?;
    let (first, last) = scope.bounds().unzip();
    let previous_window = scope.previous();
    let (previous_first, previous_last) = previous_window.unzip();

    let counts = sqlx::query(sqlx::AssertSqlSafe(format!("{SCOPED_CTE} {COUNTS_SELECT}")))
        .bind(&scope.category)
        .bind(first)
        .bind(last)
        .bind(previous_first)
        .bind(previous_last)
        .fetch_one(&state.pool)
        .await
        .map_err(db_error)?;
    let current = CompetitorOverviewCounts {
        analyzed: counts.get("analyzed"),
        brands: counts.get("brands"),
    };
    let previous = previous_window.map(|_| CompetitorOverviewCounts {
        analyzed: counts.get("previous_analyzed"),
        brands: counts.get("previous_brands"),
    });

    let analyzing = sqlx::query(ANALYZING_SELECT)
        .fetch_one(&state.pool)
        .await
        .map_err(db_error)?
        .get("analyzing");

    Ok(CompetitorOverviewResponse {
        window: scope.period(),
        category: scope.category,
        period: scope.key,
        current,
        previous,
        analyzing,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::opening_frame;

    #[test]
    fn opening_frame_is_the_earliest_stored_evidence_frame() {
        let evidence = json!([
            {"kind": "clip", "startMs": 0, "objectKey": "competitor/evidence/a/clip.mp4"},
            {"kind": "frame", "startMs": 2400, "objectKey": "competitor/evidence/a/frame-2.webp"},
            {"kind": "frame", "startMs": 300, "objectKey": "competitor/evidence/a/frame-1.webp"},
            {"kind": "frame", "startMs": 0, "objectKey": "raw/elsewhere.webp"},
        ]);
        assert_eq!(
            opening_frame(&evidence),
            Some(("competitor/evidence/a/frame-1.webp".to_string(), 300))
        );
        assert_eq!(
            opening_frame(&json!([{"kind": "clip", "startMs": 0}])),
            None
        );
        assert_eq!(opening_frame(&json!({"kind": "frame"})), None);
    }
}
