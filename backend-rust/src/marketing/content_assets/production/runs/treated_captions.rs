//! Caption-only revisions must retain host-registered treated picture sources.
use super::{
    captions, domain,
    types::{PlanDocument, Run},
};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::{repository::db_error, types::Snapshot},
};
use serde_json::{json, Value};
use sqlx::{PgConnection, Row};

pub(super) async fn preserve(
    db: &mut PgConnection,
    owner: &str,
    run: &Run,
    plan: &PlanDocument,
) -> AppResult<Option<Snapshot>> {
    let Some(project) = run.project_id else {
        return Ok(None);
    };
    let row = sqlx::query("SELECT p.revision,r.snapshot FROM ads.content_production_projects p JOIN ads.content_production_revisions r USING(project_id,revision) WHERE p.project_id=$1 AND p.owner_user_id=$2 FOR UPDATE OF p")
        .bind(project).bind(owner).fetch_optional(&mut *db).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    let snapshot: Snapshot =
        serde_json::from_value(row.get("snapshot")).map_err(|_| AppError::Internal)?;
    if snapshot.derived_assets.is_empty() {
        return Ok(None);
    }
    if run.project_revision != Some(row.get("revision")) {
        return Err(domain::conflict());
    }
    revise(snapshot, plan).map(Some)
}

fn invalid() -> AppError {
    AppError::Conflict("已处理工程仅支持恢复带明确样式的主讲字幕或调整原字幕换行；画面、声音、文字、时间与样式须保留".into())
}

fn same_time(left: &Value, right: &Value) -> bool {
    match (
        left["num"].as_u64(),
        left["den"].as_u64(),
        right["num"].as_u64(),
        right["den"].as_u64(),
    ) {
        (Some(a), Some(b), Some(c), Some(d)) if b > 0 && d > 0 => {
            u128::from(a) * u128::from(d) == u128::from(c) * u128::from(b)
        }
        _ => false,
    }
}

pub(super) fn revise(mut snapshot: Snapshot, plan: &PlanDocument) -> AppResult<Snapshot> {
    if snapshot.clips != plan.clips || plan.narration_captions.is_none() {
        return Err(invalid());
    }
    let document = snapshot.edit_document.as_mut().ok_or_else(invalid)?;
    if document.get("captionRepair").is_some()
        || document["captionOverlayPolicy"] != "preserve-source-picture-v1"
    {
        return Err(invalid());
    }
    let old = document["captions"].as_array().ok_or_else(invalid)?;
    let mut next = captions::compile(plan);
    if next.is_empty()
        || next
            .iter()
            .any(|cue| cue["stylePreset"] != "source-style-v1")
    {
        return Err(invalid());
    }
    if old.is_empty() {
        // The API caller supplies source-bound text/times and explicit style.
        // This is not visual inference or certification of the original font.
        document["captionDisplayPolicy"] = json!("source-hold-v1");
    } else {
        if old.len() != next.len() {
            return Err(invalid());
        }
        for (before, after) in old.iter().zip(&mut next) {
            if before["text"]
                .as_str()
                .ok_or_else(invalid)?
                .replace('\n', "")
                != after["text"]
                    .as_str()
                    .ok_or_else(invalid)?
                    .replace('\n', "")
            {
                return Err(invalid());
            }
            let mut normalized = after.clone();
            normalized["text"] = before["text"].clone();
            for key in ["sourceStart", "sourceEnd"] {
                if !same_time(&before["anchor"][key], &after["anchor"][key]) {
                    return Err(invalid());
                }
                normalized["anchor"][key] = before["anchor"][key].clone();
            }
            if &normalized != before {
                return Err(invalid());
            }
            // Keep original rational timestamps and all frozen cue metadata.
            let text = after["text"].clone();
            *after = before.clone();
            after["text"] = text;
        }
    }
    document["revision"] = json!(document["revision"]
        .as_u64()
        .and_then(|r| r.checked_add(1))
        .ok_or_else(invalid)?);
    document["captions"] = json!(next);
    Ok(snapshot)
}

#[cfg(test)]
mod tests;
