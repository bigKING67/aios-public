use super::super::sql_templates::{apply_sql_template, escape_sql_literal};

#[derive(Debug)]
pub(crate) struct CreatorLiveOverviewSqlOptions<'a> {
    pub(crate) start_date: &'a str,
    pub(crate) end_date: &'a str,
    pub(crate) prev_start_date: &'a str,
    pub(crate) prev_end_date: &'a str,
}

const CREATOR_LIVE_OVERVIEW_QUERY_TEMPLATE: &str = include_str!("query.sql");

pub(crate) fn build_creator_live_overview_query_sql(
    options: CreatorLiveOverviewSqlOptions<'_>,
) -> String {
    apply_sql_template(
        CREATOR_LIVE_OVERVIEW_QUERY_TEMPLATE,
        &[
            (
                "__START_DATE_LITERAL__",
                escape_sql_literal(options.start_date),
            ),
            ("__END_DATE_LITERAL__", escape_sql_literal(options.end_date)),
            (
                "__PREV_START_DATE_LITERAL__",
                escape_sql_literal(options.prev_start_date),
            ),
            (
                "__PREV_END_DATE_LITERAL__",
                escape_sql_literal(options.prev_end_date),
            ),
        ],
    )
}
