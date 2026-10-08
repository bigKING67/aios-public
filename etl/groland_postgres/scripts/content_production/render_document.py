"""Execution boundary for frozen v2 edits, including host-bound Worker snapshots."""
import hashlib
import json
import math
import subprocess
from pathlib import Path

from .edit_document import PROFILE, compile_document
from .caption_quality import assess_rendered_captions
from .execution import file_hash, render_spec, renderer_env, verify_module
from .inspection import inspect_media
from .output_profile import canvas, profile_name
from .render_binding import require_binding, attach_receipt
from .derived_assets import document_bindings, document_media


def render_snapshot_document(root, snapshot, media, work, preview, tick, lock_fd=None):
    """Use only frozen host bindings; the document cannot introduce download URLs."""
    require_binding(snapshot)
    document = snapshot["editDocument"]
    expected = canvas(snapshot)
    if document["canvas"] != {"width": expected["width"], "height": expected["height"], "fps": {"num": 30, "den": 1}}:
        raise ValueError("document differs from frozen output profile")
    bindings, files = document_bindings(snapshot), document_media(snapshot, media)
    video, receipt = render_document_local(root, document, bindings, files, snapshot["title"], work, preview, tick, lock_fd)
    receipt["host_inspection"]["outputProfile"] = profile_name(snapshot)
    attach_receipt(snapshot, receipt)
    return video, receipt


def render_document_local(root: Path, document: dict, bindings: dict, media: dict, title: str,
                          work: Path, preview: bool, tick, lock_fd: int | None = None) -> tuple[Path, dict]:
    """Host must authorize/freeze all bindings and provide immutable local media.

    Reject unsupported source timestamps/HDR instead of silently changing color or
    source timing. This entry is intentionally separate from legacy render_local.
    """
    verify_module(root)
    spec = compile_document(document, bindings, media, title)
    inherited = () if lock_fd is None else (lock_fd,)
    tracks = {track["id"]: track["kind"] for track in document["tracks"]}
    for asset in document["assets"]:
        tick()
        source = Path(media[asset["assetVersionId"]])
        if not source.is_file() or source.is_symlink() or file_hash(source) != asset["sha256"]:
            raise ValueError("frozen media hash mismatch")
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source)],
                               capture_output=True, check=True, timeout=30, env=renderer_env(work), pass_fds=inherited)
        metadata = json.loads(probe.stdout)
        for stream in metadata["streams"]:
            if stream["codec_type"] not in ("video", "audio"):
                continue
            start = float(stream.get("start_time", metadata["format"].get("start_time", "nan")))
            if not math.isfinite(start) or abs(start) > 0.001:
                raise ValueError("nonzero or unknown source PTS unsupported")
            if stream.get("color_transfer") in ("smpte2084", "arib-std-b67"):
                raise ValueError("HDR conversion unsupported")
        for clip in document["clips"]:
            if clip["assetRef"] != asset["ref"]:
                continue
            streams = [s for s in metadata["streams"] if s["codec_type"] == tracks[clip["trackId"]]]
            if len(streams) != 1:
                raise ValueError("missing or ambiguous source stream")
            duration = float(streams[0].get("duration", "nan"))
            end = clip["sourceMap"][0]["sourceEnd"]
            if not math.isfinite(duration) or end["num"] / end["den"] > duration + 0.000001:
                raise ValueError("source map exceeds actual stream duration")
    video, receipt = render_spec(root, spec, work, preview, tick, lock_fd)
    expected = spec["canvas"].copy()
    if preview:
        scale = min(1, 640 / max(expected["width"], expected["height"]))
        for dimension in ("width", "height"):
            expected[dimension] = max(2, math.floor(expected[dimension] * scale / 2 + 0.5) * 2)
    receipt["host_inspection"] = inspect_media(
        video, expected, sum(c["frames"] for c in spec["clips"]),
        {s["id"]: a["sha256"] for s, a in zip(spec["assets"], document["assets"])}, PROFILE, preview, receipt, tick, lock_fd,
        require_audio=bool(spec["audio"]))
    receipt["edit_document"] = {"schema": document["schema"], "revision": document["revision"],
                                "sha256": hashlib.sha256(json.dumps(document, sort_keys=True, separators=(",", ":"),
                                                                    ensure_ascii=False).encode()).hexdigest(),
                                "adapterProfile": PROFILE}
    receipt["caption_quality"] = assess_rendered_captions(document)
    return video, receipt
