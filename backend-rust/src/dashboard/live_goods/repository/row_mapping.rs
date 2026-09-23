use serde_json::Value;
use sqlx::{postgres::PgRow, Row};

use super::super::{
    types::DashboardLiveGoodsMetricRow, value_mapping::live_goods_metric_row_from_value,
};

pub(super) fn decode_live_goods_metric_rows(
    rows: Vec<PgRow>,
) -> Result<Vec<DashboardLiveGoodsMetricRow>, String> {
    let mut metric_rows = Vec::<DashboardLiveGoodsMetricRow>::with_capacity(rows.len());

    for row in rows {
        let payload = row
            .try_get::<String, _>("payload")
            .map_err(|error| error.to_string())?;
        let payload_json =
            serde_json::from_str::<Value>(payload.as_str()).map_err(|error| error.to_string())?;
        metric_rows.push(live_goods_metric_row_from_value(&payload_json)?);
    }

    Ok(metric_rows)
}
