mod attempts;
mod facts;
mod status;
mod types;

use crate::error::AppResult;

use self::{
    attempts::generate_weekly_summary,
    facts::build_and_persist_summary_facts,
    status::{
        mark_weekly_summary_failed, mark_weekly_summary_generating, mark_weekly_summary_success,
    },
};
use super::super::{
    periods::normalize_week_period_for_db, summary_jobs::WeeklySummaryJob,
    summary_prompt::build_summary_prompt,
};
use super::{cache::cache_summary_status, scope::normalize_weekly_summary_scope};

pub(in crate::reports) async fn run_weekly_summary_job(job: WeeklySummaryJob) -> AppResult<()> {
    let WeeklySummaryJob {
        state,
        week_period,
        summary_scope,
        task_id,
        provider,
        model,
        prompt_config,
        facts_snapshot_overrides,
    } = job;

    let normalized = normalize_week_period_for_db(week_period.as_str());
    let normalized_scope = normalize_weekly_summary_scope(Some(summary_scope.as_str()));

    let moved = mark_weekly_summary_generating(
        state.as_ref(),
        normalized.as_str(),
        normalized_scope.as_str(),
        task_id.as_str(),
    )
    .await?;
    if !moved {
        return Ok(());
    }

    let facts = build_and_persist_summary_facts(
        state.as_ref(),
        normalized.as_str(),
        normalized_scope.as_str(),
        week_period.as_str(),
        task_id.as_str(),
        facts_snapshot_overrides,
    )
    .await?;

    let prompt = build_summary_prompt(
        prompt_config
            .get("business_framework")
            .and_then(|value| value.as_str())
            .unwrap_or_default(),
        prompt_config
            .get("custom_prompt")
            .and_then(|value| value.as_str())
            .unwrap_or_default(),
        facts,
    );

    match generate_weekly_summary(
        state.as_ref(),
        provider.as_str(),
        model.as_str(),
        normalized_scope.as_str(),
        &prompt,
    )
    .await
    {
        Ok(generated) => {
            mark_weekly_summary_success(
                state.as_ref(),
                normalized.as_str(),
                normalized_scope.as_str(),
                task_id.as_str(),
                generated,
            )
            .await?;
            cache_summary_status(
                &state,
                week_period.as_str(),
                normalized_scope.as_str(),
                "SUCCESS",
            )
            .await;
            Ok(())
        }
        Err(error) => {
            let error_message = format!("{error:#}");
            mark_weekly_summary_failed(
                state.as_ref(),
                normalized.as_str(),
                normalized_scope.as_str(),
                week_period.as_str(),
                task_id.as_str(),
                error_message.as_str(),
            )
            .await?;
            Ok(())
        }
    }
}
