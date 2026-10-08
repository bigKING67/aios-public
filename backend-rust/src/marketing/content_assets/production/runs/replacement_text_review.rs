//! Adapter to the existing independent selection-text contract; no new semantic rules.
use super::{
    evidence_candidates::{Candidate, Evidence},
    selection_review,
    types::PlanDocument,
};
use crate::{
    error::{AppError, AppResult},
    llm::LlmCallOptions,
};
use serde_json::{json, Value};

pub(super) fn request(input: &Value, index: usize) -> AppResult<LlmCallOptions> {
    let item = &input["candidates"][index];
    let visual: super::super::visual_search::VisualEvidence =
        serde_json::from_value(item["evidence"].clone()).map_err(|_| AppError::Internal)?;
    let start = u32::try_from(
        item["replacement"]["startMs"]
            .as_u64()
            .ok_or(AppError::Internal)?,
    )
    .map_err(|_| AppError::Internal)?;
    let end = u32::try_from(item["endMs"].as_u64().ok_or(AppError::Internal)?)
        .map_err(|_| AppError::Internal)?;
    let candidate = Candidate {
        asset_id: visual.asset_id,
        title: visual.title.clone(),
        start_ms: start,
        end_ms: end,
        evidence: Evidence::RawVideoAnalysis(Box::new(visual)),
    };
    let lo = input["target"]["startFrame"]
        .as_u64()
        .ok_or(AppError::Internal)?
        * 1000
        / 30;
    let hi = input["target"]["endFrame"]
        .as_u64()
        .ok_or(AppError::Internal)?
        * 1000
        / 30;
    let options=LlmCallOptions{provider:None,model:None,thinking_enabled:false,
        request_scope:Some("content-production-replacement-text-review".into()),system_prompt:String::new(),
        user_prompt:json!({"slots":[],"brief":input["brief"],"narration":{"transcripts":input["narrationContext"]}}).to_string()};
    selection_review::request(&options,&[candidate],&[json!({"candidateId":0,"clipId":input["clipId"],
        "compiledSource":{"startMs":start,"endMs":end},"slot":{"timelineStartMs":lo,"timelineEndMs":hi}})])?
        .ok_or(AppError::Internal)
}
pub(super) fn inspect(options: &LlmCallOptions, response: &str) -> AppResult<Value> {
    let mut document = PlanDocument {
        summary: String::new(),
        clips: vec![],
        reasons: vec![],
        gaps: vec![],
        locked_clip_ids: vec![],
        narration_captions: None,
    };
    selection_review::apply(&mut document, &options.user_prompt, response)
}

// Each alternative gets its own identity so one verdict cannot approve another source.
pub(super) fn batch_request(input: &Value, indices: &[usize]) -> AppResult<LlmCallOptions> {
    let mut combined = None;
    let mut windows = Vec::new();
    for index in indices {
        let options = request(input, *index)?;
        let mut payload: Value =
            serde_json::from_str(&options.user_prompt).map_err(|_| AppError::Internal)?;
        payload["windows"][0]["clipId"] = json!(format!("replacement-candidate-{index}"));
        windows.push(payload["windows"][0].clone());
        combined = Some((options, payload));
    }
    let (mut options, mut payload) = combined.ok_or(AppError::Internal)?;
    payload["windows"] = json!(windows);
    options.user_prompt = payload.to_string();
    Ok(options)
}

pub(super) fn first_compatible(assessment: &Value, indices: &[usize]) -> Option<usize> {
    indices.iter().copied().find(|index| {
        let id = format!("replacement-candidate-{index}");
        assessment["checks"].as_array().is_some_and(|checks| {
            checks
                .iter()
                .any(|check| check["clipId"] == id && check["verdict"] == "compatible")
        }) && assessment["insufficientEvidenceClipIds"]
            .as_array()
            .is_some_and(|ids| !ids.iter().any(|value| value == &json!(id)))
    })
}
pub(super) fn digest(options: &LlmCallOptions) -> String {
    super::visual_review::digest(
        &json!({"system":options.system_prompt,"user":options.user_prompt}),
    )
}

#[cfg(test)]
mod contract_probe {
    use super::*;
    #[test]
    fn independent_alternatives_do_not_inherit_other_verdicts() {
        let options = LlmCallOptions {
            provider: None, model: None, thinking_enabled: false, request_scope: None,
            system_prompt: String::new(),
            user_prompt: json!({"windows": (0..3).map(|i| json!({
                "clipId": format!("replacement-candidate-{i}"),
                "narration": [{"text":"泡沫"}],
                "visibleText": {"status":"model_observed", "observations":[{"text":"泡沫", "role":"dialogue_subtitle"}]}
            })).collect::<Vec<_>>()}).to_string(),
        };
        // Concrete boundary validity is tested by the real candidate adapter fixture;
        // this test also verifies missing evidence cannot be bypassed by compatible.
        let response = json!({"checks": [
            {"clipId":"replacement-candidate-0","verdict":"uncertain","reason":"缺价格事实"},
            {"clipId":"replacement-candidate-1","verdict":"compatible","reason":"相容"},
            {"clipId":"replacement-candidate-2","verdict":"conflict","reason":"冲突"}
        ]});
        let mut assessment = inspect(&options, &response.to_string()).unwrap();
        // An incomplete source observation has no valid boundary and must block.
        assert_eq!(first_compatible(&assessment, &[0, 1, 2]), None);
        assessment["insufficientEvidenceClipIds"] = json!([]);
        assert_eq!(first_compatible(&assessment, &[0, 1, 2]), Some(1));
        assessment["insufficientEvidenceClipIds"] = json!(["replacement-candidate-1"]);
        assert_eq!(first_compatible(&assessment, &[0, 1, 2]), None);
        assert!(inspect(
            &options,
            &json!({"checks":[response["checks"][1]]}).to_string()
        )
        .is_err());
    }

    #[test]
    #[ignore = "explicit saved source and local output paths required; no provider calls"]
    fn export_or_inspect_real_contract() {
        let source = std::env::var("AIOS_REPLACEMENT_TEXT_SOURCE").unwrap();
        let out = std::path::PathBuf::from(std::env::var("AIOS_REPLACEMENT_TEXT_OUTPUT").unwrap());
        std::fs::create_dir_all(&out).unwrap();
        let saved: Value = serde_json::from_slice(&std::fs::read(source).unwrap()).unwrap();
        let index = saved["decision"]["candidateIndex"].as_u64().unwrap() as usize;
        let options = request(&saved["input"], index).unwrap();
        let exported = json!({"schema":"aios.replacement-text-contract-probe.v1","systemPrompt":options.system_prompt,
            "userPrompt":options.user_prompt,"inputSha256":digest(&options),"maxCalls":1,"deliveryApproved":false});
        let path = out.join("request.json");
        if path.exists() {
            let previous: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert_eq!(
                previous, exported,
                "production contract changed after export"
            );
        } else {
            std::fs::write(path, serde_json::to_vec_pretty(&exported).unwrap()).unwrap();
        }
        if let Ok(response) = std::env::var("AIOS_REPLACEMENT_TEXT_RESPONSE") {
            let answer = std::fs::read_to_string(response).unwrap();
            let assessment = inspect(&options, &answer).unwrap();
            std::fs::write(
                out.join("host-assessment.json"),
                serde_json::to_vec_pretty(&assessment).unwrap(),
            )
            .unwrap();
        }
    }
}
