use sqlx::{postgres::PgRow, Row};

use super::readers::{read_f64, read_string};
use crate::reports::weekly_goods_channel_funnel::selection::ChannelContribution;

pub(in crate::reports::weekly_goods_channel_funnel) fn map_selection_basis_rows(
    rows: Vec<PgRow>,
) -> Vec<ChannelContribution> {
    if rows.is_empty() {
        return Vec::new();
    }

    let total_delta: f64 = rows.iter().map(selection_basis_delta).sum();

    rows.into_iter()
        .map(|row| {
            let traffic_channel = read_string(&row, "traffic_channel", "未知渠道");
            let gmv_delta = selection_basis_delta(&row);
            let contribution_rate = row
                .try_get::<Option<f64>, _>("pay_amount_delta_contribution_rate")
                .unwrap_or(None)
                .map(|rate| rate * 100.0)
                .unwrap_or_else(|| {
                    if total_delta.abs() > f64::EPSILON {
                        (gmv_delta / total_delta) * 100.0
                    } else {
                        0.0
                    }
                });

            ChannelContribution {
                traffic_channel,
                gmv_delta,
                contribution_rate,
            }
        })
        .collect()
}

fn selection_basis_delta(row: &PgRow) -> f64 {
    row.try_get::<f64, _>("pay_amount_delta")
        .unwrap_or_else(|_| read_f64(row, "curr_pay_amount") - read_f64(row, "prev_pay_amount"))
}
