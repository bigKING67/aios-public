use super::super::sql_templates::{apply_sql_template, escape_sql_literal};

const OVERVIEW_REFUND_NOWCAST_PATCH_TEMPLATE: &str = include_str!("refund_patch.sql");

pub(crate) fn build_overview_refund_nowcast_patch_sql(
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
    platform: &str,
) -> String {
    apply_sql_template(
        OVERVIEW_REFUND_NOWCAST_PATCH_TEMPLATE,
        &[
            ("__START_DATE_LITERAL__", escape_sql_literal(start_date)),
            ("__END_DATE_LITERAL__", escape_sql_literal(end_date)),
            (
                "__PREV_START_DATE_LITERAL__",
                escape_sql_literal(prev_start_date),
            ),
            (
                "__PREV_END_DATE_LITERAL__",
                escape_sql_literal(prev_end_date),
            ),
            ("__PLATFORM_LITERAL__", escape_sql_literal(platform)),
        ],
    )
}
