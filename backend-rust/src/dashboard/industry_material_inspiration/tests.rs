use super::*;

#[test]
fn payload_sql_uses_empty_analysis_and_false_readiness_when_storage_is_absent() {
    let sql = build_douyin_payload_sql(VideoUnderstandingStorageReadiness {
        results_table_available: false,
        brand_resolution_table_available: false,
        storage_ready: false,
    });

    assert!(sql.contains("NULL::JSONB AS analysis"));
    assert!(sql.contains("'structuredVideoUnderstandingTableAvailable', FALSE"));
    assert!(sql.contains("'structuredVideoUnderstandingReady', FALSE"));
    assert!(sql.contains("'queuedStructuredVideoUnderstanding'"));
    assert!(sql.contains("'runningStructuredVideoUnderstanding'"));
    assert!(!sql.contains("ads.marketing_content_asset_brand_resolutions"));
    assert!(sql.contains("NULL::UUID AS asset_id"));
    assert!(!sql.contains(LATEST_ANALYSIS_CTE_MARKER));
    assert!(!sql.contains(VIDEO_UNDERSTANDING_RESULTS_AVAILABLE_MARKER));
    assert!(!sql.contains(VIDEO_UNDERSTANDING_STORAGE_READY_MARKER));
}

#[test]
fn payload_sql_reads_structured_results_only_when_storage_is_ready() {
    let sql = build_douyin_payload_sql(VideoUnderstandingStorageReadiness {
        results_table_available: true,
        brand_resolution_table_available: true,
        storage_ready: true,
    });

    assert!(sql.contains("FROM ads.marketing_content_asset_video_understanding_results result"));
    assert!(sql.contains("'structuredVideoUnderstandingTableAvailable', TRUE"));
    assert!(sql.contains("'structuredVideoUnderstandingReady', TRUE"));
    assert!(sql.contains("FROM ads.marketing_content_asset_brand_resolutions resolution"));
    assert!(sql.contains("'brandResolutionStatus', brand_resolution_status"));
    assert!(sql.contains("effective_brand_name"));
    assert!(sql.contains("WHEN brand_resolution.is_manual_override"));
    assert!(sql.contains("brand_resolution.confidence >= 0.9000"));
}

#[test]
fn payload_sql_exposes_scored_content_themes_without_legacy_noise() {
    let sql = build_douyin_payload_sql(VideoUnderstandingStorageReadiness {
        results_table_available: true,
        brand_resolution_table_available: false,
        storage_ready: true,
    });

    for expected in [
        "'contentThemeSummary'",
        "'contentThemeTerms'",
        "'themeScore', theme_score",
        "'semanticScore', semantic_score",
        "'coverageScore', coverage_score",
        "'performanceScore', performance_score",
        "components.semantic_score * 0.45",
        "components.coverage_score * 0.20",
        "components.performance_score * 0.35",
        "components.source_count >= 2",
        "term_group = 'topic' AND group_rank <= 8",
        "term_group = 'expression' AND group_rank <= 6",
        "'蓬松控油'::TEXT, '控油蓬松'::TEXT",
        "'头皮护理'::TEXT, '头皮养护'::TEXT",
        "'居家浴室场景'::TEXT, '居家浴室'::TEXT",
        "(千川|云图|抖音|qianchuan|yuntu)",
    ] {
        assert!(
            sql.contains(expected),
            "missing content-theme SQL contract: {expected}"
        );
    }
    assert!(!sql.contains(LATEST_ANALYSIS_CTE_MARKER));
    assert!(!sql.contains(VIDEO_UNDERSTANDING_RESULTS_AVAILABLE_MARKER));
    assert!(!sql.contains(VIDEO_UNDERSTANDING_STORAGE_READY_MARKER));
}

#[test]
fn brand_backfill_sql_targets_missing_structured_video_understanding() {
    let sql = build_brand_ai_backfill_assets_sql(false, false);

    assert!(sql.contains("has_structured_video_understanding"));
    assert!(sql.contains("has_any_ai_analysis"));
    assert!(sql.contains("has_analysis_artifact"));
    assert!(sql.contains("NULL::JSONB AS analysis"));
    assert!(!sql.contains(LATEST_ANALYSIS_CTE_MARKER));
    assert!(!sql.contains("ads.marketing_content_asset_brand_resolutions"));
}

#[tokio::test]
async fn payload_reports_live_structured_readiness_when_configured() {
    let Ok(database_url) = std::env::var("AIOS_INDUSTRY_MATERIAL_DATABASE_URL") else {
        return;
    };
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(database_url.as_str())
        .await
        .expect("connect industry material fixture database");

    for (video_type, expected_linked_assets) in
        [(GOODS_VIDEO_TYPE, 114_i64), (LIVE_LEAD_VIDEO_TYPE, 29_i64)]
    {
        let (_, _, _, _, brand_insight) =
            fetch_douyin_payload(&pool, "2026-05", video_type, Some("Off&Relax"))
                .await
                .expect("query industry material payload");
        let coverage = brand_insight
            .get("coverage")
            .expect("brand insight coverage");

        assert_eq!(
            coverage.get("linkedAssets").and_then(Value::as_i64),
            Some(expected_linked_assets)
        );
        assert_eq!(
            coverage.get("anyAiContentAssets").and_then(Value::as_i64),
            Some(expected_linked_assets)
        );
        assert_eq!(
            coverage
                .get("structuredVideoUnderstandingAssets")
                .and_then(Value::as_i64),
            Some(0)
        );
        assert_eq!(
            coverage
                .get("missingStructuredVideoUnderstanding")
                .and_then(Value::as_i64),
            Some(expected_linked_assets)
        );
        assert_eq!(
            coverage
                .get("structuredVideoUnderstandingTableAvailable")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            coverage
                .get("structuredVideoUnderstandingReady")
                .and_then(Value::as_bool),
            Some(false)
        );

        let request = NormalizedIndustryMaterialBrandAiBackfill {
            tab: if video_type == GOODS_VIDEO_TYPE {
                DOUYIN_GOODS_TAB
            } else {
                DOUYIN_LIVE_LEAD_TAB
            },
            month: "2026-05".to_string(),
            video_type,
            brand: "Off&Relax".to_string(),
            source: "auto".to_string(),
            profile: Some("preview_fast".to_string()),
            limit: 20,
        };
        let candidates = query_brand_ai_backfill_assets(
            &pool,
            &request,
            "Off&Relax",
            VideoUnderstandingStorageReadiness {
                results_table_available: false,
                brand_resolution_table_available: false,
                storage_ready: false,
            },
        )
        .await
        .expect("query structured backfill candidates");
        assert_eq!(candidates.len() as i64, expected_linked_assets);
        assert!(candidates
            .iter()
            .all(|candidate| !candidate.has_structured_video_understanding));
        assert!(candidates
            .iter()
            .all(|candidate| { candidate.has_any_ai_analysis && candidate.has_analysis_artifact }));
    }
}
