use super::super::types::PrefectFlowRun;

pub(crate) fn resolve_flow_run_state_type(run: &PrefectFlowRun) -> Option<String> {
    if let Some(value) = run.state_type.as_ref() {
        let normalized = value.trim();
        if !normalized.is_empty() {
            return Some(normalized.to_string());
        }
    }

    run.state
        .as_ref()
        .and_then(|state| state.r#type.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn resolve_flow_run_state_name(run: &PrefectFlowRun) -> Option<String> {
    if let Some(value) = run.state_name.as_ref() {
        let normalized = value.trim();
        if !normalized.is_empty() {
            return Some(normalized.to_string());
        }
    }

    run.state
        .as_ref()
        .and_then(|state| state.name.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn resolve_flow_run_state_message(run: &PrefectFlowRun) -> Option<String> {
    if let Some(value) = run.state_message.as_ref() {
        let normalized = value.trim();
        if !normalized.is_empty() {
            return Some(normalized.to_string());
        }
    }

    run.state
        .as_ref()
        .and_then(|state| state.message.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn resolve_flow_run_timestamp(run: &PrefectFlowRun) -> Option<String> {
    run.start_time
        .clone()
        .or(run.expected_start_time.clone())
        .or(run.created.clone())
}

pub(crate) fn resolve_flow_run_end_timestamp(run: &PrefectFlowRun) -> Option<String> {
    run.end_time.clone()
}

pub(crate) fn resolve_flow_run_success_timestamp(run: &PrefectFlowRun) -> Option<String> {
    run.end_time
        .clone()
        .or_else(|| resolve_flow_run_timestamp(run))
}
