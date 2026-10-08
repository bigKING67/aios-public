"""Synthetic four-second B-roll edit with a continuous, trimmed audio source."""
from copy import deepcopy


def fixture():
    def clip(ident, track, ref, start, end, source_start, source_end):
        value = {"id": ident, "trackId": track, "assetRef": ref,
                 "timeline": {"startFrame": start, "endFrame": end},
                 "sourceMap": [{"startFrame": 0, "endFrame": end - start,
                                "sourceStart": {"num": source_start, "den": 1},
                                "sourceEnd": {"num": source_end, "den": 1}}]}
        if track == "picture":
            value.update(transform={"fit": "contain", "opacity": 1}, audioPolicy="mute")
        else:
            value["gain"] = 1
        return value
    assets = [{"ref": name, "assetVersionId": name + "-version", "sha256": digit * 64}
              for name, digit in (("red", "a"), ("blue", "b"), ("voice", "c"))]
    document = {"schema": "datahub.edit-document.v2", "projectId": "fixture-project", "revision": 7,
                "canvas": {"width": 640, "height": 360, "fps": {"num": 30, "den": 1}},
                "audio": {"sampleRate": 48000, "channels": 2}, "assets": assets,
                "tracks": [{"id": "picture", "kind": "video", "zIndex": 0},
                           {"id": "narration", "kind": "audio", "zIndex": 0}],
                "clips": [clip("red-clip", "picture", "red", 0, 60, 0, 2),
                          clip("blue-clip", "picture", "blue", 60, 120, 0, 2),
                          clip("voice-clip", "narration", "voice", 0, 120, 1, 5)],
                "captions": [], "transitions": [], "templateRefs": []}
    bindings = {a["assetVersionId"]: {"sha256": a["sha256"], "durationMs": 6000} for a in assets}
    media = {a["assetVersionId"]: "/fixture/" + a["ref"] + ".mp4" for a in assets}
    return deepcopy(document), bindings, media
