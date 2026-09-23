#[derive(Debug)]
pub(crate) struct OverviewSqlOptions<'a> {
    pub(crate) start_date: &'a str,
    pub(crate) end_date: &'a str,
    pub(crate) prev_start_date: &'a str,
    pub(crate) prev_end_date: &'a str,
    pub(crate) platform: &'a str,
    pub(crate) include_platform_share: bool,
}

#[derive(Debug)]
pub(crate) struct OverviewDetailsSqlOptions<'a> {
    pub(crate) start_date: &'a str,
    pub(crate) end_date: &'a str,
    pub(crate) platform: &'a str,
}
