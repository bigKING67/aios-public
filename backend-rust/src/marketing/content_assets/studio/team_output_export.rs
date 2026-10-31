//! 团队产出 XLSX export (`GET /studio/team-output/export`): the page's team → group → person rows
//! (`kind=summary`) or every (成片, person) row behind them (`kind=videos`), for the same window,
//! dimension and 一级分类. Group folding on the page never narrows the file. The first rows state the
//! window, freshness and the money rules so a forwarded file still reads correctly.
use chrono::{DateTime, FixedOffset, Utc};
use rust_xlsxwriter::{Format, Workbook, Worksheet, XlsxError};
use sqlx::{PgPool, Row};

use super::{
    error::StudioResult,
    repository::db_error,
    team_output::{group_display, person, ratio, team_display, Dimension, MetricRow},
    team_output_queries::{names, team_output_window, EXPORT_ROWS_SELECT},
    team_output_types::{TeamOutputMetrics, TeamOutputQuery, TeamOutputResponse},
};
use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ExportKind {
    Summary,
    Videos,
}

impl ExportKind {
    pub(super) fn parse(value: Option<&str>) -> Result<Self, AppError> {
        match value.unwrap_or("summary") {
            "summary" => Ok(Self::Summary),
            "videos" => Ok(Self::Videos),
            _ => Err(AppError::bad_request("kind 只支持 summary、videos")),
        }
    }
}

const BASIS: &str = "金额只统计巨量千川，为云管家原值；千川成交为直接成交（下单金额），不扣退款；\
ROI = 千川成交 ÷ 千川消耗，成交为 0 的消耗也计入。千川消耗与有消耗成片包括以前上传、所选时段仍在投放的成片；\
新片指所选时段上传的成片。编导视角下一条成片有几位编导，每位各计 1 条，小组和团队合计只算 1 次。";
const SUMMARY_HEADERS: [&str; 11] = [
    "层级",
    "团队",
    "小组",
    "人员",
    "角色",
    "成片数",
    "千川消耗",
    "千川成交",
    "ROI",
    "新片消耗",
    "新片 ROI",
];
const VIDEO_HEADERS: [&str; 14] = [
    "团队",
    "小组",
    "人员",
    "成片",
    "云管家 ID",
    "上传日期",
    "新片",
    "品类",
    "状态",
    "剪辑",
    "编导",
    "千川消耗",
    "千川成交",
    "ROI",
];

fn xlsx_error(error: XlsxError) -> AppError {
    tracing::error!(?error, "build team output xlsx failed");
    AppError::Internal
}

fn shanghai() -> FixedOffset {
    FixedOffset::east_opt(8 * 3600).expect("+08 offset")
}

/// `团队产出_剪辑_2026-10-01至2026-10-30_全部品类_汇总.xlsx`.
pub(super) fn file_name(
    response: &TeamOutputResponse,
    category: Option<&str>,
    kind: ExportKind,
    person: Option<&str>,
) -> String {
    let dimension = if response.dimension == "director" {
        "编导"
    } else {
        "剪辑"
    };
    let what = match (kind, person) {
        (ExportKind::Summary, _) => "汇总".to_string(),
        (ExportKind::Videos, None) => "成片明细".to_string(),
        (ExportKind::Videos, Some(name)) => format!("{name}_成片明细"),
    };
    format!(
        "团队产出_{dimension}_{}至{}_{}_{what}.xlsx",
        response.period.from,
        response.period.to,
        category.unwrap_or("全部品类")
    )
}

/// RFC 5987 `filename*` for the Chinese name, with an ASCII fallback.
pub(super) fn content_disposition(name: &str) -> String {
    let encoded: String = name
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect();
    format!("attachment; filename=\"team-output.xlsx\"; filename*=UTF-8''{encoded}")
}

fn write_preamble(
    sheet: &mut Worksheet,
    response: &TeamOutputResponse,
    category: Option<&str>,
) -> Result<u32, XlsxError> {
    let dimension = if response.dimension == "director" {
        "编导"
    } else {
        "剪辑"
    };
    sheet.write_string(
        0,
        0,
        format!(
            "团队产出 · {dimension} · {} 至 {} · {} · 数据完整到 {}",
            response.period.from,
            response.period.to,
            category.unwrap_or("全部品类"),
            response
                .sync
                .latest_complete_day
                .as_deref()
                .unwrap_or("尚未同步")
        ),
    )?;
    sheet.write_string(1, 0, BASIS)?;
    let mut row = 2;
    if !response.sync.incomplete_days.is_empty() {
        sheet.write_string(
            row,
            0,
            format!(
                "未同步完整的日期：{}",
                response.sync.incomplete_days.join("、")
            ),
        )?;
        row += 1;
    }
    if response.quality.other_platform_spend > 0.0 {
        sheet.write_string(
            row,
            0,
            format!(
                "另有巨量广告、百度等其他平台消耗 {:.2}，不计入任何数字",
                response.quality.other_platform_spend
            ),
        )?;
        row += 1;
    }
    Ok(row + 1)
}

fn write_headers(
    sheet: &mut Worksheet,
    row: u32,
    headers: &[&str],
    bold: &Format,
) -> Result<(), XlsxError> {
    for (column, header) in headers.iter().enumerate() {
        sheet.write_string_with_format(row, column as u16, *header, bold)?;
    }
    Ok(())
}

fn write_ratio(
    sheet: &mut Worksheet,
    row: u32,
    column: u16,
    value: Option<f64>,
    money: &Format,
) -> Result<(), XlsxError> {
    match value {
        Some(value) => sheet
            .write_number_with_format(row, column, value, money)
            .map(|_| ()),
        None => sheet.write_string(row, column, "—").map(|_| ()),
    }
}

fn write_metrics(
    sheet: &mut Worksheet,
    row: u32,
    metrics: &TeamOutputMetrics,
    money: &Format,
) -> Result<(), XlsxError> {
    sheet.write_number(row, 5, metrics.uploads as f64)?;
    sheet.write_number_with_format(row, 6, metrics.spend, money)?;
    sheet.write_number_with_format(row, 7, metrics.gmv, money)?;
    write_ratio(sheet, row, 8, metrics.roi, money)?;
    sheet.write_number_with_format(row, 9, metrics.new_spend, money)?;
    write_ratio(sheet, row, 10, metrics.new_roi, money)?;
    Ok(())
}

/// Totals, then every team, group and person in the page's order, whatever the page has folded.
pub(super) fn summary_workbook(
    response: &TeamOutputResponse,
    category: Option<&str>,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let bold = Format::new().set_bold();
    let money = Format::new().set_num_format("#,##0.00");
    let sheet = workbook.add_worksheet();
    sheet.set_name("汇总")?;
    let mut row = write_preamble(sheet, response, category)?;
    write_headers(sheet, row, &SUMMARY_HEADERS, &bold)?;
    row += 1;
    sheet.write_string(row, 0, "合计")?;
    write_metrics(sheet, row, &response.totals, &money)?;
    row += 1;
    for team in &response.teams {
        sheet.write_string(row, 0, "团队")?;
        sheet.write_string(row, 1, &team.name)?;
        write_metrics(sheet, row, &team.metrics, &money)?;
        row += 1;
        let sentinel = team.kind == "none" || team.kind == "unmapped_label";
        for group in &team.groups {
            if !sentinel {
                sheet.write_string(row, 0, "小组")?;
                sheet.write_string(row, 1, &team.name)?;
                sheet.write_string(row, 2, &group.name)?;
                write_metrics(sheet, row, &group.metrics, &money)?;
                row += 1;
            }
            for item in &group.people {
                sheet.write_string(row, 0, "人员")?;
                sheet.write_string(row, 1, &team.name)?;
                if !sentinel {
                    sheet.write_string(row, 2, &group.name)?;
                }
                sheet.write_string(row, 3, &item.name)?;
                if let Some(role) = &item.role_name {
                    sheet.write_string(row, 4, role)?;
                }
                write_metrics(sheet, row, &item.metrics, &money)?;
                row += 1;
            }
        }
    }
    sheet.set_column_width(1, 12)?;
    sheet.set_column_width(2, 12)?;
    sheet.set_column_width(3, 12)?;
    sheet.set_column_width(4, 14)?;
    for column in 5..=10 {
        sheet.set_column_width(column, 14)?;
    }
    workbook.save_to_buffer()
}

pub(super) struct VideoRow {
    pub(super) team: String,
    pub(super) group: String,
    pub(super) person: String,
    pub(super) video_id: i64,
    pub(super) name: String,
    pub(super) uploaded: String,
    pub(super) is_new: bool,
    pub(super) category: Option<String>,
    pub(super) state: Option<String>,
    pub(super) author: Option<String>,
    pub(super) directors: Vec<String>,
    pub(super) spend: f64,
    pub(super) gmv: f64,
    pub(super) roi: Option<f64>,
}

/// One row per (成片, person): a 成片 with two 编导 appears once under each.
pub(super) fn videos_workbook(
    response: &TeamOutputResponse,
    category: Option<&str>,
    rows: &[VideoRow],
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let bold = Format::new().set_bold();
    let money = Format::new().set_num_format("#,##0.00");
    let sheet = workbook.add_worksheet();
    sheet.set_name("成片明细")?;
    let mut row = write_preamble(sheet, response, category)?;
    if response.dimension == "director" {
        sheet.write_string(
            row - 1,
            0,
            "多位编导的成片在每位编导下各占一行，按人员筛选即可看全一个人的成片。",
        )?;
        row += 1;
    }
    write_headers(sheet, row, &VIDEO_HEADERS, &bold)?;
    row += 1;
    for item in rows {
        sheet.write_string(row, 0, &item.team)?;
        sheet.write_string(row, 1, &item.group)?;
        sheet.write_string(row, 2, &item.person)?;
        sheet.write_string(row, 3, &item.name)?;
        sheet.write_string(row, 4, item.video_id.to_string())?;
        sheet.write_string(row, 5, &item.uploaded)?;
        sheet.write_string(row, 6, if item.is_new { "是" } else { "否" })?;
        sheet.write_string(row, 7, item.category.as_deref().unwrap_or(""))?;
        sheet.write_string(row, 8, item.state.as_deref().unwrap_or(""))?;
        sheet.write_string(row, 9, item.author.as_deref().unwrap_or(""))?;
        sheet.write_string(row, 10, item.directors.join("、"))?;
        sheet.write_number_with_format(row, 11, item.spend, &money)?;
        sheet.write_number_with_format(row, 12, item.gmv, &money)?;
        write_ratio(sheet, row, 13, item.roi, &money)?;
        row += 1;
    }
    sheet.set_column_width(3, 48)?;
    sheet.set_column_width(4, 12)?;
    sheet.set_column_width(10, 20)?;
    workbook.save_to_buffer()
}

/// The workbook bytes and file name for one export request.
pub(super) async fn export(
    pool: &PgPool,
    query: TeamOutputQuery,
    kind: ExportKind,
    person_key: Option<&str>,
    now: DateTime<Utc>,
) -> StudioResult<(String, Vec<u8>)> {
    let person_key = person_key.map(str::trim).filter(|key| !key.is_empty());
    if person_key.is_some_and(|key| key.len() > 128) {
        return Err(AppError::bad_request("personKey 过长").into());
    }
    let category_id = query.one_level_type_id;
    let (response, from, last) = team_output_window(pool, query, now).await?;
    let category = category_id.and_then(|id| {
        response
            .categories
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.name.clone())
    });
    let (name, bytes) = match kind {
        ExportKind::Summary => (
            file_name(&response, category.as_deref(), kind, None),
            summary_workbook(&response, category.as_deref()).map_err(xlsx_error)?,
        ),
        ExportKind::Videos => {
            let dimension = Dimension::parse(Some(response.dimension.as_str()))?;
            let rows = video_rows(pool, (from, last), dimension, category_id, person_key).await?;
            let person = person_key.and(rows.first().map(|row| row.person.as_str()));
            (
                file_name(&response, category.as_deref(), kind, person),
                videos_workbook(&response, category.as_deref(), &rows).map_err(xlsx_error)?,
            )
        }
    };
    Ok((name, bytes))
}

async fn video_rows(
    pool: &PgPool,
    window: (chrono::NaiveDate, chrono::NaiveDate),
    dimension: Dimension,
    category_id: Option<i64>,
    person_key: Option<&str>,
) -> StudioResult<Vec<VideoRow>> {
    let (from, last) = window;
    let raw = sqlx::query(EXPORT_ROWS_SELECT)
        .bind(from)
        .bind(last)
        .bind(match dimension {
            Dimension::Editor => "editor",
            Dimension::Director => "director",
        })
        .bind(category_id)
        .bind(person_key)
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    let keys: Vec<String> = raw
        .iter()
        .map(|row| row.get::<String, _>("person_key"))
        .collect();
    let names = names(pool, &keys).await?;
    let empty = MetricRow::default();
    Ok(raw
        .iter()
        .map(|row| {
            let team: String = row.get("team");
            let group: String = row.get("grp");
            let key: String = row.get("person_key");
            let gmv: f64 = row.get("gmv");
            let uploaded: DateTime<Utc> = row.get("uploaded_at");
            VideoRow {
                team: team_display(&team).0,
                group: group_display(&team, &group),
                person: person(&key, dimension, &names, &empty).name,
                video_id: row.get("video_id"),
                name: row.get("name"),
                uploaded: uploaded
                    .with_timezone(&shanghai())
                    .format("%Y-%m-%d")
                    .to_string(),
                is_new: row.get("is_new"),
                category: row.get("one_level_type_name"),
                state: row.get("video_state_name"),
                author: row.get("account_name"),
                directors: row.get("director_names"),
                spend: row.get("spend"),
                gmv,
                roi: ratio(gmv, row.get("gmv_spend")),
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_file_name_states_the_filters_and_the_header_encodes_it() {
        let disposition = content_disposition("团队产出_剪辑.xlsx");
        assert!(
            disposition.starts_with("attachment; filename=\"team-output.xlsx\"; filename*=UTF-8''")
        );
        assert!(disposition.ends_with("_%E5%89%AA%E8%BE%91.xlsx"));
        assert!(ExportKind::parse(Some("videos")).is_ok());
        assert!(ExportKind::parse(Some("csv")).is_err());
    }
}
