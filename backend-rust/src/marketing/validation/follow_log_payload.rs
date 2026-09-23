use crate::error::AppResult;

use super::common::{normalize_optional_text, normalize_required_text};
use crate::marketing::types::{
    CreatorLibraryFollowLogInput, CreatorLibraryFollowLogPayload, NOTE_MAX_LEN, TEXT_MAX_LEN,
};

pub(crate) fn normalize_follow_log_payload(
    payload: CreatorLibraryFollowLogPayload,
) -> AppResult<CreatorLibraryFollowLogInput> {
    let expected_updated_at = payload.expected_updated_at.or(payload.updated_at);
    Ok(CreatorLibraryFollowLogInput {
        follow_note: normalize_required_text(payload.follow_note, NOTE_MAX_LEN, "跟进记录")?,
        expected_updated_at: normalize_optional_text(
            expected_updated_at,
            TEXT_MAX_LEN,
            "更新时间",
        )?,
    })
}
