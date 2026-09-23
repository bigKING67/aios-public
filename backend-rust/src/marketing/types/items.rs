use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub(in crate::marketing) struct CreatorLibraryItem {
    pub(in crate::marketing) id: i64,
    pub(in crate::marketing) platform: String,
    #[serde(rename = "influencerName")]
    pub(in crate::marketing) influencer_name: String,
    #[serde(rename = "influencerId")]
    pub(in crate::marketing) influencer_id: Option<String>,
    #[serde(rename = "douyinHandle")]
    pub(in crate::marketing) douyin_handle: Option<String>,
    pub(in crate::marketing) phone: Option<String>,
    pub(in crate::marketing) mcn: Option<String>,
    pub(in crate::marketing) category: Option<String>,
    #[serde(rename = "anchorDesc")]
    pub(in crate::marketing) anchor_desc: Option<String>,
    #[serde(rename = "anchorLevel")]
    pub(in crate::marketing) anchor_level: Option<String>,
    #[serde(rename = "mainPlatformFans")]
    pub(in crate::marketing) main_platform_fans: Option<String>,
    #[serde(rename = "mainPlatformFansCount")]
    pub(in crate::marketing) main_platform_fans_count: Option<f64>,
    #[serde(rename = "sales30d")]
    pub(in crate::marketing) sales_30d: Option<String>,
    #[serde(rename = "sales30dAmount")]
    pub(in crate::marketing) sales_30d_amount: Option<f64>,
    #[serde(rename = "sales90d")]
    pub(in crate::marketing) sales_90d: Option<String>,
    #[serde(rename = "sales90dAmount")]
    pub(in crate::marketing) sales_90d_amount: Option<f64>,
    pub(in crate::marketing) tags: Vec<String>,
    #[serde(rename = "cooperationStatus")]
    pub(in crate::marketing) cooperation_status: Option<String>,
    #[serde(rename = "cooperationStatusNorm")]
    pub(in crate::marketing) cooperation_status_norm: String,
    #[serde(rename = "cooperationDesc")]
    pub(in crate::marketing) cooperation_desc: Option<String>,
    #[serde(rename = "ownerName")]
    pub(in crate::marketing) owner_name: Option<String>,
    #[serde(rename = "ownerUserId")]
    pub(in crate::marketing) owner_user_id: Option<String>,
    #[serde(rename = "isCooperable")]
    pub(in crate::marketing) is_cooperable: bool,
    #[serde(rename = "lastFollowedAt")]
    pub(in crate::marketing) last_followed_at: Option<String>,
    #[serde(rename = "followNote")]
    pub(in crate::marketing) follow_note: Option<String>,
    #[serde(rename = "followLogCount")]
    pub(in crate::marketing) follow_log_count: i64,
    #[serde(rename = "sourceType")]
    pub(in crate::marketing) source_type: String,
    #[serde(rename = "sourceFileName")]
    pub(in crate::marketing) source_file_name: Option<String>,
    #[serde(rename = "createdBy")]
    pub(in crate::marketing) created_by: Option<String>,
    #[serde(rename = "updatedBy")]
    pub(in crate::marketing) updated_by: Option<String>,
    #[serde(rename = "ownershipType")]
    pub(in crate::marketing) ownership_type: String,
    #[serde(rename = "canEdit")]
    pub(in crate::marketing) can_edit: bool,
    #[serde(rename = "canDelete")]
    pub(in crate::marketing) can_delete: bool,
    #[serde(rename = "createdAt")]
    pub(in crate::marketing) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(in crate::marketing) updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub(in crate::marketing) struct CreatorLibraryFollowLogItem {
    pub(in crate::marketing) id: i64,
    #[serde(rename = "influencerLibraryId")]
    pub(in crate::marketing) influencer_library_id: i64,
    #[serde(rename = "followedAt")]
    pub(in crate::marketing) followed_at: String,
    #[serde(rename = "followNote")]
    pub(in crate::marketing) follow_note: String,
    #[serde(rename = "createdBy")]
    pub(in crate::marketing) created_by: Option<String>,
    #[serde(rename = "updatedBy")]
    pub(in crate::marketing) updated_by: Option<String>,
    #[serde(rename = "canEdit")]
    pub(in crate::marketing) can_edit: bool,
    #[serde(rename = "canDelete")]
    pub(in crate::marketing) can_delete: bool,
    #[serde(rename = "createdAt")]
    pub(in crate::marketing) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(in crate::marketing) updated_at: String,
}

#[derive(Debug, Serialize, Default)]
pub(in crate::marketing) struct CreatorLibrarySummary {
    #[serde(rename = "totalCreators")]
    pub(in crate::marketing) total_creators: i64,
    #[serde(rename = "cooperableCreators")]
    pub(in crate::marketing) cooperable_creators: i64,
    #[serde(rename = "negotiatingCreators")]
    pub(in crate::marketing) negotiating_creators: i64,
    #[serde(rename = "unfollowed30dCreators")]
    pub(in crate::marketing) unfollowed_30d_creators: i64,
    #[serde(rename = "sLevelCreators")]
    pub(in crate::marketing) s_level_creators: i64,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(crate) struct CreatorLibraryFilterOptions {
    pub(in crate::marketing) platforms: Vec<String>,
    pub(in crate::marketing) categories: Vec<String>,
    #[serde(rename = "anchorTags")]
    pub(in crate::marketing) anchor_tags: Vec<String>,
    #[serde(rename = "anchorLevels")]
    pub(in crate::marketing) anchor_levels: Vec<String>,
    #[serde(rename = "cooperationStatuses")]
    pub(in crate::marketing) cooperation_statuses: Vec<String>,
    pub(in crate::marketing) owners: Vec<String>,
    #[serde(rename = "bdUsers")]
    pub(in crate::marketing) bd_users: Vec<CreatorLibraryBdUser>,
    #[serde(rename = "sourceTypes")]
    pub(in crate::marketing) source_types: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(in crate::marketing) struct CreatorLibraryBdUser {
    #[serde(rename = "userId")]
    pub(in crate::marketing) user_id: String,
    pub(in crate::marketing) username: String,
    #[serde(rename = "displayName")]
    pub(in crate::marketing) display_name: String,
    pub(in crate::marketing) aliases: Vec<String>,
}
