use tracing::warn;

use crate::state::AppState;

use super::super::super::{
    runtime_store_pg::{append_postgres_payload_event, list_postgres_payload_events},
    runtime_store_types::{RuntimeStoreReadResult, RuntimeStoreWriteResult},
    types::DataOpsAuditEvent,
};
use super::super::{
    memory,
    results::{
        memory_read_fallback_result, memory_read_result, memory_write_fallback_result,
        memory_write_result, postgres_read_result, postgres_write_result,
    },
    MAX_AUDIT_EVENTS,
};

pub(in crate::dataops::runtime_store) async fn list_audit_events_with_store(
    state: &AppState,
    postgres_requested: bool,
) -> RuntimeStoreReadResult<DataOpsAuditEvent> {
    if postgres_requested {
        match list_postgres_payload_events::<DataOpsAuditEvent>(
            state,
            "runtime_audit_events",
            MAX_AUDIT_EVENTS,
        )
        .await
        {
            Ok(items) => return postgres_read_result(items),
            Err(message) => {
                warn!(error = %message, "dataops audit event postgres read failed");
                let items = memory::list_audit_events().await;
                return memory_read_fallback_result(items, message);
            }
        }
    }

    let items = memory::list_audit_events().await;
    memory_read_result(items)
}

pub(in crate::dataops::runtime_store) async fn append_audit_event(
    state: &AppState,
    event: DataOpsAuditEvent,
    postgres_requested: bool,
) -> RuntimeStoreWriteResult {
    if postgres_requested {
        match append_postgres_payload_event(
            state,
            "runtime_audit_events",
            event.id.as_str(),
            &event,
        )
        .await
        {
            Ok(()) => return postgres_write_result(),
            Err(message) => {
                warn!(error = %message, "dataops audit event postgres write failed");
                memory::append_audit_event(event).await;
                return memory_write_fallback_result(message);
            }
        }
    }

    memory::append_audit_event(event).await;
    memory_write_result()
}
