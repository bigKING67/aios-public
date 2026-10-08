//! Pure validation for AI 创作中心 segments. Database-dependent checks
//! (permissions, overlap, preset status, content hash) live in `repository`.
use super::types::{ContentSegmentListQuery, SegmentPresetLabel};
use crate::error::{AppError, AppResult};

pub(super) const DEFAULT_LIST_LIMIT: i64 = 50;
pub(super) const MAX_LIST_LIMIT: i64 = 200;
pub(super) const MAX_CONFIRM_ITEMS: usize = 200;
const MAX_PRODUCT_NAME_CHARS: usize = 200;
const MAX_KEY_CHARS: usize = 64;

pub(super) const STATUSES: [&str; 4] = ["suggested", "confirmed", "rejected", "stale"];
/// Statuses a client may set; `stale` is only assigned by the server.
pub(super) const CLIENT_STATUSES: [&str; 3] = ["suggested", "confirmed", "rejected"];
pub(super) const ORIGINS: [&str; 2] = ["ai", "human"];

pub(super) fn validate_range(
    start_ms: i32,
    end_ms: i32,
    duration_ms: Option<i32>,
) -> AppResult<()> {
    if start_ms < 0 || end_ms <= start_ms {
        return Err(AppError::bad_request(
            "片段起止时间无效：需 0 ≤ 开始 < 结束",
        ));
    }
    if duration_ms.is_some_and(|duration| end_ms > duration) {
        return Err(AppError::bad_request("片段结束时间超出原片时长"));
    }
    Ok(())
}

/// Asset durations are stored in seconds; convert with floor so a segment can
/// never extend past the last whole millisecond. Unknown or invalid → None.
pub(super) fn duration_ms(duration_seconds: Option<f64>) -> Option<i32> {
    duration_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| (value * 1000.0).floor())
        .filter(|value| *value >= 1.0 && *value <= f64::from(i32::MAX))
        .map(|value| value as i32)
}

pub(super) fn normalize_sha256(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit()))
        .map(str::to_ascii_lowercase)
}

/// Returns `Ok(None)` for blank input (clear / inherit), trimmed text otherwise.
pub(super) fn normalize_product_name(value: Option<&str>) -> AppResult<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value.chars().count() > MAX_PRODUCT_NAME_CHARS || value.chars().any(char::is_control) {
        return Err(AppError::bad_request("产品名称过长或包含控制字符"));
    }
    Ok(Some(value.to_string()))
}

pub(super) fn validate_key(value: &str, field: &str) -> AppResult<()> {
    let valid = !value.is_empty()
        && value.len() <= MAX_KEY_CHARS
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_');
    if valid {
        Ok(())
    } else {
        Err(AppError::bad_request(format!("{field} 格式无效")))
    }
}

pub(super) fn ensure_label(labels: &[SegmentPresetLabel], label_key: &str) -> AppResult<()> {
    if labels.iter().any(|label| label.key == label_key) {
        Ok(())
    } else {
        Err(AppError::bad_request("标签不属于该分类预设版本"))
    }
}

pub(super) fn validate_client_status(status: &str) -> AppResult<()> {
    if CLIENT_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(AppError::bad_request(
            "状态只能设为 suggested、confirmed 或 rejected",
        ))
    }
}

pub(super) fn list_limit(query: &ContentSegmentListQuery) -> AppResult<i64> {
    let limit = query.limit.unwrap_or(DEFAULT_LIST_LIMIT);
    if !(1..=MAX_LIST_LIMIT).contains(&limit) {
        return Err(AppError::bad_request("limit 取值范围为 1–200"));
    }
    if let Some(status) = query.status.as_deref() {
        if !STATUSES.contains(&status) {
            return Err(AppError::bad_request("未知的片段状态"));
        }
    }
    if let Some(origin) = query.origin.as_deref() {
        if !ORIGINS.contains(&origin) {
            return Err(AppError::bad_request("片段来源只能是 ai 或 human"));
        }
    }
    for (value, field) in [
        (query.preset_key.as_deref(), "presetKey"),
        (query.label_key.as_deref(), "labelKey"),
    ] {
        if let Some(value) = value {
            validate_key(value, field)?;
        }
    }
    Ok(limit)
}

/// Half-open interval intersection, matching PostgreSQL `int4range(start, end)`.
pub(super) fn overlaps(a: (i32, i32), b: (i32, i32)) -> bool {
    a.0 < b.1 && b.0 < a.1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_label_min_duration_is_optional() {
        let with: SegmentPresetLabel = serde_json::from_value(serde_json::json!({
            "key": "live_demo", "name": "实拍内容", "definition": "", "minDurationSec": 30
        }))
        .unwrap();
        assert_eq!(with.min_duration_sec, Some(30.0));
        let without: SegmentPresetLabel = serde_json::from_value(serde_json::json!({
            "key": "promotion", "name": "机制", "definition": ""
        }))
        .unwrap();
        assert_eq!(without.min_duration_sec, None);
        assert_eq!(
            serde_json::to_value(&without).unwrap(),
            serde_json::json!({"key": "promotion", "name": "机制", "definition": ""})
        );
    }

    fn label(key: &str) -> SegmentPresetLabel {
        SegmentPresetLabel {
            key: key.into(),
            name: key.into(),
            definition: String::new(),
            min_duration_sec: None,
        }
    }

    #[test]
    fn range_requires_ordered_non_negative_bounds_within_known_duration() {
        assert!(validate_range(0, 1, None).is_ok());
        assert!(validate_range(0, 5000, Some(5000)).is_ok());
        assert!(validate_range(-1, 10, None).is_err());
        assert!(validate_range(10, 10, None).is_err());
        assert!(validate_range(20, 10, None).is_err());
        assert!(validate_range(0, 5001, Some(5000)).is_err());
        // Unknown duration is allowed; callers persist sourceDurationMs=null.
        assert!(validate_range(0, i32::MAX, None).is_ok());
    }

    #[test]
    fn duration_conversion_floors_and_rejects_invalid_values() {
        assert_eq!(duration_ms(Some(2.5009)), Some(2500));
        assert_eq!(duration_ms(Some(0.0)), None);
        assert_eq!(duration_ms(Some(-3.0)), None);
        assert_eq!(duration_ms(Some(f64::NAN)), None);
        assert_eq!(duration_ms(Some(1e12)), None);
        assert_eq!(duration_ms(None), None);
    }

    #[test]
    fn sha_and_product_normalization() {
        let upper = "A".repeat(64);
        assert_eq!(normalize_sha256(Some(&upper)), Some("a".repeat(64)));
        assert_eq!(normalize_sha256(Some("abc")), None);
        assert_eq!(normalize_sha256(Some(&"g".repeat(64))), None);
        assert_eq!(normalize_product_name(Some("  ")).unwrap(), None);
        assert_eq!(
            normalize_product_name(Some(" 精华 ")).unwrap().as_deref(),
            Some("精华")
        );
        assert!(normalize_product_name(Some(&"x".repeat(201))).is_err());
        assert!(normalize_product_name(Some("a\u{0007}b")).is_err());
    }

    #[test]
    fn keys_labels_and_statuses() {
        assert!(validate_key("framework", "presetKey").is_ok());
        assert!(validate_key("Framework", "presetKey").is_err());
        assert!(validate_key("", "presetKey").is_err());
        assert!(ensure_label(&[label("koc")], "koc").is_ok());
        assert!(ensure_label(&[label("koc")], "promotion").is_err());
        assert!(validate_client_status("confirmed").is_ok());
        assert!(validate_client_status("stale").is_err());
    }

    #[test]
    fn list_query_bounds() {
        let mut query = ContentSegmentListQuery::default();
        assert_eq!(list_limit(&query).unwrap(), DEFAULT_LIST_LIMIT);
        query.limit = Some(201);
        assert!(list_limit(&query).is_err());
        query.limit = Some(0);
        assert!(list_limit(&query).is_err());
        query.limit = Some(200);
        query.status = Some("bogus".into());
        assert!(list_limit(&query).is_err());
        query.status = Some("stale".into());
        assert!(list_limit(&query).is_ok());
        query.origin = Some("model".into());
        assert!(list_limit(&query).is_err());
        query.origin = Some("AI".into());
        assert!(list_limit(&query).is_err());
        for origin in ORIGINS {
            query.origin = Some(origin.into());
            assert!(list_limit(&query).is_ok());
        }
    }

    #[test]
    fn half_open_overlap() {
        assert!(overlaps((0, 10), (5, 15)));
        assert!(!overlaps((0, 10), (10, 20)));
        assert!(overlaps((0, 10), (0, 10)));
        assert!(!overlaps((20, 30), (0, 10)));
    }
}
