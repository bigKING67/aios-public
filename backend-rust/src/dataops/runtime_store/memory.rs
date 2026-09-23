use std::collections::HashMap;

use chrono::Utc;
use once_cell::sync::Lazy;
use tokio::sync::RwLock;

use super::{
    MAX_AUDIT_EVENTS, MAX_BATCH_EXECUTION_EVENTS, MAX_NOTIFICATION_EVENTS, MAX_TRACE_LIMIT,
};
use crate::dataops::{
    time::normalize_token,
    types::{DataOpsAuditEvent, DataOpsBatchExecutionRecord, DataOpsNotificationEvent},
};

#[derive(Debug, Default)]
struct DataOpsMemoryStore {
    audit_events: Vec<DataOpsAuditEvent>,
    notification_events: Vec<DataOpsNotificationEvent>,
    batch_executions: Vec<DataOpsBatchExecutionRecord>,
    trigger_locks: HashMap<String, i64>,
    slo_cooldown_locks: HashMap<String, i64>,
}

static DATAOPS_MEMORY_STORE: Lazy<RwLock<DataOpsMemoryStore>> =
    Lazy::new(|| RwLock::new(DataOpsMemoryStore::default()));

pub(super) async fn list_audit_events() -> Vec<DataOpsAuditEvent> {
    let store = DATAOPS_MEMORY_STORE.read().await;
    store
        .audit_events
        .iter()
        .take(MAX_AUDIT_EVENTS)
        .cloned()
        .collect()
}

pub(super) async fn append_audit_event(event: DataOpsAuditEvent) {
    let mut store = DATAOPS_MEMORY_STORE.write().await;
    store.audit_events.insert(0, event);
    if store.audit_events.len() > MAX_AUDIT_EVENTS {
        store.audit_events.truncate(MAX_AUDIT_EVENTS);
    }
}

pub(super) async fn list_notification_events(limit: usize) -> Vec<DataOpsNotificationEvent> {
    let store = DATAOPS_MEMORY_STORE.read().await;
    store
        .notification_events
        .iter()
        .take(limit.clamp(1, MAX_TRACE_LIMIT))
        .cloned()
        .collect()
}

pub(super) async fn list_notification_events_by_retry_group(
    retry_group_id: &str,
    limit: usize,
) -> Vec<DataOpsNotificationEvent> {
    let store = DATAOPS_MEMORY_STORE.read().await;
    let token = normalize_token(retry_group_id);

    store
        .notification_events
        .iter()
        .filter(|event| {
            normalize_token(event.retry_group_id.as_deref().unwrap_or_default()) == token
        })
        .take(limit.clamp(1, MAX_TRACE_LIMIT))
        .cloned()
        .collect()
}

pub(super) async fn append_notification_event(event: DataOpsNotificationEvent) {
    let mut store = DATAOPS_MEMORY_STORE.write().await;
    store.notification_events.insert(0, event);
    if store.notification_events.len() > MAX_NOTIFICATION_EVENTS {
        store.notification_events.truncate(MAX_NOTIFICATION_EVENTS);
    }
}

pub(super) async fn list_batch_execution_events() -> Vec<DataOpsBatchExecutionRecord> {
    let store = DATAOPS_MEMORY_STORE.read().await;
    store
        .batch_executions
        .iter()
        .take(MAX_BATCH_EXECUTION_EVENTS)
        .cloned()
        .collect()
}

pub(super) async fn append_batch_execution_event(event: DataOpsBatchExecutionRecord) {
    let mut store = DATAOPS_MEMORY_STORE.write().await;
    store.batch_executions.insert(0, event);
    if store.batch_executions.len() > MAX_BATCH_EXECUTION_EVENTS {
        store.batch_executions.truncate(MAX_BATCH_EXECUTION_EVENTS);
    }
}

pub(super) async fn delete_batch_execution_event(event_id: &str) -> bool {
    let mut store = DATAOPS_MEMORY_STORE.write().await;
    let prev_len = store.batch_executions.len();
    store
        .batch_executions
        .retain(|event| event.id.trim() != event_id.trim());
    prev_len != store.batch_executions.len()
}

pub(super) async fn try_acquire_lock(lock_key: &str, ttl_ms: i64, slo: bool) -> bool {
    let now = Utc::now().timestamp_millis();

    let mut store = DATAOPS_MEMORY_STORE.write().await;
    let locks = if slo {
        &mut store.slo_cooldown_locks
    } else {
        &mut store.trigger_locks
    };

    locks.retain(|_, expires_at| *expires_at > now);

    if let Some(expires_at) = locks.get(lock_key) {
        if *expires_at > now {
            return false;
        }
    }

    locks.insert(lock_key.to_string(), now + ttl_ms.max(1_000));
    true
}
