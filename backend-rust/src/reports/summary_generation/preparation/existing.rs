use super::super::types::{PreparedSummaryTask, WeeklySummaryRecord};

pub(super) fn existing_task_result(
    existing_record: WeeklySummaryRecord,
    task_id: &str,
    force_regenerate: bool,
) -> Option<PreparedSummaryTask> {
    let status = existing_record.status.to_uppercase();

    if (status == "PENDING" || status == "GENERATING") && !force_regenerate {
        return Some(PreparedSummaryTask {
            should_enqueue: false,
            status,
            task_id: existing_record
                .task_id
                .unwrap_or_else(|| task_id.to_string()),
        });
    }

    if status == "SUCCESS" && !force_regenerate {
        return Some(PreparedSummaryTask {
            should_enqueue: false,
            status,
            task_id: existing_record
                .task_id
                .unwrap_or_else(|| task_id.to_string()),
        });
    }

    None
}
