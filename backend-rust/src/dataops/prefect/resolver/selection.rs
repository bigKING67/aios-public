use super::{super::config::BLOCKING_FLOW_RUN_STATES, super::types::PrefectFlowRun};
use crate::dataops::prefect::resolver::flow_run::resolve_flow_run_state_type;

pub(crate) fn select_runtime_flow_run(runs: &[PrefectFlowRun]) -> Option<&PrefectFlowRun> {
    runs.iter()
        .find(|run| flow_run_state_matches(run, BLOCKING_FLOW_RUN_STATES))
        .or_else(|| {
            runs.iter()
                .find(|run| !flow_run_state_matches(run, &["SCHEDULED"]))
        })
        .or_else(|| runs.first())
}

pub(crate) fn select_latest_successful_flow_run(
    runs: &[PrefectFlowRun],
) -> Option<&PrefectFlowRun> {
    runs.iter()
        .find(|run| flow_run_state_matches(run, &["COMPLETED"]))
}

fn flow_run_state_matches(run: &PrefectFlowRun, candidates: &[&str]) -> bool {
    resolve_flow_run_state_type(run)
        .map(|state| {
            candidates
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(state.as_str()))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow_run(id: &str, state_type: &str, start_time: Option<&str>) -> PrefectFlowRun {
        PrefectFlowRun {
            id: id.to_string(),
            name: None,
            state: None,
            state_type: Some(state_type.to_string()),
            state_name: Some(state_type.to_string()),
            state_message: None,
            start_time: start_time.map(str::to_string),
            end_time: None,
            expected_start_time: None,
            created: None,
        }
    }

    #[test]
    fn runtime_flow_run_ignores_future_scheduled_when_actual_run_exists() {
        let runs = vec![
            flow_run("scheduled", "SCHEDULED", None),
            flow_run("failed", "FAILED", Some("2026-04-27T02:00:00Z")),
            flow_run("completed", "COMPLETED", Some("2026-04-26T02:00:00Z")),
        ];

        let selected = select_runtime_flow_run(runs.as_slice()).expect("selected run");
        assert_eq!(selected.id, "failed");

        let successful =
            select_latest_successful_flow_run(runs.as_slice()).expect("successful run");
        assert_eq!(successful.id, "completed");
    }

    #[test]
    fn runtime_flow_run_prefers_active_run_over_terminal_history() {
        let runs = vec![
            flow_run("scheduled", "SCHEDULED", None),
            flow_run("completed", "COMPLETED", Some("2026-04-27T01:00:00Z")),
            flow_run("running", "RUNNING", Some("2026-04-27T02:00:00Z")),
        ];

        let selected = select_runtime_flow_run(runs.as_slice()).expect("selected run");
        assert_eq!(selected.id, "running");
    }

    #[test]
    fn runtime_flow_run_falls_back_to_scheduled_when_no_actual_run_exists() {
        let runs = vec![
            flow_run("scheduled-next", "SCHEDULED", None),
            flow_run("scheduled-later", "SCHEDULED", None),
        ];

        let selected = select_runtime_flow_run(runs.as_slice()).expect("selected run");
        assert_eq!(selected.id, "scheduled-next");
    }
}
