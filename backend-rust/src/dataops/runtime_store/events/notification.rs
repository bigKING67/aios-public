use tracing::warn;

use crate::state::AppState;

use super::super::super::{
    runtime_store_pg::{
        append_postgres_payload_event, list_postgres_notification_events_by_retry_group,
        list_postgres_payload_events,
    },
    runtime_store_types::{RuntimeStoreReadResult, RuntimeStoreWriteResult},
    types::DataOpsNotificationEvent,
};
use super::super::{
    memory,
    results::{
        memory_read_fallback_result, memory_read_result, memory_write_fallback_result,
        memory_write_result, postgres_read_result, postgres_write_result,
    },
    MAX_NOTIFICATION_EVENTS, MAX_TRACE_LIMIT,
};

pub(in crate::dataops::runtime_store) async fn list_notification_events_with_store(
    state: &AppState,
    postgres_requested: bool,
) -> RuntimeStoreReadResult<DataOpsNotificationEvent> {
    if postgres_requested {
        match list_postgres_payload_events::<DataOpsNotificationEvent>(
            state,
            "runtime_notification_events",
            MAX_NOTIFICATION_EVENTS,
        )
        .await
        {
            Ok(items) => return postgres_read_result(items),
            Err(message) => {
                warn!(error = %message, "dataops notification event postgres read failed");
                let items = memory::list_notification_events(MAX_NOTIFICATION_EVENTS).await;
                return memory_read_fallback_result(items, message);
            }
        }
    }

    let items = memory::list_notification_events(MAX_NOTIFICATION_EVENTS).await;
    memory_read_result(items)
}

pub(in crate::dataops::runtime_store) async fn list_notification_events_by_retry_group_with_store(
    state: &AppState,
    retry_group_id: &str,
    limit: usize,
    postgres_requested: bool,
) -> RuntimeStoreReadResult<DataOpsNotificationEvent> {
    let limit = limit.clamp(1, MAX_TRACE_LIMIT);
    if postgres_requested {
        match list_postgres_notification_events_by_retry_group(state, retry_group_id, limit).await {
            Ok(items) => return postgres_read_result(items),
            Err(message) => {
                warn!(
                    error = %message,
                    retry_group_id,
                    "dataops notification trace postgres read failed"
                );
                let items =
                    memory::list_notification_events_by_retry_group(retry_group_id, limit).await;
                return memory_read_fallback_result(items, message);
            }
        }
    }

    let items = memory::list_notification_events_by_retry_group(retry_group_id, limit).await;
    memory_read_result(items)
}

pub(in crate::dataops::runtime_store) async fn append_notification_event(
    state: &AppState,
    event: DataOpsNotificationEvent,
    postgres_requested: bool,
) -> RuntimeStoreWriteResult {
    if postgres_requested {
        match append_postgres_payload_event(
            state,
            "runtime_notification_events",
            event.id.as_str(),
            &event,
        )
        .await
        {
            Ok(()) => return postgres_write_result(),
            Err(message) => {
                warn!(error = %message, "dataops notification event postgres write failed");
                memory::append_notification_event(event).await;
                return memory_write_fallback_result(message);
            }
        }
    }

    memory::append_notification_event(event).await;
    memory_write_result()
}
