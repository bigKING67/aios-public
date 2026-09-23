use std::{collections::HashMap, sync::Arc};

use tracing::info;

pub(super) type CacheFillLockMap = tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>;
pub(super) type CacheRefreshSet = tokio::sync::Mutex<std::collections::HashSet<String>>;

const CACHE_FILL_LOCK_MAP_PRUNE_THRESHOLD: usize = 512;

fn prune_idle_cache_fill_locks(
    lock_map: &mut HashMap<String, Arc<tokio::sync::Mutex<()>>>,
) -> usize {
    if lock_map.len() < CACHE_FILL_LOCK_MAP_PRUNE_THRESHOLD {
        return 0;
    }

    let before = lock_map.len();
    // 仅清理“无等待者、无持有者”的空闲锁（strong_count == 1 代表仅 map 本身持有）
    lock_map.retain(|_, lock| Arc::strong_count(lock) > 1);
    before.saturating_sub(lock_map.len())
}

pub(super) async fn acquire_cache_fill_lock(
    lock_map: &CacheFillLockMap,
    cache_key: &str,
) -> Arc<tokio::sync::Mutex<()>> {
    let mut guard = lock_map.lock().await;
    if let Some(lock) = guard.get(cache_key) {
        return Arc::clone(lock);
    }

    let pruned = prune_idle_cache_fill_locks(&mut guard);
    if pruned > 0 {
        info!(
            cache_fill_lock_count = guard.len(),
            pruned, "cache fill lock map pruned idle entries"
        );
    }

    let lock = Arc::new(tokio::sync::Mutex::new(()));
    guard.insert(cache_key.to_string(), Arc::clone(&lock));
    lock
}

pub(super) async fn try_mark_background_refreshing(
    refresh_set: &CacheRefreshSet,
    cache_key: &str,
) -> bool {
    let mut guard = refresh_set.lock().await;
    if guard.contains(cache_key) {
        return false;
    }

    guard.insert(cache_key.to_string());
    true
}

pub(super) async fn mark_background_refresh_done(refresh_set: &CacheRefreshSet, cache_key: &str) {
    let mut guard = refresh_set.lock().await;
    guard.remove(cache_key);
}
