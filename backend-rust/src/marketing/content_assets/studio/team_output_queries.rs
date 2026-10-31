//! 团队产出 queries over `cloud_video.*` (written by the desktop `cloud_video_team_sync`); the tree,
//! ROI and sync rules live in `team_output`.
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{PgPool, Row};

use super::{
    error::StudioResult,
    overview_types::StudioOverviewPeriod,
    overview_window::{resolve_calendar, shanghai_date, CalendarQuery, OverviewWindow},
    repository::db_error,
    team_output::{
        assemble, ratio, round2, sync_summary, Dimension, MetricRow, Names, RollupRow, VideoScope,
    },
    team_output_types::{
        TeamOutputCategory, TeamOutputQuality, TeamOutputQuery, TeamOutputResponse,
        TeamOutputVideo, TeamOutputVideosQuery, TeamOutputVideosResponse,
    },
};
use crate::error::AppError;

const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;

/// The 「拍摄人/编导」 label named 无 means no 编导: `scoped` drops it, so such 成片 read as 未标注编导.
/// `$1`/`$2` window, `$3` dimension, `$4` optional 一级分类. `scoped`: 成片 uploaded in the window or
/// with spend in it; `people`: one row per (成片, person), people keyed as in `TeamOutputPerson::key`;
/// `base`: plus the team and group of the person on the upload day (the earliest snapshot when the
/// upload predates every snapshot). Labels without an account and 成片 without anyone get sentinel
/// team/group names (`~unmapped`, `~none`) that never collide with vendor names.
macro_rules! team_output_cte {
    () => {
        "WITH stats AS ( \
            SELECT d.video_id, SUM(d.spend) AS spend, SUM(d.pay_order_amount) AS gmv, \
                   COALESCE(SUM(d.spend) FILTER (WHERE d.pay_order_amount IS NOT NULL), 0) AS gmv_spend, \
                   SUM(d.other_platform_spend) AS other_spend \
            FROM cloud_video.finished_spend_daily d WHERE d.stat_date BETWEEN $1 AND $2 GROUP BY d.video_id \
        ), scoped AS ( \
            SELECT v.video_id, v.name, v.account_key, v.account_name, \
                   ARRAY(SELECT x FROM UNNEST(v.director_label_ids) AS x WHERE x NOT IN ( \
                       SELECT label_id FROM cloud_video.director_labels WHERE TRIM(name) = '无')) AS director_label_ids, \
                   v.uploaded_at, \
                   v.one_level_type_name, v.video_state_name, v.total_stat_cost, v.total_stat_cost_at, \
                   (v.uploaded_at AT TIME ZONE 'Asia/Shanghai')::DATE AS upload_day, \
                   (v.uploaded_at AT TIME ZONE 'Asia/Shanghai')::DATE BETWEEN $1 AND $2 AS is_new, \
                   COALESCE(s.spend, 0) AS spend, COALESCE(s.gmv, 0) AS gmv, COALESCE(s.gmv_spend, 0) AS gmv_spend, \
                   COALESCE(s.other_spend, 0) AS other_spend \
            FROM cloud_video.finished_videos v LEFT JOIN stats s ON s.video_id = v.video_id \
            WHERE v.recycled_at IS NULL AND ($4::BIGINT IS NULL OR v.one_level_type_id = $4) \
              AND ((v.uploaded_at AT TIME ZONE 'Asia/Shanghai')::DATE BETWEEN $1 AND $2 OR s.video_id IS NOT NULL) \
        ), people AS ( \
            SELECT DISTINCT sc.video_id, p.person_key, p.account_key FROM scoped sc CROSS JOIN LATERAL ( \
                SELECT COALESCE(sc.account_key, 'none') AS person_key, sc.account_key WHERE $3 = 'editor' \
                UNION ALL \
                SELECT CASE WHEN x.label_id IS NULL THEN 'none' \
                            ELSE COALESCE(dl.account_key, 'label:' || x.label_id::TEXT) END, dl.account_key \
                FROM UNNEST(CASE WHEN CARDINALITY(sc.director_label_ids) = 0 THEN ARRAY[NULL::BIGINT] \
                                 ELSE sc.director_label_ids END) AS x(label_id) \
                LEFT JOIN cloud_video.director_labels dl ON dl.label_id = x.label_id \
                WHERE $3 = 'director' \
            ) p \
        ), base AS ( \
            SELECT pe.video_id, pe.person_key, sc.is_new, sc.spend, sc.gmv, sc.gmv_spend, \
                   CASE WHEN pe.person_key = 'none' THEN '~none' WHEN pe.account_key IS NULL THEN '~unmapped' \
                        ELSE COALESCE(org.team_name, '') END AS team, \
                   CASE WHEN pe.account_key IS NULL THEN '' ELSE COALESCE(org.group_name, '') END AS grp \
            FROM people pe JOIN scoped sc ON sc.video_id = pe.video_id \
            LEFT JOIN LATERAL ( \
                SELECT a.team_name, a.group_name FROM cloud_video.account_snapshots a \
                WHERE a.account_key = pe.account_key \
                ORDER BY (a.snapshot_date <= sc.upload_day) DESC, \
                         CASE WHEN a.snapshot_date <= sc.upload_day THEN a.snapshot_date END DESC NULLS LAST, \
                         a.snapshot_date \
                LIMIT 1 \
            ) org ON TRUE \
        ) "
    };
}

macro_rules! metric_columns {
    () => {
        "COUNT(*) FILTER (WHERE is_new)::BIGINT AS uploads, SUM(spend)::FLOAT8 AS spend, SUM(gmv)::FLOAT8 AS gmv, \
         SUM(gmv_spend)::FLOAT8 AS gmv_spend, COALESCE(SUM(spend) FILTER (WHERE is_new), 0)::FLOAT8 AS new_spend, \
         COALESCE(SUM(gmv) FILTER (WHERE is_new), 0)::FLOAT8 AS new_gmv, \
         COALESCE(SUM(gmv_spend) FILTER (WHERE is_new), 0)::FLOAT8 AS new_gmv_spend, \
         COUNT(*) FILTER (WHERE spend > 0)::BIGINT AS spent_videos"
    };
}

/// One row per person, group, team and the overall total; groups and teams count each 成片 once.
const ROLLUP_SELECT: &str = concat!(
    team_output_cte!(),
    "SELECT 'person' AS level, team, grp, person_key, ",
    metric_columns!(),
    " FROM base GROUP BY team, grp, person_key \
     UNION ALL SELECT 'group', team, grp, NULL, ",
    metric_columns!(),
    " FROM (SELECT DISTINCT team, grp, video_id, is_new, spend, gmv, gmv_spend FROM base) g GROUP BY team, grp \
     UNION ALL SELECT 'team', team, NULL, NULL, ",
    metric_columns!(),
    " FROM (SELECT DISTINCT team, video_id, is_new, spend, gmv, gmv_spend FROM base) t GROUP BY team \
     UNION ALL SELECT 'total', NULL, NULL, NULL, ",
    metric_columns!(),
    " FROM scoped"
);

const QUALITY_SELECT: &str = concat!(
    team_output_cte!(),
    "SELECT COUNT(*) FILTER (WHERE is_new AND CARDINALITY(director_label_ids) = 0)::BIGINT AS without_director, \
            COUNT(*) FILTER (WHERE is_new AND CARDINALITY(director_label_ids) > 1)::BIGINT AS several_directors, \
            COUNT(*) FILTER (WHERE is_new AND account_key IS NULL)::BIGINT AS without_author, \
            COALESCE(SUM(spend - gmv_spend), 0)::FLOAT8 AS spend_without_gmv, \
            COALESCE(SUM(other_spend), 0)::FLOAT8 AS other_platform_spend \
     FROM scoped"
);

/// A person's 成片, `$8` = `all` | `new` (uploaded in the window) | `previous` (uploaded before it, with
/// spend in it). `new_total` / `previous_total` count both kinds whatever `$8` keeps.
const VIDEOS_SELECT: &str = concat!(
    team_output_cte!(),
    ", mine AS ( \
        SELECT sc.*, COUNT(*) FILTER (WHERE sc.is_new) OVER ()::BIGINT AS new_total, \
               COUNT(*) FILTER (WHERE NOT sc.is_new) OVER ()::BIGINT AS previous_total \
        FROM scoped sc WHERE sc.video_id IN (SELECT video_id FROM people WHERE person_key = $5) \
     ) \
     SELECT m.video_id, m.name, m.account_name, m.one_level_type_name, m.video_state_name, m.uploaded_at, \
            m.is_new, m.spend::FLOAT8 AS spend, m.gmv::FLOAT8 AS gmv, m.gmv_spend::FLOAT8 AS gmv_spend, \
            m.other_spend::FLOAT8 AS other_platform_spend, \
            m.total_stat_cost::FLOAT8 AS total_stat_cost, m.total_stat_cost_at, \
            ARRAY(SELECT COALESCE(dl.name, x::TEXT) FROM UNNEST(m.director_label_ids) AS x \
                  LEFT JOIN cloud_video.director_labels dl ON dl.label_id = x ORDER BY 1) AS director_names, \
            COUNT(*) OVER ()::BIGINT AS total, m.new_total, m.previous_total \
     FROM mine m WHERE $8 = 'all' OR m.is_new = ($8 = 'new') \
     ORDER BY m.spend DESC, m.uploaded_at DESC, m.video_id \
     LIMIT $6 OFFSET $7"
);

/// Every (成片, person) row for the export (`$5`: one person's key, or NULL for everyone): the person's
/// team and group on the upload day, in table order.
pub(super) const EXPORT_ROWS_SELECT: &str = concat!(
    team_output_cte!(),
    "SELECT b.team, b.grp, b.person_key, sc.video_id, sc.name, sc.account_name, sc.one_level_type_name, \
            sc.video_state_name, sc.uploaded_at, sc.is_new, sc.spend::FLOAT8 AS spend, sc.gmv::FLOAT8 AS gmv, \
            sc.gmv_spend::FLOAT8 AS gmv_spend, sc.other_spend::FLOAT8 AS other_platform_spend, \
            ARRAY(SELECT COALESCE(dl.name, x::TEXT) FROM UNNEST(sc.director_label_ids) AS x \
                  LEFT JOIN cloud_video.director_labels dl ON dl.label_id = x ORDER BY 1) AS director_names \
     FROM base b JOIN scoped sc ON sc.video_id = b.video_id \
     WHERE $5::TEXT IS NULL OR b.person_key = $5 \
     ORDER BY b.team, b.grp, b.person_key, sc.spend DESC, sc.uploaded_at DESC, sc.video_id"
);

/// Both counts for a page the scope left empty (the list query then returns no row to carry them).
const VIDEO_COUNTS_SELECT: &str = concat!(
    team_output_cte!(),
    "SELECT COUNT(*) FILTER (WHERE sc.is_new)::BIGINT AS new_total, \
            COUNT(*) FILTER (WHERE NOT sc.is_new)::BIGINT AS previous_total \
     FROM scoped sc WHERE sc.video_id IN (SELECT video_id FROM people WHERE person_key = $5)"
);

const ACCOUNT_NAMES_SELECT: &str = "SELECT DISTINCT ON (account_key) account_key, name, role_name \
    FROM cloud_video.account_snapshots ORDER BY account_key, snapshot_date DESC";
const AUTHOR_NAMES_SELECT: &str = "SELECT DISTINCT ON (account_key) account_key, account_name \
    FROM cloud_video.finished_videos WHERE account_key = ANY($1) AND account_name IS NOT NULL \
    ORDER BY account_key, synced_at DESC";
const LABELS_SELECT: &str = "SELECT label_id, name, account_key FROM cloud_video.director_labels";
const SYNC_DAYS_SELECT: &str = "SELECT kind, stat_date FROM cloud_video.team_sync_days \
    WHERE status = 'complete' AND stat_date BETWEEN $1 AND $2";
const LATEST_DAY_SELECT: &str = "SELECT MAX(stat_date) FROM cloud_video.team_sync_days \
    WHERE kind = 'spend' AND status = 'complete'";
const CATEGORIES_SELECT: &str = "SELECT DISTINCT one_level_type_id, one_level_type_name \
    FROM cloud_video.finished_videos \
    WHERE one_level_type_id IS NOT NULL AND one_level_type_name IS NOT NULL ORDER BY one_level_type_name";

struct Window {
    window: OverviewWindow,
    today: NaiveDate,
    latest: Option<NaiveDate>,
}

async fn resolve_window(
    pool: &PgPool,
    now: DateTime<Utc>,
    calendar: CalendarQuery<'_>,
) -> StudioResult<Window> {
    let today = shanghai_date(now);
    let latest: Option<NaiveDate> = sqlx::query_scalar(LATEST_DAY_SELECT)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    let calendar = if calendar.unit.is_none() && calendar.from.is_none() && calendar.to.is_none() {
        CalendarQuery {
            unit: Some("month"),
            ..calendar
        }
    } else {
        calendar
    };
    let window = resolve_calendar(calendar, today, latest)?
        .ok_or_else(|| AppError::bad_request("需要日期范围"))?;
    Ok(Window {
        window,
        today,
        latest,
    })
}

fn metric_row(row: &sqlx::postgres::PgRow) -> MetricRow {
    MetricRow {
        uploads: row.get("uploads"),
        spend: row.get::<Option<f64>, _>("spend").unwrap_or_default(),
        gmv: row.get::<Option<f64>, _>("gmv").unwrap_or_default(),
        gmv_spend: row.get::<Option<f64>, _>("gmv_spend").unwrap_or_default(),
        new_spend: row.get("new_spend"),
        new_gmv: row.get("new_gmv"),
        new_gmv_spend: row.get("new_gmv_spend"),
        spent_videos: row.get("spent_videos"),
    }
}

pub(super) async fn names(pool: &PgPool, keys: &[String]) -> StudioResult<Names> {
    let mut names = Names::default();
    for row in sqlx::query(AUTHOR_NAMES_SELECT)
        .bind(keys)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
    {
        names
            .accounts
            .insert(row.get("account_key"), (row.get("account_name"), None));
    }
    for row in sqlx::query(ACCOUNT_NAMES_SELECT)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
    {
        names.accounts.insert(
            row.get("account_key"),
            (row.get("name"), row.get("role_name")),
        );
    }
    for row in sqlx::query(LABELS_SELECT)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
    {
        names.labels.insert(row.get("label_id"), row.get("name"));
    }
    Ok(names)
}

pub(super) async fn team_output(
    pool: &PgPool,
    query: TeamOutputQuery,
    now: DateTime<Utc>,
) -> StudioResult<TeamOutputResponse> {
    Ok(team_output_window(pool, query, now).await?.0)
}

/// The response and the counted dates `[from, last]` behind it (the export reads the same dates).
pub(super) async fn team_output_window(
    pool: &PgPool,
    query: TeamOutputQuery,
    now: DateTime<Utc>,
) -> StudioResult<(TeamOutputResponse, NaiveDate, NaiveDate)> {
    let dimension = Dimension::parse(query.dimension.as_deref())?;
    let Window {
        window,
        today,
        latest,
    } = resolve_window(
        pool,
        now,
        CalendarQuery {
            unit: query.unit.as_deref(),
            date: query.date.as_deref(),
            from: query.from.as_deref(),
            to: query.to.as_deref(),
        },
    )
    .await?;
    let rows: Vec<RollupRow> = sqlx::query(ROLLUP_SELECT)
        .bind(window.from)
        .bind(window.last)
        .bind(dimension.as_str())
        .bind(query.one_level_type_id)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .iter()
        .map(|row| RollupRow {
            level: row.get("level"),
            team: row.get("team"),
            group: row.get("grp"),
            person_key: row.get("person_key"),
            metrics: metric_row(row),
        })
        .collect();
    let keys: Vec<String> = rows
        .iter()
        .filter_map(|row| row.person_key.clone())
        .collect();
    let names = names(pool, &keys).await?;
    let (totals, teams) = assemble(&rows, dimension, &names);
    let quality_row = sqlx::query(QUALITY_SELECT)
        .bind(window.from)
        .bind(window.last)
        .bind(dimension.as_str())
        .bind(query.one_level_type_id)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    let unmapped: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM cloud_video.director_labels WHERE account_key IS NULL AND TRIM(name) <> '无'",
    )
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    let complete: Vec<(String, NaiveDate)> = sqlx::query(SYNC_DAYS_SELECT)
        .bind(window.from)
        .bind(window.last)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .iter()
        .map(|row| (row.get("kind"), row.get("stat_date")))
        .collect();
    let categories = sqlx::query(CATEGORIES_SELECT)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .iter()
        .map(|row| TeamOutputCategory {
            id: row.get("one_level_type_id"),
            name: row.get("one_level_type_name"),
        })
        .collect();
    let (from, last) = (window.from, window.last);
    Ok((
        TeamOutputResponse {
            period: StudioOverviewPeriod {
                key: window.key.clone(),
                from: window.from.format("%Y-%m-%d").to_string(),
                to: window.to.format("%Y-%m-%d").to_string(),
                today: today.format("%Y-%m-%d").to_string(),
                latest_activity_date: latest.map(|day| day.format("%Y-%m-%d").to_string()),
            },
            dimension: dimension.as_str().to_string(),
            totals,
            teams,
            quality: TeamOutputQuality {
                uploads_without_director: quality_row.get("without_director"),
                uploads_with_several_directors: quality_row.get("several_directors"),
                uploads_without_author: quality_row.get("without_author"),
                unmapped_director_labels: unmapped,
                spend_without_gmv: round2(quality_row.get("spend_without_gmv")),
                other_platform_spend: round2(quality_row.get("other_platform_spend")),
            },
            sync: sync_summary(&window, today, &complete, latest),
            categories,
        },
        from,
        last,
    ))
}

pub(super) async fn team_output_videos(
    pool: &PgPool,
    query: TeamOutputVideosQuery,
    now: DateTime<Utc>,
) -> StudioResult<TeamOutputVideosResponse> {
    let dimension = Dimension::parse(query.dimension.as_deref())?;
    let scope = VideoScope::parse(query.scope.as_deref())?;
    let person_key = query.person_key.trim();
    if person_key.is_empty() || person_key.len() > 128 {
        return Err(AppError::bad_request("personKey 不能为空").into());
    }
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    let Window { window, .. } = resolve_window(
        pool,
        now,
        CalendarQuery {
            unit: query.unit.as_deref(),
            date: query.date.as_deref(),
            from: query.from.as_deref(),
            to: query.to.as_deref(),
        },
    )
    .await?;
    let rows = sqlx::query(VIDEOS_SELECT)
        .bind(window.from)
        .bind(window.last)
        .bind(dimension.as_str())
        .bind(query.one_level_type_id)
        .bind(person_key)
        .bind(page_size)
        .bind((page - 1) * page_size)
        .bind(scope.as_str())
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    let total = rows.first().map(|row| row.get("total")).unwrap_or(0);
    let (new_total, previous_total) = match rows.first() {
        Some(row) => (row.get("new_total"), row.get("previous_total")),
        None => {
            let row = sqlx::query(VIDEO_COUNTS_SELECT)
                .bind(window.from)
                .bind(window.last)
                .bind(dimension.as_str())
                .bind(query.one_level_type_id)
                .bind(person_key)
                .fetch_one(pool)
                .await
                .map_err(db_error)?;
            (row.get("new_total"), row.get("previous_total"))
        }
    };
    let items = rows
        .iter()
        .map(|row| {
            let gmv: f64 = row.get("gmv");
            let gmv_spend: f64 = row.get("gmv_spend");
            TeamOutputVideo {
                video_id: row.get("video_id"),
                name: row.get("name"),
                author_name: row.get("account_name"),
                director_names: row.get("director_names"),
                one_level_type_name: row.get("one_level_type_name"),
                video_state_name: row.get("video_state_name"),
                uploaded_at: row.get::<DateTime<Utc>, _>("uploaded_at").to_rfc3339(),
                is_new: row.get("is_new"),
                spend: round2(row.get("spend")),
                gmv: round2(gmv),
                roi: ratio(gmv, gmv_spend),
                other_platform_spend: round2(row.get("other_platform_spend")),
                total_stat_cost: row.get("total_stat_cost"),
                total_stat_cost_at: row
                    .get::<Option<DateTime<Utc>>, _>("total_stat_cost_at")
                    .map(|at| at.to_rfc3339()),
            }
        })
        .collect();
    Ok(TeamOutputVideosResponse {
        items,
        total,
        new_total,
        previous_total,
        page,
        page_size,
    })
}
