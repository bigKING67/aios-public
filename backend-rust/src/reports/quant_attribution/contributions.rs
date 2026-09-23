use std::cmp;

use super::super::{
    factor_reason::build_factor_reason_and_action,
    metrics::calculate_wow,
    traffic_channel::{TrafficChannelNature, TrafficChannelProfile},
    GoodsChannelDriverContribution,
};
use super::factors::FactorRow;

pub(super) fn build_driver_contributions(
    factor_rows: Vec<FactorRow>,
    channel_context: &str,
    channel_profile: TrafficChannelProfile,
    channel_nature: TrafficChannelNature,
) -> Vec<GoodsChannelDriverContribution> {
    let total_ln_contribution: f64 = factor_rows.iter().map(|row| row.ln_contribution).sum();
    let mut quant_attribution = factor_rows
        .into_iter()
        .map(|row| {
            let (reason, action) = build_factor_reason_and_action(
                row.factor_key,
                row.ln_contribution,
                channel_context,
                channel_profile,
                channel_nature,
            );

            GoodsChannelDriverContribution {
                factor_key: row.factor_key.to_string(),
                factor_label: row.factor_label.to_string(),
                curr_value: row.curr_value,
                prev_value: row.prev_value,
                change_rate: calculate_wow(row.curr_value, row.prev_value),
                ln_contribution: row.ln_contribution,
                contribution_rate: if total_ln_contribution.abs() > f64::EPSILON {
                    Some((row.ln_contribution / total_ln_contribution) * 100.0)
                } else {
                    None
                },
                effect: if row.ln_contribution >= 0.0 {
                    "拉动".to_string()
                } else {
                    "拖累".to_string()
                },
                reason,
                action,
                priority: "P2".to_string(),
            }
        })
        .collect::<Vec<_>>();

    assign_priorities(&mut quant_attribution);
    quant_attribution
}

fn assign_priorities(quant_attribution: &mut [GoodsChannelDriverContribution]) {
    let mut factor_order: Vec<usize> = (0..quant_attribution.len()).collect();
    factor_order.sort_by(|left, right| {
        quant_attribution[*right]
            .ln_contribution
            .abs()
            .partial_cmp(&quant_attribution[*left].ln_contribution.abs())
            .unwrap_or(cmp::Ordering::Equal)
    });

    for (rank, idx) in factor_order.into_iter().enumerate() {
        quant_attribution[idx].priority = if rank == 0 {
            "P0".to_string()
        } else if rank <= 2 {
            "P1".to_string()
        } else {
            "P2".to_string()
        };
    }
}
