mod prediction;
mod quality;
mod totals;

pub(super) use prediction::patch_series_with_nowcast_prediction;
pub(super) use quality::apply_nowcast_quality_patch;
pub(super) use totals::{collect_series_predicted_totals, patch_overview_totals_with_predicted};
