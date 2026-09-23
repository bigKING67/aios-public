mod existing;
mod insert;
mod reset;

use crate::error::AppResult;

use super::super::{
    periods::normalize_week_period_for_db, summary_jobs::PrepareWeeklySummaryGenerationInput,
};
use super::{records::query_weekly_summary_record, types::PreparedSummaryTask};

pub(crate) async fn prepare_weekly_summary_generation(
    input: PrepareWeeklySummaryGenerationInput<'_>,
) -> AppResult<PreparedSummaryTask> {
    let PrepareWeeklySummaryGenerationInput {
        pool,
        week_period,
        summary_scope,
        task_id,
        provider,
        model,
        prompt_config,
        facts_snapshot,
        requested_by,
        force_regenerate,
        retry: _retry,
    } = input;

    let normalized = normalize_week_period_for_db(week_period);
    let existing = query_weekly_summary_record(pool, normalized.as_str(), summary_scope).await?;

    if let Some(existing_record) = existing {
        if let Some(prepared) =
            existing::existing_task_result(existing_record, task_id, force_regenerate)
        {
            return Ok(prepared);
        }

        reset::reset_existing_weekly_summary_task(reset::ResetWeeklySummaryTaskInput {
            pool,
            normalized_week_period: normalized.as_str(),
            summary_scope,
            task_id,
            provider,
            model,
            prompt_config: &prompt_config,
            facts_snapshot: &facts_snapshot,
            requested_by,
        })
        .await?;
    } else if let Some(prepared) =
        insert::insert_weekly_summary_task(insert::InsertWeeklySummaryTaskInput {
            pool,
            normalized_week_period: normalized.as_str(),
            summary_scope,
            task_id,
            provider,
            model,
            prompt_config: &prompt_config,
            facts_snapshot: &facts_snapshot,
            requested_by,
        })
        .await?
    {
        return Ok(prepared);
    }

    Ok(PreparedSummaryTask {
        should_enqueue: true,
        status: "PENDING".to_string(),
        task_id: task_id.to_string(),
    })
}
