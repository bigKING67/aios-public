use super::*;
use crate::marketing::content_assets::production::runs::{
    evidence_tests, picture_remix, tests as fixtures,
};

fn fixture() -> (Run, Uuid, Value, Value, PlanDocument) {
    let mut run = evidence_tests::run();
    run.status = "waiting".into();
    run.request.task_type = "picture_remix".into();
    run.request.target_seconds = 3;
    run.request.narration_asset_id = Some(run.sources.assets[0].asset_id);
    run.project_id = Some(Uuid::new_v4());
    run.project_revision = Some(1);
    run.plan_revision = 1;
    let mut plan = fixtures::document();
    plan.clips[0].start_ms = 0;
    plan.clips[0].end_ms = 3000;
    plan.clips[0].volume = 0.0;
    plan.clips[0].caption.clear();
    plan.narration_captions = Some(NarrationCaptions {
        asset_id: run.sources.assets[0].asset_id,
        source_sha256: run.sources.assets[0].sha256.clone(),
        cues: vec![Cue {
            id: "speech".into(),
            start_ms: 200,
            end_ms: 1600,
            text: "完整字幕".into(),
            style: None,
        }],
    });
    let effective = picture_remix::edit_document(&run, &plan).unwrap().unwrap();
    let mut frozen = effective.clone();
    frozen["captionRepair"] = json!({"policy":"asr-boundary-repair-v1"});
    let mut candidate = effective.clone();
    candidate["captions"][0]["text"] = json!("完整\n字幕");
    candidate["revision"] = json!(2);
    let sha = digest(&candidate);
    let job = Uuid::new_v4();
    run.render_job_id = Some(job);
    let rereview =
        json!({"documentSha256":sha,"effectiveDocumentSha256":sha,"semanticIssueCount":0});
    let (width, height) = run
        .sources
        .output_profile
        .dimensions(&run.sources.aspect)
        .unwrap();
    let receipt = json!({"render_binding":run.sources.render_binding,"host_run_id":run.run_id,"host_project_id":run.project_id,"host_revision":1,
        "host_execution_version":run.execution_version,"host_plan_revision":1,
        "caption_quality":{"repair":{"captions":effective["captions"]}},
        "host_caption_review":{"candidateRendered":true,"candidateReview":rereview,
            "candidate":{"status":"candidate","document":candidate,"documentSha256":sha,
                "baseDocumentSha256":digest(&frozen),"baseEffectiveDocumentSha256":digest(&effective)},
            "candidateRender":{"status":"inspection_pending","documentSha256":sha,
                "baseDocumentSha256":digest(&frozen),"reviewSha256":digest(&rereview),
                "outputObjectKey":format!("production/{}/{job}/caption-candidate.mp4",run.project_id.unwrap()),
                "receipt":{"render_binding":run.sources.render_binding,"edit_document":{"sha256":sha},"host_inspection":{
                    "schema":"aios.media-inspection.v1","status":"passed","width":width,"height":height,"fps":30,
                    "outputProfile":run.sources.output_profile}}}}});
    (run, job, receipt, json!({"editDocument":frozen}), plan)
}

#[test]
fn caption_candidate_exposes_versioned_plan_without_approving_delivery() {
    let (run, job, receipt, snapshot, plan) = fixture();
    let result = inspect(&run, job, &receipt, &snapshot, &plan)
        .unwrap()
        .unwrap();
    assert_eq!(result["deliveryApproved"], false);
    assert_eq!(result["expectedVersion"], run.version);
    assert_eq!(result["expectedProjectRevision"], 1);
    assert_eq!(result["captionChanges"][0]["before"], "完整字幕");
    assert_eq!(result["captionChanges"][0]["after"], "完整\n字幕");
    assert_eq!(
        result["planDocument"]["narrationCaptions"]["cues"][0]["text"],
        "完整\n字幕"
    );
    assert_eq!(
        result["planDocument"]["clips"],
        serde_json::to_value(&plan.clips).unwrap()
    );
}

#[test]
fn caption_candidate_rejects_wrong_job_foreign_key_stale_hash_and_spec() {
    for mode in ["key", "job", "hash", "review", "spec", "revision", "source"] {
        let (run, mut job, mut receipt, mut snapshot, plan) = fixture();
        match mode {
            "key" => {
                receipt["host_caption_review"]["candidateRender"]["outputObjectKey"] =
                    json!("foreign/private.mp4")
            }
            "job" => job = Uuid::new_v4(),
            "hash" => receipt["host_caption_review"]["candidate"]["documentSha256"] = json!("bad"),
            "review" => {
                receipt["host_caption_review"]["candidateReview"]["semanticIssueCount"] = json!(1)
            }
            "spec" => {
                receipt["host_caption_review"]["candidateRender"]["receipt"]["host_inspection"]
                    ["width"] = json!(1)
            }
            "revision" => receipt["host_revision"] = json!(99),
            _ => snapshot["editDocument"]["revision"] = json!(99),
        }
        assert!(
            inspect(&run, job, &receipt, &snapshot, &plan).is_err(),
            "{mode}"
        );
    }
}

#[test]
fn caption_candidate_rejects_rehashed_text_and_timing_changes() {
    for mode in ["text", "anchor", "canvas"] {
        let (run, job, mut receipt, snapshot, plan) = fixture();
        let review = &mut receipt["host_caption_review"];
        let doc = &mut review["candidate"]["document"];
        match mode {
            "text" => doc["captions"][0]["text"] = json!("改写字幕"),
            "anchor" => doc["captions"][0]["anchor"]["sourceEnd"]["num"] = json!(1700),
            _ => doc["canvas"]["width"] = json!(1),
        }
        let sha = digest(doc);
        review["candidate"]["documentSha256"] = json!(sha);
        review["candidateRender"]["documentSha256"] = json!(sha);
        review["candidateRender"]["receipt"]["edit_document"]["sha256"] = json!(sha);
        review["candidateReview"]["documentSha256"] = json!(sha);
        review["candidateReview"]["effectiveDocumentSha256"] = json!(sha);
        review["candidateRender"]["reviewSha256"] = json!(digest(&review["candidateReview"]));
        assert!(
            inspect(&run, job, &receipt, &snapshot, &plan).is_err(),
            "{mode}"
        );
    }
}

#[test]
fn caption_candidate_preserves_style_in_versioned_plan_conversion() {
    let (run, job, mut receipt, mut snapshot, plan) = fixture();
    let style = json!({"fontHeight":0.035,"centerY":0.6875,"color":"#ffffff","strokeWidth":0.0015,"weight":900});
    snapshot["editDocument"]["captions"][0]["stylePreset"] = json!("source-style-v1");
    snapshot["editDocument"]["captions"][0]["style"] = style.clone();
    receipt["caption_quality"]["repair"]["captions"] = snapshot["editDocument"]["captions"].clone();
    let mut effective = snapshot["editDocument"].clone();
    effective.as_object_mut().unwrap().remove("captionRepair");
    let review = &mut receipt["host_caption_review"];
    review["candidate"]["document"]["captions"][0]["stylePreset"] = json!("source-style-v1");
    review["candidate"]["document"]["captions"][0]["style"] = style;
    let sha = digest(&review["candidate"]["document"]);
    let base = digest(&snapshot["editDocument"]);
    review["candidate"]["baseDocumentSha256"] = json!(base);
    review["candidate"]["baseEffectiveDocumentSha256"] = json!(digest(&effective));
    review["candidate"]["documentSha256"] = json!(sha);
    review["candidateRender"]["baseDocumentSha256"] = json!(base);
    review["candidateRender"]["documentSha256"] = json!(sha);
    review["candidateRender"]["receipt"]["edit_document"]["sha256"] = json!(sha);
    review["candidateReview"]["documentSha256"] = json!(sha);
    review["candidateReview"]["effectiveDocumentSha256"] = json!(sha);
    review["candidateRender"]["reviewSha256"] = json!(digest(&review["candidateReview"]));
    let result = inspect(&run, job, &receipt, &snapshot, &plan)
        .unwrap()
        .unwrap();
    assert_eq!(
        result["planDocument"]["narrationCaptions"]["cues"][0]["style"],
        snapshot["editDocument"]["captions"][0]["style"]
    );
    let adopted: PlanDocument = serde_json::from_value(result["planDocument"].clone()).unwrap();
    let frozen = picture_remix::edit_document(&run, &adopted)
        .unwrap()
        .unwrap();
    assert_eq!(
        frozen["captions"][0]["style"],
        snapshot["editDocument"]["captions"][0]["style"]
    );
}

#[test]
fn explicit_caption_candidate_without_asr_preserves_style_and_rejects_rehashed_changes() {
    let (run, job, mut receipt, mut snapshot, plan) = fixture();
    snapshot["editDocument"]
        .as_object_mut()
        .unwrap()
        .remove("captionRepair");
    let style = json!({"fontHeight":0.035,"centerY":0.72,"color":"#ffffff","strokeWidth":0.0015,"weight":700});
    snapshot["editDocument"]["captions"][0]["stylePreset"] = json!("source-style-v1");
    snapshot["editDocument"]["captions"][0]["style"] = style.clone();
    receipt.as_object_mut().unwrap().remove("caption_quality");
    for changed_style in [false, true] {
        let review = &mut receipt["host_caption_review"];
        let mut document = snapshot["editDocument"].clone();
        document["revision"] = json!(2);
        document["captions"][0]["text"] = json!("完整\n字幕");
        if changed_style {
            document["captions"][0]["style"]["weight"] = json!(900);
        }
        let sha = digest(&document);
        let base = digest(&snapshot["editDocument"]);
        review["candidate"]["document"] = document;
        review["candidate"]["documentSha256"] = json!(sha);
        review["candidate"]["baseDocumentSha256"] = json!(base);
        review["candidate"]["baseEffectiveDocumentSha256"] = json!(base);
        review["candidateRender"]["baseDocumentSha256"] = json!(base);
        review["candidateRender"]["documentSha256"] = json!(sha);
        review["candidateRender"]["receipt"]["edit_document"]["sha256"] = json!(sha);
        review["candidateReview"]["documentSha256"] = json!(sha);
        review["candidateReview"]["effectiveDocumentSha256"] = json!(sha);
        review["candidateRender"]["reviewSha256"] = json!(digest(&review["candidateReview"]));
        let result = inspect(&run, job, &receipt, &snapshot, &plan);
        if changed_style {
            assert!(result.is_err());
        } else {
            assert_eq!(
                result.unwrap().unwrap()["planDocument"]["narrationCaptions"]["cues"][0]["style"],
                style
            );
        }
    }
}
