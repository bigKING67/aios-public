use super::sql_templates::{apply_sql_template, escape_sql_literal};

const GOODS_CARD_QUERY_SQL: &str = include_str!("query.sql");

pub(super) fn build_goods_card_query_sql(
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
) -> String {
    apply_sql_template(
        GOODS_CARD_QUERY_SQL,
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
        ],
    )
}
