use tracing::warn;

use crate::state::AppState;

use super::super::super::{
    runtime_store_pg::{
        append_postgres_payload_event, delete_postgres_payload_event, list_postgres_payload_events,
    },
    runtime_store_types::{
        RuntimeStoreDeleteResult, RuntimeStoreReadResult, RuntimeStoreWriteResult,
    },
    types::DataOpsBatchExecutionRecord,
};
use super::super::{
    memory,
    results::{
        memory_delete_fallback_result, memory_delete_result, memory_read_fallback_result,
        memory_read_result, memory_write_fallback_result, memory_write_result,
        postgres_delete_result, postgres_read_result, postgres_write_result,
    },
    MAX_BATCH_EXECUTION_EVENTS,
};

pub(in crate::dataops::runtime_store) async fn list_batch_execution_events_with_store(
    state: &AppState,
    postgres_requested: bool,
) -> RuntimeStoreReadResult<DataOpsBatchExecutionRecord> {
    if postgres_requested {
        match list_postgres_payload_events::<DataOpsBatchExecutionRecord>(
            state,
            "runtime_batch_execution_events",
            MAX_BATCH_EXECUTION_EVENTS,
        )
        .await
        {
            Ok(items) => return postgres_read_result(items),
            Err(message) => {
                warn!(error = %message, "dataops batch execution postgres read failed");
                let items = memory::list_batch_execution_events().await;
                return memory_read_fallback_result(items, message);
            }
        }
    }

    let items = memory::list_batch_execution_events().await;
    memory_read_result(items)
}

pub(in crate::dataops::runtime_store) async fn append_batch_execution_event(
    state: &AppState,
    event: DataOpsBatchExecutionRecord,
    postgres_requested: bool,
) -> RuntimeStoreWriteResult {
    if postgres_requested {
        match append_postgres_payload_event(
            state,
            "runtime_batch_execution_events",
            event.id.as_str(),
            &event,
        )
        .await
        {
            Ok(()) => return postgres_write_result(),
            Err(message) => {
                warn!(error = %message, "dataops batch execution postgres write failed");
                memory::append_batch_execution_event(event).await;
                return memory_write_fallback_result(message);
            }
        }
    }

    memory::append_batch_execution_event(event).await;
    memory_write_result()
}

pub(in crate::dataops::runtime_store) async fn delete_batch_execution_event(
    state: &AppState,
    event_id: &str,
    postgres_requested: bool,
) -> RuntimeStoreDeleteResult {
    if postgres_requested {
        match delete_postgres_payload_event(state, "runtime_batch_execution_events", event_id).await
        {
            Ok(deleted) => return postgres_delete_result(deleted),
            Err(message) => {
                warn!(error = %message, "dataops batch execution postgres delete failed");
                let deleted = memory::delete_batch_execution_event(event_id).await;
                return memory_delete_fallback_result(deleted, message);
            }
        }
    }

    let deleted = memory::delete_batch_execution_event(event_id).await;
    memory_delete_result(deleted)
}
