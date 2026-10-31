//! 团队产出 contracts (`GET /studio/team-output`, `GET /studio/team-output/videos`). The OpenAPI
//! generator extracts these structs by name, so keep them as plain serde structs.
use serde::{Deserialize, Serialize};

use super::overview_types::StudioOverviewPeriod;

/// Asia/Shanghai calendar dates (`YYYY-MM-DD`): `from` + `to` (at most 366 days), or `unit`
/// (`day` | `month` | `year`) with an optional `date` inside it (default: the newest synced day).
/// `dimension`: `editor` (作者 = 剪辑, default) | `director` (「拍摄人/编导」人名标签).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputQuery {
    pub(super) unit: Option<String>,
    pub(super) date: Option<String>,
    pub(super) from: Option<String>,
    pub(super) to: Option<String>,
    pub(super) dimension: Option<String>,
    pub(super) one_level_type_id: Option<i64>,
}

/// The page's filters plus `kind`: `summary` (default) | `videos`.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputExportQuery {
    pub(super) unit: Option<String>,
    pub(super) date: Option<String>,
    pub(super) from: Option<String>,
    pub(super) to: Option<String>,
    pub(super) dimension: Option<String>,
    pub(super) one_level_type_id: Option<i64>,
    pub(super) kind: Option<String>,
    /// `kind=videos` only: one person's 成片 (a `key` from `GET /studio/team-output`).
    pub(super) person_key: Option<String>,
}

impl From<TeamOutputExportQuery> for TeamOutputQuery {
    fn from(query: TeamOutputExportQuery) -> Self {
        Self {
            unit: query.unit,
            date: query.date,
            from: query.from,
            to: query.to,
            dimension: query.dimension,
            one_level_type_id: query.one_level_type_id,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputVideosQuery {
    pub(super) unit: Option<String>,
    pub(super) date: Option<String>,
    pub(super) from: Option<String>,
    pub(super) to: Option<String>,
    pub(super) dimension: Option<String>,
    pub(super) one_level_type_id: Option<i64>,
    /// A person's `key` from `GET /studio/team-output`.
    pub(super) person_key: String,
    /// `all` (default) | `new` (uploaded in the window) | `previous` (uploaded before, with spend in it).
    pub(super) scope: Option<String>,
    pub(super) page: Option<i64>,
    pub(super) page_size: Option<i64>,
}

/// Amounts are the vendor's raw 巨量千川 values summed over the window. `roi` = `gmv` / `gmvSpend`;
/// spend whose GMV the vendor did not return stays out of the denominator; null without such spend.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputMetrics {
    /// 成片 uploaded in the window.
    pub(super) uploads: i64,
    /// Spend of all of the person's 成片 (whenever uploaded) in the window.
    pub(super) spend: f64,
    /// 巨量千川 direct GMV (直接成交, refunds not deducted) in the window.
    pub(super) gmv: f64,
    pub(super) gmv_spend: f64,
    pub(super) roi: Option<f64>,
    /// The same three for the 成片 uploaded in the window.
    pub(super) new_spend: f64,
    pub(super) new_gmv: f64,
    pub(super) new_roi: Option<f64>,
    /// 成片 with spend in the window.
    pub(super) spent_videos: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputPerson {
    /// The accountKey, the label prefix plus its id for a person label without an account, or `none`.
    pub(super) key: String,
    pub(super) name: String,
    pub(super) role_name: Option<String>,
    /// `account` | `unmapped_label` | `none`.
    pub(super) kind: String,
    pub(super) metrics: TeamOutputMetrics,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputGroup {
    pub(super) name: String,
    /// Each 成片 once, however many people of the group worked on it.
    pub(super) metrics: TeamOutputMetrics,
    pub(super) people: Vec<TeamOutputPerson>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputTeam {
    pub(super) name: String,
    /// `team` | `unassigned` (account without a team) | `unmapped_label` | `none`.
    pub(super) kind: String,
    pub(super) metrics: TeamOutputMetrics,
    pub(super) groups: Vec<TeamOutputGroup>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputQuality {
    /// Among the 成片 uploaded in the window.
    pub(super) uploads_without_director: i64,
    pub(super) uploads_with_several_directors: i64,
    pub(super) uploads_without_author: i64,
    /// Person labels of 「拍摄人/编导」 not linked to an account.
    pub(super) unmapped_director_labels: i64,
    /// Spend in the window whose GMV the vendor did not return.
    pub(super) spend_without_gmv: f64,
    /// Other platforms' spend (百度, 巨量广告, 快手 and so on) on the same 成片, left out of every figure; a
    /// lower bound, since only 成片 with 千川 spend that day are read.
    pub(super) other_platform_spend: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputSync {
    /// Days of the window up to yesterday; today is never complete.
    pub(super) days: i64,
    pub(super) spend_days_complete: i64,
    pub(super) upload_days_complete: i64,
    /// Days of the window (up to yesterday) whose spend or uploads are not complete yet.
    pub(super) incomplete_days: Vec<String>,
    /// Newest day with complete spend, any window.
    pub(super) latest_complete_day: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputCategory {
    pub(super) id: i64,
    pub(super) name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputResponse {
    /// The resolved window; `latestActivityDate` is the newest day with complete spend.
    pub(super) period: StudioOverviewPeriod,
    pub(super) dimension: String,
    /// Each 成片 once across all people and teams.
    pub(super) totals: TeamOutputMetrics,
    pub(super) teams: Vec<TeamOutputTeam>,
    pub(super) quality: TeamOutputQuality,
    pub(super) sync: TeamOutputSync,
    pub(super) categories: Vec<TeamOutputCategory>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputVideo {
    pub(super) video_id: i64,
    pub(super) name: String,
    pub(super) author_name: Option<String>,
    pub(super) director_names: Vec<String>,
    pub(super) one_level_type_name: Option<String>,
    pub(super) video_state_name: Option<String>,
    pub(super) uploaded_at: String,
    /// Uploaded inside the window.
    pub(super) is_new: bool,
    pub(super) spend: f64,
    pub(super) gmv: f64,
    pub(super) roi: Option<f64>,
    /// Other platforms' spend in the window, not counted.
    pub(super) other_platform_spend: f64,
    /// The vendor's cumulative spend as last read, and when.
    pub(super) total_stat_cost: Option<f64>,
    pub(super) total_stat_cost_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TeamOutputVideosResponse {
    pub(super) items: Vec<TeamOutputVideo>,
    /// Rows the chosen scope keeps.
    pub(super) total: i64,
    /// The person's 成片 uploaded in the window, and those uploaded before it that spent in it.
    pub(super) new_total: i64,
    pub(super) previous_total: i64,
    pub(super) page: i64,
    pub(super) page_size: i64,
}
