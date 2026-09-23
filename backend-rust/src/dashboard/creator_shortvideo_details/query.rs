use super::super::sql_templates::{apply_sql_template, escape_sql_literal};

#[derive(Debug)]
pub(crate) struct CreatorShortVideoDetailsSqlOptions<'a> {
    pub(crate) start_date: &'a str,
    pub(crate) end_date: &'a str,
    pub(crate) cooperation_status: Option<&'a str>,
    pub(crate) keyword: Option<&'a str>,
    pub(crate) current_user_id: &'a str,
    pub(crate) can_manage_manual_attrs: bool,
}

const CREATOR_SHORTVIDEO_DETAILS_QUERY_TEMPLATE: &str = include_str!("query.sql");

pub(crate) fn build_creator_shortvideo_details_query_sql(
    options: CreatorShortVideoDetailsSqlOptions<'_>,
) -> String {
    let cooperation_status_literal = options
        .cooperation_status
        .map(escape_sql_literal)
        .unwrap_or_else(|| "NULL".to_string());
    let keyword_literal = options
        .keyword
        .map(escape_sql_literal)
        .unwrap_or_else(|| "NULL".to_string());
    let can_manage_manual_attrs_literal = if options.can_manage_manual_attrs {
        "TRUE".to_string()
    } else {
        "FALSE".to_string()
    };
    apply_sql_template(
        CREATOR_SHORTVIDEO_DETAILS_QUERY_TEMPLATE,
        &[
            (
                "__START_DATE_LITERAL__",
                escape_sql_literal(options.start_date),
            ),
            ("__END_DATE_LITERAL__", escape_sql_literal(options.end_date)),
            ("__COOPERATION_STATUS_LITERAL__", cooperation_status_literal),
            ("__KEYWORD_LITERAL__", keyword_literal),
            (
                "__CURRENT_USER_ID_LITERAL__",
                escape_sql_literal(options.current_user_id),
            ),
            (
                "__CAN_MANAGE_MANUAL_ATTRS_LITERAL__",
                can_manage_manual_attrs_literal,
            ),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::{build_creator_shortvideo_details_query_sql, CreatorShortVideoDetailsSqlOptions};

    #[test]
    fn builds_schema_compatible_sql_for_optional_asset_columns() {
        let sql = build_creator_shortvideo_details_query_sql(CreatorShortVideoDetailsSqlOptions {
            start_date: "2026-06-01",
            end_date: "2026-06-09",
            cooperation_status: None,
            keyword: None,
            current_user_id: "user-001",
            can_manage_manual_attrs: false,
        });

        for column in [
            "asset_product_names",
            "asset_owner_names",
            "asset_video_types",
            "asset_content_scenes",
            "asset_content_scene_groups",
            "asset_content_scene_subtypes",
        ] {
            assert!(
                sql.contains(format!("compat_{column}").as_str()),
                "query should expose compatibility alias for {column}"
            );
            assert!(
                !sql.contains(format!("COALESCE(d.{column}").as_str()),
                "query must not directly reference optional {column}"
            );
            assert!(
                !sql.contains(format!("unnest(COALESCE(d.{column}").as_str()),
                "keyword search must not directly reference optional {column}"
            );
        }

        assert!(
            sql.contains("to_jsonb(ma)->>'mcn' AS compat_mcn"),
            "manual MCN should be read through a compatibility alias"
        );
        assert!(
            !sql.contains("ma.mcn::"),
            "query must not directly reference optional manual_attrs.mcn"
        );
    }

    #[test]
    fn builds_live_content_asset_identity_fallback_sql() {
        let sql = build_creator_shortvideo_details_query_sql(CreatorShortVideoDetailsSqlOptions {
            start_date: "2026-06-01",
            end_date: "2026-06-09",
            cooperation_status: None,
            keyword: Some("1866498618601867"),
            current_user_id: "user-001",
            can_manage_manual_attrs: false,
        });

        assert!(
            sql.contains("live_asset_identity_by_video"),
            "details query should realtime-fallback to content asset identities"
        );
        assert!(
            sql.contains("live_asset_identity_by_material"),
            "details query should fallback by Qianchuan material id when video id is missing or stale"
        );
        assert!(
            sql.contains("ads.marketing_content_platform_videos"),
            "details query should read active platform-video identities"
        );
        assert!(
            sql.contains("ads.marketing_content_ad_materials"),
            "details query should read active ad-material identities"
        );
        assert!(
            sql.contains("merged_qianchuan_material_ids"),
            "details query should expose material ids from fact and live identity"
        );
        assert!(
            sql.contains("active_pv.relation_status = 'active'"),
            "details query should not expose archived platform-video relation ids from stale fact snapshots"
        );
        assert!(
            sql.contains("active_material.relation_status = 'active'"),
            "details query should not expose archived ad-material relation ids from stale fact snapshots"
        );
        assert!(
            sql.contains("regexp_split_to_array(NULLIF(BTRIM(d.qianchuan_material_key), '')"),
            "details query should use qianchuan material key to find live material identities"
        );
        assert!(
            sql.contains("material_hit.material_id = ANY(row_material_keys.material_ids)"),
            "details query should join live content asset identities by material ids"
        );
        assert!(
            sql.contains("merged_asset_product_names"),
            "keyword search and payload should use fallback asset taxonomy"
        );
    }

    #[test]
    fn builds_cooperation_and_qianchuan_material_shortvideo_detail_sql() {
        let sql = build_creator_shortvideo_details_query_sql(CreatorShortVideoDetailsSqlOptions {
            start_date: "2026-06-01",
            end_date: "2026-06-09",
            cooperation_status: None,
            keyword: None,
            current_user_id: "user-001",
            can_manage_manual_attrs: false,
        });

        assert!(
            sql.contains("LIKE '%合作%'"),
            "creator short-video details must include cooperative rows"
        );
        assert!(
            sql.contains("NOT LIKE '%自营%'"),
            "creator short-video details must exclude self-operated rows"
        );
        assert!(
            sql.contains("'qianchuan_video_day'"),
            "creator short-video details must include Qianchuan video-grain rows"
        );
        assert!(
            sql.contains("'qianchuan_material_day'"),
            "creator short-video details must include Qianchuan material-grain rows"
        );
        assert!(
            sql.contains("merged_qianchuan_material_ids"),
            "creator short-video details must retain material-id signals"
        );
        assert!(
            sql.contains("qianchuan_overall_impression_count"),
            "creator short-video details must retain Qianchuan exposure fact signals"
        );
        assert!(
            sql.contains("qianchuan_overall_click_count"),
            "creator short-video details must retain Qianchuan click fact signals"
        );
        assert!(
            sql.contains("qianchuan_user_pay_amount"),
            "creator short-video details must retain Qianchuan payment fact signals"
        );
    }

    #[test]
    fn builds_owner_based_manual_attr_permission_sql() {
        let sql = build_creator_shortvideo_details_query_sql(CreatorShortVideoDetailsSqlOptions {
            start_date: "2026-06-01",
            end_date: "2026-06-09",
            cooperation_status: None,
            keyword: None,
            current_user_id: "user-001",
            can_manage_manual_attrs: false,
        });

        assert!(
            sql.contains("asset_owner_user_ids"),
            "details query should expose stable owner user ids"
        );
        assert!(
            sql.contains("manual_attr_target_owners"),
            "details query should aggregate owner facts at manual target grain"
        );
        assert!(
            sql.contains(
                "owner_target.author_douyin_id = COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '')"
            ),
            "row permissions should join owner facts by creator/video identity"
        );
        assert!(
            sql.contains("manual_can_edit"),
            "details query should expose backend permission facts"
        );
        assert!(
            sql.contains("FALSE::BOOLEAN AS can_manage_manual_attrs"),
            "details query should bind the admin override flag"
        );
        assert!(
            sql.contains("'user-001'::TEXT AS current_user_id"),
            "details query should bind the current user id into params"
        );
        assert!(
            sql.contains("NULLIF(p.current_user_id, '') IS NOT NULL"),
            "ownerless rows should still require an authenticated user id"
        );
        assert!(
            !sql.contains("can_write_manual_attrs"),
            "ownerless manual attrs should not require a separate writer flag"
        );
    }
}
