use super::super::permissions::ensure_content_asset_edit_permission;
use super::types::{BoundAsset, SaveRequest, Snapshot};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use std::collections::HashSet;

fn check_rights(asset: &super::super::types::ContentAssetItem) -> AppResult<()> {
    let today = chrono::Utc::now().date_naive();
    let invalid_date = |value: &Option<String>, start: bool| {
        value.as_ref().is_some_and(|v| {
            chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").map_or(true, |d| {
                if start {
                    d > today
                } else {
                    d < today
                }
            })
        })
    };
    if asset.repurpose_allowed == Some(false)
        || ["expired", "restricted"].contains(&asset.authorization_status.as_str())
        || invalid_date(&asset.authorization_starts_at, true)
        || invalid_date(&asset.authorization_expires_at, false)
    {
        return Err(AppError::bad_request("素材存在复剪限制或不在授权有效期内"));
    }
    Ok(())
}

pub(super) async fn bind_assets(
    state: &AppState,
    user: &CurrentUser,
    request: SaveRequest,
) -> AppResult<Snapshot> {
    super::domain::validate(&request)?;
    let mut assets = Vec::new();
    let mut seen = HashSet::new();
    for clip in &request.clips {
        if !seen.insert(clip.asset_id) {
            continue;
        }
        let asset = ensure_content_asset_edit_permission(&state.pool, user, clip.asset_id).await?;
        check_rights(&asset)?;
        if asset.external_only
            || asset.asset_status != "ready"
            || asset.bucket != state.settings.tos_bucket
        {
            return Err(AppError::bad_request("素材必须是当前资产桶内已就绪的原片"));
        }
        let key = asset
            .raw_object_key
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| AppError::bad_request("素材缺少原片"))?;
        let sha = asset
            .raw_sha256
            .filter(|s| s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()))
            .ok_or_else(|| AppError::bad_request("素材缺少已验证的原片摘要"))?;
        let duration = asset
            .duration_seconds
            .filter(|v| v.is_finite() && *v > 0.0 && *v <= 1800.0)
            .ok_or_else(|| AppError::bad_request("素材时长缺失或超过 30 分钟"))?;
        let duration_ms = (duration * 1000.0).floor() as u32;
        if request
            .clips
            .iter()
            .any(|c| c.asset_id == clip.asset_id && c.end_ms > duration_ms)
        {
            return Err(AppError::bad_request("片段切点超出原片范围"));
        }
        assets.push(BoundAsset {
            asset_id: clip.asset_id,
            object_key: key,
            sha256: sha.to_ascii_lowercase(),
            duration_ms,
        });
    }
    Ok(Snapshot {
        title: request.title.trim().to_string(),
        aspect: request.aspect,
        clips: request.clips,
        assets,
        rights_confirmed: true,
    })
}

pub(super) async fn revalidate(
    state: &AppState,
    user: &CurrentUser,
    snapshot: &Snapshot,
) -> AppResult<()> {
    for source in &snapshot.assets {
        let current =
            ensure_content_asset_edit_permission(&state.pool, user, source.asset_id).await?;
        check_rights(&current)?;
        if current.external_only
            || current.asset_status != "ready"
            || current.bucket != state.settings.tos_bucket
            || current.raw_object_key.as_deref() != Some(source.object_key.as_str())
            || current
                .raw_sha256
                .as_deref()
                .map(str::to_ascii_lowercase)
                .as_deref()
                != Some(source.sha256.as_str())
        {
            return Err(AppError::Conflict(
                "源素材已变化或不可用，请重新选片并保存".into(),
            ));
        }
    }
    Ok(())
}
