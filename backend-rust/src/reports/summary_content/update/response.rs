use chrono::Utc;

use crate::reports::{WeeklySummaryContentResponse, WEEKLY_SUMMARY_CONTENT_STATUS_MANUAL_EDITED};

use super::input::ManualSummaryUpdateInput;

pub(super) fn build_manual_summary_response(
    input: ManualSummaryUpdateInput,
) -> WeeklySummaryContentResponse {
    WeeklySummaryContentResponse {
        week_period: input.week_period,
        summary_scope: input.summary_scope,
        status: "SUCCESS".to_string(),
        content_status: WEEKLY_SUMMARY_CONTENT_STATUS_MANUAL_EDITED.to_string(),
        task_id: Some(input.task_id),
        provider: Some(input.provider),
        model: Some(input.model),
        generated_at: Some(Utc::now().to_rfc3339()),
        updated_by: Some(input.requested_by),
        approved_by: None,
        approved_at: None,
        published_by: None,
        published_at: None,
        message: None,
        conclusions: input.conclusions,
    }
}
