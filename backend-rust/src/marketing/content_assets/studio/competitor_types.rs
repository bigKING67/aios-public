//! 竞品爆款 API shapes. The OpenAPI generator reads these structs by name, so keep
//! them as plain serde structs.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::overview_types::StudioOverviewPeriod;

/// Paste a Douyin share link (or text containing one). An existing video keeps
/// its row and metadata; an explicit metadata edit is separate from collection.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateCompetitorVideoRequest {
    pub(super) share_url: String,
    #[serde(default)]
    pub(super) brand_name: Option<String>,
    #[serde(default)]
    pub(super) product_category: Option<String>,
    #[serde(default)]
    pub(super) notes: Option<String>,
}

/// Latest analysis of a video, for list rows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorAnalysisSummary {
    pub(super) analysis_id: Uuid,
    /// One of queued, running, succeeded, partial, failed or cancelled.
    pub(super) status: String,
    pub(super) complete: bool,
    pub(super) cost_yuan: Option<f64>,
    pub(super) created_at: String,
    pub(super) finished_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorVideo {
    pub(super) aweme_id: String,
    pub(super) share_url: String,
    pub(super) title: Option<String>,
    pub(super) author_name: Option<String>,
    pub(super) brand_name: Option<String>,
    pub(super) product_category: Option<String>,
    pub(super) duration_seconds: Option<f64>,
    /// Last resolution result (available, removed, private or unknown).
    pub(super) availability: String,
    /// manual (pasted link) or compass (rank import).
    pub(super) source: String,
    /// Provenance memberships; not mutually exclusive.
    pub(super) sources: Vec<String>,
    pub(super) manual_added_at: Option<String>,
    pub(super) latest_ranking_date: Option<String>,
    pub(super) ranking_days: i64,
    pub(super) best_rank: Option<i32>,
    pub(super) relevant_date: Option<String>,
    /// Only POST supplies `created` or `existing`.
    pub(super) add_outcome: Option<String>,
    pub(super) notes: Option<String>,
    pub(super) first_seen_at: String,
    pub(super) last_resolved_at: Option<String>,
    pub(super) latest_analysis: Option<CompetitorAnalysisSummary>,
    /// Opening frame of the newest analysis that stored frames (so a re-analysis in
    /// progress keeps the last cover); null before any frames exist.
    pub(super) cover_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorVideoListResponse {
    pub(super) items: Vec<CompetitorVideo>,
    pub(super) total: i64,
    pub(super) page: i64,
    pub(super) page_size: i64,
    pub(super) period: Option<StudioOverviewPeriod>,
    pub(super) latest_sync_at: Option<String>,
    pub(super) latest_ranking_date: Option<String>,
}

/// One card A run. `card` follows the competitor contract (prompt and taxonomy
/// versions below); `hostErrors` lists validation issues that removed only the
/// parts citing them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorAnalysis {
    pub(super) analysis_id: Uuid,
    pub(super) aweme_id: String,
    pub(super) status: String,
    pub(super) model_id: Option<String>,
    pub(super) prompt_version: Option<String>,
    pub(super) taxonomy_version: Option<String>,
    pub(super) card: Option<Value>,
    pub(super) host_errors: Value,
    pub(super) evidence_objects: Value,
    pub(super) cost_yuan: Option<f64>,
    pub(super) error_code: Option<String>,
    pub(super) error_message: Option<String>,
    pub(super) created_at: String,
    pub(super) started_at: Option<String>,
    pub(super) finished_at: Option<String>,
}

/// 爆款分析 filters: a taxonomy category key or `all` (default `loose_powder`), and the same
/// calendar window as the studio home by the date a film was first seen: `from` + `to`, or
/// `unit` (`day` | `month` | `year`) with an optional `date` (default: the month of the newest
/// analysed film). The legacy `period` (`last7` | `last30` | `all`) is still accepted.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CompetitorPatternsQuery {
    pub(super) category: Option<String>,
    pub(super) period: Option<String>,
    pub(super) unit: Option<String>,
    pub(super) date: Option<String>,
    pub(super) from: Option<String>,
    pub(super) to: Option<String>,
}

/// A category that has a snapshot, with its counted films over all time.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorPatternCategory {
    pub(super) key: String,
    pub(super) films: i32,
}

/// Locked statistics written by the competitor worker. `payload` holds `sample`,
/// `rows` (film and opening-family numerators over the assessable films of each
/// dimension), `roleTime`, free-text `text` (scenes, audiences), `films` and `labels`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorPatternSnapshot {
    pub(super) cohort: String,
    pub(super) period: String,
    pub(super) stats_version: String,
    pub(super) taxonomy_version: String,
    pub(super) normalization_version: String,
    pub(super) input_snapshot: String,
    pub(super) films: i32,
    pub(super) families: i32,
    pub(super) computed_at: String,
    pub(super) payload: Value,
}

/// Our confirmed selling-point segments for each label of the active preset (0 when none). Only some keys
/// match the competitor taxonomy; the page maps them explicitly.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OwnSellingPointCoverage {
    pub(super) label_key: String,
    /// Name in the active selling-point preset.
    pub(super) label_name: String,
    pub(super) segments: i64,
    pub(super) assets: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorPatternsResponse {
    pub(super) category: String,
    /// The snapshot key, `all` or `YYYY-MM-DD..YYYY-MM-DD`.
    pub(super) period: String,
    /// The dates the page covers, in the studio home's shape.
    pub(super) window: StudioOverviewPeriod,
    pub(super) categories: Vec<CompetitorPatternCategory>,
    /// Absent until the worker has written a snapshot for this category and window.
    pub(super) snapshot: Option<CompetitorPatternSnapshot>,
    /// The window has analysed films but no snapshot yet; the worker is computing it.
    pub(super) pending: bool,
    pub(super) own_selling_points: Vec<OwnSellingPointCoverage>,
    pub(super) own_structures: OwnStructures,
}

/// One structure of our originals and how many originals have it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OwnStructureRow {
    /// Label keys, a framework sequence in time order or a selling-point set in preset order.
    pub(super) labels: Vec<String>,
    pub(super) assets: i64,
    /// 视频云管家 spend of these originals in the window (yuan); 0 without spend data.
    pub(super) spend: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OwnStructureLane {
    /// Originals with at least one confirmed segment of this lane's preset.
    pub(super) assets: i64,
    /// Their 视频云管家 spend in the window (yuan).
    pub(super) spend: f64,
    /// Names in the active preset, by label key.
    pub(super) labels: BTreeMap<String, String>,
    pub(super) rows: Vec<OwnStructureRow>,
}

/// 框架结构排行, our side: structures of our originals' confirmed segments (every product).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OwnStructures {
    pub(super) framework: OwnStructureLane,
    pub(super) selling_point: OwnStructureLane,
    /// Days of the window whose per-day spend is synced, so a partly covered window can say so.
    pub(super) spend_days: OwnSpendDays,
}

/// Per-day spend coverage of the window (`cloud_video.spend_days`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OwnSpendDays {
    /// Days in the window; null for all time.
    pub(super) days: Option<i64>,
    /// Of them, days with synced spend.
    pub(super) synced: i64,
}

/// Analysed films and the brands they cover in one window of the overview.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorOverviewCounts {
    pub(super) analyzed: i64,
    pub(super) brands: i64,
}

/// 竞品爆款 · 总览. Counts follow the statistics snapshot: the latest succeeded or
/// partial analysis per film, its card category, and the Beijing date the film was
/// first seen. `previous` is the period just before: the previous day, month or year, or as many
/// days just before a custom range (`null` for all time).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorOverviewResponse {
    pub(super) category: String,
    pub(super) period: String,
    pub(super) window: StudioOverviewPeriod,
    pub(super) current: CompetitorOverviewCounts,
    pub(super) previous: Option<CompetitorOverviewCounts>,
    /// Queued or running analyses in every category.
    pub(super) analyzing: i64,
}

/// Queue the 总览 AI summary for the latest snapshot of a category and window.
#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateCompetitorReportRequest {
    #[serde(default)]
    pub(super) category: Option<String>,
    #[serde(default)]
    pub(super) period: Option<String>,
    #[serde(default)]
    pub(super) unit: Option<String>,
    #[serde(default)]
    pub(super) date: Option<String>,
    #[serde(default)]
    pub(super) from: Option<String>,
    #[serde(default)]
    pub(super) to: Option<String>,
    /// `openings` caches semantic formulas independently; omitted means the optional full reading.
    pub(super) kind: Option<String>,
    /// Opening failures are sticky until an explicit retry (automatic page reads never repay).
    #[serde(default)]
    pub(super) retry: bool,
}

/// One 总览 AI summary (batch insight B, online). `report` follows the B contract
/// (insights, sound insights, diagnoses, next actions); it cites `stat_id`s and
/// aweme ids only, and the page renders every number from `inputs.stats`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorReport {
    pub(super) report_id: Uuid,
    pub(super) category: String,
    pub(super) period: String,
    /// The snapshot input this report was requested for.
    pub(super) input_snapshot: String,
    pub(super) prompt_version: String,
    /// queued, running, succeeded or failed.
    pub(super) status: String,
    pub(super) model_id: Option<String>,
    /// Locked statistic rows, sample and film → analysis map the worker used; plus our coverage.
    pub(super) inputs: Option<Value>,
    pub(super) report: Option<Value>,
    /// Host validation results `[[severity, path, message]]`.
    pub(super) issues: Value,
    pub(super) cost_yuan: Option<f64>,
    pub(super) error_code: Option<String>,
    pub(super) error_message: Option<String>,
    pub(super) created_at: String,
    pub(super) finished_at: Option<String>,
}

/// The latest 爆款拆解 report of a category and window, with what the page needs to
/// decide whether one can be generated: the current snapshot input and its films.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompetitorReportLatestResponse {
    pub(super) category: String,
    pub(super) period: String,
    pub(super) report: Option<CompetitorReport>,
    /// `input_snapshot` of the current statistics snapshot; differs from the report's after new analyses.
    pub(super) current_input_snapshot: Option<String>,
    pub(super) films: Option<i32>,
    /// A report is generated only from this many films.
    pub(super) min_films: i32,
}

/// A query with no parameters retains the original all-time/200-row read contract.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CompetitorVideoListQuery {
    pub(super) source: Option<String>,
    pub(super) unit: Option<String>,
    pub(super) date: Option<String>,
    pub(super) from: Option<String>,
    pub(super) to: Option<String>,
    pub(super) page: Option<i64>,
    pub(super) page_size: Option<i64>,
}

/// Explicit metadata replacement. Empty text clears a field.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct UpdateCompetitorVideoRequest {
    pub(super) brand_name: String,
    pub(super) product_category: String,
    pub(super) notes: String,
}
