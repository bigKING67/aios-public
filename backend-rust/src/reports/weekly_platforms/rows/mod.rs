mod contribution;
mod platform_row;
mod readers;

use super::super::PlatformData;

pub(super) fn map_weekly_platform_rows(rows: Vec<sqlx::postgres::PgRow>) -> Vec<PlatformData> {
    let mut result = Vec::with_capacity(rows.len());
    let mut total_gmv = 0.0;

    for row in rows {
        let item = platform_row::map_platform_row(row);
        total_gmv += item.gmv;
        result.push(item);
    }

    contribution::apply_platform_contribution(result.as_mut_slice(), total_gmv);
    result
}
