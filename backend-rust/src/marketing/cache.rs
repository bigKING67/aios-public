use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::{Mutex, RwLock};

use super::types::CreatorLibraryFilterOptions;

const CREATOR_LIBRARY_FILTER_OPTIONS_CACHE_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Default)]
pub(crate) struct CreatorLibraryFilterOptionsCache {
    inner: Arc<RwLock<Option<CreatorLibraryFilterOptionsCacheEntry>>>,
    refresh_lock: Arc<Mutex<()>>,
    epoch: Arc<RwLock<u64>>,
}

#[derive(Clone)]
struct CreatorLibraryFilterOptionsCacheEntry {
    options: CreatorLibraryFilterOptions,
    expires_at: Instant,
}

impl CreatorLibraryFilterOptionsCache {
    pub(crate) async fn get(&self) -> Option<CreatorLibraryFilterOptions> {
        let guard = self.inner.read().await;
        let entry = guard.as_ref()?;
        if Instant::now() < entry.expires_at {
            return Some(entry.options.clone());
        }
        None
    }

    pub(crate) async fn current_epoch(&self) -> u64 {
        *self.epoch.read().await
    }

    pub(crate) async fn set_if_current(
        &self,
        options: CreatorLibraryFilterOptions,
        refresh_epoch: u64,
    ) {
        if self.current_epoch().await != refresh_epoch {
            return;
        }
        let mut guard = self.inner.write().await;
        if self.current_epoch().await != refresh_epoch {
            return;
        }
        *guard = Some(CreatorLibraryFilterOptionsCacheEntry {
            options,
            expires_at: Instant::now() + CREATOR_LIBRARY_FILTER_OPTIONS_CACHE_TTL,
        });
    }

    pub(crate) async fn invalidate(&self) {
        let mut epoch_guard = self.epoch.write().await;
        *epoch_guard = epoch_guard.saturating_add(1);
        let mut guard = self.inner.write().await;
        *guard = None;
    }

    pub(crate) async fn lock_refresh(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.refresh_lock.lock().await
    }
}
