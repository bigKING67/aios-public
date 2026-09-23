use super::super::sql_templates::{apply_sql_template, escape_sql_literal};

#[derive(Debug)]
pub(crate) struct CreatorLiveDetailsSqlOptions<'a> {
    pub(crate) start_date: &'a str,
    pub(crate) end_date: &'a str,
    pub(crate) cooperation_status: Option<&'a str>,
    pub(crate) keyword: Option<&'a str>,
}

const CREATOR_LIVE_DETAILS_QUERY_TEMPLATE: &str = include_str!("details_query.sql");

pub(crate) fn build_creator_live_details_query_sql(
    options: CreatorLiveDetailsSqlOptions<'_>,
) -> String {
    let cooperation_status_literal = options
        .cooperation_status
        .map(escape_sql_literal)
        .unwrap_or_else(|| "NULL".to_string());
    let keyword_literal = options
        .keyword
        .map(escape_sql_literal)
        .unwrap_or_else(|| "NULL".to_string());

    apply_sql_template(
        CREATOR_LIVE_DETAILS_QUERY_TEMPLATE,
        &[
            (
                "__START_DATE_LITERAL__",
                escape_sql_literal(options.start_date),
            ),
            ("__END_DATE_LITERAL__", escape_sql_literal(options.end_date)),
            ("__COOPERATION_STATUS_LITERAL__", cooperation_status_literal),
            ("__KEYWORD_LITERAL__", keyword_literal),
        ],
    )
}
