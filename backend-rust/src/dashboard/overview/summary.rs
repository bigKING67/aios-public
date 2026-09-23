use super::super::sql_templates::{apply_sql_template, escape_sql_literal};
use super::types::OverviewSqlOptions;

const OVERVIEW_QUERY_TEMPLATE: &str = include_str!("summary_query.sql");

pub(crate) fn build_overview_query_sql(options: OverviewSqlOptions<'_>) -> String {
    build_overview_legacy_query_sql(options)
}

fn build_overview_legacy_query_sql(options: OverviewSqlOptions<'_>) -> String {
    let start_date_literal = escape_sql_literal(options.start_date);
    let end_date_literal = escape_sql_literal(options.end_date);
    let prev_start_date_literal = escape_sql_literal(options.prev_start_date);
    let prev_end_date_literal = escape_sql_literal(options.prev_end_date);
    let platform_literal = escape_sql_literal(options.platform);

    let platform_share_cte_sql = if options.include_platform_share {
        r#",
platform_dimension AS (
  SELECT
    t.platform,
    t.sort_order
  FROM (
    VALUES
      ('taobao', 1),
      ('douyin', 2),
      ('xhs', 3),
      ('jd', 4),
      ('wx', 5)
  ) AS t(platform, sort_order)
),
platform_current AS (
  SELECT
    d.platform,
    COALESCE(SUM(t.gmv), 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(
      SUM(COALESCE(t.gmv, 0) - COALESCE(t.refund_amount_pay_time, 0)),
      0
    )::NUMERIC(18, 2) AS gsv_pay_time_current,
    d.sort_order
  FROM platform_dimension d
  CROSS JOIN params p
  LEFT JOIN ads.all_trade_overview t
    ON t.platform = d.platform
   AND t."date" BETWEEN p.current_start_date AND p.current_end_date
  GROUP BY d.platform, d.sort_order
)"#
    } else {
        ""
    };

    let platform_current_select_sql = if options.include_platform_share {
        r#"COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'platform', p.platform,
          'gmv', p.gmv,
          'gsvPayTimeCurrent', p.gsv_pay_time_current
        )
        ORDER BY p.sort_order
      )
      FROM platform_current p
    ),
    '[]'::JSON
  )"#
    } else {
        "'[]'::JSON"
    };

    apply_sql_template(
        OVERVIEW_QUERY_TEMPLATE,
        &[
            ("__START_DATE_LITERAL__", start_date_literal),
            ("__END_DATE_LITERAL__", end_date_literal),
            ("__PREV_START_DATE_LITERAL__", prev_start_date_literal),
            ("__PREV_END_DATE_LITERAL__", prev_end_date_literal),
            ("__PLATFORM_LITERAL__", platform_literal),
            (
                "__PLATFORM_SHARE_CTE_SQL__",
                platform_share_cte_sql.to_string(),
            ),
            (
                "__PLATFORM_CURRENT_SELECT_SQL__",
                platform_current_select_sql.to_string(),
            ),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::{build_overview_query_sql, OverviewSqlOptions};

    fn options(include_platform_share: bool) -> OverviewSqlOptions<'static> {
        OverviewSqlOptions {
            start_date: "2026-08-01",
            end_date: "2026-08-12",
            prev_start_date: "2026-07-01",
            prev_end_date: "2026-07-12",
            platform: "overview",
            include_platform_share,
        }
    }

    #[test]
    fn platform_contribution_includes_gmv_and_payment_time_gsv() {
        let sql = build_overview_query_sql(options(true));

        assert!(
            sql.contains("SUM(COALESCE(t.gmv, 0) - COALESCE(t.refund_amount_pay_time, 0))"),
            "platform contribution should derive GSV from the canonical payment-time refund field"
        );
        assert!(
            sql.contains("'gsvPayTimeCurrent', p.gsv_pay_time_current"),
            "platform contribution response should expose payment-time GSV"
        );
    }

    #[test]
    fn platform_contribution_query_stays_optional() {
        let sql = build_overview_query_sql(options(false));

        assert!(!sql.contains("platform_dimension AS"));
        assert!(!sql.contains("'gsvPayTimeCurrent'"));
    }
}
