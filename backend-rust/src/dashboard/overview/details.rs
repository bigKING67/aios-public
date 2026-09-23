use super::super::sql_templates::{apply_sql_template, escape_sql_literal};
use super::types::OverviewDetailsSqlOptions;

const OVERVIEW_DETAILS_QUERY_TEMPLATE: &str = include_str!("details_query.sql");

pub(crate) fn build_overview_details_query_sql(options: OverviewDetailsSqlOptions<'_>) -> String {
    apply_sql_template(
        OVERVIEW_DETAILS_QUERY_TEMPLATE,
        &[
            (
                "__START_DATE_LITERAL__",
                escape_sql_literal(options.start_date),
            ),
            ("__END_DATE_LITERAL__", escape_sql_literal(options.end_date)),
            ("__PLATFORM_LITERAL__", escape_sql_literal(options.platform)),
        ],
    )
}
