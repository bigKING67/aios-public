import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.edit_document import compile_document, resolve_caption_display
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from content_production.caption_worker import run_review
from edit_document_fixture import fixture


def sample():
    doc, bindings, media = fixture()
    doc['captionOverlayPolicy'] = 'preserve-source-picture-v1'
    doc['captionDisplayPolicy'] = 'source-hold-v1'
    doc['assets'] = [a for a in doc['assets'] if a['ref'] != 'red']
    doc['clips'][0]['assetRef'] = 'voice'
    doc['clips'][0]['sourceMap'][0].update(sourceStart={'num': 1, 'den': 1}, sourceEnd={'num': 3, 'den': 1})
    doc['captions'] = [{'id': 'caption', 'stylePreset': 'basic-bottom-v1', 'text': '完整字幕',
                        'anchor': {'kind': 'source', 'clipId': 'voice-clip', 'assetVersionId': 'voice-version',
                                   'sourceStart': {'num': 5, 'den': 2}, 'sourceEnd': {'num': 7, 'den': 2}}}]
    return doc, bindings, media


class CaptionOverlayTests(unittest.TestCase):
    def test_same_source_same_time_retained_and_partial_caption_is_bounded(self):
        doc, bindings, media = sample(); before = copy.deepcopy(doc)
        compiled = compile_document(doc, bindings, media, 'preserve')
        self.assertEqual(compiled['clips'][0]['captions'], [])
        self.assertEqual(compiled['clips'][1]['captions'][0]['from'], 0)
        self.assertEqual(compiled['clips'][1]['captions'][0]['to'], .5)
        cue = resolve_caption_display(doc)[0]
        self.assertEqual(cue['preservedSourceRanges'], [{'startFrame':45, 'endFrame':60}])
        self.assertEqual(cue['renderRanges'], [{'startFrame':60, 'endFrame':75}])
        self.assertEqual(doc, before)
        assessment = assess_rendered_captions(doc)
        self.assertEqual(assessment['schema'], 'aios.caption-quality.v4')
        self.assertEqual(assessment['status'], 'needs_revision')  # Visible fragment only 15 frames.
        self.assertEqual(assessment['sourceTextCompatibility'], 'unverified')
        assessment['displayCues'][0]['preservedSourceRanges'] = []
        self.assertEqual(caption_delivery_reason({'editDocument':doc},{'caption_quality':assessment}), 'caption_quality_receipt_invalid')

    def test_time_mismatch_and_timeline_titles_are_not_suppressed(self):
        doc, bindings, media = sample()
        doc['clips'][0]['sourceMap'][0].update(sourceStart={'num':0,'den':1}, sourceEnd={'num':2,'den':1})
        self.assertTrue(compile_document(doc,bindings,media,'offset')['clips'][0]['captions'])
        self.assertEqual(resolve_caption_display(doc)[0]['renderRanges'], [{'startFrame':45,'endFrame':75}])
        doc,bindings,media = sample()
        doc['captions'][0]['anchor'] = {'kind':'timeline','startFrame':45,'endFrame':75}
        self.assertTrue(compile_document(doc,bindings,media,'title')['clips'][0]['captions'])

    def test_legacy_and_unknown_policy(self):
        doc,bindings,media = sample(); del doc['captionOverlayPolicy']
        self.assertTrue(compile_document(doc,bindings,media,'legacy')['clips'][0]['captions'])
        self.assertNotIn('renderRanges',resolve_caption_display(doc)[0])
        doc['captionOverlayPolicy']='unknown';doc['captions']=[]
        with self.assertRaises(ValueError):compile_document(doc,bindings,media,'unknown')

    def test_all_retained_skips_model_without_approving_original_text(self):
        doc,bindings,media = sample()
        doc['captions'][0]['anchor']['sourceEnd']={'num':3,'den':1}
        factory,reserve=Mock(),Mock()
        result=run_review(doc,bindings,media,limit=3,model='unused',callback_factory=factory,reserve=reserve,tick=lambda:None)
        self.assertEqual(result['reason'],'original_source_picture_preserved')
        self.assertEqual(result['callsReserved'],0)
        self.assertFalse(result['deliveryApproved'])
        factory.assert_not_called();reserve.assert_not_called()


if __name__ == '__main__':unittest.main()
