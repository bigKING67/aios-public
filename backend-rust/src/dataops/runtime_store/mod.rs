use super::env::resolve_bool_env;
use super::runtime_store_pg::RuntimeStoreLimits;
use super::runtime_store_types::{
    RuntimeLockResult, RuntimeStoreDeleteResult, RuntimeStoreReadResult, RuntimeStoreWriteResult,
};
use super::types::{
    DataOpsAuditEvent, DataOpsBatchExecutionRecord, DataOpsNotificationEvent,
    DataOpsRuntimeStoreStatus,
};
use crate::state::AppState;

const MAX_AUDIT_EVENTS: usize = 80;
const MAX_NOTIFICATION_EVENTS: usize = 120;
const MAX_BATCH_EXECUTION_EVENTS: usize = 40;
const MAX_TRACE_LIMIT: usize = 1200;

mod events;
mod locks;
mod memory;
mod results;
mod status;

pub(super) async fn build_runtime_store_status(state: &AppState) -> DataOpsRuntimeStoreStatus {
    status::build_runtime_store_status(state, runtime_store_limits()).await
}

fn runtime_store_limits() -> RuntimeStoreLimits {
    RuntimeStoreLimits {
        max_audit_events: MAX_AUDIT_EVENTS,
        max_notification_events: MAX_NOTIFICATION_EVENTS,
        max_batch_execution_events: MAX_BATCH_EXECUTION_EVENTS,
    }
}

pub(super) async fn list_audit_events_with_store(
    state: &AppState,
) -> RuntimeStoreReadResult<DataOpsAuditEvent> {
    events::list_audit_events_with_store(state, postgres_requested()).await
}

pub(super) async fn append_audit_event(
    state: &AppState,
    event: DataOpsAuditEvent,
) -> RuntimeStoreWriteResult {
    events::append_audit_event(state, event, postgres_requested()).await
}

pub(super) async fn list_notification_events_with_store(
    state: &AppState,
) -> RuntimeStoreReadResult<DataOpsNotificationEvent> {
    events::list_notification_events_with_store(state, postgres_requested()).await
}

pub(super) async fn list_notification_events_by_retry_group_with_store(
    state: &AppState,
    retry_group_id: &str,
    limit: usize,
) -> RuntimeStoreReadResult<DataOpsNotificationEvent> {
    events::list_notification_events_by_retry_group_with_store(
        state,
        retry_group_id,
        limit,
        postgres_requested(),
    )
    .await
}

pub(super) async fn append_notification_event(
    state: &AppState,
    event: DataOpsNotificationEvent,
) -> RuntimeStoreWriteResult {
    events::append_notification_event(state, event, postgres_requested()).await
}

pub(super) async fn list_batch_execution_events_with_store(
    state: &AppState,
) -> RuntimeStoreReadResult<DataOpsBatchExecutionRecord> {
    events::list_batch_execution_events_with_store(state, postgres_requested()).await
}

pub(super) async fn append_batch_execution_event(
    state: &AppState,
    event: DataOpsBatchExecutionRecord,
) -> RuntimeStoreWriteResult {
    events::append_batch_execution_event(state, event, postgres_requested()).await
}

pub(super) async fn delete_batch_execution_event(
    state: &AppState,
    event_id: &str,
) -> RuntimeStoreDeleteResult {
    events::delete_batch_execution_event(state, event_id, postgres_requested()).await
}

pub(super) async fn try_acquire_trigger_lock(
    state: &AppState,
    lock_key: &str,
    ttl_ms: i64,
) -> RuntimeLockResult {
    locks::try_acquire_trigger_lock(state, lock_key, ttl_ms, postgres_requested()).await
}

pub(super) async fn try_acquire_slo_cooldown(
    state: &AppState,
    lock_key: &str,
    ttl_ms: i64,
) -> RuntimeLockResult {
    locks::try_acquire_slo_cooldown(state, lock_key, ttl_ms, postgres_requested()).await
}

fn postgres_requested() -> bool {
    resolve_bool_env("DATAOPS_POSTGRES_ENABLED", false)
}
