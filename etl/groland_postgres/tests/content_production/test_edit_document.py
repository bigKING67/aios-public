import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.edit_document import compile_document
from content_production.execution import build_spec
from edit_document_fixture import fixture


class EditDocumentTests(unittest.TestCase):
    def test_source_style_survives_cuts_without_mutating_original(self):
        document, bindings, media = fixture()
        style = {"fontHeight": .035, "centerY": .6875, "color": "#ffffff", "strokeWidth": .0015, "weight": 900}
        document["captions"] = [{"id": "styled", "stylePreset": "source-style-v1", "style": style,
            "text": "保留原片样式", "anchor": {"kind": "timeline", "startFrame": 30, "endFrame": 90}}]
        original = copy.deepcopy(document)
        spec = compile_document(document, bindings, media, "styled")
        self.assertEqual([c["captions"][0]["style"] for c in spec["clips"]], [style, style])
        self.assertEqual(document, original)
        for bad in ({"color": "red;display:none"}, {"fontHeight": True}, {"centerY": float("nan")},
                    {"strokeWidth": .1}, {"weight": True}, {"css": "any"}):
            invalid = copy.deepcopy(document)
            invalid["captions"][0]["style"].update(bad)
            with self.assertRaises(ValueError):
                compile_document(invalid, bindings, media, "bad")
        document["captions"][0]["stylePreset"] = "basic-bottom-v1"
        with self.assertRaises(ValueError):
            compile_document(document, bindings, media, "default override")

    def test_source_audio_caption_crosses_picture_cut_without_losing_time(self):
        document, bindings, media = fixture()
        document["clips"][1]["sourceMap"][0].update(
            sourceStart={"num": 3, "den": 1}, sourceEnd={"num": 5, "den": 1})
        document["captions"] = [{"id": "speech", "stylePreset": "basic-bottom-v1",
            "text": "商品与声音\n保持一致", "anchor": {"kind": "source", "clipId": "voice-clip", "assetVersionId": "voice-version",
            "sourceStart": {"num": 5, "den": 2}, "sourceEnd": {"num": 7, "den": 2}}}]
        original = copy.deepcopy(document)
        spec = compile_document(document, bindings, media, "captions")
        self.assertEqual(spec["clips"][0]["captions"][0]["from"], 1.5)
        self.assertEqual(spec["clips"][0]["captions"][0]["to"], 2)
        self.assertEqual(spec["clips"][1]["captions"][0]["from"], 3)
        self.assertEqual(spec["clips"][1]["captions"][0]["to"], 3.5)
        self.assertEqual(document, original)

    def test_timeline_captions_are_ordered_and_invalid_cues_are_rejected(self):
        document, bindings, media = fixture()
        cue = {"id": "title", "stylePreset": "basic-bottom-v1", "text": "<产品> & 演示",
               "anchor": {"kind": "timeline", "startFrame": 30, "endFrame": 90}}
        document["captions"] = [cue]
        self.assertEqual(compile_document(document, bindings, media, "caption")["clips"][1]["captions"],
                         [{"from": 0, "to": 1, "text": cue["text"]}])
        cases = [lambda c: c.update(stylePreset="unknown"), lambda c: c.update(text=" "),
                 lambda c: c.update(text="bad\x00text"), lambda c: c["anchor"].update(endFrame=121),
                 lambda c: c["anchor"].update(startFrame=True),
                 lambda c: c.update(anchor={"kind": "source", "clipId": "missing", "assetVersionId": "voice-version",
                     "sourceStart": {"num": 1, "den": 1}, "sourceEnd": {"num": 2, "den": 1}}),
                 lambda c: c.update(anchor={"kind": "source", "clipId": "voice-clip", "assetVersionId": "voice-version",
                     "sourceStart": {"num": 0, "den": 1}, "sourceEnd": {"num": 2, "den": 1}})]
        for change in cases:
            invalid = copy.deepcopy(document)
            change(invalid["captions"][0])
            with self.assertRaises(ValueError):
                compile_document(invalid, bindings, media, "bad")
        document["captions"].append({**copy.deepcopy(cue), "id": "overlap"})
        with self.assertRaisesRegex(ValueError, "overlapping"):
            compile_document(document, bindings, media, "overlap")

    def test_adjacent_asr_cues_share_frame_boundary_and_stale_source_is_rejected(self):
        document, bindings, media = fixture()
        for ident, start, end in (("a", 1160, 1480), ("b", 1480, 1760)):
            document["captions"].append({"id": ident, "text": ident, "stylePreset": "basic-bottom-v1",
                "anchor": {"kind": "source", "clipId": "voice-clip", "assetVersionId": "voice-version",
                           "sourceStart": {"num": start, "den": 1000},
                           "sourceEnd": {"num": end, "den": 1000}}})
        cues = compile_document(document, bindings, media, "adjacent")["clips"][0]["captions"]
        self.assertEqual(cues[0]["to"], cues[1]["from"])
        document["captions"][0]["anchor"]["assetVersionId"] = "old-version"
        with self.assertRaisesRegex(ValueError, "version changed"):
            compile_document(document, bindings, media, "stale")

    def test_continuous_audio_is_independent_of_two_muted_pictures(self):
        document, bindings, media = fixture()
        original = copy.deepcopy(document)
        spec = compile_document(document, bindings, media, "B-roll")
        self.assertEqual([c["frames"] for c in spec["clips"]], [60, 60])
        self.assertEqual([c["volume"] for c in spec["clips"]], [0, 0])
        self.assertEqual(spec["audio"], [{"id": "clip3", "asset_id": "asset2", "in_seconds": 1.0,
                                           "frames": 120, "start_frame": 0, "volume": 1}])
        self.assertEqual(document, original)

    def test_non_integer_source_seconds_are_exact_until_adapter_conversion(self):
        document, bindings, media = fixture()
        mapping = document["clips"][0]["sourceMap"][0]
        mapping["sourceStart"] = {"num": 1, "den": 30}
        mapping["sourceEnd"] = {"num": 61, "den": 30}
        spec = compile_document(document, bindings, media, "frame")
        self.assertEqual(spec["clips"][0]["in_seconds"], 1 / 30)

    def test_invalid_or_unsupported_edits_fail_instead_of_silently_downgrading(self):
        cases = [
            lambda d: d.update(schema="future"),
            lambda d: d.update(unknown=True),
            lambda d: d["canvas"]["fps"].update(num=24),
            lambda d: d["canvas"].update(width=641),
            lambda d: d["audio"].update(channels=1),
            lambda d: d["clips"][0]["timeline"].update(startFrame=True),
            lambda d: d["clips"][0]["timeline"].update(startFrame=1),
            lambda d: d["clips"][1]["timeline"].update(startFrame=59, endFrame=119),
            lambda d: d["clips"][2]["timeline"].update(startFrame=1, endFrame=121),
            lambda d: d["clips"][0]["sourceMap"][0]["sourceEnd"].update(num=3),
            lambda d: d["clips"][0]["sourceMap"][0]["sourceStart"].update(den=0),
            lambda d: d["clips"][2]["sourceMap"][0].update(sourceStart={"num": 3, "den": 1}, sourceEnd={"num": 7, "den": 1}),
            lambda d: d["clips"][0].update(audioPolicy="preserve"),
            lambda d: d["clips"][0]["transform"].update(opacity=0.5),
            lambda d: d["clips"][2].update(gain=float("nan")),
            lambda d: d["clips"][2].update(gain=2),
            lambda d: d["clips"][2].update(trackId=[]),
            lambda d: d["clips"][2].update(id=d["clips"][0]["id"]),
            lambda d: d["clips"][0].update(assetRef="outside"),
            lambda d: d["assets"][2].update(sha256="0" * 64),
            lambda d: d["assets"].append(copy.deepcopy(d["assets"][0])),
            lambda d: d["tracks"].append({"id": "overlay", "kind": "video", "zIndex": 1}),
            lambda d: d["clips"].append({**copy.deepcopy(d["clips"][2]), "id": "overlap"}),
            lambda d: d["captions"].append({"text": "unsupported"}),
            lambda d: d["transitions"].append({"type": "crossfade"}),
        ]
        for index, change in enumerate(cases):
            with self.subTest(case=index):
                document, bindings, media = fixture()
                change(document)
                with self.assertRaises(ValueError):
                    compile_document(document, bindings, media, "invalid")

    def test_audio_only_source_must_be_bound_and_available(self):
        document, bindings, media = fixture()
        del bindings["voice-version"]
        with self.assertRaises(ValueError):
            compile_document(document, bindings, media, "missing")
        document, bindings, media = fixture()
        del media["voice-version"]
        with self.assertRaises(ValueError):
            compile_document(document, bindings, media, "missing")

    def test_legacy_spec_retains_original_sound_and_caption_semantics(self):
        snapshot = {"title": "legacy", "aspect": "portrait", "assets": [{"assetId": "source"}],
                    "clips": [{"assetId": "source", "startMs": 1000, "endMs": 2033, "volume": 0.7, "caption": "test"}]}
        spec = build_spec(snapshot, {"source": Path("/fixture/source.mp4")}, "legacy")
        self.assertEqual(spec["audio"], [])
        self.assertEqual(spec["clips"][0]["volume"], 0.7)
        self.assertEqual(spec["clips"][0]["frames"], 30)
        self.assertEqual(spec["clips"][0]["captions"], [{"from": 1.0, "to": 2.033, "text": "test"}])


if __name__ == "__main__":
    unittest.main()
