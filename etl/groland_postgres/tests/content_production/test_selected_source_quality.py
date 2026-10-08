import copy
from pathlib import Path
import sys
import unittest
import tempfile
from unittest.mock import Mock
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import selected_source_quality as quality
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from edit_document_fixture import fixture


class SelectedQualityTests(unittest.TestCase):
    def evaluate(self, doc, score=.98):
        with patch.object(quality, 'document_media', return_value={'red-version': 'red', 'blue-version': 'blue'}), \
             patch.object(quality, 'measure', return_value={'frames': 60, 'minimumSSIM': score, 'meanSSIM': score}) as measure:
            result = quality.review({'editDocument': doc}, {}, 'video', {'host_inspection': {'sha256': 'd'*64}}, '.', lambda: None)
        return result, measure.call_count

    def test_selected_windows_bind_picture_and_narration_without_approval(self):
        doc, _, _ = fixture(); doc['captionOverlayPolicy'] = 'preserve-source-picture-v1'
        before = copy.deepcopy(doc)
        result, calls = self.evaluate(doc)
        self.assertEqual(calls, 2)
        window = result['windows'][1]
        self.assertEqual((window['startFrame'], window['endFrame']), (60, 120))
        self.assertEqual(window['assetVersionId'], 'blue-version')
        self.assertEqual(window['narration'][0]['sourceStart'], {'num': 3, 'den': 1})
        self.assertEqual(window['narration'][0]['sourceEnd'], {'num': 5, 'den': 1})
        self.assertEqual(window['fidelity'], 'matched')
        self.assertFalse(result['deliveryApproved'])
        receipt = {'host_selected_source_quality': result, 'caption_quality': assess_rendered_captions(doc)}
        self.assertEqual(caption_delivery_reason({'editDocument': doc}, receipt), 'caption_quality_pending')
        self.assertEqual(doc, before)

    def test_mismatch_and_unsupported_composition_are_not_passes(self):
        doc, _, _ = fixture(); doc['captionOverlayPolicy'] = 'preserve-source-picture-v1'
        result, _ = self.evaluate(doc, .5)
        self.assertEqual(result['windows'][0]['fidelity'], 'mismatch')
        doc['clips'][0]['transform']['opacity'] = .5
        result, calls = self.evaluate(doc)
        self.assertEqual(calls, 1)
        self.assertEqual(result['windows'][0]['fidelity'], 'unverified')

    def test_long_windows_remain_pending_and_legacy_has_no_extra_work(self):
        doc, _, _ = fixture()
        result, calls = self.evaluate(doc)
        self.assertIsNone(result); self.assertEqual(calls, 0)
        doc['captionOverlayPolicy'] = 'preserve-source-picture-v1'
        doc['clips'][0]['timeline']['endFrame'] = 180
        doc['clips'] = [doc['clips'][0]]
        result, calls = self.evaluate(doc)
        self.assertEqual(calls, 0)
        self.assertEqual(result['windows'][0]['reason'], 'bounded_fidelity_budget_exceeded')
        self.assertFalse(result['deliveryApproved'])

    def test_cancellation_terminates_owned_inspection_process(self):
        process = Mock()
        process.poll.return_value = None
        route = {'sourceStart': {'num': 0, 'den': 1}, 'sourceEnd': {'num': 1, 'den': 1},
                 'startFrame': 0, 'endFrame': 30}
        def cancel():
            raise RuntimeError('cancelled')
        with tempfile.TemporaryDirectory() as work, patch.object(quality.subprocess, 'Popen', return_value=process):
            with self.assertRaisesRegex(RuntimeError, 'cancelled'):
                quality.measure('source', 'video', route, {'width': 720, 'height': 1280}, work, 0, cancel, None)
        process.terminate.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)


if __name__ == '__main__': unittest.main()
