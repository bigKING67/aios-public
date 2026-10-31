//! 团队产出 against a disposable database (bql 010 + 012): team/group by the upload-day snapshot,
//! several 编导 counted once per person and once per group, ROI over spend with known GMV, and the
//! per-person video list. Each run uses its own 一级分类 and account keys, so it can share the
//! fixture. Run through `backend-rust/scripts/test-content-production-postgres.sh`.
use super::team_output_queries::{team_output, team_output_videos};
use super::team_output_types::{TeamOutputQuery, TeamOutputResponse, TeamOutputVideosQuery};
use chrono::{TimeZone, Utc};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

async fn pool() -> PgPool {
    let url =
        std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").expect("isolated test database");
    PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .unwrap()
}

struct Fixture {
    type_id: i64,
    editor: String,
    director_one: String,
    director_two: String,
    unmapped_label: i64,
}

async fn exec(pool: &PgPool, sql: &str) {
    sqlx::raw_sql(sqlx::AssertSqlSafe(sql.to_string()))
        .execute(pool)
        .await
        .unwrap();
}

/// v1 (10-05, 编导 one + two, spend 100 / GMV 150 on 10-15), v2 (10-25, 编导 one, spend 50 with
/// unknown GMV), v3 (09-20, only the 「无」 label = no 编导, spend 30 / GMV 60 on 10-02), v4 (10-06,
/// an unmapped label plus 「无」, no spend), v5 recycled. The editor moved from 内容1组 (snapshot 10-10) to 内容2组 (10-20).
async fn seed(pool: &PgPool) -> Fixture {
    let run = Uuid::new_v4().as_u128() % 1_000_000_000;
    let type_id = 9_000_000_000 + run as i64;
    let base = (run as i64) * 10;
    let f = Fixture {
        type_id,
        editor: format!("ed-{run}"),
        director_one: format!("d1-{run}"),
        director_two: format!("d2-{run}"),
        unmapped_label: base + 3,
    };
    let (l1, l2, l3, l4) = (base + 1, base + 2, base + 3, base + 4);
    let (ed, d1, d2) = (&f.editor, &f.director_one, &f.director_two);
    exec(
        pool,
        &format!(
            "INSERT INTO cloud_video.account_snapshots (snapshot_date, account_key, name, role_name, team_name, group_name) VALUES \
             ('2026-10-10', '{ed}', '剪辑甲', '抖音组-剪辑', '花悦', '内容1组'), \
             ('2026-10-20', '{ed}', '剪辑甲', '抖音组-剪辑', '花悦', '内容2组'), \
             ('2026-10-01', '{d1}', '编导一', '花悦编导', '佰马', '小组1'), \
             ('2026-10-01', '{d2}', '编导二', '花悦编导', '佰马', '小组1'); \
             INSERT INTO cloud_video.director_labels (label_id, name, account_key, mapping_source) VALUES \
             ({l1}, '编导一', '{d1}', 'name_match'), ({l2}, '编导二', '{d2}', 'manual'); \
             INSERT INTO cloud_video.director_labels (label_id, name) VALUES ({l3}, '没有账号'), ({l4}, '无'); \
             INSERT INTO cloud_video.finished_videos (video_id, name, account_key, account_name, one_level_type_id, \
               one_level_type_name, uploaded_at, recycled_at, director_label_ids) VALUES \
             ({b1}, 'v1', '{ed}', '剪辑甲', {type_id}, '测试品类', '2026-10-05 18:00+08', NULL, ARRAY[{l1}, {l2}]::BIGINT[]), \
             ({b2}, 'v2', '{ed}', '剪辑甲', {type_id}, '测试品类', '2026-10-25 18:00+08', NULL, ARRAY[{l1}]::BIGINT[]), \
             ({b3}, 'v3', '{ed}', '剪辑甲', {type_id}, '测试品类', '2026-09-20 18:00+08', NULL, ARRAY[{l4}]::BIGINT[]), \
             ({b4}, 'v4', '{ed}', '剪辑甲', {type_id}, '测试品类', '2026-10-06 18:00+08', NULL, ARRAY[{l3}, {l4}]::BIGINT[]), \
             ({b5}, 'v5', '{ed}', '剪辑甲', {type_id}, '测试品类', '2026-10-07 18:00+08', '2026-10-08 10:00+08', '{{}}'); \
             INSERT INTO cloud_video.finished_spend_daily (video_id, stat_date, spend, pay_order_amount, other_platform_spend, \
               list_spend, relation_count) VALUES \
             ({b1}, '2026-10-15', 100, 150, 20, 100, 2), ({b2}, '2026-10-26', 50, NULL, 0, 50, 0), \
             ({b3}, '2026-10-02', 30, 60, 0, 30, 1), ({b5}, '2026-10-09', 999, 999, 999, 999, 1);",
            b1 = base + 1,
            b2 = base + 2,
            b3 = base + 3,
            b4 = base + 4,
            b5 = base + 5,
        ),
    )
    .await;
    f
}

fn query(f: &Fixture, dimension: &str) -> TeamOutputQuery {
    TeamOutputQuery {
        from: Some("2026-10-01".into()),
        to: Some("2026-10-31".into()),
        dimension: Some(dimension.into()),
        one_level_type_id: Some(f.type_id),
        ..TeamOutputQuery::default()
    }
}

fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 30, 4, 0, 0).unwrap()
}

fn team<'a>(
    response: &'a TeamOutputResponse,
    name: &str,
) -> &'a super::team_output_types::TeamOutputTeam {
    response.teams.iter().find(|t| t.name == name).unwrap()
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 010 and 012"]
async fn editors_count_by_the_upload_day_group_and_roi_skips_unknown_gmv() {
    let pool = pool().await;
    let f = seed(&pool).await;
    let response = team_output(&pool, query(&f, "editor"), now())
        .await
        .unwrap();
    let totals = &response.totals;
    assert_eq!(
        (totals.uploads, totals.spend, totals.gmv, totals.gmv_spend),
        (3, 180.0, 210.0, 130.0)
    );
    assert_eq!(totals.roi, Some(210.0 / 130.0));
    assert_eq!(
        (totals.new_spend, totals.new_gmv, totals.new_roi),
        (150.0, 150.0, Some(1.5))
    );
    assert_eq!(totals.spent_videos, 3); // the recycled v5 is out
    let huayue = team(&response, "花悦");
    let groups: Vec<_> = huayue
        .groups
        .iter()
        .map(|g| (g.name.as_str(), g.metrics.uploads, g.metrics.spend))
        .collect();
    // v1/v4 predate every snapshot (earliest: 内容1组), v3 too; v2 was uploaded after the move.
    assert_eq!(groups, vec![("内容1组", 2, 130.0), ("内容2组", 1, 50.0)]);
    assert_eq!(huayue.groups[0].people[0].name, "剪辑甲");
    assert_eq!(
        huayue.groups[0].people[0].role_name.as_deref(),
        Some("抖音组-剪辑")
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 010 and 012"]
async fn directors_count_each_person_and_each_group_once_per_video() {
    let pool = pool().await;
    let f = seed(&pool).await;
    let response = team_output(&pool, query(&f, "director"), now())
        .await
        .unwrap();
    assert_eq!((response.totals.uploads, response.totals.spend), (3, 180.0));
    let baima = team(&response, "佰马");
    assert_eq!((baima.metrics.uploads, baima.metrics.spend), (2, 150.0));
    let people: Vec<_> = baima.groups[0]
        .people
        .iter()
        .map(|p| (p.name.as_str(), p.metrics.uploads, p.metrics.spend))
        .collect();
    assert_eq!(people, vec![("编导一", 2, 150.0), ("编导二", 1, 100.0)]);
    let unmapped = team(&response, "未关联账号");
    assert_eq!(unmapped.groups[0].people[0].name, "没有账号");
    assert_eq!(
        unmapped.groups[0].people[0].key,
        format!("label:{}", f.unmapped_label)
    );
    let none = team(&response, "未归属");
    assert_eq!(none.groups[0].people[0].name, "未标注编导");
    assert_eq!((none.metrics.uploads, none.metrics.spend), (0, 30.0)); // v3 is old, its spend is in the window
    assert_eq!(response.quality.uploads_with_several_directors, 1); // 「无」 beside a real label is not a second 编导
    let (real_unmapped, placeholders): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE TRIM(name) <> '无'), COUNT(*) FILTER (WHERE TRIM(name) = '无') \
         FROM cloud_video.director_labels WHERE account_key IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(placeholders > 0);
    assert_eq!(response.quality.unmapped_director_labels, real_unmapped); // 「无」 is not an unmapped person
    assert!(response
        .teams
        .iter()
        .flat_map(|t| t.groups.iter().flat_map(|g| g.people.iter()))
        .all(|p| p.name != "无"));
    assert_eq!(response.quality.spend_without_gmv, 50.0);
    assert_eq!(response.quality.other_platform_spend, 20.0); // never in spend or ROI
    assert_eq!(response.teams.last().unwrap().name, "未归属");
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 010 and 012"]
async fn a_person_lists_their_videos_by_spend() {
    let pool = pool().await;
    let f = seed(&pool).await;
    let page = team_output_videos(
        &pool,
        TeamOutputVideosQuery {
            from: Some("2026-10-01".into()),
            to: Some("2026-10-31".into()),
            dimension: Some("director".into()),
            one_level_type_id: Some(f.type_id),
            person_key: f.director_one.clone(),
            ..TeamOutputVideosQuery::default()
        },
        now(),
    )
    .await
    .unwrap();
    let rows: Vec<_> = page
        .items
        .iter()
        .map(|v| (v.name.as_str(), v.spend, v.roi, v.is_new))
        .collect();
    assert_eq!(
        rows,
        vec![("v1", 100.0, Some(1.5), true), ("v2", 50.0, None, true)]
    );
    assert_eq!(page.items[0].director_names, vec!["编导一", "编导二"]);
    assert_eq!(page.items[0].other_platform_spend, 20.0);
    assert_eq!((page.new_total, page.previous_total), (2, 0));
    assert_eq!(page.total, 2);
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 010 and 012"]
async fn a_person_list_splits_new_and_previous_films() {
    let pool = pool().await;
    let f = seed(&pool).await;
    let list = |scope: &'static str| {
        let pool = pool.clone();
        let key = f.editor.clone();
        let type_id = f.type_id;
        async move {
            team_output_videos(
                &pool,
                TeamOutputVideosQuery {
                    from: Some("2026-10-01".into()),
                    to: Some("2026-10-31".into()),
                    dimension: Some("editor".into()),
                    one_level_type_id: Some(type_id),
                    person_key: key,
                    scope: Some(scope.into()),
                    ..TeamOutputVideosQuery::default()
                },
                now(),
            )
            .await
            .unwrap()
        }
    };
    let all = list("all").await;
    assert_eq!((all.total, all.new_total, all.previous_total), (4, 3, 1)); // v5 is recycled
    let previous = list("previous").await;
    assert_eq!(
        previous
            .items
            .iter()
            .map(|v| v.name.as_str())
            .collect::<Vec<_>>(),
        vec!["v3"]
    );
    assert!(!previous.items[0].is_new);
    let new = list("new").await;
    assert_eq!((new.total, new.new_total, new.previous_total), (3, 3, 1));
    assert!(new.items.iter().all(|v| v.is_new));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 010 and 012"]
async fn exports_read_back_with_every_row_and_one_line_per_director() {
    use super::team_output_export::{export, ExportKind};
    let pool = pool().await;
    let f = seed(&pool).await;
    let rows = |bytes: &[u8], sheet: &str| {
        crate::xlsx::parse_xlsx_rows(bytes, 10 << 20, 10_000, 20, sheet).unwrap()
    };

    let (name, bytes) = export(
        &pool,
        query(&f, "director"),
        ExportKind::Summary,
        None,
        now(),
    )
    .await
    .unwrap();
    assert_eq!(
        name,
        "团队产出_编导_2026-10-01至2026-10-30_测试品类_汇总.xlsx"
    );
    let summary = rows(&bytes, "汇总");
    assert!(summary[0][0].contains("数据完整到"));
    let header = summary
        .iter()
        .position(|row| row.first().map(String::as_str) == Some("层级"))
        .unwrap();
    let people: Vec<_> = summary[header + 1..]
        .iter()
        .filter(|row| row[0] == "人员")
        .map(|row| (row[3].clone(), row[5].clone()))
        .collect();
    assert!(people.contains(&("编导一".to_string(), "2".to_string())));
    assert!(people.contains(&("编导二".to_string(), "1".to_string())));
    assert!(people.contains(&("未标注编导".to_string(), "0".to_string()))); // folded groups never narrow it

    let (_, bytes) = export(
        &pool,
        query(&f, "director"),
        ExportKind::Videos,
        None,
        now(),
    )
    .await
    .unwrap();
    let videos = rows(&bytes, "成片明细");
    let header = videos
        .iter()
        .position(|row| row.first().map(String::as_str) == Some("团队"))
        .unwrap();
    let v1: Vec<_> = videos[header + 1..]
        .iter()
        .filter(|row| row[3] == "v1")
        .map(|row| row[2].clone())
        .collect();
    assert_eq!(v1, vec!["编导一", "编导二"]); // one line under each 编导
    let v3 = videos[header + 1..]
        .iter()
        .find(|row| row[3] == "v3")
        .unwrap();
    assert_eq!((v3[6].as_str(), v3[11].as_str()), ("否", "30")); // an older film with spend in the window

    let one_person = Some(f.director_one.as_str());
    let (name, bytes) = export(
        &pool,
        query(&f, "director"),
        ExportKind::Videos,
        one_person,
        now(),
    )
    .await
    .unwrap();
    assert!(name.ends_with("_编导一_成片明细.xlsx"));
    let one = rows(&bytes, "成片明细");
    let header = one
        .iter()
        .position(|row| row.first().map(String::as_str) == Some("团队"))
        .unwrap();
    let mut films: Vec<_> = one[header + 1..]
        .iter()
        .map(|row| (row[2].clone(), row[3].clone()))
        .collect();
    films.sort();
    assert_eq!(
        films,
        vec![
            ("编导一".to_string(), "v1".to_string()),
            ("编导一".to_string(), "v2".to_string())
        ]
    );
}
