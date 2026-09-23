use crate::error::AppResult;

use super::{
    common::{normalize_optional_date, normalize_optional_text, normalize_required_text},
    labels::{
        is_not_cooperable_status, normalize_anchor_level, normalize_cooperation_status_label,
    },
};
use crate::marketing::{
    anchor_tags::{dedup_anchor_tags, normalize_anchor_tag_text},
    types::{
        CreatorLibraryInput, CreatorLibraryPayload, NOTE_MAX_LEN, NOT_COOPERABLE_STATUS_VALUE,
        TEXT_MAX_LEN,
    },
};

pub(crate) fn normalize_payload(payload: CreatorLibraryPayload) -> AppResult<CreatorLibraryInput> {
    let expected_updated_at = payload.expected_updated_at.or(payload.updated_at);
    let platform = normalize_required_text(Some(payload.platform), TEXT_MAX_LEN, "平台")?;
    let influencer_name =
        normalize_required_text(Some(payload.influencer_name), TEXT_MAX_LEN, "达人昵称")?;
    let cooperation_status =
        normalize_optional_text(payload.cooperation_status, TEXT_MAX_LEN, "合作状态")?;
    let is_not_cooperable_status = cooperation_status
        .as_deref()
        .map(is_not_cooperable_status)
        .unwrap_or(false);
    let is_cooperable = payload.is_cooperable.unwrap_or(!is_not_cooperable_status);
    let cooperation_status = if !is_cooperable || is_not_cooperable_status {
        Some(NOT_COOPERABLE_STATUS_VALUE.to_string())
    } else {
        cooperation_status.and_then(normalize_cooperation_status_label)
    };
    let cooperation_status_norm = cooperation_status
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "未分类".to_string());
    let mut tags = payload
        .tags
        .unwrap_or_default()
        .into_iter()
        .filter_map(normalize_anchor_tag_text)
        .collect::<Vec<_>>();
    if tags.is_empty() {
        if let Some(anchor_desc) = payload.anchor_desc.as_deref() {
            tags.extend(
                anchor_desc
                    .split([',', '，', '、', ';', '；', '/'])
                    .filter_map(|item| normalize_anchor_tag_text(item.to_string())),
            );
        }
    }
    let tags = dedup_anchor_tags(tags, 20);

    Ok(CreatorLibraryInput {
        platform,
        influencer_name,
        influencer_id: normalize_optional_text(payload.influencer_id, TEXT_MAX_LEN, "达人ID")?,
        douyin_handle: normalize_optional_text(payload.douyin_handle, TEXT_MAX_LEN, "抖音号")?,
        phone: normalize_optional_text(payload.phone, TEXT_MAX_LEN, "手机号")?,
        mcn: normalize_optional_text(payload.mcn, TEXT_MAX_LEN, "MCN")?,
        category: normalize_optional_text(payload.category, TEXT_MAX_LEN, "类目")?,
        anchor_desc: normalize_optional_text(payload.anchor_desc, TEXT_MAX_LEN, "主播标签")?,
        anchor_level: normalize_anchor_level(payload.anchor_level)?,
        main_platform_fans: normalize_optional_text(
            payload.main_platform_fans,
            TEXT_MAX_LEN,
            "粉丝数",
        )?,
        sales_30d: normalize_optional_text(payload.sales_30d, TEXT_MAX_LEN, "近30天GMV")?,
        sales_90d: normalize_optional_text(payload.sales_90d, TEXT_MAX_LEN, "近90天GMV")?,
        tags,
        cooperation_status,
        cooperation_status_norm,
        cooperation_desc: normalize_optional_text(
            payload.cooperation_desc,
            NOTE_MAX_LEN,
            "合作描述",
        )?,
        owner_name: normalize_optional_text(payload.owner_name, TEXT_MAX_LEN, "归属BD")?,
        owner_user_id: normalize_optional_text(payload.owner_user_id, TEXT_MAX_LEN, "归属BD账号")?,
        is_cooperable,
        last_followed_at: normalize_optional_date(payload.last_followed_at, "最近跟进日期")?,
        follow_note: normalize_optional_text(payload.follow_note, NOTE_MAX_LEN, "跟进备注")?,
        expected_updated_at: normalize_optional_text(
            expected_updated_at,
            TEXT_MAX_LEN,
            "更新时间",
        )?,
    })
}
