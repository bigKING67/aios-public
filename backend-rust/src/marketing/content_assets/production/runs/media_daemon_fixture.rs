//! Owned persistent Python worker, with local storage/model adapters only.
use serde_json::Value;
use std::{path::Path, process::Stdio, time::Duration};
use tokio::process::{Child, Command};

pub(super) struct MediaDaemon(Child);
impl MediaDaemon {
    pub(super) fn start(repo: &Path, out: &Path, payload: &Value) -> Self {
        let log = std::fs::File::create(out.join("media-daemon.log")).unwrap();
        Self(Command::new(repo.join("etl/groland_postgres/.venv/bin/python"))
            .env("PYTHONPATH", repo.join("etl/groland_postgres/scripts"))
            .env("AIOS_CAPTION_BRIDGE_OUTPUT", out)
            .env("AIOS_CAPTION_BRIDGE_FIXTURE", payload.to_string())
            .arg(repo.join("etl/groland_postgres/tests/content_production/caption_render_bridge_fixture.py"))
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log))
            .kill_on_drop(true)
            .spawn().unwrap())
    }

    pub(super) async fn wait_receipt(path: &Path) {
        tokio::time::timeout(Duration::from_secs(180), async {
            while !path.exists() {
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        })
        .await
        .expect("persistent worker did not publish receipt; inspect media-daemon.log");
    }

    pub(super) async fn finish(self, out: &Path) {
        self.finish_jobs(out, 2).await;
    }

    pub(super) async fn finish_jobs(mut self, out: &Path, expected: usize) {
        // Observe the same process returning to its real idle loop after both jobs.
        tokio::time::sleep(Duration::from_secs(6)).await;
        assert!(self.0.try_wait().unwrap().is_none());
        let state: Value =
            serde_json::from_slice(&std::fs::read(out.join("daemon-state.json")).unwrap()).unwrap();
        assert_eq!(state["completedJobs"].as_array().unwrap().len(), expected);
        assert!(state["idlePolls"].as_u64().unwrap() > 0);
        assert_eq!(state["pid"].as_u64(), self.0.id().map(u64::from));
        let status = Command::new("/bin/kill")
            .arg("-TERM")
            .arg(self.0.id().unwrap().to_string())
            .status()
            .await
            .unwrap();
        assert!(status.success());
        assert!(tokio::time::timeout(Duration::from_secs(10), self.0.wait())
            .await
            .unwrap()
            .unwrap()
            .success());
        std::fs::write(
            out.join("daemon-shutdown.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "sameProcessCompletedJobs":expected,"idleObserved":true,
                "sigtermExitSuccess":true,"paidCalls":0
            }))
            .unwrap(),
        )
        .unwrap();
    }
}
