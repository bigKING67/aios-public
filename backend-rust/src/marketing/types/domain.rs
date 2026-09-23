use chrono::NaiveDate;

#[derive(Debug)]
pub(in crate::marketing) struct CreatorLibraryInput {
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
    pub(in crate::marketing) tags: Vec<String>,
    pub(in crate::marketing) cooperation_status: Option<String>,
    pub(in crate::marketing) cooperation_status_norm: String,
    pub(in crate::marketing) cooperation_desc: Option<String>,
    pub(in crate::marketing) owner_name: Option<String>,
    pub(in crate::marketing) owner_user_id: Option<String>,
    pub(in crate::marketing) is_cooperable: bool,
    pub(in crate::marketing) last_followed_at: Option<NaiveDate>,
    pub(in crate::marketing) follow_note: Option<String>,
    pub(in crate::marketing) expected_updated_at: Option<String>,
}

#[derive(Debug)]
pub(in crate::marketing) struct CreatorLibraryFollowLogInput {
    pub(in crate::marketing) follow_note: String,
    pub(in crate::marketing) expected_updated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub(in crate::marketing) struct CreatorLibraryActor {
    pub(in crate::marketing) user_id: String,
    pub(in crate::marketing) display_name: String,
    pub(in crate::marketing) is_bd: bool,
    pub(in crate::marketing) can_manage: bool,
}
