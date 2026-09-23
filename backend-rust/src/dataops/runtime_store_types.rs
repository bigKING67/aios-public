pub(super) const STORE_MODE_MEMORY: &str = "memory";
pub(super) const STORE_MODE_POSTGRES: &str = "postgres";

#[derive(Debug, Clone)]
pub(super) struct RuntimeStoreReadResult<T> {
    pub(super) items: Vec<T>,
    pub(super) mode: String,
    pub(super) warning: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct RuntimeStoreWriteResult {
    pub(super) mode: String,
    pub(super) warning: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct RuntimeStoreDeleteResult {
    pub(super) deleted: bool,
    pub(super) mode: String,
    pub(super) warning: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct RuntimeLockResult {
    pub(super) acquired: bool,
    pub(super) mode: String,
    pub(super) warning: Option<String>,
}
