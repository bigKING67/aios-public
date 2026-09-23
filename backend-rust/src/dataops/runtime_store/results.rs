use super::super::runtime_store_types::{
    RuntimeStoreDeleteResult, RuntimeStoreReadResult, RuntimeStoreWriteResult, STORE_MODE_MEMORY,
    STORE_MODE_POSTGRES,
};

pub(super) fn postgres_write_result() -> RuntimeStoreWriteResult {
    RuntimeStoreWriteResult {
        mode: STORE_MODE_POSTGRES.to_string(),
        warning: None,
    }
}

pub(super) fn memory_write_result() -> RuntimeStoreWriteResult {
    RuntimeStoreWriteResult {
        mode: STORE_MODE_MEMORY.to_string(),
        warning: None,
    }
}

pub(super) fn memory_write_fallback_result(message: String) -> RuntimeStoreWriteResult {
    RuntimeStoreWriteResult {
        mode: STORE_MODE_MEMORY.to_string(),
        warning: Some(message),
    }
}

pub(super) fn postgres_delete_result(deleted: bool) -> RuntimeStoreDeleteResult {
    RuntimeStoreDeleteResult {
        deleted,
        mode: STORE_MODE_POSTGRES.to_string(),
        warning: None,
    }
}

pub(super) fn memory_delete_result(deleted: bool) -> RuntimeStoreDeleteResult {
    RuntimeStoreDeleteResult {
        deleted,
        mode: STORE_MODE_MEMORY.to_string(),
        warning: None,
    }
}

pub(super) fn memory_delete_fallback_result(
    deleted: bool,
    message: String,
) -> RuntimeStoreDeleteResult {
    RuntimeStoreDeleteResult {
        deleted,
        mode: STORE_MODE_MEMORY.to_string(),
        warning: Some(message),
    }
}

pub(super) fn postgres_read_result<T>(items: Vec<T>) -> RuntimeStoreReadResult<T> {
    RuntimeStoreReadResult {
        items,
        mode: STORE_MODE_POSTGRES.to_string(),
        warning: None,
    }
}

pub(super) fn memory_read_result<T>(items: Vec<T>) -> RuntimeStoreReadResult<T> {
    RuntimeStoreReadResult {
        items,
        mode: STORE_MODE_MEMORY.to_string(),
        warning: None,
    }
}

pub(super) fn memory_read_fallback_result<T>(
    items: Vec<T>,
    message: String,
) -> RuntimeStoreReadResult<T> {
    RuntimeStoreReadResult {
        items,
        mode: STORE_MODE_MEMORY.to_string(),
        warning: Some(message),
    }
}
