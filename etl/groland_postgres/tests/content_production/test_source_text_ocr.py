import sys
import unittest
import tempfile
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.source_text_ocr import parse_tsv, sample_frames, inspect_if_enabled, inspect_source_text
from test_caption_overlay import sample

HEADER = 'level\tleft\ttop\twidth\theight\tconf\ttext\n'
PAGE = '1\t0\t0\t100\t200\t-1\t\n'

class OcrTests(unittest.TestCase):
    def test_sample_times_include_edges_but_never_interval_end(self):
        self.assertEqual(sample_frames({'startFrame':627,'endFrame':668}),[627,642,657,667])
        self.assertEqual(sample_frames({'startFrame':10,'endFrame':11}),[10])

    def test_normalized_top_left_boxes_keep_uncertain_role(self):
        result=parse_tsv(HEADER+PAGE+'5\t10\t120\t80\t20\t70\t活动价\n')
        self.assertEqual(result,[{'text':'活动价','confidence':.7,'box':[.1,.6,.8,.1],'role':'unverified'}])
        self.assertEqual(parse_tsv(HEADER+PAGE),[])

    def test_invalid_box_or_confidence_fails_instead_of_clean_receipt(self):
        for row in ['5\t90\t0\t80\t20\t70\t字\n','5\t0\t0\t20\t20\tnan\t字\n']:
            with self.assertRaises(ValueError):parse_tsv(HEADER+PAGE+row)
        with self.assertRaises(ValueError):parse_tsv(HEADER)

    def test_missing_tool_is_incomplete_not_text_free(self):
        doc, _, media = sample()
        with tempfile.TemporaryDirectory() as work, patch('content_production.source_text_ocr.subprocess.run', side_effect=FileNotFoundError):
            report = inspect_source_text(doc, media, work, lambda: None)
        self.assertEqual(report['status'], 'incomplete')
        self.assertFalse(report['textFreeVerified'])
        self.assertFalse(report['erasureAuthorized'])

    def test_sample_budget_marks_partial_and_never_approves_empty_ocr(self):
        doc, _, media = sample()
        doc['clips'][1]['timeline']['endFrame'] = 1000
        def run(args, **kwargs):
            return SimpleNamespace(stdout=b'tesseract 5\n' if '--version' in args else (HEADER+PAGE).encode())
        with tempfile.TemporaryDirectory() as work, patch('content_production.source_text_ocr.subprocess.run', side_effect=run), patch('content_production.source_text_ocr.file_hash', return_value='a'*64):
            report = inspect_source_text(doc, media, work, lambda: None)
        self.assertEqual(len(report['samples']),16)
        self.assertEqual(report['status'],'partial')
        self.assertEqual(report['reason'],'sample_limit')
        self.assertFalse(report['deliveryApproved'])
        self.assertFalse(report['textFreeVerified'])

    def test_disabled_by_default_and_unknown_setting_rejected(self):
        with patch.dict('os.environ',{'AIOS_SOURCE_TEXT_OCR':'0'}):
            self.assertIsNone(inspect_if_enabled({}, {}, Path('/unused'),lambda:None))
        with patch.dict('os.environ',{'AIOS_SOURCE_TEXT_OCR':'yes'}):
            with self.assertRaises(ValueError):inspect_if_enabled({}, {}, Path('/unused'),lambda:None)

if __name__ == '__main__':unittest.main()
