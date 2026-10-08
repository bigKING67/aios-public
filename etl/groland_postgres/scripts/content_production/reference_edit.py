"""Reassemble completed product-swap shots on the reference's original timeline.

This does not generate or approve replacement media. The host supplies frozen
asset versions and measured 30 fps frame counts after accepting provider outputs.
"""
import re
from .edit_document import SCHEMA, _id, _integer, _keys


def build_reference_edit(project_id: str, revision: int, reference: dict, replacements: list,
                         canvas: dict, preserve_audio: bool = True) -> dict:
    """Assets: {assetVersionId, sha256, frames}; replacements additionally specify
    startFrame/endFrame and asset. No implicit stretching, trimming or fallback.
    """
    _id(project_id)
    _integer(revision, 1, 2_147_483_647)
    if type(preserve_audio) is not bool:
        raise ValueError("audio preservation must be explicit")
    _keys(canvas, ("width", "height", "fps"))
    _keys(canvas["fps"], ("num", "den"))
    _integer(canvas["fps"]["num"], 30, 30)
    _integer(canvas["fps"]["den"], 1, 1)
    for dimension in ("width", "height"):
        if _integer(canvas[dimension], 64, 1920) % 2:
            raise ValueError("invalid canvas dimensions")
    assets, versions = [], {}

    def asset_ref(asset):
        _keys(asset, ("assetVersionId", "sha256", "frames"))
        version = _id(asset["assetVersionId"])
        _integer(asset["frames"], 1, 18000)
        if not isinstance(asset["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", asset["sha256"]):
            raise ValueError("invalid frozen source hash")
        if version in versions:
            old, ref = versions[version]
            if old != asset:
                raise ValueError("conflicting frozen asset version")
            return ref
        ref = f"source{len(assets)}"
        assets.append({"ref": ref, "assetVersionId": version, "sha256": asset["sha256"]})
        versions[version] = (dict(asset), ref)
        return ref

    original = asset_ref(reference)
    total = reference["frames"]
    if not isinstance(replacements, list) or not 1 <= len(replacements) <= 49:
        raise ValueError("expected 1–49 completed replacement shots")
    ordered = []
    for replacement in replacements:
        _keys(replacement, ("startFrame", "endFrame", "asset"))
        start = _integer(replacement["startFrame"], 0, total - 1)
        end = _integer(replacement["endFrame"], start + 1, total)
        ref = asset_ref(replacement["asset"])
        if replacement["asset"]["sha256"] == reference["sha256"]:
            raise ValueError("unchanged reference is not a replacement output")
        if replacement["asset"]["frames"] != end - start:
            raise ValueError("replacement duration must match the original shot exactly")
        ordered.append((start, end, ref))
    clips = []

    def append_clip(track, ref, start, end, source_start):
        clip = {"id": f"clip{len(clips)}", "trackId": track, "assetRef": ref,
                "timeline": {"startFrame": start, "endFrame": end},
                "sourceMap": [{"startFrame": 0, "endFrame": end - start,
                               "sourceStart": {"num": source_start, "den": 30},
                               "sourceEnd": {"num": source_start + end - start, "den": 30}}]}
        if track == "picture":
            clip.update(transform={"fit": "contain", "opacity": 1}, audioPolicy="mute")
        else:
            clip["gain"] = 1
        clips.append(clip)

    cursor = 0
    for start, end, ref in sorted(ordered):
        if start < cursor:
            raise ValueError("replacement shots overlap")
        if start > cursor:
            append_clip("picture", original, cursor, start, cursor)
        append_clip("picture", ref, start, end, 0)
        cursor = end
    if cursor < total:
        append_clip("picture", original, cursor, total, cursor)
    tracks = [{"id": "picture", "kind": "video", "zIndex": 0}]
    if preserve_audio:
        tracks.append({"id": "original-audio", "kind": "audio", "zIndex": 0})
        append_clip("original-audio", original, 0, total, 0)
    used = {clip["assetRef"] for clip in clips}
    return {"schema": SCHEMA, "projectId": project_id, "revision": revision,
            "canvas": {**canvas, "fps": dict(canvas["fps"])}, "audio": {"sampleRate": 48000, "channels": 2},
            "assets": [a for a in assets if a["ref"] in used], "tracks": tracks, "clips": clips,
            "captions": [], "transitions": [], "templateRefs": []}
