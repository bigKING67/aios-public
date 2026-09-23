pub(crate) fn get_traffic_goods_as_of_date_sql() -> &'static str {
    r#"
    SELECT
      LEAST($2::DATE, COALESCE(MAX(stat_date), $2::DATE))::TEXT AS as_of_date
    FROM ads.taobao_traffic_goods_daily
    WHERE stat_date BETWEEN $1::DATE AND $2::DATE
    "#
}
