mod background;
mod monthly;
mod state;
mod weekly;

pub(in crate::reports) use monthly::get_or_build_monthly_report;
pub(in crate::reports) use weekly::get_or_build_weekly_report;
