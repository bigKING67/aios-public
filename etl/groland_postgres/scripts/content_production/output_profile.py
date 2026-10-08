"""Versioned host output geometry, shared by rendering and technical inspection."""
import math


def profile_name(snapshot: dict) -> str:
    name = snapshot.get("outputProfile", "legacy_v1")
    if name not in ("legacy_v1", "hd_1080_v1"):
        raise ValueError("unsupported frozen output profile")
    return name


def canvas(snapshot: dict, preview: bool = False) -> dict:
    name = profile_name(snapshot)
    width, height = {
        "legacy_v1": {"portrait": (720, 1280), "landscape": (1280, 720), "square": (1080, 1080)},
        "hd_1080_v1": {"portrait": (1080, 1920), "landscape": (1920, 1080), "square": (1080, 1080)},
    }[name][snapshot["aspect"]]
    if preview:
        # Exactly match the content-locked renderer's positive Math.round and even grid.
        scale = min(1, 640 / max(width, height))
        width, height = (max(2, math.floor(size * scale / 2 + 0.5) * 2) for size in (width, height))
    return {"width": width, "height": height, "fps": 30}
