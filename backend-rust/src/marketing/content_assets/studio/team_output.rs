//! 团队产出: 视频云管家 成片 by 剪辑 (author) or 编导 (person label), grouped team → group → person
//! (`cloud_video.*` tables written by the desktop `cloud_video_team_sync`). A 成片 belongs to the team
//! and group its person had on its upload day (`account_snapshots`). A 成片 with several 编导 counts once
//! for each of them; group, team and overall totals count it once. Spend and GMV are 巨量千川 only; ROI divides
//! summed GMV by the summed spend whose GMV is known; source `roi` values are never used. Read only, gated by `team_output_access`.
use std::collections::BTreeMap;

use chrono::NaiveDate;

use super::{
    overview_window::OverviewWindow,
    team_output_types::{
        TeamOutputGroup, TeamOutputMetrics, TeamOutputPerson, TeamOutputSync, TeamOutputTeam,
    },
};
use crate::{auth::CurrentUser, error::AppError};

pub(super) const TEAM_OUTPUT_PERMISSION: &str = "marketing:team_output:read";
const NONE_KEY: &str = "none";
const LABEL_PREFIX: &str = "label:";

/// Super admins and holders of the 团队产出 permission (admins pass `has_permission`).
pub(super) fn ensure_team_output_access(user: &CurrentUser) -> Result<(), AppError> {
    if user.user_id.trim().is_empty() {
        return Err(AppError::Unauthorized);
    }
    if user.is_super_admin() || user.has_permission(TEAM_OUTPUT_PERMISSION) {
        return Ok(());
    }
    Err(AppError::Forbidden)
}

/// Which of a person's 成片 the video list keeps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum VideoScope {
    All,
    New,
    Previous,
}

impl VideoScope {
    pub(super) fn parse(value: Option<&str>) -> Result<Self, AppError> {
        match value.unwrap_or("all") {
            "all" => Ok(Self::All),
            "new" => Ok(Self::New),
            "previous" => Ok(Self::Previous),
            _ => Err(AppError::bad_request("scope 只支持 all、new、previous")),
        }
    }

    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::New => "new",
            Self::Previous => "previous",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Dimension {
    Editor,
    Director,
}

impl Dimension {
    pub(super) fn parse(value: Option<&str>) -> Result<Self, AppError> {
        match value.unwrap_or("editor") {
            "editor" => Ok(Self::Editor),
            "director" => Ok(Self::Director),
            _ => Err(AppError::bad_request("dimension 只支持 editor、director")),
        }
    }

    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Editor => "editor",
            Self::Director => "director",
        }
    }
}

pub(super) fn ratio(numerator: f64, denominator: f64) -> Option<f64> {
    (denominator > 0.0).then(|| numerator / denominator)
}

pub(super) fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[derive(Debug, Clone, Default, PartialEq)]
pub(super) struct MetricRow {
    pub(super) uploads: i64,
    pub(super) spend: f64,
    pub(super) gmv: f64,
    pub(super) gmv_spend: f64,
    pub(super) new_spend: f64,
    pub(super) new_gmv: f64,
    pub(super) new_gmv_spend: f64,
    pub(super) spent_videos: i64,
}

impl From<&MetricRow> for TeamOutputMetrics {
    fn from(row: &MetricRow) -> Self {
        Self {
            uploads: row.uploads,
            spend: round2(row.spend),
            gmv: round2(row.gmv),
            gmv_spend: round2(row.gmv_spend),
            roi: ratio(row.gmv, row.gmv_spend),
            new_spend: round2(row.new_spend),
            new_gmv: round2(row.new_gmv),
            new_roi: ratio(row.new_gmv, row.new_gmv_spend),
            spent_videos: row.spent_videos,
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct RollupRow {
    pub(super) level: String,
    pub(super) team: Option<String>,
    pub(super) group: Option<String>,
    pub(super) person_key: Option<String>,
    pub(super) metrics: MetricRow,
}

#[derive(Debug, Default)]
pub(super) struct Names {
    /// accountKey → (name, role) from the newest snapshot, or the author name on the 成片.
    pub(super) accounts: BTreeMap<String, (String, Option<String>)>,
    /// label id → name.
    pub(super) labels: BTreeMap<i64, String>,
}

pub(super) fn person(
    key: &str,
    dimension: Dimension,
    names: &Names,
    metrics: &MetricRow,
) -> TeamOutputPerson {
    let (name, role_name, kind) = if key == NONE_KEY {
        let name = match dimension {
            Dimension::Editor => "无作者",
            Dimension::Director => "未标注编导",
        };
        (name.to_string(), None, "none")
    } else if let Some(id) = key.strip_prefix(LABEL_PREFIX) {
        let name = id
            .parse::<i64>()
            .ok()
            .and_then(|id| names.labels.get(&id).cloned())
            .unwrap_or_else(|| format!("标签 {id}"));
        (name, None, "unmapped_label")
    } else {
        let (name, role) = names
            .accounts
            .get(key)
            .cloned()
            .unwrap_or_else(|| (key.to_string(), None));
        (name, role, "account")
    };
    TeamOutputPerson {
        key: key.to_string(),
        name,
        role_name,
        kind: kind.to_string(),
        metrics: metrics.into(),
    }
}

pub(super) fn team_display(team: &str) -> (String, &'static str) {
    match team {
        "~none" => ("未归属".to_string(), "none"),
        "~unmapped" => ("未关联账号".to_string(), "unmapped_label"),
        "" => ("未分团队".to_string(), "unassigned"),
        name => (name.to_string(), "team"),
    }
}

pub(super) fn group_display(team: &str, group: &str) -> String {
    match (team, group) {
        ("~none", _) | ("~unmapped", _) => "—".to_string(),
        (_, "") => "未分小组".to_string(),
        (_, name) => name.to_string(),
    }
}

/// Group metrics and its people, keyed by group name.
type Groups = BTreeMap<String, (MetricRow, Vec<TeamOutputPerson>)>;

/// The team → group → person tree, each level by spend then uploads (sentinel teams last).
pub(super) fn assemble(
    rows: &[RollupRow],
    dimension: Dimension,
    names: &Names,
) -> (TeamOutputMetrics, Vec<TeamOutputTeam>) {
    let mut totals = TeamOutputMetrics::default();
    let mut teams: BTreeMap<String, (MetricRow, Groups)> = BTreeMap::new();
    for row in rows {
        let team = row.team.clone().unwrap_or_default();
        let group = row.group.clone().unwrap_or_default();
        match row.level.as_str() {
            "total" => totals = (&row.metrics).into(),
            "team" => teams.entry(team).or_default().0 = row.metrics.clone(),
            "group" => {
                teams.entry(team).or_default().1.entry(group).or_default().0 = row.metrics.clone();
            }
            "person" => {
                let key = row
                    .person_key
                    .clone()
                    .unwrap_or_else(|| NONE_KEY.to_string());
                teams
                    .entry(team)
                    .or_default()
                    .1
                    .entry(group)
                    .or_default()
                    .1
                    .push(person(&key, dimension, names, &row.metrics));
            }
            _ => {}
        }
    }
    let by_size = |a: &TeamOutputMetrics, b: &TeamOutputMetrics| {
        b.spend
            .total_cmp(&a.spend)
            .then_with(|| b.uploads.cmp(&a.uploads))
    };
    let mut out: Vec<TeamOutputTeam> = teams
        .into_iter()
        .map(|(team, (metrics, groups))| {
            let (name, kind) = team_display(&team);
            let mut groups: Vec<TeamOutputGroup> = groups
                .into_iter()
                .map(|(group, (metrics, mut people))| {
                    people.sort_by(|a, b| {
                        by_size(&a.metrics, &b.metrics).then_with(|| a.name.cmp(&b.name))
                    });
                    TeamOutputGroup {
                        name: group_display(&team, &group),
                        metrics: (&metrics).into(),
                        people,
                    }
                })
                .collect();
            groups
                .sort_by(|a, b| by_size(&a.metrics, &b.metrics).then_with(|| a.name.cmp(&b.name)));
            TeamOutputTeam {
                name,
                kind: kind.to_string(),
                metrics: (&metrics).into(),
                groups,
            }
        })
        .collect();
    // Real teams by size, then 未分团队, 未关联账号, 未归属.
    let rank = |kind: &str| match kind {
        "team" => 0,
        "unassigned" => 1,
        "unmapped_label" => 2,
        _ => 3,
    };
    out.sort_by(|a, b| {
        rank(&a.kind)
            .cmp(&rank(&b.kind))
            .then_with(|| by_size(&a.metrics, &b.metrics))
            .then_with(|| a.name.cmp(&b.name))
    });
    (totals, out)
}

/// Days of the window up to yesterday, and those not complete for spend or uploads.
pub(super) fn sync_summary(
    window: &OverviewWindow,
    today: NaiveDate,
    complete: &[(String, NaiveDate)],
    latest: Option<NaiveDate>,
) -> TeamOutputSync {
    let last = window.to.min(today.pred_opt().unwrap_or(today));
    let mut days = Vec::new();
    let mut day = window.from;
    while day <= last {
        days.push(day);
        let Some(next) = day.succ_opt() else { break };
        day = next;
    }
    let has = |kind: &str, day: NaiveDate| complete.iter().any(|(k, d)| k == kind && *d == day);
    TeamOutputSync {
        days: days.len() as i64,
        spend_days_complete: days.iter().filter(|d| has("spend", **d)).count() as i64,
        upload_days_complete: days.iter().filter(|d| has("uploads", **d)).count() as i64,
        incomplete_days: days
            .iter()
            .filter(|d| !has("spend", **d) || !has("uploads", **d))
            .map(|d| d.format("%Y-%m-%d").to_string())
            .collect(),
        latest_complete_day: latest.map(|d| d.format("%Y-%m-%d").to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::CurrentUser;
    use crate::marketing::content_assets::studio::overview_window::{
        resolve_calendar, CalendarQuery,
    };

    fn user(roles: &[&str], permissions: &[&str]) -> CurrentUser {
        CurrentUser {
            user_id: "u1".to_string(),
            username: Some("u1".to_string()),
            roles: roles.iter().map(|value| (*value).to_string()).collect(),
            permissions: permissions
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        }
    }

    fn metrics(uploads: i64, spend: f64, gmv: f64) -> MetricRow {
        MetricRow {
            uploads,
            spend,
            gmv,
            gmv_spend: spend,
            new_spend: spend,
            new_gmv: gmv,
            new_gmv_spend: spend,
            spent_videos: i64::from(spend > 0.0),
        }
    }

    fn row(
        level: &str,
        team: Option<&str>,
        group: Option<&str>,
        person: Option<&str>,
        m: MetricRow,
    ) -> RollupRow {
        RollupRow {
            level: level.to_string(),
            team: team.map(Into::into),
            group: group.map(Into::into),
            person_key: person.map(Into::into),
            metrics: m,
        }
    }

    #[test]
    fn only_the_permission_or_a_super_admin_opens_team_output() {
        assert!(ensure_team_output_access(&user(&[], &[TEAM_OUTPUT_PERMISSION])).is_ok());
        assert!(ensure_team_output_access(&user(&["super_admin"], &[])).is_ok());
        assert!(matches!(
            ensure_team_output_access(&user(
                &["content_ops_manager"],
                &["marketing:content_assets:manage"]
            )),
            Err(AppError::Forbidden)
        ));
        assert!(matches!(
            ensure_team_output_access(&CurrentUser {
                user_id: String::new(),
                ..user(&[], &[TEAM_OUTPUT_PERMISSION])
            }),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn a_team_output_only_account_still_opens_team_output() {
        let hr = user(
            &["team_output_viewer", "team_output_only"],
            &[TEAM_OUTPUT_PERMISSION],
        );
        assert!(ensure_team_output_access(&hr).is_ok());
        assert!(matches!(
            ensure_team_output_access(&user(&["team_output_only"], &[])),
            Err(AppError::Forbidden)
        ));
    }

    #[test]
    fn roi_divides_summed_gmv_by_the_spend_with_known_gmv() {
        let m: TeamOutputMetrics = (&MetricRow {
            uploads: 2,
            spend: 300.0,
            gmv: 300.0,
            gmv_spend: 200.0,
            ..MetricRow::default()
        })
            .into();
        assert_eq!(m.roi, Some(1.5));
        assert_eq!(m.new_roi, None);
    }

    #[test]
    fn the_tree_sorts_by_spend_and_puts_unattributed_teams_last() {
        let mut names = Names::default();
        names
            .accounts
            .insert("a".into(), ("剪辑甲".into(), Some("抖音组-剪辑".into())));
        names.labels.insert(503, "没有账号".into());
        let rows = vec![
            row("total", None, None, None, metrics(5, 300.0, 450.0)),
            row("team", Some("~none"), None, None, metrics(2, 0.0, 0.0)),
            row("team", Some("花悦"), None, None, metrics(2, 100.0, 150.0)),
            row("team", Some("佰马"), None, None, metrics(1, 200.0, 300.0)),
            row(
                "group",
                Some("花悦"),
                Some(""),
                None,
                metrics(2, 100.0, 150.0),
            ),
            row(
                "person",
                Some("花悦"),
                Some(""),
                Some("a"),
                metrics(2, 100.0, 150.0),
            ),
            row(
                "person",
                Some("~none"),
                Some(""),
                Some("none"),
                metrics(2, 0.0, 0.0),
            ),
            row(
                "person",
                Some("~unmapped"),
                Some(""),
                Some("label:503"),
                metrics(1, 0.0, 0.0),
            ),
        ];
        let (totals, teams) = assemble(&rows, Dimension::Director, &names);
        assert_eq!(totals.uploads, 5);
        assert_eq!(
            teams
                .iter()
                .map(|t| (t.name.as_str(), t.kind.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("佰马", "team"),
                ("花悦", "team"),
                ("未关联账号", "unmapped_label"),
                ("未归属", "none")
            ]
        );
        let huayue = &teams[1];
        assert_eq!(huayue.groups[0].name, "未分小组");
        assert_eq!(huayue.groups[0].people[0].name, "剪辑甲");
        assert_eq!(teams[2].groups[0].people[0].name, "没有账号");
        assert_eq!(teams[3].groups[0].people[0].name, "未标注编导");
    }

    #[test]
    fn sync_counts_days_up_to_yesterday() {
        let day = |d: u32| NaiveDate::from_ymd_opt(2026, 10, d).unwrap();
        let window = resolve_calendar(
            CalendarQuery {
                from: Some("2026-10-27"),
                to: Some("2026-10-29"),
                ..CalendarQuery::default()
            },
            day(29),
            None,
        )
        .unwrap()
        .unwrap();
        let complete = vec![
            ("spend".to_string(), day(27)),
            ("uploads".to_string(), day(27)),
            ("spend".to_string(), day(28)),
        ];
        let sync = sync_summary(&window, day(29), &complete, Some(day(28)));
        assert_eq!(
            (
                sync.days,
                sync.spend_days_complete,
                sync.upload_days_complete
            ),
            (2, 2, 1)
        );
        assert_eq!(sync.incomplete_days, vec!["2026-10-28"]);
        assert_eq!(sync.latest_complete_day.as_deref(), Some("2026-10-28"));
    }

    #[test]
    fn video_scopes_parse_and_default_to_all() {
        assert_eq!(VideoScope::parse(None).unwrap(), VideoScope::All);
        assert_eq!(
            VideoScope::parse(Some("previous")).unwrap().as_str(),
            "previous"
        );
        assert!(VideoScope::parse(Some("old")).is_err());
    }

    #[test]
    fn unknown_dimensions_are_rejected() {
        assert_eq!(Dimension::parse(None).unwrap(), Dimension::Editor);
        assert_eq!(
            Dimension::parse(Some("director")).unwrap(),
            Dimension::Director
        );
        assert!(Dimension::parse(Some("owner")).is_err());
    }
}
