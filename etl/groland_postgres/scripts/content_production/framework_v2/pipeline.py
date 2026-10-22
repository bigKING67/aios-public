"""Framework v2 pipeline: original video -> framework segments for one AI 切段 job.

shots (proxy cuts) -> one forward decode of every sampled frame -> person features and chains -> local VLM
gray-pair checks -> local VLM shot facts -> OCR -> rule engine -> bounded Lite review -> structural
finalize. Every stage is deterministic given its model outputs, and the job always publishes a
full-coverage timeline: a failed Lite review keeps the rule output.
"""
import copy

import numpy as np

from ..segment_suggestion_contract import merge_usage
from . import local_vlm, mouth, ocr, persons, review, rules, shots
from .frames import Frames

PIPELINE_VERSION = 'framework-v2-rules-v9'
RULE_CONFIDENCE = 0.7
REVIEW_CONFIDENCE = 0.85


def _allowed(label, label_keys):
    if label in label_keys:
        return label
    return rules.MIXED if rules.MIXED in label_keys else None


def _bg_near(feats, k):
    near = [persons._hist_sim(feats['bg'][k], feats['bg'][j]) for j in (k - 1, k + 1) if 0 <= j < len(feats['bg'])]
    return max(near) if near else None


def frame_requests(spans):
    """Shared by the actual decoder and isolated, zero-inference input audits."""
    starts = np.array([a for a, _ in spans], np.float32)
    ends = np.array([b for _, b in spans], np.float32)
    return (persons.frame_requests(spans) + local_vlm.fact_requests(spans)
            + local_vlm.pair_requests(starts, ends) + ocr.frame_requests(spans))


def run(source, proxy, duration_ms, label_keys, provider, work, env, tick, stage, *,
        evidence_sink=None, sampling=None):
    """Returns (segments, summary, usage). `stage` is a one-item list the worker shows in the UI."""
    duration = duration_ms / 1000
    stage[0] = '镜头切点'
    cuts = shots.cut_times(proxy)
    spans = shots.spans(cuts, duration)
    if sampling is not None:
        if evidence_sink is None:
            raise ValueError('Experimental sampling requires an evidence sink')
        cuts, spans = sampling.layout(source, cuts, duration_ms)
    stage[0] = '解码画面'
    requests = frame_requests(spans)
    frames = (Frames(source, requests, tick) if sampling is None else sampling.decode(source, requests, tick))
    stage[0] = '人物特征'
    feats = persons.extract(frames, spans, tick)
    chain = persons.chains(feats)
    vlm = local_vlm.LocalVlm()
    stage[0] = '人物确认'
    gray = persons.gray_pairs(feats, chain)
    merged_pairs = 0
    for i, j, verdict in vlm.same_person(frames, gray, feats['start'], feats['end'], tick):
        if verdict and verdict.get('same_person') == 'yes' and verdict.get('same_session') == 'yes':
            chain = persons.merge(chain, i, j)
            merged_pairs += 1
    stage[0] = '镜头事实'
    facts = vlm.shot_facts(frames, spans, tick)
    stage[0] = '画面文字'
    texts, ocr_engine = ocr.shot_text(frames, spans, tick)
    del frames
    shot_rows = [{'start': a, 'end': b, 'facts': f, 'chain': chain.get(k), 'ocr': t, 'bg_near': _bg_near(feats, k)}
                 for k, ((a, b), f, t) in enumerate(zip(spans, facts, texts))]
    rule_segments, runs = rules.segment(shot_rows, duration)
    # Explicit evaluation hook only; the worker does not retain frame observations.
    evidence = None if evidence_sink is None else copy.deepcopy(dict(
        shots=shot_rows, cuts=cuts, runs=runs, ruleSegments=rule_segments, durationMs=duration_ms))
    stage[0] = '复核'
    final, receipts = review.review(provider, source, rule_segments, runs, cuts, duration, work, env, tick)
    stage[0] = '口型'
    probed = []

    def measure(mouth_spans):
        probed.extend(mouth_spans)
        return mouth.shot_mouth(source, mouth_spans, tick)
    final = rules.finalize(final, shot_rows, measure)
    usage = {}
    for receipt in receipts:
        usage = merge_usage(usage, receipt.get('usage'))
    reviewed = [r['window'] for r in receipts if 'responseId' in r]

    def confidence(a, b):
        inside = any(wa <= a and b <= wb for wa, wb in reviewed)
        return REVIEW_CONFIDENCE if inside else RULE_CONFIDENCE

    segments = []
    for a, b, label in final:
        key = _allowed(label, label_keys)
        if key is None:
            continue
        segments.append({'start_ms': int(round(a * 1000)), 'end_ms': min(duration_ms, int(round(b * 1000))),
                         'label_key': key, 'confidence': confidence(a, b),
                         'reason': 'framework-v2 规则' + ('+Lite 复核' if confidence(a, b) == REVIEW_CONFIDENCE else '')})
    summary = {
        'pipeline': PIPELINE_VERSION, 'promptVersion': PIPELINE_VERSION,
        'prompts': {'facts': local_vlm.FACTS_PROMPT_VERSION, 'pairs': local_vlm.PAIR_PROMPT_VERSION,
                    'review': review.PROMPT_VERSION},
        'shots': len(spans), 'cuts': len(cuts), 'faceShots': int(feats['has_face'].sum()),
        'chains': len(set(chain.values())), 'grayPairs': len(gray), 'mergedPairs': merged_pairs,
        'factsMissing': sum(f is None for f in facts), 'ocrEngine': ocr_engine,
        'faceModels': feats['modelSha256'], 'mouthModel': mouth.MODEL_SHA256,
        'mouthShots': len(probed), 'localVlm': {'model': vlm.model, **vlm.usage},
        'ruleSegments': rule_segments, 'review': receipts,
    }
    if evidence is not None:
        evidence['mouth'] = [[s['start'], s['end'], s['mouth']] for s in shot_rows if 'mouth' in s]
        if sampling is not None:
            evidence['sampling'] = copy.deepcopy(sampling.receipt)
            summary['sampling'] = {k: v for k, v in sampling.receipt.items() if k != 'samples'}
        evidence_sink(evidence)
    return segments, summary, usage
