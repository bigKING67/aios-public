//! Studio-local error envelope. Every failure keeps the global `{detail}` body;
//! segment write conflicts add a machine-readable `code` and the involved
//! `segmentIds` so clients do not parse the Chinese detail text. Other modules
//! keep the unchanged `AppError` response format.
use super::types::ContentSegmentConflictResponse;
use crate::error::AppError;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ConflictCode {
    /// Interval intersects a confirmed segment of the same (asset, preset);
    /// `segmentIds` lists the conflicting confirmed segments (may be empty
    /// when the database exclusion constraint caught a race).
    SegmentOverlap,
    /// Two segments of one batch confirm overlap each other (same asset and
    /// preset); `segmentIds` lists that pair. Distinct from `SegmentOverlap`,
    /// which names already-confirmed segments.
    BatchOverlap,
    /// The client's `sourceContentHash` no longer matches the raw asset.
    SourceChanged,
    /// The target segment is stale (its source content changed); read-only.
    StaleSegment,
    /// `expectedRevision` does not match the stored revision.
    RevisionConflict,
    /// A remix batch idempotency key was reused with a different request.
    IdempotencyConflict,
    /// No valid unused framework remix combination exists.
    RemixUnavailable,
    /// The user's queued/running framework remix renders would exceed the limit.
    RemixActiveLimit,
    /// A 单条剪辑 repeats an existing live or succeeded output exactly and the
    /// request did not set `allowDuplicate`.
    RemixEditDuplicate,
}

impl ConflictCode {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::SegmentOverlap => "segment_overlap",
            Self::BatchOverlap => "batch_overlap",
            Self::SourceChanged => "source_changed",
            Self::StaleSegment => "stale_segment",
            Self::RevisionConflict => "revision_conflict",
            Self::IdempotencyConflict => "idempotency_conflict",
            Self::RemixUnavailable => "remix_unavailable",
            Self::RemixActiveLimit => "remix_active_limit",
            Self::RemixEditDuplicate => "remix_edit_duplicate",
        }
    }
}

#[derive(Debug)]
pub(super) struct SegmentConflict {
    pub(super) code: ConflictCode,
    pub(super) detail: String,
    pub(super) segment_ids: Vec<Uuid>,
}

#[derive(Debug)]
pub(super) enum StudioError {
    App(AppError),
    Conflict(SegmentConflict),
}

pub(super) type StudioResult<T> = Result<T, StudioError>;

impl StudioError {
    pub(super) fn conflict(
        code: ConflictCode,
        detail: impl Into<String>,
        segment_ids: Vec<Uuid>,
    ) -> Self {
        Self::Conflict(SegmentConflict {
            code,
            detail: detail.into(),
            segment_ids,
        })
    }
}

impl From<AppError> for StudioError {
    fn from(error: AppError) -> Self {
        Self::App(error)
    }
}

impl IntoResponse for StudioError {
    fn into_response(self) -> Response {
        match self {
            Self::App(error) => error.into_response(),
            Self::Conflict(conflict) => (
                StatusCode::CONFLICT,
                Json(ContentSegmentConflictResponse {
                    detail: conflict.detail,
                    code: conflict.code.as_str(),
                    segment_ids: conflict.segment_ids,
                }),
            )
                .into_response(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn body(response: Response) -> (StatusCode, serde_json::Value) {
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 16)
            .await
            .unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn conflict_body_keeps_detail_and_adds_code_and_ids() {
        let id = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
        let (status, json) = body(
            StudioError::conflict(
                ConflictCode::SegmentOverlap,
                "与已确认片段时间重叠",
                vec![id],
            )
            .into_response(),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(
            json,
            serde_json::json!({
                "detail": "与已确认片段时间重叠",
                "code": "segment_overlap",
                "segmentIds": [id.to_string()],
            })
        );
    }

    #[tokio::test]
    async fn app_errors_keep_the_global_body() {
        let (status, json) =
            body(StudioError::from(AppError::bad_request("x")).into_response()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(json, serde_json::json!({ "detail": "x" }));
    }

    #[test]
    fn codes_are_stable() {
        assert_eq!(
            [
                ConflictCode::SegmentOverlap,
                ConflictCode::BatchOverlap,
                ConflictCode::SourceChanged,
                ConflictCode::StaleSegment,
                ConflictCode::RevisionConflict,
                ConflictCode::IdempotencyConflict,
                ConflictCode::RemixUnavailable,
                ConflictCode::RemixActiveLimit,
                ConflictCode::RemixEditDuplicate,
            ]
            .map(ConflictCode::as_str),
            [
                "segment_overlap",
                "batch_overlap",
                "source_changed",
                "stale_segment",
                "revision_conflict",
                "idempotency_conflict",
                "remix_unavailable",
                "remix_active_limit",
                "remix_edit_duplicate",
            ]
        );
    }
}
