import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.source_text_compatibility import assess_source_text
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from test_caption_overlay import sample


class SourceTextTests(unittest.TestCase):
    def test_full_picture_ranges_inspected_even_outside_caption(self):
        doc, _, _ = sample()
        before = copy.deepcopy(doc)
        report = assess_source_text(doc)
        self.assertEqual(report['inspectionFrames'], 60)
        self.assertEqual([r['action'] for r in report['routes']], ['preserve_original', 'inspect_source_text'])
        self.assertEqual(report['routes'][1]['sourceEnd'], {'num': 2, 'den': 1})
        self.assertTrue(all(r['textPresence'] == 'unverified' and not r['erasureAuthorized'] for r in report['routes']))
        self.assertEqual(doc, before)

    def test_missing_shifted_or_ambiguous_audio_never_claims_compatible(self):
        for mode in ('missing', 'shifted', 'ambiguous'):
            doc, _, _ = sample()
            voice = doc['clips'][-1]
            if mode == 'missing': doc['clips'].pop()
            if mode == 'shifted': voice['sourceMap'][0]['sourceStart'] = {'num': 0, 'den': 1}
            if mode == 'ambiguous':
                extra = copy.deepcopy(voice); extra['id'] = 'other-audio'; doc['clips'].append(extra)
            self.assertEqual(assess_source_text(doc)['inspectionFrames'], 120)

    def test_audio_gap_splits_picture_without_losing_coverage(self):
        doc, _, _ = sample()
        doc['clips'][-1]['timeline']['endFrame'] = 30
        result = assess_source_text(doc)
        self.assertEqual([(r['startFrame'], r['endFrame'], r['reason']) for r in result['routes']],
                         [(0,30,'same_source_same_time'),(30,60,'audio_reference_missing'),(60,120,'audio_reference_missing')])

    def test_empty_generated_captions_does_not_bypass_old_text_gate(self):
        doc, _, _ = sample(); doc['captions'] = []
        doc.pop('captionDisplayPolicy', None)
        receipt = {'caption_quality': assess_rendered_captions(doc)}
        self.assertEqual(caption_delivery_reason({'editDocument': doc},receipt), 'caption_quality_pending')
        self.assertEqual(caption_delivery_reason({'editDocument': doc},{}), 'caption_quality_receipt_invalid')
        receipt['caption_quality']['sourceTextRouting']['routes'][1]['action'] = 'preserve_original'
        self.assertEqual(caption_delivery_reason({'editDocument': doc},receipt), 'caption_quality_receipt_invalid')

    def test_all_retained_no_new_captions_keeps_technical_delivery_behavior(self):
        doc, _, _ = sample(); doc['captions'] = []
        doc['clips'][1]['assetRef'] = 'voice'
        doc['clips'][1]['sourceMap'][0].update(sourceStart={'num':3,'den':1},sourceEnd={'num':5,'den':1})
        receipt = {'caption_quality': assess_rendered_captions(doc)}
        self.assertEqual(receipt['caption_quality']['sourceTextRouting']['status'], 'original_preserved')
        self.assertIsNone(caption_delivery_reason({'editDocument': doc},receipt))
        self.assertFalse(receipt['caption_quality']['sourceTextRouting']['deliveryApproved'])

if __name__ == '__main__': unittest.main()
