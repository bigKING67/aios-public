import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.caption_preparation import prepare_captioned_document
from edit_document_fixture import fixture


def source(document):
    asset = next(a for a in document['assets'] if a['assetVersionId'] == 'voice-version')
    return {'assetVersionId': 'voice-version', 'sourceSha256': asset['sha256'], 'result': {'utterances': [
        {'text': '字幕。', 'words': [{'text':'字','start_time':1200,'end_time':1600},
                                 {'text':'幕','start_time':1600,'end_time':2000}]}]}}


class CaptionPreparationTests(unittest.TestCase):
    def test_next_revision_compiles_and_preserves_frozen_document(self):
        doc, bindings, media = fixture(); before = copy.deepcopy(doc)
        result = prepare_captioned_document(doc, bindings, media, source(doc), narration_clip_id='voice-clip',
            target_revision=doc['revision']+1, call_model=lambda _: {'groups':[{'lines':['字幕']}]}, model='fixture')
        self.assertEqual(doc, before)
        self.assertEqual(result['document']['revision'], doc['revision']+1)
        self.assertEqual(result['document']['captions'][0]['anchor']['sourceStart']['num'], 1200)
        self.assertNotEqual(result['baseDocumentSha256'], result['documentSha256'])
        self.assertEqual(result['status'], 'generated'); self.assertFalse(result['deliveryReady'])

    def test_stale_asr_or_revision_rejected_before_model(self):
        doc, bindings, media = fixture(); callback = MagicMock()
        for field in ['assetVersionId','sourceSha256']:
            receipt = source(doc); receipt[field] = 'stale'
            with self.assertRaisesRegex(ValueError, 'ASR source'):
                prepare_captioned_document(doc, bindings, media, receipt, narration_clip_id='voice-clip',
                    target_revision=doc['revision']+1, call_model=callback, model='fixture')
        with self.assertRaisesRegex(ValueError, 'next document revision'):
            prepare_captioned_document(doc, bindings, media, source(doc), narration_clip_id='voice-clip',
                target_revision=doc['revision'], call_model=callback, model='fixture')
        callback.assert_not_called()

    def test_failure_does_not_change_engineering_state(self):
        doc, bindings, media = fixture(); before = copy.deepcopy(doc)
        with self.assertRaises(ValueError):
            prepare_captioned_document(doc, bindings, media, source(doc), narration_clip_id='voice-clip',
                target_revision=doc['revision']+1, call_model=lambda _: {'groups':[{'lines':['错误']}]}, model='fixture')
        self.assertEqual(doc, before)


if __name__ == '__main__': unittest.main()
