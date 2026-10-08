"""Compile the supported EditDocument v2 subset; never reinterpret legacy edits.

Bindings are frozen, authorized asset versions supplied by the host, not model
output. This module validates the render contract, not business permissions.
"""
import math
import hashlib
import re
from fractions import Fraction

SCHEMA = "datahub.edit-document.v2"
PROFILE = "hyperframes-av-v1"


def _keys(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError("invalid or unsupported edit fields")


def _integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError("invalid edit integer")
    return value


def _id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value):
        raise ValueError("invalid edit identifier")
    return value


def _time(value):
    _keys(value, ("num", "den"))
    return Fraction(_integer(value["num"], 0, 1_800_000_000), _integer(value["den"], 1, 1_000_000))


def compile_document(document: dict, bindings: dict, media: dict, title: str) -> dict:
    """Return a producer spec; source duration and hashes come from host bindings.

    binding[assetVersionId] = {sha256, durationMs}; media uses the same version ID.
    Audio clips require gain. Video clips require mute and contain/cover + opacity
    1. Only one contiguous video track and non-overlapping clips per audio track
    are supported. All other editing capabilities fail explicitly.
    """
    if 'captionRepair' in document:
        from .caption_execution import derive_caption_document
        document, _ = derive_caption_document(document)
    _keys(document, ("schema", "projectId", "revision", "canvas", "audio", "assets",
                     "tracks", "clips", "captions", "transitions", "templateRefs"), ("captionDisplayPolicy", "captionOverlayPolicy"))
    if document["schema"] != SCHEMA:
        raise ValueError("unsupported edit schema")
    _integer(document["revision"], 1, 2_147_483_647)
    project_id = _id(document["projectId"])
    if not isinstance(title, str) or not title.strip() or len(title) > 120:
        raise ValueError("invalid edit title")
    geometry = document["canvas"]
    _keys(geometry, ("width", "height", "fps"))
    _keys(geometry["fps"], ("num", "den"))
    _integer(geometry["fps"]["num"], 30, 30)
    _integer(geometry["fps"]["den"], 1, 1)
    for dimension in ("width", "height"):
        if _integer(geometry[dimension], 64, 1920) % 2:
            raise ValueError("canvas must use even dimensions")
    _keys(document["audio"], ("sampleRate", "channels"))
    _integer(document["audio"]["sampleRate"], 48000, 48000)
    _integer(document["audio"]["channels"], 2, 2)
    if any(document[key] != [] for key in ("transitions", "templateRefs")):
        raise ValueError("transitions and templates unsupported by this profile")
    for key, limit in (("assets", 100), ("tracks", 33), ("clips", 132)):
        if not isinstance(document[key], list) or not 1 <= len(document[key]) <= limit:
            raise ValueError("invalid edit collection size")
    assets, refs, versions = [], {}, set()
    for asset in document["assets"]:
        _keys(asset, ("ref", "assetVersionId", "sha256"))
        ref, version = _id(asset["ref"]), _id(asset["assetVersionId"])
        digest = asset["sha256"]
        if ref in refs or version in versions or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("duplicate or invalid asset")
        binding = bindings.get(version)
        if not isinstance(binding, dict) or binding.get("sha256") != digest or version not in media:
            raise ValueError("asset is not bound to frozen source")
        duration = _integer(binding.get("durationMs"), 1, 1_800_000)
        refs[ref] = (duration, f"asset{len(assets)}")
        versions.add(version)
        assets.append({"id": refs[ref][1], "path": str(media[version])})
    tracks = {}
    for track in document["tracks"]:
        _keys(track, ("id", "kind", "zIndex"))
        ident = _id(track["id"])
        if ident in tracks or track["kind"] not in ("video", "audio"):
            raise ValueError("duplicate or unsupported track")
        _integer(track["zIndex"], 0, 0)
        tracks[ident] = track["kind"]
    if list(tracks.values()).count("video") != 1:
        raise ValueError("profile requires one video track")
    picture, audio, used, ids, ranges = [], [], set(), set(), {t: [] for t in tracks}
    for clip in document["clips"]:
        if not isinstance(clip, dict) or not isinstance(clip.get("trackId"), str) or clip["trackId"] not in tracks:
            raise ValueError("unknown track")
        kind = tracks[clip["trackId"]]
        _keys(clip, ("id", "trackId", "assetRef", "timeline", "sourceMap"),
              ("transform", "audioPolicy") if kind == "video" else ("gain",))
        ident, ref = _id(clip["id"]), _id(clip["assetRef"])
        if ident in ids or ref not in refs:
            raise ValueError("duplicate clip or unknown asset")
        ids.add(ident)
        used.add(ref)
        _keys(clip["timeline"], ("startFrame", "endFrame"))
        start = _integer(clip["timeline"]["startFrame"], 0, 17999)
        end = _integer(clip["timeline"]["endFrame"], start + 1, 18000)
        frames = end - start
        source_map = clip["sourceMap"]
        if not isinstance(source_map, list) or len(source_map) != 1:
            raise ValueError("piecewise source maps unsupported")
        mapping = source_map[0]
        _keys(mapping, ("startFrame", "endFrame", "sourceStart", "sourceEnd"))
        _integer(mapping["startFrame"], 0, 0)
        _integer(mapping["endFrame"], frames, frames)
        source_start, source_end = _time(mapping["sourceStart"]), _time(mapping["sourceEnd"])
        if source_end - source_start != Fraction(frames, 30) or source_end > Fraction(refs[ref][0], 1000):
            raise ValueError("source range exceeds binding or requires unsupported speed")
        ranges[clip["trackId"]].append((start, end))
        common = {"id": f"clip{len(ids)}", "asset_id": refs[ref][1], "in_seconds": float(source_start), "frames": frames}
        if kind == "video":
            transform = clip.get("transform")
            _keys(transform, ("fit", "opacity"))
            if (transform["fit"] not in ("contain", "cover") or type(transform["opacity"]) not in (int, float)
                    or transform["opacity"] != 1 or clip.get("audioPolicy") != "mute"):
                raise ValueError("unsupported picture transform or source audio policy")
            picture.append((start, {**common, "volume": 0, "fit": transform["fit"], "captions": []}))
        else:
            gain = clip.get("gain")
            if type(gain) not in (int, float) or not math.isfinite(gain) or not 0 < gain <= 1:
                raise ValueError("audio gain must be positive and at most one")
            audio.append({**common, "start_frame": start, "volume": gain})
    if used != refs.keys() or len(picture) > 100 or len(audio) > 32:
        raise ValueError("unused assets or renderer capacity exceeded")
    cursor = 0
    for start, clip in sorted(picture, key=lambda item: item[0]):
        if start != cursor:
            raise ValueError("picture gaps or overlaps unsupported")
        cursor += clip["frames"]
    if not cursor:
        raise ValueError("empty picture track")
    for track, intervals in ranges.items():
        previous = 0
        if not intervals:
            raise ValueError("empty tracks unsupported")
        for start, end in sorted(intervals):
            if start < previous or end > cursor:
                raise ValueError("track overlap or audio beyond picture")
            previous = end
    _compile_captions(document, picture, cursor)
    return {"project_id": "p" + hashlib.sha256(project_id.encode()).hexdigest()[:40], "title": title.strip(),
            "canvas": {"width": geometry["width"], "height": geometry["height"], "fps": 30},
            "assets": assets, "clips": [c for _, c in sorted(picture, key=lambda item: item[0])],
            "audio": audio}


def _caption_style(cue):
    if cue["stylePreset"] == "basic-bottom-v1":
        if "style" in cue:
            raise ValueError("default caption preset cannot override style")
        return None
    style = cue.get("style")
    _keys(style, ("fontHeight", "centerY", "color", "strokeWidth", "weight"))
    for key, lo, hi in (("fontHeight", .015, .08), ("centerY", .1, .9), ("strokeWidth", 0, .004)):
        value = style[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi:
            raise ValueError("invalid source caption geometry")
    color = style["color"]
    if (not isinstance(color, str) or len(color) != 7 or color[0] != "#"
            or any(c not in "0123456789abcdefABCDEF" for c in color[1:])
            or type(style["weight"]) is not int or style["weight"] not in (400, 600, 700, 900)):
        raise ValueError("invalid source caption color or weight")
    return dict(style)


def resolve_caption_display(document):
    """Resolve source-anchored speech or timeline text before splitting at cuts.

    The locked renderer owns basic-bottom-v1 styling and escapes plain text.
    Unsupported styles and overlapping cues must fail, never silently degrade.
    """
    policy = document.get("captionDisplayPolicy")
    if "captionDisplayPolicy" in document and policy != "source-hold-v1":
        raise ValueError("unsupported caption display policy")
    video_tracks = {t["id"] for t in document["tracks"] if t["kind"] == "video"}
    cuts = sorted(c["timeline"]["endFrame"] for c in document["clips"] if c["trackId"] in video_tracks)
    total_frames = max(cuts)
    captions = document["captions"]
    if not isinstance(captions, list) or len(captions) > 500:
        raise ValueError("invalid caption collection")
    clips = {clip["id"]: clip for clip in document["clips"]}
    versions = {asset["ref"]: asset["assetVersionId"] for asset in document["assets"]}
    cues, ids = [], set()
    for cue in captions:
        _keys(cue, ("id", "anchor", "text", "stylePreset"), ("style",))
        style = _caption_style(cue)
        ident = _id(cue["id"])
        text = cue["text"]
        if (ident in ids or cue["stylePreset"] not in ("basic-bottom-v1", "source-style-v1")
                or not isinstance(text, str) or not text.strip() or len(text) > 2000
                or any(ord(c) < 32 and c != "\n" for c in text)):
            raise ValueError("invalid caption text, id or style")
        ids.add(ident)
        anchor = cue["anchor"]
        if not isinstance(anchor, dict):
            raise ValueError("invalid caption anchor")
        if anchor.get("kind") == "timeline":
            _keys(anchor, ("kind", "startFrame", "endFrame"))
            start = _integer(anchor["startFrame"], 0, total_frames - 1)
            end = _integer(anchor["endFrame"], start + 1, total_frames)
        elif anchor.get("kind") == "source":
            _keys(anchor, ("kind", "clipId", "assetVersionId", "sourceStart", "sourceEnd"))
            clip_id = _id(anchor["clipId"])
            if clip_id not in clips:
                raise ValueError("unknown caption source clip")
            clip = clips[clip_id]
            if anchor["assetVersionId"] != versions[clip["assetRef"]]:
                raise ValueError("caption source version changed")
            mapping = clip["sourceMap"][0]
            lower, upper = _time(mapping["sourceStart"]), _time(mapping["sourceEnd"])
            source_start, source_end = _time(anchor["sourceStart"]), _time(anchor["sourceEnd"])
            if not lower <= source_start < source_end <= upper:
                raise ValueError("caption outside source clip")
            start = clip["timeline"]["startFrame"] + math.ceil((source_start - lower) * 30)
            end = clip["timeline"]["startFrame"] + math.ceil((source_end - lower) * 30)
            if end <= start:
                raise ValueError("caption shorter than a display frame")
        else:
            raise ValueError("unsupported caption anchor")
        limit = clip["timeline"]["endFrame"] if anchor["kind"] == "source" else end
        cues.append({"id": ident, "startFrame": start, "speechEndFrame": end, "endFrame": end,
                     "text": text, "limit": limit, "source": anchor["kind"] == "source"})
        if style is not None:
            cues[-1]["style"] = style
    ordered = sorted(cues, key=lambda c: c["startFrame"])
    previous = 0
    for cue in ordered:
        if cue["startFrame"] < previous:
            raise ValueError("overlapping captions unsupported")
        previous = cue["endFrame"]
    for i, cue in enumerate(ordered):
        end = cue["endFrame"]
        if policy and cue["source"]:
            next_start = ordered[i+1]["startFrame"] if i+1 < len(ordered) else total_frames
            cut = next((boundary for boundary in cuts if boundary >= end), total_frames)
            # At 30 fps, at most 9 additional frames (300ms). Never move onset,
            # bridge a new picture cut, leave the source clip, or overlap a cue.
            needed = max(18, len(cue["text"].replace("\n", "")) * 3)
            desired = max(end, cue["startFrame"] + needed)
            cue["endFrame"] = min(desired, end + 9, next_start, cut, cue["limit"], total_frames)
        del cue["limit"]
        del cue["source"]
    from .caption_overlay import annotate_overlay_ranges
    return annotate_overlay_ranges(document, ordered)


def _compile_captions(document, picture, total_frames):
    for cue in resolve_caption_display(document):
        intervals = cue.get("renderRanges", [{"startFrame": cue["startFrame"], "endFrame": cue["endFrame"]}])
        for interval in intervals:
            start, end = interval["startFrame"], interval["endFrame"]
            for clip_start, clip in picture:
                left, right = max(start, clip_start), min(end, clip_start + clip["frames"])
                if left < right:
                    clip["captions"].append({"from": clip["in_seconds"] + (left - clip_start) / 30,
                                             "to": clip["in_seconds"] + (right - clip_start) / 30,
                                             "text": cue["text"], **({"style": cue["style"]} if "style" in cue else {})})
