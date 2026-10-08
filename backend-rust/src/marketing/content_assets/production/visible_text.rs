//! Read-boundary validation of stored model observations. No erase authorization.
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Analysis {
    coverage: String,
    observations: Vec<Observation>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation {
    start_ms: u32,
    end_ms: u32,
    text: String,
    role: String,
    r#box: Option<[f64; 4]>,
    confidence: f64,
}

pub(super) fn for_segment(value: Value, start: u32, end: u32, duration_ms: f64) -> Value {
    let unavailable = |status| {
        json!({"status":status,"observations":[],"erasureAuthorized":false,
        "selectionAdvice":advice(&[], &[], false)})
    };
    if value.is_null() {
        return unavailable("missing");
    }
    let Ok(analysis) = serde_json::from_value::<Analysis>(value) else {
        return unavailable("invalid");
    };
    if !["partial", "unknown"].contains(&analysis.coverage.as_str())
        || analysis.observations.len() > 32
        || !duration_ms.is_finite()
        || start >= end
        || f64::from(end) > duration_ms
    {
        return unavailable("invalid");
    }
    let mut observations = Vec::new();
    let mut source_roles = Vec::new();
    let mut candidate_roles = Vec::new();
    for item in analysis.observations {
        if item.start_ms >= item.end_ms
            || f64::from(item.end_ms) > duration_ms
            || item.text.trim().is_empty()
            || item.text.chars().count() > 300
            || ![
                "dialogue_subtitle",
                "promotion",
                "packaging",
                "brand_mark",
                "other",
                "unknown",
            ]
            .contains(&item.role.as_str())
            || !item.confidence.is_finite()
            || !(0.0..=1.0).contains(&item.confidence)
            || item.r#box.is_some_and(|b| {
                b.iter().any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
                    || b[2] <= 0.0
                    || b[3] <= 0.0
                    || b[0] + b[2] > 1.0
                    || b[1] + b[3] > 1.0
            })
        {
            return unavailable("invalid");
        }
        source_roles.push(item.role.clone());
        let lo = start.max(item.start_ms);
        let hi = end.min(item.end_ms);
        if lo < hi {
            candidate_roles.push(item.role.clone());
            observations.push(
                json!({"sourceStartMs":item.start_ms,"sourceEndMs":item.end_ms,
                "candidateStartMs":lo-start,"candidateEndMs":hi-start,"text":item.text,
                "role":item.role,"box":item.r#box,"confidence":item.confidence}),
            );
        }
    }
    json!({"status":"model_observed","coverage":analysis.coverage,"observations":observations,
        "textFreeVerified":false,"erasureAuthorized":false,"coordinateSpace":"source-normalized-top-left",
        "selectionAdvice":advice(&candidate_roles, &source_roles, true)})
}

// Input comes only from for_segment, which retains absolute observation times.
// Narrowing a render window never upgrades approximate observations to clean proof.
pub(super) fn for_window(value: &Value, start: u32, end: u32) -> Value {
    let mut narrowed = value.clone();
    if value["status"] != "model_observed" || start >= end {
        return narrowed;
    }
    let mut roles = Vec::new();
    let observations = value["observations"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, item)| {
            let lo = u64::from(start).max(item["sourceStartMs"].as_u64()?);
            let hi = u64::from(end).min(item["sourceEndMs"].as_u64()?);
            if lo >= hi {
                return None;
            }
            roles.push(item["role"].as_str()?.to_owned());
            let mut mapped = item.clone();
            mapped["observationIndex"] = json!(index);
            mapped["candidateStartMs"] = json!(lo - u64::from(start));
            mapped["candidateEndMs"] = json!(hi - u64::from(start));
            Some(mapped)
        })
        .collect::<Vec<_>>();
    let source_roles = value["selectionAdvice"]["sourceConflictRoles"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    narrowed["observations"] = json!(observations);
    narrowed["selectionAdvice"] = advice(&roles, &source_roles, true);
    narrowed["windowSourceStartMs"] = json!(start);
    narrowed["windowSourceEndMs"] = json!(end);
    narrowed
}

// Approximate observations identify review needs, never frame-accurate approval.
pub(super) fn dialogue_boundary_status(window: &Value) -> &'static str {
    let observations: Vec<_> = window["observations"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|o| o["role"] == "dialogue_subtitle")
        .collect();
    if observations.is_empty() {
        return "unavailable";
    }
    if observations
        .iter()
        .any(|o| o["text"] != observations[0]["text"])
    {
        return "multiple_texts_require_review";
    }
    let (Some(start), Some(end)) = (
        window["windowSourceStartMs"].as_u64(),
        window["windowSourceEndMs"].as_u64(),
    ) else {
        return "unavailable";
    };
    let mut ranges: Vec<_> = observations
        .iter()
        .filter_map(|o| Some((o["sourceStartMs"].as_u64()?, o["sourceEndMs"].as_u64()?)))
        .collect();
    ranges.sort_unstable();
    let mut covered = start;
    for (lo, hi) in ranges {
        if lo > covered {
            return "partial_range_requires_review";
        }
        covered = covered.max(hi);
    }
    if covered < end {
        "partial_range_requires_review"
    } else {
        "single_text_model_estimated"
    }
}

// Do not repeat full text and geometry for every slot; refer to candidate evidence.
pub(super) fn window_references(value: &Value, start: u32, end: u32) -> Value {
    let window = for_window(value, start, end);
    let references = window["observations"].as_array().into_iter().flatten().map(|o| {
        json!({"observationIndex":o["observationIndex"],"startMs":o["candidateStartMs"],"endMs":o["candidateEndMs"]})
    }).collect::<Vec<_>>();
    json!({"status":window["status"],"observationReferences":references,
        "textFreeVerified":false,"timingPrecision":"model_estimated",
        "dialogueBoundaryStatus":dialogue_boundary_status(&window)})
}

// Rank neither missing nor empty observations as cleaner than observed text.
// Full-source context remains visible because model times are approximate.
fn advice(candidate: &[String], source: &[String], available: bool) -> Value {
    let conflicts = |roles: &[String]| {
        ["dialogue_subtitle", "promotion"]
            .into_iter()
            .filter(|role| roles.iter().any(|r| r == role))
            .collect::<Vec<_>>()
    };
    let candidate_conflicts = conflicts(candidate);
    let source_conflicts = conflicts(source);
    let protected = ["packaging", "brand_mark"]
        .into_iter()
        .filter(|role| candidate.iter().any(|r| r == role))
        .collect::<Vec<_>>();
    let mut steps = vec!["verify_remaining_source_text_scope"];
    if candidate.iter().any(|r| r == "dialogue_subtitle") {
        steps.push("compare_caption_with_current_narration");
        steps.push("prefer_compatible_alternative_or_preserve_source");
    }
    if candidate.iter().any(|r| r == "promotion") {
        steps.push("check_promotion_against_current_business_facts");
    }
    if !protected.is_empty() {
        steps.push("protect_product_and_brand_text");
    }
    if candidate.iter().any(|r| r == "other" || r == "unknown") {
        steps.push("classify_unresolved_visible_text");
    }
    json!({"handlingSteps":steps,"action":if !candidate_conflicts.is_empty() {"compare_alternatives"} else {"inspect_before_replacement"},
        "candidateConflictRoles":candidate_conflicts,"sourceConflictRoles":source_conflicts,
        "protectedRoles":protected,"evidenceAvailable":available,
        "cleanStatus":"unverified","timingPrecision":"model_estimated",
        "geometryPrecision":"model_estimated","erasureAuthorized":false})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn value() -> Value {
        json!({"coverage":"partial","observations":[{"start_ms":500,"end_ms":1500,
            "text":"活动价","role":"promotion","box":[0.1,0.1,0.5,0.1],"confidence":0.9}]})
    }
    #[test]
    fn clips_observation_to_candidate_but_keeps_source_time() {
        let result = for_segment(value(), 1000, 3000, 4000.0);
        assert_eq!(result["observations"][0]["sourceStartMs"], 500);
        assert_eq!(result["observations"][0]["candidateStartMs"], 0);
        assert_eq!(result["observations"][0]["candidateEndMs"], 500);
        assert_eq!(result["erasureAuthorized"], false);
    }
    #[test]
    fn no_overlap_or_missing_is_never_clean_proof() {
        let result = for_segment(value(), 2000, 3000, 4000.0);
        assert_eq!(result["observations"], json!([]));
        assert_eq!(result["textFreeVerified"], false);
        assert_eq!(
            for_segment(Value::Null, 0, 1000, 4000.0)["status"],
            "missing"
        );
    }
    #[test]
    fn out_of_source_range_or_bad_geometry_invalidates_evidence() {
        assert_eq!(for_segment(value(), 0, 1000, 1200.0)["status"], "invalid");
        let mut bad = value();
        bad["observations"][0]["box"] = json!([0.9, 0.0, 0.5, 0.1]);
        assert_eq!(for_segment(bad, 0, 1000, 4000.0)["status"], "invalid");
    }
    #[test]
    fn conflict_advice_and_protected_packaging_are_separate() {
        let mut input = value();
        let mut packaging = input["observations"][0].clone();
        packaging["role"] = json!("packaging");
        input["observations"]
            .as_array_mut()
            .unwrap()
            .push(packaging.clone());
        let result = for_segment(input, 1000, 2000, 4000.0);
        assert_eq!(result["selectionAdvice"]["action"], "compare_alternatives");
        assert_eq!(
            result["selectionAdvice"]["protectedRoles"],
            json!(["packaging"])
        );
        let result = for_segment(
            json!({"coverage":"partial","observations":[packaging]}),
            1000,
            2000,
            4000.0,
        );
        assert_eq!(
            result["selectionAdvice"]["action"],
            "inspect_before_replacement"
        );
        assert_eq!(
            result["selectionAdvice"]["candidateConflictRoles"],
            json!([])
        );
        assert_eq!(result["selectionAdvice"]["cleanStatus"], "unverified");
    }
    #[test]
    fn handling_steps_separate_dialogue_promotion_and_unknown() {
        let mut input = value();
        for role in ["dialogue_subtitle", "packaging", "unknown"] {
            let mut item = input["observations"][0].clone();
            item["role"] = json!(role);
            input["observations"].as_array_mut().unwrap().push(item);
        }
        let result = for_segment(input, 500, 1500, 4000.0);
        let steps = result["selectionAdvice"]["handlingSteps"]
            .as_array()
            .unwrap();
        for expected in [
            "compare_caption_with_current_narration",
            "check_promotion_against_current_business_facts",
            "protect_product_and_brand_text",
            "classify_unresolved_visible_text",
        ] {
            assert!(steps.contains(&json!(expected)));
        }
        for input in [Value::Null, json!({"coverage":"partial","observations":[]})] {
            let result = for_segment(input, 500, 1500, 4000.0);
            assert_eq!(
                result["selectionAdvice"]["handlingSteps"],
                json!(["verify_remaining_source_text_scope"])
            );
            assert_eq!(result["selectionAdvice"]["cleanStatus"], "unverified");
        }
    }
    #[test]
    fn consumed_window_excludes_later_copy_but_keeps_source_risk() {
        let input = json!({"coverage":"partial","observations":[
            {"start_ms":22000,"end_ms":23600,"text":"泡沫绵密","role":"dialogue_subtitle","box":null,"confidence":0.9},
            {"start_ms":23700,"end_ms":24000,"text":"活动价","role":"promotion","box":null,"confidence":0.9}]});
        let parent = for_segment(input, 22000, 24000, 25000.0);
        let window = for_window(&parent, 22000, 23100);
        assert_eq!(window["observations"].as_array().unwrap().len(), 1);
        assert_eq!(window["observations"][0]["candidateEndMs"], 1100);
        assert_eq!(window["observations"][0]["sourceEndMs"], 23600);
        assert_eq!(
            window["selectionAdvice"]["candidateConflictRoles"],
            json!(["dialogue_subtitle"])
        );
        assert_eq!(
            window["selectionAdvice"]["sourceConflictRoles"],
            json!(["dialogue_subtitle", "promotion"])
        );
        assert_eq!(window["textFreeVerified"], false);
        assert_eq!(parent["observations"].as_array().unwrap().len(), 2);
        let compact = window_references(&parent, 22000, 23100);
        assert_eq!(
            compact["observationReferences"],
            json!([{"observationIndex":0,"startMs":0,"endMs":1100}])
        );
        assert!(!compact.to_string().contains("泡沫绵密"));
        assert_eq!(compact["textFreeVerified"], false);
    }
    #[test]
    fn model_interval_boundary_does_not_prove_clean_video() {
        let mut input = value();
        input["observations"][0]["role"] = json!("dialogue_subtitle");
        input["observations"][0]["start_ms"] = json!(1000);
        input["observations"][0]["end_ms"] = json!(2000);
        let result = for_segment(input, 2000, 2500, 4000.0);
        assert_eq!(result["observations"], json!([]));
        assert_eq!(
            result["selectionAdvice"]["sourceConflictRoles"],
            json!(["dialogue_subtitle"])
        );
        assert_eq!(
            result["selectionAdvice"]["action"],
            "inspect_before_replacement"
        );
        assert_eq!(
            result["selectionAdvice"]["timingPrecision"],
            "model_estimated"
        );
        assert_eq!(
            for_segment(Value::Null, 2000, 2500, 4000.0)["selectionAdvice"]["cleanStatus"],
            "unverified"
        );
    }
    #[test]
    fn dialogue_boundaries_preserve_unknown_gaps_and_changed_text() {
        let observation = |lo, hi, text| json!({"sourceStartMs":lo,"sourceEndMs":hi,"text":text,"role":"dialogue_subtitle"});
        for (items, expected) in [
            (vec![], "unavailable"),
            (
                vec![observation(0, 1000, "当前句")],
                "single_text_model_estimated",
            ),
            (
                vec![
                    observation(0, 500, "当前句"),
                    observation(500, 1000, "当前句"),
                ],
                "single_text_model_estimated",
            ),
            (
                vec![
                    observation(0, 400, "当前句"),
                    observation(500, 1000, "当前句"),
                ],
                "partial_range_requires_review",
            ),
            (
                vec![observation(100, 1000, "当前句")],
                "partial_range_requires_review",
            ),
            (
                vec![observation(0, 900, "当前句")],
                "partial_range_requires_review",
            ),
            (
                vec![
                    observation(0, 100, "前句"),
                    observation(100, 1000, "当前句"),
                ],
                "multiple_texts_require_review",
            ),
        ] {
            let window =
                json!({"windowSourceStartMs":0,"windowSourceEndMs":1000,"observations":items});
            assert_eq!(dialogue_boundary_status(&window), expected);
        }
    }
}
