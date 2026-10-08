import copy
import unittest
from content_production.source_text_plan import plan_source_text, prepare_source_text_plan
from unittest.mock import patch
from pathlib import Path
from test_caption_overlay import sample


class TextPlanTests(unittest.TestCase):
    def record(self, doc, roles, clip=1):
        a = next(a for a in doc['assets'] if a['ref'] == doc['clips'][clip]['assetRef'])
        return {'assetVersionId': a['assetVersionId'], 'sourceSha256': a['sha256'],
            'visibleText': {'coverage': 'partial', 'observations': [
                {'start_ms': 0, 'end_ms': 10000, 'text': '观察文字', 'role': role,
                 'box': None, 'confidence': .9} for role in roles]}}

    def test_preserved_picture_never_recommends_erasure_but_checks_promotion(self):
        doc, _, _ = sample()
        r = self.record(doc, ['dialogue_subtitle', 'promotion'], 0)
        plan = plan_source_text(doc, [r]); steps = plan['routes'][0]['nextSteps']
        self.assertIn('retain_source_pixels', steps)
        self.assertIn('check_promotion_against_current_business_facts', steps)
        self.assertNotIn('assess_burned_caption_conflict', steps)
        self.assertFalse(plan['deliveryApproved'])

    def test_replacement_distinguishes_roles_and_preserves_input(self):
        doc, _, _ = sample(); r = self.record(doc, ['dialogue_subtitle', 'packaging', 'brand_mark', 'unknown'])
        before = copy.deepcopy((doc, r))
        route = plan_source_text(doc, [r])['routes'][1]
        self.assertIn('prefer_clean_alternative', route['nextSteps'])
        self.assertIn('protect_product_and_brand_text', route['nextSteps'])
        self.assertIn('classify_unresolved_visible_text', route['nextSteps'])
        self.assertFalse(route['erasureAuthorized']); self.assertEqual((doc, r), before)

    def test_empty_partial_or_missing_analysis_is_not_clean(self):
        doc, _, _ = sample()
        for records in ([], [self.record(doc, [])]):
            route = plan_source_text(doc, records)['routes'][1]
            self.assertFalse(route['textFreeVerified'])
            self.assertEqual(route['textPresence'], 'unverified')
            self.assertIn('verify_remaining_source_text_scope', route['nextSteps'])

    def test_track_and_burned_text_can_coexist(self):
        doc, _, _ = sample(); r = self.record(doc, ['dialogue_subtitle'])
        r['subtitleStreams'] = [{'index': 2, 'codec': 'ass'}]
        steps = plan_source_text(doc, [r])['routes'][1]['nextSteps']
        self.assertIn('inspect_and_retime_separate_subtitle_track', steps)
        self.assertIn('assess_burned_caption_conflict', steps)

    def test_host_probes_tracks_and_rejects_changed_media(self):
        doc, bindings, media = sample()
        expected = {str(Path(media[a['assetVersionId']])): a['sha256'] for a in doc['assets']}
        prepared = {'document': doc, 'bindings': bindings, 'media': media}
        with patch('content_production.execution.file_hash', side_effect=lambda p: expected[str(p)]), \
             patch('content_production.source_treatment_media._probe', return_value={'streams': [
                 {'codec_type': 'video', 'index': 0}, {'codec_type': 'subtitle', 'index': 2, 'codec_name': 'subrip'}]}):
            result = prepare_source_text_plan(prepared, [], Path('.'), lambda: None)
            self.assertEqual(result['routes'][1]['subtitleStreams'], [{'index': 2, 'codec': 'subrip'}])
            self.assertFalse(result['routes'][1]['textFreeVerified'])
        with patch('content_production.execution.file_hash', return_value='changed'):
            with self.assertRaisesRegex(ValueError, 'differs'):
                prepare_source_text_plan(prepared, [], Path('.'), lambda: None)

    def test_outside_window_observations_do_not_leak_and_binding_rejects(self):
        doc, _, _ = sample(); r = self.record(doc, ['promotion'])
        r['visibleText']['observations'][0].update(start_ms=20000, end_ms=21000)
        self.assertEqual(plan_source_text(doc, [r])['routes'][1]['observedRoles'], [])
        with self.assertRaises(ValueError): plan_source_text(doc, [r, r])
        r['sourceSha256'] = 'incorrect'
        with self.assertRaises(ValueError): plan_source_text(doc, [r])


if __name__ == '__main__': unittest.main()
