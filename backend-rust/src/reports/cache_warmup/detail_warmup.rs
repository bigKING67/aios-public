use std::sync::Arc;

use tokio::task::JoinSet;
use tracing::warn;

use super::super::{
    cache_runtime::{get_or_build_monthly_report, get_or_build_weekly_report},
    PeriodOption,
};
use crate::{error::AppError, state::AppState};

pub(super) async fn warmup_weekly_report_details(
    state: Arc<AppState>,
    periods: Vec<PeriodOption>,
    parallelism: usize,
) -> (usize, usize) {
    if periods.is_empty() {
        return (0, 0);
    }

    let mut queue = periods.into_iter();
    let mut join_set: JoinSet<Result<String, (String, AppError)>> = JoinSet::new();
    let mut success_count = 0usize;
    let mut failed_count = 0usize;

    loop {
        while join_set.len() < parallelism {
            let Some(period) = queue.next() else {
                break;
            };
            let week_period = period.value;
            let state_for_task = Arc::clone(&state);
            join_set.spawn(async move {
                match get_or_build_weekly_report(&state_for_task, week_period.as_str(), false).await
                {
                    Ok(_) => Ok(week_period),
                    Err(error) => Err((week_period, error)),
                }
            });
        }

        if join_set.is_empty() {
            break;
        }

        match join_set.join_next().await {
            Some(Ok(Ok(_))) => {
                success_count += 1;
            }
            Some(Ok(Err((week_period, error)))) => {
                failed_count += 1;
                warn!(
                    ?error,
                    week_period = %week_period,
                    "skip weekly warmup item due to build error"
                );
            }
            Some(Err(error)) => {
                failed_count += 1;
                warn!(?error, "weekly warmup task join failed");
            }
            None => break,
        }
    }

    (success_count, failed_count)
}

pub(super) async fn warmup_monthly_report_details(
    state: Arc<AppState>,
    periods: Vec<PeriodOption>,
    parallelism: usize,
) -> (usize, usize) {
    if periods.is_empty() {
        return (0, 0);
    }

    let mut queue = periods.into_iter();
    let mut join_set: JoinSet<Result<String, (String, AppError)>> = JoinSet::new();
    let mut success_count = 0usize;
    let mut failed_count = 0usize;

    loop {
        while join_set.len() < parallelism {
            let Some(period) = queue.next() else {
                break;
            };
            let month_period = period.value;
            let state_for_task = Arc::clone(&state);
            join_set.spawn(async move {
                match get_or_build_monthly_report(&state_for_task, month_period.as_str(), false)
                    .await
                {
                    Ok(_) => Ok(month_period),
                    Err(error) => Err((month_period, error)),
                }
            });
        }

        if join_set.is_empty() {
            break;
        }

        match join_set.join_next().await {
            Some(Ok(Ok(_))) => {
                success_count += 1;
            }
            Some(Ok(Err((month_period, error)))) => {
                failed_count += 1;
                warn!(
                    ?error,
                    month_period = %month_period,
                    "skip monthly warmup item due to build error"
                );
            }
            Some(Err(error)) => {
                failed_count += 1;
                warn!(?error, "monthly warmup task join failed");
            }
            None => break,
        }
    }

    (success_count, failed_count)
}
