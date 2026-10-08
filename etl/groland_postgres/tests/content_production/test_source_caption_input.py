import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_source_caption_boundaries as fixture
from content_production.source_caption_input import source_context, observe_asset_caption_range
from content_production.source_caption_groups import match_source_caption_groups
from content_production.source_caption_coverage import complete_source_caption_coverage
from content_production.source_treatment_captions import _audio


class SourceCaptionInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SourceCaptionBoundaryTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixture.SourceCaptionBoundaryTests.tearDownClass()

    def setUp(self):
        self.case = fixture.SourceCaptionBoundaryTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        _, asset = _audio(self.case.case.document)
        self.sources = [{**asset, 'durationMs': 6000}]
        self.version = asset['assetVersionId']

    def test_preplanning_source_reaches_coverage_without_an_edit_project(self):
        c = self.case
        parent = c.case.root / 'source-only'
        callback = Mock(side_effect=fixture.observations)
        reference = observe_asset_caption_range(self.sources, self.version, 30, 60,
            c.case.media, parent, model='fixture', call_model=callback, check=lambda: None)
        request, context = source_context(self.sources, self.version, 30, 60)
        self.assertNotIn('clips', context)
        self.assertNotIn('projectId', context)
        self.assertEqual(reference['status'], 'observed')
        self.assertEqual(observe_asset_caption_range(self.sources, self.version, 30, 60,
            c.case.media, parent, model='fixture', call_model=callback, check=lambda: None), reference)
        self.assertEqual(callback.call_count, 1)
        def groups(messages):
            frames = [int(p['text'].split()[1].split('，')[0]) for p in messages[1]['content']
                      if p['type'] == 'input_text' and p['text'].startswith('待判断帧')]
            return {'samples': [{'frame': f, 'groupId': 'g0' if f < 22 else 'g1' if f < 52 else 'g2'} for f in frames]}
        group_work = c.case.root / 'source-only-groups'
        match_source_caption_groups(request, context, c.case.media, parent, group_work,
            region=c.region, model='fixture', call_model=groups, check=lambda: None)
        result = complete_source_caption_coverage(request, context, c.case.media, parent, group_work,
            c.case.root / 'source-only-coverage', region=c.region, model='fixture', call_limit=2,
            call_model=groups, check=lambda: None)
        self.assertTrue(result['frameCoverageComplete'])
        self.assertEqual(result['sourceBinding']['assetVersionId'], self.version)
        self.assertEqual(result['scopeIntervals'][0]['sourceMap']['sourceStart'], {'num': 1, 'den': 1})
        self.assertFalse(result['executableEditAllowed'])
        wrong_source = copy.deepcopy(self.sources)
        wrong_source[0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'media changed'):
            observe_asset_caption_range(wrong_source, self.version, 30, 60, c.case.media,
                c.case.root / 'wrong-source', model='fixture', call_model=callback, check=lambda: None)
        self.assertEqual(callback.call_count, 1)
        changed = copy.deepcopy(self.sources)
        changed[0]['durationMs'] = 6100
        with self.assertRaisesRegex(ValueError, 'changed'):
            observe_asset_caption_range(changed, self.version, 30, 60, c.case.media, parent,
                model='fixture', call_model=callback, check=lambda: None)
        self.assertEqual(callback.call_count, 1)

    def test_preflight_bounds_calls_replays_and_filters_short_intervals(self):
        from content_production.source_caption_input import preflight_source_captions
        c = self.case
        split = False
        def answer(messages):
            parts = messages[1]['content']
            dense = [p for p in parts if p['type'] == 'input_text' and p['text'].startswith('待判断帧')]
            if dense:
                return {'samples': [{'frame': int(p['text'].split()[1].split('，')[0]), 'groupId': 'g1' if split and int(p['text'].split()[1].split('，')[0]) >= 30 else 'g0'} for p in dense]}
            result = fixture.observations(messages)
            for item in result['samples']:
                item['lines'] = ['另一句' if split and item['frame'] >= 30 else '完整原片字幕']
            return result
        callback = Mock(side_effect=answer)
        def run(required=33, budget=3, name='preflight'):
            return preflight_source_captions(self.sources, self.version, 30, 60, c.case.media,
                c.case.root / name, required_frames=required, region=c.region,
                model='fixture', max_calls=budget, call_model=callback, check=lambda: None)
        result = run()
        self.assertEqual(result['status'], 'candidates_observed')
        self.assertEqual(result['candidates'][0]['frameCount'], 60)
        self.assertEqual(result['candidates'][0]['sourceMap']['sourceStart'], {'num': 1, 'den': 1})
        self.assertEqual(result['callsReserved'], 3)
        self.assertFalse(result['executableEditAllowed'])
        self.assertEqual(run(), result)
        self.assertEqual(callback.call_count, 3)
        for required, budget in [(61, 3), (33, 4), (34, 3)]:
            with self.assertRaises(ValueError):
                run(required, budget)
        self.assertEqual(callback.call_count, 3)
        split = True
        short = run(name='short-preflight')
        self.assertEqual(short['status'], 'needs_inspection')
        self.assertEqual(short['candidates'], [])  # Two 30-frame groups cannot fill 33 frames.
        self.assertEqual(callback.call_count, 6)

    def test_wrong_version_duplicate_and_out_of_range_are_rejected(self):
        for sources, version, start, length in [
            (self.sources, 'unknown', 0, 30), (self.sources * 2, self.version, 0, 30),
            (self.sources, self.version, -1, 30), (self.sources, self.version, True, 30),
            (self.sources, self.version, 0, 151), (self.sources, self.version, 170, 30),
        ]:
            with self.assertRaises(ValueError):
                source_context(sources, version, start, length)
