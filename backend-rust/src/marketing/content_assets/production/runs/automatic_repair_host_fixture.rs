//! Exercise the production spawn loop, not direct repair steps, in the disposable DB.
use crate::state::AppState;
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

pub(super) struct Host(
    Vec<tokio::task::JoinHandle<()>>,
    Option<super::service_process_fixture::Service>,
);
impl Drop for Host {
    fn drop(&mut self) {
        for task in &self.0 {
            task.abort();
        }
    }
}
impl Host {
    pub(super) async fn start(state: &AppState, out: &std::path::Path) -> Self {
        for flag in 0..3 {
            let mut disabled = state.clone();
            let settings = Arc::make_mut(&mut disabled.settings);
            match flag {
                0 => settings.content_production_enabled = false,
                1 => settings.content_production_runs_enabled = false,
                _ => settings.content_production_planning_enabled = false,
            }
            let tasks = Self(super::planner::spawn(Arc::new(disabled)), None);
            assert!(tasks.0.is_empty(), "disabled host must not spawn");
        }
        if let Ok(binary) = std::env::var("AIOS_TEST_SERVICE_BINARY") {
            return Self(
                vec![],
                Some(super::service_process_fixture::Service::start(state, out, &binary).await),
            );
        }
        let host = Self(super::planner::spawn(Arc::new(state.clone())), None);
        assert_eq!(host.0.len(), 3);
        host
    }

    pub(super) async fn observe_quiet(&self) {
        // At least three normal 2s scan opportunities; this is bounded observation,
        // not a guarantee about long-term uptime or exact scheduling intervals.
        tokio::time::sleep(Duration::from_secs(7)).await;
        assert!(self.0.iter().all(|task| !task.is_finished()));
        if let Some(service) = &self.1 {
            service.check().await;
        }
    }

    pub(super) async fn service_result(&self, run: Uuid) -> Option<Value> {
        match &self.1 {
            Some(service) => Some(service.read_result(run).await),
            None => None,
        }
    }

    pub(super) async fn wait_for_repair(&self, state: &AppState, job: Uuid) {
        tokio::time::timeout(Duration::from_secs(45), async {
            loop {
                assert!(self.0.iter().all(|task| !task.is_finished()));
                let receipt: Option<Value> = sqlx::query_scalar(
                    "SELECT receipt->'host_auto_repair' FROM ads.content_production_jobs WHERE job_id=$1",
                )
                .bind(job)
                .fetch_one(&state.pool)
                .await
                .unwrap();
                if let Some(receipt) = receipt {
                    match receipt["status"].as_str() {
                        Some("production_queued") => break,
                        Some("reserved_outcome_unknown") => {}
                        other => panic!("unexpected background repair result: {other:?}"),
                    }
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        })
        .await
        .expect("spawned repair worker did not queue a revision");
    }
}
