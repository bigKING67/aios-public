//! Self-hosted dtk v5 sidecar (Evil0ctal/Douyin_TikTok_Download_API).
//!
//! Douyin's detail API now refuses unsigned requests (`403 ... Uifid Not
//! Found`). dtk signs them with a pooled identity; AIOS only asks it for the
//! raw `aweme_detail` and keeps its own stream selection and host allowlist.
//! Douyin's "no such post" ends the lookup (the unsigned fallbacks can only add
//! a misleading 403); every other failure is a miss, so the caller falls
//! through to the direct path.

use std::time::Duration;

use reqwest::{header::ACCEPT, redirect::Policy, Client, Response, StatusCode};
use serde_json::Value;
use tracing::warn;

use crate::config::DouyinDtkSettings;

/// dtk holds the connection up to this long. Kept short: the whole import,
/// including the fallbacks and the video download, shares one browser request.
const DTK_WAIT_SECONDS: u64 = 12;
const DTK_TIMEOUT_SECONDS: u64 = DTK_WAIT_SECONDS + 3;
/// One raw post is a few hundred KB.
const DTK_RESPONSE_MAX_BYTES: u64 = 8 * 1024 * 1024;

/// Douyin's own answer is only trusted for `Detail` and `NotFound`; every other
/// outcome is a miss and the caller falls through to the direct path.
#[derive(Debug)]
pub(super) enum DtkDetail {
    Detail(Value),
    /// Douyin returned no post for the id (deleted, private or taken down).
    NotFound,
    Miss,
}

#[derive(Debug, PartialEq)]
enum DtkFailure {
    /// The task outlived `?wait=`; dtk keeps running it, so asking again collects it.
    Pending(String),
    NotFound(String),
    Other(String),
}

/// A pending task gets this many further `?wait=` rounds before it counts as a miss.
const DTK_PENDING_RETRIES: usize = 1;

pub(super) async fn fetch_douyin_detail_via_dtk(
    settings: &DouyinDtkSettings,
    aweme_id: &str,
) -> DtkDetail {
    let mut pending_retries = DTK_PENDING_RETRIES;
    loop {
        match request_dtk_detail(settings, aweme_id).await {
            Ok(detail) => return DtkDetail::Detail(detail),
            Err(DtkFailure::Pending(reason)) if pending_retries > 0 => {
                pending_retries -= 1;
                warn!(%aweme_id, reason = %reason, "douyin dtk task still running; waiting again");
            }
            Err(DtkFailure::NotFound(reason)) => {
                warn!(%aweme_id, reason = %reason, "douyin dtk reports post not found");
                return DtkDetail::NotFound;
            }
            Err(DtkFailure::Pending(reason) | DtkFailure::Other(reason)) => {
                warn!(%aweme_id, reason = %reason, "douyin dtk sidecar miss");
                return DtkDetail::Miss;
            }
        }
    }
}

async fn request_dtk_detail(
    settings: &DouyinDtkSettings,
    aweme_id: &str,
) -> Result<Value, DtkFailure> {
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(DTK_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| DtkFailure::Other("client build failed".to_string()))?;
    let response = client
        .get(format!("{}/api/v1/douyin/video", settings.base_url))
        .query(&[
            ("aweme_id", aweme_id),
            ("include_raw", "true"),
            ("wait", &DTK_WAIT_SECONDS.to_string()),
        ])
        .header("X-API-Key", settings.api_key.as_str())
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| DtkFailure::Other(format!("request failed: {}", error.without_url())))?;
    let status = response.status();
    let body = read_bounded_body(response)
        .await
        .map_err(|reason| DtkFailure::Other(format!("HTTP {} {reason}", status.as_u16())))?;
    extract_dtk_aweme_detail(status, &body, aweme_id)
}

async fn read_bounded_body(mut response: Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > DTK_RESPONSE_MAX_BYTES)
    {
        return Err("body too large".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("read failed: {}", error.without_url()))?
    {
        if (body.len() + chunk.len()) as u64 > DTK_RESPONSE_MAX_BYTES {
            return Err("body too large".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// The dtk envelope is `{success, data, error, meta}`; a finished `?wait=` call
/// answers 200 with the Content in `data` and the platform payload in `data.raw`.
fn extract_dtk_aweme_detail(
    status: StatusCode,
    body: &[u8],
    aweme_id: &str,
) -> Result<Value, DtkFailure> {
    let envelope: Value = serde_json::from_slice(body)
        .map_err(|_| DtkFailure::Other(format!("HTTP {} non-JSON body", status.as_u16())))?;
    let request_id = envelope
        .pointer("/meta/request_id")
        .and_then(Value::as_str)
        .unwrap_or("-");
    if status == StatusCode::ACCEPTED {
        return Err(DtkFailure::Pending(format!(
            "wait elapsed before task finished (request_id {request_id})"
        )));
    }
    if !status.is_success() || envelope.get("success").and_then(Value::as_bool) != Some(true) {
        let code = envelope
            .pointer("/error/code")
            .and_then(Value::as_str)
            .unwrap_or("UNKNOWN");
        let reason = format!(
            "HTTP {} error {code} (request_id {request_id})",
            status.as_u16()
        );
        return Err(if code == "NOT_FOUND" {
            DtkFailure::NotFound(reason)
        } else {
            DtkFailure::Other(reason)
        });
    }
    let raw = envelope
        .pointer("/data/raw")
        .filter(|value| value.is_object())
        .ok_or_else(|| DtkFailure::Other(format!("no raw detail (request_id {request_id})")))?;
    let raw_id = raw.get("aweme_id").and_then(|value| match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    });
    if raw_id.as_deref() != Some(aweme_id) {
        return Err(DtkFailure::Other(format!(
            "raw detail id mismatch (request_id {request_id})"
        )));
    }
    Ok(raw.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ID: &str = "7380000000000000001";

    fn extract(status: u16, body: Value) -> Result<Value, DtkFailure> {
        extract_dtk_aweme_detail(
            StatusCode::from_u16(status).unwrap(),
            body.to_string().as_bytes(),
            ID,
        )
    }

    #[test]
    fn returns_raw_detail_from_finished_envelope() {
        let detail = extract(
            200,
            json!({
                "success": true,
                "data": {"content_id": ID, "raw": {"aweme_id": ID, "video": {}}},
                "error": null,
                "meta": {"request_id": "r1"}
            }),
        )
        .expect("detail");
        assert_eq!(detail["aweme_id"], ID);
    }

    #[test]
    fn misses_when_wait_elapsed() {
        let error = extract(
            202,
            json!({"success": true, "data": {"task_id": "t", "state": "running"}, "meta": {"request_id": "r2"}}),
        )
        .unwrap_err();
        assert!(
            matches!(&error, DtkFailure::Pending(reason) if reason.contains("wait elapsed")),
            "{error:?}"
        );
    }

    #[test]
    fn misses_with_error_code_on_failure_envelope() {
        let error = extract(
            503,
            json!({"success": false, "data": null, "error": {"code": "NO_IDENTITY", "message": "x"}, "meta": {"request_id": "r3"}}),
        )
        .unwrap_err();
        assert!(
            matches!(&error, DtkFailure::Other(reason) if reason.contains("NO_IDENTITY") && reason.contains("r3")),
            "{error:?}"
        );
    }

    #[test]
    fn reports_not_found_separately() {
        let error = extract(
            404,
            json!({"success": false, "data": null, "error": {"code": "NOT_FOUND", "message": "x"}, "meta": {"request_id": "r4"}}),
        )
        .unwrap_err();
        assert!(matches!(error, DtkFailure::NotFound(_)), "{error:?}");
    }

    #[test]
    fn misses_without_raw_or_on_id_mismatch() {
        assert!(extract(200, json!({"success": true, "data": {"content_id": ID}})).is_err());
        assert!(extract(
            200,
            json!({"success": true, "data": {"raw": {"aweme_id": "1", "video": {}}}})
        )
        .is_err());
        assert!(extract(
            200,
            json!({"success": true, "data": {"raw": {"video": {}}}})
        )
        .is_err());
        assert!(extract_dtk_aweme_detail(StatusCode::OK, b"<html>", ID).is_err());
    }
}
