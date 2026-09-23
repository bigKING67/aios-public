const BRAND_RESOLUTION_CTE_MARKER: &str = "__BRAND_RESOLUTION_CTE__";
const BRAND_RESOLUTION_JOIN_MARKER: &str = "__BRAND_RESOLUTION_JOIN__";

const BRAND_RESOLUTION_SOURCE_CTE: &str = include_str!("brand_resolution_source_cte.sql");
const BRAND_RESOLUTION_EFFECTIVE_JOIN: &str = include_str!("brand_resolution_effective_join.sql");
const BRAND_RESOLUTION_EMPTY_CTE: &str = r#"latest_brand_resolution AS (
  SELECT
    NULL::UUID AS asset_id,
    NULL::TEXT AS brand_name,
    NULL::TEXT AS status,
    NULL::NUMERIC AS confidence,
    NULL::TEXT AS primary_source,
    NULL::JSONB AS evidence_json,
    FALSE AS is_manual_override
  WHERE FALSE
)"#;

pub(super) fn inject(template: &str, table_available: bool) -> String {
    let resolution_cte = if table_available {
        BRAND_RESOLUTION_SOURCE_CTE
    } else {
        BRAND_RESOLUTION_EMPTY_CTE
    };
    template
        .replace(BRAND_RESOLUTION_CTE_MARKER, resolution_cte)
        .replace(
            BRAND_RESOLUTION_JOIN_MARKER,
            BRAND_RESOLUTION_EFFECTIVE_JOIN,
        )
}
