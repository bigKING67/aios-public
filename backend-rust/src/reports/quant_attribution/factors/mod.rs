mod click_stage;
mod types;
mod visitor_stage;

pub(super) use types::FactorRow;

use super::totals::ChannelMetricTotals;

pub(super) fn build_factor_rows(totals: &ChannelMetricTotals) -> Vec<FactorRow> {
    if totals.has_click_stage {
        return click_stage::build_click_stage_factor_rows(totals);
    }

    visitor_stage::build_visitor_stage_factor_rows(totals)
}
