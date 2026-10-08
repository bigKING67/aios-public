use super::types::{CreateRunRequest, PlanDocument};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::{
        domain,
        types::{SaveRequest, Snapshot},
    },
};
use std::collections::HashSet;

/// Host-built studio batches only: the public create API rejects this type and
/// no model planning runs for it (see `framework_remix`).
pub(super) const FRAMEWORK_REMIX: &str = "framework_remix";
/// Hard ceilings of a framework remix Run; studio settings may only lower them.
/// 600 s equals the legacy clip engine limit (`production::domain::validate`).
pub(in crate::marketing::content_assets) const FRAMEWORK_REMIX_MAX_SECONDS: u32 = 600;
pub(in crate::marketing::content_assets) const FRAMEWORK_REMIX_MAX_SOURCES: usize = 50;

pub(super) fn conflict() -> AppError {
    AppError::Conflict("任务或方案已更新，请重新载入后操作".into())
}

pub(super) fn validate_request(r: &CreateRunRequest) -> AppResult<()> {
    if r.max_auto_repairs > 2
        || (r.max_auto_repairs > 0
            && (r.task_type != "picture_remix"
                || !r.model_call_confirmed
                || r.review_before_production))
    {
        return Err(AppError::bad_request(
            "自动修订仅适用于已授权自动制作的画面混剪，最多2轮",
        ));
    }
    let remix = r.task_type == FRAMEWORK_REMIX;
    let (max_seconds, max_assets) = if remix {
        (FRAMEWORK_REMIX_MAX_SECONDS, FRAMEWORK_REMIX_MAX_SOURCES)
    } else {
        (120, 10)
    };
    if r.idempotency_key.is_empty()
        || r.idempotency_key.len() > 100
        || !r
            .idempotency_key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        || r.title.trim().is_empty()
        || r.title.chars().count() > 120
        || r.brief.trim().is_empty()
        || r.brief.chars().count() > 1800
        || ![
            "smart",
            "talking_head",
            "montage",
            "recut",
            "highlights",
            "variants",
            "picture_remix",
            FRAMEWORK_REMIX,
        ]
        .contains(&r.task_type.as_str())
        || !["portrait", "landscape", "square"].contains(&r.aspect.as_str())
        || !(3..=max_seconds).contains(&r.target_seconds)
        || r.asset_ids.is_empty()
        || r.asset_ids.len() > max_assets
        || r.asset_ids.iter().collect::<HashSet<_>>().len() != r.asset_ids.len()
        || !r.rights_confirmed
    {
        return Err(AppError::bad_request(if remix {
            "框架混剪要求无效：1–50 条不重复素材及 3–600 秒时长"
        } else {
            "制作要求无效：明确目标、1–10 条不重复素材及 3–120 秒时长"
        }));
    }
    if remix && (r.model_call_confirmed || r.review_before_production) {
        return Err(AppError::bad_request(
            "框架混剪由片段确定性组合，不调用模型规划或等待方案确认",
        ));
    }
    if (r.generate_captions && r.task_type != "picture_remix")
        || (r.task_type == "picture_remix") != r.narration_asset_id.is_some()
        || r.narration_asset_id
            .is_some_and(|id| !r.asset_ids.contains(&id))
        || (r.task_type == "picture_remix" && r.asset_ids.len() < 2)
    {
        return Err(AppError::bad_request(
            "画面混剪必须指定素材范围内的主讲原片；其他任务不接受主讲设置",
        ));
    }
    Ok(())
}

pub(super) fn validate_plan(
    p: &PlanDocument,
    r: &CreateRunRequest,
    sources: &Snapshot,
) -> AppResult<()> {
    if p.summary.trim().is_empty()
        || p.summary.chars().count() > 2000
        || p.clips.len() != p.reasons.len()
        || p.gaps.len() > 12
        || p.reasons
            .iter()
            .any(|s| s.trim().is_empty() || s.chars().count() > 500)
        || p.gaps
            .iter()
            .any(|s| s.trim().is_empty() || s.chars().count() > 1000)
        || (p.clips.is_empty() && p.gaps.is_empty())
    {
        return Err(AppError::bad_request(
            "方案需包含有依据的片段或明确素材缺口",
        ));
    }
    if !p.clips.is_empty() {
        domain::validate(&SaveRequest {
            expected_revision: None,
            title: r.title.clone(),
            aspect: r.aspect.clone(),
            clips: p.clips.clone(),
            rights_confirmed: true,
        })?;
    }
    super::captions::validate(p, r, sources)?;
    if r.task_type == "picture_remix" {
        super::picture_remix::validate(p, r, sources)?;
    }
    let ids: HashSet<_> = p.clips.iter().map(|c| c.id.as_str()).collect();
    if p.locked_clip_ids.iter().collect::<HashSet<_>>().len() != p.locked_clip_ids.len()
        || p.locked_clip_ids
            .iter()
            .any(|id| !ids.contains(id.as_str()))
        || p.clips.iter().any(|c| {
            !sources
                .assets
                .iter()
                .any(|a| a.asset_id == c.asset_id && c.end_ms <= a.duration_ms)
        })
        || (r.task_type != "picture_remix"
            && p.clips
                .iter()
                .map(|c| u64::from(c.end_ms - c.start_ms))
                .sum::<u64>()
                > u64::from(r.target_seconds) * 1000)
    {
        return Err(AppError::bad_request(
            "方案超出冻结素材范围、时长或锁定项无效",
        ));
    }
    Ok(())
}

pub(super) fn preserve_locks(
    old: &PlanDocument,
    next: &PlanDocument,
    unlock: &[String],
) -> AppResult<()> {
    if unlock.iter().collect::<HashSet<_>>().len() != unlock.len()
        || unlock.iter().any(|id| !old.locked_clip_ids.contains(id))
    {
        return Err(AppError::bad_request("解锁项必须是当前已锁定的片段"));
    }
    let retained: Vec<_> = old
        .clips
        .iter()
        .filter(|c| old.locked_clip_ids.contains(&c.id) && !unlock.contains(&c.id))
        .collect();
    let next_retained: Vec<_> = next
        .clips
        .iter()
        .filter(|c| retained.iter().any(|old| old.id == c.id))
        .collect();
    if retained.len() != next_retained.len()
        || retained
            .iter()
            .zip(next_retained)
            .any(|(a, b)| !next.locked_clip_ids.contains(&a.id) || *a != b)
    {
        return Err(AppError::Conflict(
            "已锁定片段被修改、移除或重排，请先明确解锁".into(),
        ));
    }
    Ok(())
}
