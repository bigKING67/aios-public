use super::super::sql_templates::{apply_sql_template, escape_sql_literal};

const OVERVIEW_DETAILS_NOWCAST_PATCH_TEMPLATE: &str = include_str!("details_nowcast_patch.sql");

pub(crate) fn build_overview_details_refund_nowcast_patch_sql(
    start_date: &str,
    end_date: &str,
    platform: &str,
) -> String {
    apply_sql_template(
        OVERVIEW_DETAILS_NOWCAST_PATCH_TEMPLATE,
        &[
            ("__START_DATE_LITERAL__", escape_sql_literal(start_date)),
            ("__END_DATE_LITERAL__", escape_sql_literal(end_date)),
            ("__PLATFORM_LITERAL__", escape_sql_literal(platform)),
        ],
    )
}
