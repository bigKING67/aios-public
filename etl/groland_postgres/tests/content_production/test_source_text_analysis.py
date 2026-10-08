import copy
import unittest
from content_production.source_text_analysis import record_from_excerpt
from content_production.source_text_plan import plan_source_text
from test_caption_overlay import sample


class ExcerptAnalysisTests(unittest.TestCase):
    def fixture(self):
        doc, _, _ = sample()
        asset = next(a for a in doc['assets'] if a['ref'] == doc['clips'][1]['assetRef'])
        manifest = {'sourceSha256': asset['sha256'], 'inputSha256': 'input-hash',
            'sourceStartMs': 1000, 'sourceEndMs': 2000, 'inputTimeOriginMs': 0,
            'geometry': 'uniform scale to 720px width; no crop'}
        result = {'analysis': {'video_understanding': {'visible_text': {'coverage': 'partial', 'observations': [
            {'start_ms': 0, 'end_ms': 500, 'text': '旧字幕', 'role': 'dialogue_subtitle',
             'box': [.1,.6,.8,.1], 'confidence': .8}]}}}}
        return doc, asset, manifest, result

    def test_mapped_source_range_reaches_planner_without_mutation(self):
        doc, asset, manifest, result = self.fixture(); before = copy.deepcopy(result)
        record = record_from_excerpt(asset, manifest, result, input_sha256='input-hash')
        item = record['visibleText']['observations'][0]
        self.assertEqual((item['start_ms'],item['end_ms']), (1000,1500))
        self.assertEqual(result, before)
        route = plan_source_text(doc, [record])['routes'][1]
        self.assertIn('assess_burned_caption_conflict', route['nextSteps'])
        self.assertEqual(route['analysisEvidence']['precision'], 'model_estimate')
        self.assertFalse(route['textFreeVerified'])

    def test_nonzero_input_origin(self):
        _, asset, manifest, result = self.fixture(); manifest['inputTimeOriginMs'] = 500
        result['analysis']['video_understanding']['visible_text']['observations'][0].update(start_ms=500,end_ms=1000)
        r = record_from_excerpt(asset, manifest, result, input_sha256='input-hash')
        self.assertEqual(r['visibleText']['observations'][0]['start_ms'],1000)

    def test_binding_range_geometry_and_empty_results(self):
        _, asset, manifest, result = self.fixture()
        for field, value in [('sourceSha256','wrong'), ('inputSha256','wrong'), ('sourceStartMs',True),
                             ('sourceEndMs',1000), ('geometry','cropped')]:
            changed = {**manifest, field:value}
            with self.assertRaises(ValueError): record_from_excerpt(asset,changed,result,input_sha256='input-hash')
        observations = result['analysis']['video_understanding']['visible_text']['observations']
        observations[0]['end_ms'] = 1001
        with self.assertRaises(ValueError):record_from_excerpt(asset,manifest,result,input_sha256='input-hash')
        observations.clear()
        r=record_from_excerpt(asset,manifest,result,input_sha256='input-hash')
        self.assertFalse(r['analysisEvidence']['textFreeVerified'])


if __name__ == '__main__': unittest.main()
