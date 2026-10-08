"""Convert punctuated Seed-ASR word timing into source-anchored edit captions.

No model calls or transcript rewriting. Layout warnings require downstream review.
"""
from __future__ import annotations

import unicodedata

from .caption_layout import wrap_caption

_BREAKS = set("，。！？；,!?;\n")


def _spoken(text: str) -> str:
    return "".join(c for c in text if not c.isspace() and not unicodedata.category(c).startswith("P"))


def _milliseconds(value: object) -> int:
    if type(value) is not int or value < 0:
        raise ValueError("ASR timestamps must be nonnegative integer milliseconds")
    return value


def captions_from_seed_asr(result: dict, *, clip_id: str, asset_version_id: str,
                           source_start_ms: int, source_end_ms: int,
                           asr_origin_ms: int = 0, protected_terms: tuple[str, ...] = ()) -> dict:
    """Use an ASR result whose zero maps to asr_origin_ms in the source asset.

    Selection must contain complete punctuation-delimited clauses. Word timing may
    overlap within a clause; caption ranges may not overlap. Text is kept verbatim
    apart from punctuation boundaries and inserted display line breaks.
    """
    start = _milliseconds(source_start_ms)
    end = _milliseconds(source_end_ms)
    origin = _milliseconds(asr_origin_ms)
    if end <= start or not isinstance(clip_id, str) or not clip_id or not isinstance(asset_version_id, str) or not asset_version_id:
        raise ValueError("valid source window, clip and asset version are required")
    if not isinstance(result, dict) or not isinstance(result.get("utterances"), list):
        raise ValueError("ASR result must contain utterances")
    clauses = []
    previous_start = -1
    for utterance in result["utterances"]:
        if not isinstance(utterance, dict) or not isinstance(utterance.get("text"), str) or not isinstance(utterance.get("words"), list):
            raise ValueError("ASR utterance requires text and words")
        words = []
        for word in utterance["words"]:
            if not isinstance(word, dict) or not isinstance(word.get("text"), str):
                raise ValueError("invalid ASR word")
            token = _spoken(word["text"])
            if not token:
                continue  # Seed-ASR emits whitespace placeholders with -1 timestamps.
            lo = _milliseconds(word.get("start_time")) + origin
            hi = _milliseconds(word.get("end_time")) + origin
            if hi <= lo or lo < previous_start:
                raise ValueError("invalid or unordered ASR word timing")
            previous_start = lo
            words.append((token, lo, hi))
        text = utterance["text"]
        if any(ord(c) < 32 and c not in "\n\t\r" for c in text):
            raise ValueError("invalid ASR text control character")
        if _spoken(text) != "".join(w[0] for w in words):
            raise ValueError("ASR text and timed words do not align")
        cursor = 0
        pending = ""
        for char in text + "\n":
            pending += char
            if char not in _BREAKS:
                continue
            spoken = _spoken(pending)
            if not spoken:
                pending = ""
                continue
            group = []
            count = 0
            while cursor < len(words) and count < len(spoken):
                group.append(words[cursor]); count += len(words[cursor][0]); cursor += 1
            if count != len(spoken):
                raise ValueError("ASR punctuation splits a timed word")
            clauses.append((pending.strip().rstrip("，。！？；,!?;"), group[0][1], max(w[2] for w in group)))
            pending = ""
    cues, warnings = [], []
    previous_end = -1
    for text, lo, hi in clauses:
        if hi <= start or lo >= end:
            continue
        if lo < start or hi > end:
            raise ValueError("source window cuts an ASR clause; choose complete clause boundaries")
        if lo < previous_end:
            raise ValueError("ASR clause timing overlaps")
        previous_end = hi
        ident = f"asr-{clip_id}-{lo}-{hi}"
        wrapped = wrap_caption(text, protected_terms)
        if wrapped != text:
            warnings.append({"captionId": ident, "reason": "word_boundary_layout_requires_review"})
        if hi - lo < 600:
            warnings.append({"captionId": ident, "reason": "short_display_duration"})
        if len(_spoken(text)) * 1000 > (hi - lo) * 10:
            warnings.append({"captionId": ident, "reason": "reading_rate_exceeds_10_chars_per_second"})
        text = wrapped
        cues.append({"id": ident, "text": text, "stylePreset": "basic-bottom-v1",
                     "anchor": {"kind": "source", "clipId": clip_id, "assetVersionId": asset_version_id,
                                "sourceStart": {"num": lo, "den": 1000}, "sourceEnd": {"num": hi, "den": 1000}}})
    if not cues:
        raise ValueError("no timed speech within source window")
    if len(cues) > 500:
        raise ValueError("caption count exceeds edit document limit")
    return {"captions": cues, "warnings": warnings, "termsVerified": False}
