use super::super::types::PrefectDeployment;

pub(crate) fn resolve_deployment_paused(deployment: &PrefectDeployment) -> bool {
    if let Some(paused) = deployment.paused {
        return paused;
    }

    if let Some(is_active) = deployment.is_schedule_active {
        return !is_active;
    }

    false
}

pub(crate) fn resolve_deployment_status(deployment: &PrefectDeployment) -> Option<String> {
    let status = deployment.status.as_ref()?;
    if let Some(text) = status.as_str() {
        let normalized = text.trim();
        if !normalized.is_empty() {
            return Some(normalized.to_string());
        }
    }

    if let Some(obj) = status.as_object() {
        if let Some(name) = obj.get("name").and_then(|value| value.as_str()) {
            let normalized = name.trim();
            if !normalized.is_empty() {
                return Some(normalized.to_string());
            }
        }
        if let Some(kind) = obj.get("type").and_then(|value| value.as_str()) {
            let normalized = kind.trim();
            if !normalized.is_empty() {
                return Some(normalized.to_string());
            }
        }
    }

    None
}
