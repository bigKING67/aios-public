use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct WeekPeriodQuery {
    pub(crate) week_period: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WeekPeriodOptionalQuery {
    pub(crate) week_period: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WeekPeriodSummaryScopeQuery {
    pub(crate) week_period: Option<String>,
    pub(crate) summary_scope: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WeeklyPeriodsQuery {
    pub(crate) limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct MonthlyPeriodQuery {
    pub(crate) month_period: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct MonthlyPeriodsQuery {
    pub(crate) limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ListReportsQuery {
    pub(crate) report_type: Option<String>,
    pub(crate) limit: Option<i64>,
    pub(crate) offset: Option<i64>,
}
