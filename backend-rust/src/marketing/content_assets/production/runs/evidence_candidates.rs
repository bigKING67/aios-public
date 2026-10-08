//! Source-bound observations, not business label enums or expert-confirmed truth.
use super::super::{types::ClipHit, visual_search::VisualEvidence};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(super) enum Evidence {
    Transcript {
        #[serde(rename = "transcriptId")]
        transcript_id: Uuid,
        text: String,
    },
    RawVideoAnalysis(Box<VisualEvidence>),
    SourcePreservation {
        #[serde(rename = "rawSha256")]
        raw_sha256: String,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Candidate {
    pub asset_id: Uuid,
    pub title: String,
    pub start_ms: u32,
    pub end_ms: u32,
    pub evidence: Evidence,
}

impl Candidate {
    pub fn model_input(&self, id: usize) -> Value {
        let evidence = match &self.evidence {
            Evidence::Transcript { text, .. } => {
                json!({"kind":"raw-transcript","text":text,"audioPolicy":"preserve-source","picturePolicy":"preserve-source"})
            }
            Evidence::SourcePreservation { .. } => {
                json!({"kind":"source-preservation","audioPolicy":"mute","picturePolicy":"preserve-source","limitation":"仅按已冻结主讲原片原时间保留画面和烧录文字，不证明画面/字幕语义正确，不是新画面；独立主讲轨保留声音"})
            }
            Evidence::RawVideoAnalysis(v) => {
                json!({"kind":"raw-video-analysis","observation":v.observation,"visibleText":v.visible_text,"purposeSuggestion":v.purpose_suggestion,"qualitySignal":v.quality_signal,"observationSourceRange":{"startMs":v.start_ms,"endMs":v.end_ms},"audioPolicy":"mute","limitation":"已有原片模型描述，不是人工确认，也不证明声音内容"})
            }
        };
        json!({"candidateId":id,"title":self.title,"durationMs":self.end_ms-self.start_ms,"source":{"assetId":self.asset_id,"startMs":self.start_ms,"endMs":self.end_ms},"evidence":evidence})
    }

    pub fn volume(&self) -> f64 {
        match self.evidence {
            Evidence::Transcript { .. } => 1.0,
            Evidence::RawVideoAnalysis(_) | Evidence::SourcePreservation { .. } => 0.0,
        }
    }
}

// Interleave by asset and modality, so one verbose transcript cannot consume the
// entire context before another selected asset's visual evidence is considered.
pub(super) fn select(
    asset_ids: &[Uuid],
    transcripts: Vec<ClipHit>,
    visuals: Vec<VisualEvidence>,
) -> Vec<Candidate> {
    let mut buckets = Vec::new();
    for id in asset_ids {
        let spoken = transcripts
            .iter()
            .filter(|h| {
                h.asset_id == *id
                    && h.can_use
                    && !h.text.trim().is_empty()
                    && h.text.chars().count() <= 2000
                    && h.end_ms.saturating_sub(h.start_ms) >= 100
            })
            .map(|h| Candidate {
                asset_id: h.asset_id,
                title: h.title.clone(),
                start_ms: h.start_ms,
                end_ms: h.end_ms,
                evidence: Evidence::Transcript {
                    transcript_id: h.transcript_id,
                    text: h.text.clone(),
                },
            })
            .collect::<Vec<_>>();
        let visual = visuals
            .iter()
            .filter(|v| v.asset_id == *id)
            .map(|v| Candidate {
                asset_id: v.asset_id,
                title: v.title.clone(),
                start_ms: v.start_ms,
                end_ms: v.end_ms,
                evidence: Evidence::RawVideoAnalysis(Box::new(v.clone())),
            })
            .collect::<Vec<_>>();
        buckets.push(spoken.into_iter());
        buckets.push(visual.into_iter());
    }
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    loop {
        let mut progressed = false;
        for bucket in &mut buckets {
            if let Some(candidate) = bucket.next() {
                progressed = true;
                // Keep distinct modalities for the same range; their audio and
                // evidentiary meaning differ. Exact repeats add no evidence.
                let key = (
                    candidate.asset_id,
                    candidate.start_ms,
                    candidate.end_ms,
                    matches!(candidate.evidence, Evidence::Transcript { .. }),
                );
                if seen.insert(key) {
                    result.push(candidate);
                }
                if result.len() == 30 {
                    return result;
                }
            }
        }
        if !progressed {
            return result;
        }
    }
}
