//! 成片人工审核: one current review per output (Run), for the output asset it was
//! given for. Same access as batch cancel: owner-only in scoped studio access,
//! any signed-in user in open access (`owner` filter `None`); the reviewer is
//! the real caller. Repeating a review replaces it, clearing removes it, and the
//! previous decision is kept only in the `studio_audit` log line.
use super::error::StudioResult;
use super::remix_read;
use super::remix_types::{RemixBatchDetail, RemixOutputReviewRequest};
use super::repository::db_error;
use crate::{config::Settings, error::AppError};
use sqlx::{PgPool, Row};
use uuid::Uuid;

/// Rejection reasons, as the table's check constraint allows them.
const REASONS: [&str; 7] = [
    "duplicate_picture",
    "voice_break",
    "wrong_product",
    "pacing",
    "frame_drop",
    "wrong_framework",
    "other",
];
const NOTE_MAX_CHARS: usize = 500;

#[derive(Debug, PartialEq, Eq)]
struct Review {
    decision: &'static str,
    reasons: Vec<String>,
    note: Option<String>,
}

fn validate(request: &RemixOutputReviewRequest) -> Result<Review, AppError> {
    let decision = match request.decision.as_str() {
        "approved" => "approved",
        "rejected" => "rejected",
        _ => {
            return Err(AppError::bad_request(
                "decision 只能是 approved 或 rejected",
            ))
        }
    };
    let mut reasons: Vec<String> = Vec::new();
    for reason in &request.reasons {
        if !REASONS.contains(&reason.as_str()) {
            return Err(AppError::bad_request(format!("未知的驳回原因：{reason}")));
        }
        if !reasons.contains(reason) {
            reasons.push(reason.clone());
        }
    }
    if decision == "rejected" && reasons.is_empty() {
        return Err(AppError::bad_request("驳回需要至少选择一个原因"));
    }
    if decision == "approved" && !reasons.is_empty() {
        return Err(AppError::bad_request("通过不需要驳回原因"));
    }
    let note = request
        .note
        .as_deref()
        .map(str::trim)
        .filter(|note| !note.is_empty())
        .map(str::to_owned);
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > NOTE_MAX_CHARS)
    {
        return Err(AppError::bad_request(format!(
            "备注最多 {NOTE_MAX_CHARS} 字"
        )));
    }
    Ok(Review {
        decision,
        reasons,
        note,
    })
}

struct Target {
    run_id: Uuid,
    /// The current output asset, when the output succeeded and is still in the library.
    output_asset_id: Option<Uuid>,
}

async fn target(
    pool: &PgPool,
    owner: Option<&str>,
    batch_id: Uuid,
    ordinal: i32,
) -> StudioResult<Target> {
    let row = sqlx::query(
        "SELECT br.run_id, CASE WHEN r.status = 'succeeded' THEN oa.asset_id END AS output_asset_id \
         FROM ads.content_remix_batches b \
         JOIN ads.content_remix_batch_runs br ON br.batch_id = b.batch_id \
         JOIN ads.content_production_runs r ON r.run_id = br.run_id \
         LEFT JOIN ads.marketing_content_assets oa ON oa.asset_id = br.output_asset_id AND (oa.is_deleted = FALSE OR EXISTS (SELECT 1 FROM ads.content_remix_output_reviews cr WHERE cr.run_id=br.run_id AND cr.output_asset_id=br.output_asset_id AND cr.decision='rejected')) \
         WHERE b.batch_id = $1 AND br.ordinal = $2 AND ($3::TEXT IS NULL OR b.owner_user_id = $3)",
    )
    .bind(batch_id)
    .bind(ordinal)
    .bind(owner)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(AppError::NotFound)?;
    Ok(Target {
        run_id: row.get("run_id"),
        output_asset_id: row.get("output_asset_id"),
    })
}

pub(super) async fn review(
    pool: &PgPool,
    settings: &Settings,
    viewer: &str,
    owner: Option<&str>,
    batch_id: Uuid,
    ordinal: i32,
    request: &RemixOutputReviewRequest,
) -> StudioResult<RemixBatchDetail> {
    let review = validate(request)?;
    let target = target(pool, owner, batch_id, ordinal).await?;
    let Some(output_asset_id) = target.output_asset_id else {
        return Err(AppError::Conflict("这条成片还没有可播放的成片文件，不能审核".into()).into());
    };
    let mut tx = pool.begin().await.map_err(db_error)?;
    super::remix_delivery::lock_review_change(&mut tx, Some(output_asset_id)).await?;
    super::remix_retention::before_change(&mut tx, target.run_id, Some(output_asset_id)).await?;
    sqlx::query(
        "INSERT INTO ads.content_remix_output_reviews \
         (run_id, output_asset_id, decision, reasons, note, reviewer_user_id, reviewed_at) \
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) \
         ON CONFLICT (run_id) DO UPDATE SET output_asset_id = EXCLUDED.output_asset_id, \
         decision = EXCLUDED.decision, reasons = EXCLUDED.reasons, note = EXCLUDED.note, \
         reviewer_user_id = EXCLUDED.reviewer_user_id, reviewed_at = EXCLUDED.reviewed_at",
    )
    .bind(target.run_id)
    .bind(output_asset_id)
    .bind(review.decision)
    .bind(&review.reasons)
    .bind(review.note.as_deref())
    .bind(viewer)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    if let Some(id) = target.output_asset_id {
        super::remix_retention::sync_rejection(&mut tx, id).await?;
    }
    tx.commit().await.map_err(db_error)?;
    tracing::info!(
        target: "studio_audit",
        action = "remix_output_review",
        %batch_id,
        ordinal,
        run_id = %target.run_id,
        decision = review.decision,
        reasons = ?review.reasons,
        operator = viewer,
        "remix output reviewed"
    );
    remix_read::detail(pool, settings, viewer, owner, batch_id).await
}

/// Removes the output's review (back to 待审核); a no-op when there is none.
pub(super) async fn clear(
    pool: &PgPool,
    settings: &Settings,
    viewer: &str,
    owner: Option<&str>,
    batch_id: Uuid,
    ordinal: i32,
) -> StudioResult<RemixBatchDetail> {
    let target = target(pool, owner, batch_id, ordinal).await?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    super::remix_delivery::lock_review_change(&mut tx, target.output_asset_id).await?;
    super::remix_retention::before_change(&mut tx, target.run_id, target.output_asset_id).await?;
    let removed = sqlx::query("DELETE FROM ads.content_remix_output_reviews WHERE run_id = $1")
        .bind(target.run_id)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?
        .rows_affected();
    if let Some(id) = target.output_asset_id {
        super::remix_retention::sync_rejection(&mut tx, id).await?;
    }
    tx.commit().await.map_err(db_error)?;
    if removed > 0 {
        tracing::info!(
            target: "studio_audit",
            action = "remix_output_review_clear",
            %batch_id,
            ordinal,
            run_id = %target.run_id,
            operator = viewer,
            "remix output review cleared"
        );
    }
    remix_read::detail(pool, settings, viewer, owner, batch_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(decision: &str, reasons: &[&str], note: Option<&str>) -> RemixOutputReviewRequest {
        RemixOutputReviewRequest {
            decision: decision.into(),
            reasons: reasons.iter().map(|reason| (*reason).to_owned()).collect(),
            note: note.map(str::to_owned),
        }
    }

    #[test]
    fn approvals_take_no_reasons_and_blank_notes_drop() {
        assert_eq!(
            validate(&request("approved", &[], Some("  "))).unwrap(),
            Review {
                decision: "approved",
                reasons: vec![],
                note: None
            }
        );
        assert!(validate(&request("approved", &["pacing"], None)).is_err());
    }

    #[test]
    fn rejections_need_known_reasons_once_each() {
        assert_eq!(
            validate(&request(
                "rejected",
                &["pacing", "other", "pacing"],
                Some(" 节奏拖 ")
            ))
            .unwrap(),
            Review {
                decision: "rejected",
                reasons: vec!["pacing".into(), "other".into()],
                note: Some("节奏拖".into())
            }
        );
        assert!(validate(&request("rejected", &[], None)).is_err());
        assert!(validate(&request("rejected", &["boring"], None)).is_err());
    }

    #[test]
    fn unknown_decisions_and_long_notes_are_rejected() {
        assert!(validate(&request("maybe", &[], None)).is_err());
        let long = "字".repeat(NOTE_MAX_CHARS + 1);
        assert!(validate(&request("approved", &[], Some(&long))).is_err());
        let max = "字".repeat(NOTE_MAX_CHARS);
        assert!(validate(&request("approved", &[], Some(&max))).is_ok());
    }
}
