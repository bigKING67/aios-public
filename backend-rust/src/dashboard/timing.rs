use std::time::{Duration, Instant};

use axum::http::HeaderValue;

struct DashboardTimingEntry {
    name: &'static str,
    duration: Duration,
}

pub(super) struct DashboardTiming {
    started_at: Instant,
    entries: Vec<DashboardTimingEntry>,
}

impl DashboardTiming {
    pub(super) fn start() -> Self {
        Self {
            started_at: Instant::now(),
            entries: Vec::new(),
        }
    }

    pub(super) fn mark_elapsed(&mut self, name: &'static str, started_at: Instant) {
        self.entries.push(DashboardTimingEntry {
            name,
            duration: started_at.elapsed(),
        });
    }

    pub(super) fn header_value(&self) -> Option<HeaderValue> {
        let source = format_server_timing(self.entries.as_slice(), self.started_at.elapsed());
        HeaderValue::from_str(source.as_str()).ok()
    }
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

fn format_server_timing(entries: &[DashboardTimingEntry], total: Duration) -> String {
    let mut parts = entries
        .iter()
        .map(|entry| format!("{};dur={:.2}", entry.name, duration_ms(entry.duration)))
        .collect::<Vec<_>>();
    parts.push(format!("total;dur={:.2}", duration_ms(total)));
    parts.join(", ")
}

#[cfg(test)]
mod tests {
    use super::{format_server_timing, DashboardTimingEntry};
    use std::time::Duration;

    #[test]
    fn formats_server_timing_entries() {
        let source = format_server_timing(
            &[
                DashboardTimingEntry {
                    name: "metrics_query",
                    duration: Duration::from_micros(1234),
                },
                DashboardTimingEntry {
                    name: "tree_build",
                    duration: Duration::from_millis(2),
                },
            ],
            Duration::from_micros(3456),
        );

        assert_eq!(
            source,
            "metrics_query;dur=1.23, tree_build;dur=2.00, total;dur=3.46"
        );
    }
}
