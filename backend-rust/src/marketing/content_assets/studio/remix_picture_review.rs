//! Small public projection of the worker's advisory receipt. Never expose raw logs.
use super::remix_types::{RemixPicturePair, RemixPictureReview};
use serde_json::Value;

pub(super) fn project(
    review: Option<Value>,
    inspected_sha: Option<String>,
) -> Option<RemixPictureReview> {
    let value = review?;
    let incomplete = || RemixPictureReview {
        status: "incomplete".into(),
        pair_count: 0,
        pairs: vec![],
    };
    if value["schema"] != "aios.remix-picture-review.v1"
        || value["deliveryApproved"] != false
        || inspected_sha.as_deref().filter(|s| s.len() == 64).is_none()
        || value["outputSha256"].as_str() != inspected_sha.as_deref()
    {
        return Some(incomplete());
    }
    let status = value["status"].as_str().unwrap_or_default();
    let count = value["pairCount"].as_u64().unwrap_or(u64::MAX);
    let Some(findings) = value["findings"].as_array().filter(|f| f.len() <= 20) else {
        return Some(incomplete());
    };
    let mut pairs = vec![];
    for finding in findings {
        let numbers = [
            finding["left"]["clipOrdinal"].as_u64(),
            finding["right"]["clipOrdinal"].as_u64(),
            finding["left"]["outputStartMs"].as_u64(),
            finding["right"]["outputStartMs"].as_u64(),
        ];
        let [Some(left_clip), Some(right_clip), Some(left_ms), Some(right_ms)] = numbers else {
            return Some(incomplete());
        };
        if !(1..=60).contains(&left_clip)
            || !(left_clip + 1..=60).contains(&right_clip)
            || left_ms >= right_ms
            || right_ms >= 600_000
        {
            return Some(incomplete());
        }
        pairs.push(RemixPicturePair {
            left_clip,
            right_clip,
            left_ms,
            right_ms,
        });
    }
    let valid = match status {
        "review_required" => !pairs.is_empty() && count >= pairs.len() as u64 && count <= 1770,
        "no_findings" | "not_applicable" | "incomplete" => pairs.is_empty() && count == 0,
        _ => false,
    };
    Some(if valid {
        RemixPictureReview {
            status: status.into(),
            pair_count: count,
            pairs,
        }
    } else {
        incomplete()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn receipt_projection_is_bound_and_does_not_leak_private_fields() {
        let sha = "a".repeat(64);
        let mut value = json!({"schema":"aios.remix-picture-review.v1", "deliveryApproved":false,
            "status":"review_required", "outputSha256":sha, "pairCount":1,
            "findings":[{"left":{"clipOrdinal":2,"outputStartMs":127500},
                "right":{"clipOrdinal":3,"outputStartMs":133000}}], "private":"secret-path"});
        let actual = project(Some(value.clone()), Some(sha.clone())).unwrap();
        assert_eq!(actual.status, "review_required");
        assert_eq!(actual.pairs[0].right_ms, 133000);
        assert!(!serde_json::to_string(&actual)
            .unwrap()
            .contains("secret-path"));
        assert_eq!(
            project(Some(value.clone()), Some("b".repeat(64)))
                .unwrap()
                .status,
            "incomplete"
        );
        value["findings"][0]["right"]["outputStartMs"] = json!(700000);
        assert_eq!(
            project(Some(value), Some(sha)).unwrap().status,
            "incomplete"
        );
        assert!(project(None, None).is_none());
    }

    #[test]
    fn inconsistent_or_unknown_results_never_look_clear() {
        for status in ["no_findings", "future", "review_required"] {
            let value = json!({"schema":"aios.remix-picture-review.v1", "deliveryApproved":false,
                "status":status, "outputSha256":"a".repeat(64), "pairCount":1, "findings":[]});
            assert_eq!(
                project(Some(value), Some("a".repeat(64))).unwrap().status,
                "incomplete"
            );
        }
    }
}
