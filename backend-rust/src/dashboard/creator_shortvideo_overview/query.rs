use super::super::sql_templates::{apply_sql_template, escape_sql_literal};

#[derive(Debug)]
pub(crate) struct CreatorShortVideoOverviewSqlOptions<'a> {
    pub(crate) start_date: &'a str,
    pub(crate) end_date: &'a str,
    pub(crate) prev_start_date: &'a str,
    pub(crate) prev_end_date: &'a str,
}

const CREATOR_SHORTVIDEO_OVERVIEW_QUERY_TEMPLATE: &str = include_str!("query.sql");

pub(crate) fn build_creator_shortvideo_overview_query_sql(
    options: CreatorShortVideoOverviewSqlOptions<'_>,
) -> String {
    apply_sql_template(
        CREATOR_SHORTVIDEO_OVERVIEW_QUERY_TEMPLATE,
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

#[cfg(test)]
mod tests {
    use super::{build_creator_shortvideo_overview_query_sql, CreatorShortVideoOverviewSqlOptions};

    #[test]
    fn builds_cooperation_and_qianchuan_material_shortvideo_overview_sql() {
        let sql =
            build_creator_shortvideo_overview_query_sql(CreatorShortVideoOverviewSqlOptions {
                start_date: "2026-06-01",
                end_date: "2026-06-09",
                prev_start_date: "2026-05-23",
                prev_end_date: "2026-05-31",
            });

        assert!(
            sql.contains("LIKE '%合作%'"),
            "creator short-video overview must include cooperative rows"
        );
        assert!(
            sql.contains("NOT LIKE '%自营%'"),
            "creator short-video overview must exclude self-operated rows"
        );
        assert!(
            sql.contains("'qianchuan_video_day'"),
            "creator short-video overview must include Qianchuan video-grain rows"
        );
        assert!(
            sql.contains("'qianchuan_material_day'"),
            "creator short-video overview must include Qianchuan material-grain rows"
        );
        assert!(
            sql.contains("metric_entity_key"),
            "creator short-video overview must de-duplicate videos by video id"
        );
        assert!(
            sql.contains("qianchuan_overall_impression_count"),
            "creator short-video overview must retain Qianchuan exposure fact signals"
        );
        assert!(
            sql.contains("qianchuan_overall_click_count"),
            "creator short-video overview must retain Qianchuan click fact signals"
        );
        assert!(
            sql.contains("qianchuan_user_pay_amount"),
            "creator short-video overview must retain Qianchuan payment fact signals"
        );
    }
}
