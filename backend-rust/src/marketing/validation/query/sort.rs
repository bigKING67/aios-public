use crate::{
    error::{AppError, AppResult},
    marketing::types::CreatorLibrarySort,
};

use super::super::common::normalize_text;

pub(super) fn normalize_sort(value: Option<String>) -> AppResult<CreatorLibrarySort> {
    let Some(value) = value.and_then(normalize_text) else {
        return Ok(CreatorLibrarySort::OwnerPriorityDesc);
    };
    match value.as_str() {
        "owner_priority_desc" => Ok(CreatorLibrarySort::OwnerPriorityDesc),
        "updated_at_desc" => Ok(CreatorLibrarySort::UpdatedDesc),
        "updated_at_asc" => Ok(CreatorLibrarySort::UpdatedAsc),
        "identity_asc" => Ok(CreatorLibrarySort::IdentityAsc),
        "identity_desc" => Ok(CreatorLibrarySort::IdentityDesc),
        "name_asc" => Ok(CreatorLibrarySort::NameAsc),
        "name_desc" => Ok(CreatorLibrarySort::NameDesc),
        "platform_asc" => Ok(CreatorLibrarySort::PlatformAsc),
        "platform_desc" => Ok(CreatorLibrarySort::PlatformDesc),
        "fans_desc" => Ok(CreatorLibrarySort::FansDesc),
        "fans_asc" => Ok(CreatorLibrarySort::FansAsc),
        "anchor_tag_asc" => Ok(CreatorLibrarySort::AnchorTagAsc),
        "anchor_tag_desc" => Ok(CreatorLibrarySort::AnchorTagDesc),
        "anchor_level_asc" => Ok(CreatorLibrarySort::AnchorLevelAsc),
        "anchor_level_desc" => Ok(CreatorLibrarySort::AnchorLevelDesc),
        "sales_30d_desc" => Ok(CreatorLibrarySort::Sales30dDesc),
        "sales_30d_asc" => Ok(CreatorLibrarySort::Sales30dAsc),
        "sales_90d_desc" => Ok(CreatorLibrarySort::Sales90dDesc),
        "sales_90d_asc" => Ok(CreatorLibrarySort::Sales90dAsc),
        "status_asc" => Ok(CreatorLibrarySort::StatusAsc),
        "status_desc" => Ok(CreatorLibrarySort::StatusDesc),
        "owner_asc" => Ok(CreatorLibrarySort::OwnerAsc),
        "owner_desc" => Ok(CreatorLibrarySort::OwnerDesc),
        "last_follow_asc" => Ok(CreatorLibrarySort::LastFollowAsc),
        "last_follow_desc" => Ok(CreatorLibrarySort::LastFollowDesc),
        _ => Err(AppError::bad_request("排序参数不合法")),
    }
}
