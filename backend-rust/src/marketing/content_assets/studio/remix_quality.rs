//! Project host QC into bounded, safe review information, never into delivery authorization.
use super::remix_types::{RemixQc, RemixQcFreezeEvent, RemixQcReport, RemixQcTimestampGap};
use serde_json::Value;

pub(super) fn project(
    receipt: Option<Value>,
    inspected_sha: Option<String>,
    waiting_reason: Option<&str>,
) -> Option<RemixQc> {
    let blocked = matches!(
        waiting_reason,
        Some("remix_qc_failed" | "remix_qc_incomplete" | "remix_qc_sources_changed")
    );
    let Some(receipt) = receipt.filter(|v| v["schema"] == "aios.remix-qc.v1") else {
        return blocked.then(incomplete);
    };
    let checks = &receipt["checks"];
    let bound = inspected_sha.as_deref().is_some_and(|sha| {
        sha.len() == 64
            && sha.bytes().all(|b| b.is_ascii_hexdigit())
            && receipt["outputSha256"].as_str() == Some(sha)
    });
    let all_passed = ["timing", "freeze", "pictures", "sources"]
        .iter()
        .all(|key| checks[*key]["status"] == "passed");
    let status = match receipt["status"].as_str() {
        Some("passed") if bound && all_passed && !blocked => "passed",
        Some("failed") => "failed",
        _ => "incomplete",
    };
    let freeze_count = checks["freeze"]["events"].as_array().map_or(0, |events| {
        events.iter().filter(|e| e["sourceExempt"] != true).count() as u64
    });
    let timestamp_gap_count = checks["timing"]["timestampGapCount"].as_u64().unwrap_or(0);
    let duplicate_pair_count = checks["pictures"]["pairCount"].as_u64().unwrap_or(0);
    let max_av_offset_ms = ["audioStartOffsetMs", "audioEndOffsetMs"]
        .iter()
        .filter_map(|key| checks["timing"][*key].as_f64())
        .map(f64::abs)
        .reduce(f64::max);
    let source_status = match checks["sources"]["status"].as_str() {
        Some("passed") => "passed",
        Some("failed") => "failed",
        _ => "incomplete",
    };
    let source_changed = waiting_reason == Some("remix_qc_sources_changed");
    let mut result = RemixQc {
        status: if source_changed { "failed" } else { status }.into(),
        reasons: Vec::new(),
        freeze_count,
        timestamp_gap_count,
        duplicate_pair_count,
        max_av_offset_ms,
        source_status: if source_changed {
            "failed"
        } else {
            source_status
        }
        .into(),
        report: Some(report(&receipt)),
    };
    let av_limit = receipt["thresholds"]["av_offset_seconds"]
        .as_f64()
        .unwrap_or(0.1)
        * 1000.0;
    for (reason, applies) in [
        ("frame_freeze", freeze_count > 0),
        ("timestamp_gap", timestamp_gap_count > 0),
        (
            "av_offset",
            max_av_offset_ms.is_some_and(|n| n > av_limit + 0.001),
        ),
        ("duplicate_picture", duplicate_pair_count > 0),
        (
            "source_changed",
            source_changed || source_status == "failed",
        ),
        (
            "technical_inspection",
            receipt["errorStage"] == "technical_inspection",
        ),
    ] {
        if applies {
            result.reasons.push(reason.into());
        }
    }
    if result.status != "passed" && result.reasons.is_empty() {
        result.reasons.push("incomplete".into());
    }
    Some(result)
}

fn incomplete() -> RemixQc {
    RemixQc {
        status: "incomplete".into(),
        reasons: vec!["incomplete".into()],
        freeze_count: 0,
        timestamp_gap_count: 0,
        duplicate_pair_count: 0,
        max_av_offset_ms: None,
        source_status: "incomplete".into(),
        report: None,
    }
}

fn report(receipt: &Value) -> RemixQcReport {
    let checks = &receipt["checks"];
    let thresholds = &receipt["thresholds"];
    let status = |key: &str| match checks[key]["status"].as_str() {
        Some("passed") => "passed".into(),
        Some("failed") => "failed".into(),
        _ => "incomplete".into(),
    };
    let freeze_events = checks["freeze"]["events"].as_array();
    RemixQcReport {
        timing_status: status("timing"),
        freeze_status: status("freeze"),
        picture_status: status("pictures"),
        frame_count: checks["timing"]["frameCount"].as_u64(),
        audio_start_offset_ms: checks["timing"]["audioStartOffsetMs"].as_f64(),
        audio_end_offset_ms: checks["timing"]["audioEndOffsetMs"].as_f64(),
        freeze_threshold_ms: thresholds["freeze_seconds"].as_f64().map(|v| v * 1000.0),
        av_offset_threshold_ms: thresholds["av_offset_seconds"].as_f64().map(|v| v * 1000.0),
        pts_gap_threshold_ms: thresholds["pts_gap_seconds"].as_f64().map(|v| v * 1000.0),
        freeze_noise_db: thresholds["freeze_noise_db"].as_f64(),
        picture_max_distance: thresholds["picture_max_distance"].as_f64(),
        picture_min_texture: thresholds["picture_min_texture"].as_f64(),
        checked_segments: checks["sources"]["checkedSegments"].as_u64(),
        error_stage: receipt["errorStage"]
            .as_str()
            .filter(|s| {
                matches!(
                    *s,
                    "binding"
                        | "timing"
                        | "freeze"
                        | "pictures"
                        | "sources"
                        | "technical_inspection"
                )
            })
            .map(str::to_owned),
        freeze_event_count: freeze_events.map_or(0, Vec::len),
        freeze_events: freeze_events
            .into_iter()
            .flatten()
            .take(20)
            .filter_map(|event| {
                Some(RemixQcFreezeEvent {
                    start_ms: event["startMs"].as_f64()?,
                    end_ms: event["endMs"].as_f64()?,
                    source_exempt: event["sourceExempt"] == true,
                })
            })
            .collect(),
        timestamp_gaps: checks["timing"]["timestampGaps"]
            .as_array()
            .into_iter()
            .flatten()
            .take(20)
            .filter_map(|gap| {
                Some(RemixQcTimestampGap {
                    frame: gap["frame"].as_u64()?,
                    delta_ms: gap["deltaMs"].as_f64()?,
                })
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn passed() -> Value {
        json!({"schema":"aios.remix-qc.v1","status":"passed","outputSha256":"a".repeat(64),
        "checks":{"timing":{"status":"passed","audioStartOffsetMs":0,"audioEndOffsetMs":1},
        "freeze":{"status":"passed","events":[]},"pictures":{"status":"passed","pairCount":0},"sources":{"status":"passed"}}})
    }

    #[test]
    fn old_or_unbound_receipts_never_look_passed() {
        assert!(project(None, None, None).is_none());
        assert_eq!(
            project(None, None, Some("remix_qc_incomplete"))
                .unwrap()
                .status,
            "incomplete"
        );
        assert_eq!(
            project(Some(passed()), None, None).unwrap().status,
            "incomplete"
        );
        let mut value = passed();
        value["checks"]["freeze"] = Value::Null;
        assert_eq!(
            project(Some(value), Some("a".repeat(64)), None)
                .unwrap()
                .status,
            "incomplete"
        );
        assert_eq!(
            project(Some(passed()), Some("a".repeat(64)), None)
                .unwrap()
                .status,
            "passed"
        );
    }

    #[test]
    fn changed_after_qc_overrides_pass_and_exposes_no_raw_receipt() {
        let result = project(
            Some(passed()),
            Some("a".repeat(64)),
            Some("remix_qc_sources_changed"),
        )
        .unwrap();
        assert_eq!(result.status, "failed");
        assert_eq!(result.reasons, ["source_changed"]);
        let mut value = passed();
        value["status"] = json!("failed");
        value["checks"]["freeze"]["events"] = json!([{"sourceExempt":false},{"sourceExempt":true}]);
        value["checks"]["pictures"]["pairCount"] = json!(2);
        value["privateUrl"] = json!("https://private/secret");
        let result = project(Some(value), Some("a".repeat(64)), None).unwrap();
        assert_eq!(result.freeze_count, 1);
        assert_eq!(result.duplicate_pair_count, 2);
        assert!(!serde_json::to_string(&result).unwrap().contains("secret"));
    }

    #[test]
    fn report_keeps_positions_and_thresholds_bounded_without_raw_fields() {
        let mut value = passed();
        value["thresholds"] =
            json!({"freeze_seconds":0.2,"av_offset_seconds":0.1,"pts_gap_seconds":0.05});
        value["checks"]["freeze"]["events"] = json!((0..25)
            .map(|n| json!({
            "startMs":n*1000,"endMs":n*1000+250,"sourceExempt":n==0,
            "parts":[{"sourceUrl":"https://private/secret"}]}))
            .collect::<Vec<_>>());
        value["checks"]["timing"]["timestampGaps"] = json!([{"frame":7,"deltaMs":100}]);
        value["errorStage"] = json!("https://private/secret");
        let result = project(Some(value), Some("a".repeat(64)), None).unwrap();
        let report = result.report.as_ref().unwrap();
        assert_eq!(report.freeze_event_count, 25);
        assert_eq!(report.freeze_events.len(), 20);
        assert_eq!(report.freeze_events[1].start_ms, 1000.0);
        assert!(report.freeze_events[0].source_exempt);
        assert_eq!(report.timestamp_gaps[0].frame, 7);
        assert_eq!(report.freeze_threshold_ms, Some(200.0));
        assert!(report.error_stage.is_none());
        assert!(!serde_json::to_string(&result).unwrap().contains("secret"));
    }
}
