use serde::Deserialize;

#[derive(Debug, Deserialize, Clone, Default)]
pub(in crate::marketing) struct CreatorLibraryQuery {
    pub(in crate::marketing) keyword: Option<String>,
    pub(in crate::marketing) platform: Option<String>,
    pub(in crate::marketing) category: Option<String>,
    pub(in crate::marketing) anchor_tag: Option<String>,
    pub(in crate::marketing) anchor_tags: Option<String>,
    pub(in crate::marketing) fans_band: Option<String>,
    pub(in crate::marketing) anchor_level: Option<String>,
    pub(in crate::marketing) cooperation_status: Option<String>,
    pub(in crate::marketing) owner_name: Option<String>,
    pub(in crate::marketing) owner_user_id: Option<String>,
    pub(in crate::marketing) last_follow_range: Option<String>,
    pub(in crate::marketing) is_cooperable: Option<String>,
    pub(in crate::marketing) source_type: Option<String>,
    pub(in crate::marketing) ownership: Option<String>,
    pub(in crate::marketing) mcn_status: Option<String>,
    pub(in crate::marketing) include_filter_options: Option<String>,
    pub(in crate::marketing) include_summary: Option<String>,
    pub(in crate::marketing) page: Option<i64>,
    pub(in crate::marketing) page_size: Option<i64>,
    pub(in crate::marketing) sort: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(in crate::marketing) struct CreatorLibraryPayload {
    pub(in crate::marketing) platform: String,
    pub(in crate::marketing) influencer_name: String,
    pub(in crate::marketing) influencer_id: Option<String>,
    pub(in crate::marketing) douyin_handle: Option<String>,
    pub(in crate::marketing) phone: Option<String>,
    pub(in crate::marketing) mcn: Option<String>,
    pub(in crate::marketing) category: Option<String>,
    pub(in crate::marketing) anchor_desc: Option<String>,
    pub(in crate::marketing) anchor_level: Option<String>,
    pub(in crate::marketing) main_platform_fans: Option<String>,
    pub(in crate::marketing) sales_30d: Option<String>,
    pub(in crate::marketing) sales_90d: Option<String>,
    pub(in crate::marketing) tags: Option<Vec<String>>,
    pub(in crate::marketing) cooperation_status: Option<String>,
    pub(in crate::marketing) cooperation_desc: Option<String>,
    pub(in crate::marketing) owner_name: Option<String>,
    pub(in crate::marketing) owner_user_id: Option<String>,
    pub(in crate::marketing) is_cooperable: Option<bool>,
    pub(in crate::marketing) last_followed_at: Option<String>,
    pub(in crate::marketing) follow_note: Option<String>,
    pub(in crate::marketing) expected_updated_at: Option<String>,
    pub(in crate::marketing) updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(in crate::marketing) struct CreatorLibraryImportRequest {
    pub(in crate::marketing) rows: Vec<CreatorLibraryPayload>,
}

#[derive(Debug, Deserialize)]
pub(in crate::marketing) struct CreatorLibraryFollowLogPayload {
    pub(in crate::marketing) follow_note: Option<String>,
    pub(in crate::marketing) expected_updated_at: Option<String>,
    pub(in crate::marketing) updated_at: Option<String>,
}
