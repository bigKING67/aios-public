mod kpis;
mod periods;
mod platforms;

pub(super) use kpis::{build_monthly_conclusions, build_monthly_kpis};
pub(super) use periods::{get_all_month_periods, get_latest_month_period};
pub(super) use platforms::build_monthly_platform_data;
