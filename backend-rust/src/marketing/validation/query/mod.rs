mod enum_filters;
mod sort;
mod tags;

use crate::error::AppResult;

use super::{
    common::{normalize_optional_bool, normalize_optional_flag, normalize_optional_text},
    labels::normalize_anchor_level,
};
use crate::marketing::types::{
    CreatorLibraryQuery, NormalizedQuery, DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
    TEXT_MAX_LEN,
};

pub(crate) fn normalize_query(query: CreatorLibraryQuery) -> AppResult<NormalizedQuery> {
    let page = query.page.unwrap_or(DEFAULT_PAGE).max(1);
    let page_size = query
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);

    Ok(NormalizedQuery {
        keyword: normalize_optional_text(query.keyword, TEXT_MAX_LEN, "关键词")?,
        platform: normalize_optional_text(query.platform, TEXT_MAX_LEN, "平台")?,
        category: normalize_optional_text(query.category, TEXT_MAX_LEN, "类目")?,
        anchor_tags: tags::normalize_anchor_tags(query.anchor_tag, query.anchor_tags)?,
        fans_band: enum_filters::normalize_fans_band(query.fans_band)?,
        anchor_level: normalize_anchor_level(query.anchor_level)?,
        cooperation_status: normalize_optional_text(
            query.cooperation_status,
            TEXT_MAX_LEN,
            "合作状态",
        )?,
        owner_name: normalize_optional_text(query.owner_name, TEXT_MAX_LEN, "归属BD")?,
        owner_user_id: normalize_optional_text(query.owner_user_id, TEXT_MAX_LEN, "归属BD账号")?,
        last_follow_range: enum_filters::normalize_last_follow_range(query.last_follow_range)?,
        is_cooperable: normalize_optional_bool(query.is_cooperable, "是否可合作")?,
        source_type: normalize_optional_text(query.source_type, TEXT_MAX_LEN, "数据来源")?,
        ownership: enum_filters::normalize_ownership(query.ownership)?,
        mcn_status: enum_filters::normalize_mcn_status(query.mcn_status)?,
        include_filter_options: normalize_optional_flag(
            query.include_filter_options,
            true,
            "是否返回筛选项",
        )?,
        include_summary: normalize_optional_flag(query.include_summary, true, "是否返回摘要")?,
        page,
        page_size,
        sort: sort::normalize_sort(query.sort)?,
    })
}
