import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from edit_document_fixture import fixture


class CaptionQualityTests(unittest.TestCase):
    def test_no_captions_preserve_existing_delivery(self):
        doc, _, _ = fixture()
        self.assertEqual(assess_rendered_captions(doc)['status'], 'not_applicable')
        self.assertIsNone(caption_delivery_reason({'editDocument': doc}, {}))
        self.assertIsNone(caption_delivery_reason({'aspect': 'portrait'}, {}))

    def test_technical_render_never_implies_caption_quality(self):
        doc, _, _ = fixture()
        doc['captions'] = [{'id': 'c', 'text': '字幕', 'stylePreset': 'basic-bottom-v1',
            'anchor': {'kind': 'timeline', 'startFrame': 0, 'endFrame': 60}}]
        receipt = {'caption_quality': assess_rendered_captions(doc)}
        self.assertEqual(caption_delivery_reason({'editDocument': doc}, receipt), 'caption_quality_pending')
        self.assertEqual(caption_delivery_reason({'editDocument': doc}, {}), 'caption_quality_receipt_invalid')
        changed = copy.deepcopy(doc); changed['captions'][0]['text'] = '篡改'
        self.assertEqual(caption_delivery_reason({'editDocument': changed}, receipt), 'caption_quality_receipt_invalid')
        receipt['caption_quality']['status'] = 'passed'
        self.assertEqual(caption_delivery_reason({'editDocument': doc}, receipt), 'caption_quality_receipt_invalid')

    def test_short_source_caption_requires_revision(self):
        doc, _, _ = fixture()
        doc['captions'] = [{'id': 'c', 'text': '字幕', 'stylePreset': 'basic-bottom-v1',
            'anchor': {'kind': 'source', 'clipId': 'voice-clip', 'assetVersionId': 'voice-version',
                       'sourceStart': {'num': 1, 'den': 1}, 'sourceEnd': {'num': 3, 'den': 2}}}]
        receipt = {'caption_quality': assess_rendered_captions(doc)}
        self.assertEqual(caption_delivery_reason({'editDocument': doc}, receipt), 'caption_revision_required')


if __name__ == '__main__': unittest.main()
