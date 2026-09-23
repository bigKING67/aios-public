use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::super::{
    summary_facts::{build_weekly_summary_facts, merge_summary_facts},
    summary_normalization::normalize_summary_facts_percentages,
    summary_prompt::has_minimum_summary_facts,
};
use super::status::{mark_weekly_summary_failed, persist_weekly_summary_facts};

pub(super) async fn build_and_persist_summary_facts(
    state: &AppState,
    normalized_week_period: &str,
    normalized_scope: &str,
    week_period_for_facts: &str,
    task_id: &str,
    facts_snapshot_overrides: serde_json::Value,
) -> AppResult<serde_json::Value> {
    let auto_facts = match build_weekly_summary_facts(
        &state.pool,
        week_period_for_facts,
        normalized_scope,
    )
    .await
    {
        Ok(facts) => facts,
        Err(error) => {
            let error_message = error.to_string();
            if let Err(mark_error) = mark_weekly_summary_failed(
                state,
                normalized_week_period,
                normalized_scope,
                week_period_for_facts,
                task_id,
                error_message.as_str(),
            )
            .await
            {
                tracing::error!(?mark_error, "mark summary failed failed");
            }
            return Err(error);
        }
    };

    let facts = normalize_summary_facts_percentages(merge_summary_facts(
        auto_facts,
        facts_snapshot_overrides,
    ));
    if !has_minimum_summary_facts(normalized_scope, &facts) {
        let error_message = format!(
            "summary facts incomplete for scope={}, generation blocked to prevent hallucination",
            normalized_scope
        );
        mark_weekly_summary_failed(
            state,
            normalized_week_period,
            normalized_scope,
            week_period_for_facts,
            task_id,
            error_message.as_str(),
        )
        .await?;
        return Err(AppError::bad_request(error_message.as_str()));
    }

    persist_weekly_summary_facts(
        state,
        normalized_week_period,
        normalized_scope,
        task_id,
        facts.clone(),
    )
    .await?;

    Ok(facts)
}
