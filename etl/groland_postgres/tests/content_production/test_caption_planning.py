import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.caption_planning import captions_from_seed_asr
from content_production.edit_document import compile_document
from edit_document_fixture import fixture


def result(text='你好，世界。'):
    chars = text.replace('，', '').replace('。', '')
    return {'utterances': [{'text': text, 'words': [
        {'text': c, 'start_time': i * 200, 'end_time': (i + 1) * 200}
        for i, c in enumerate(chars)]}]}


def plan(data, **kwargs):
    return captions_from_seed_asr(data, clip_id='voice-clip', asset_version_id='voice-version',
                                  source_start_ms=kwargs.pop('source_start_ms', 1000),
                                  source_end_ms=kwargs.pop('source_end_ms', 5000),
                                  asr_origin_ms=1000, **kwargs)


class CaptionPlanningTests(unittest.TestCase):
    def test_punctuation_offset_and_real_compiler(self):
        data = result(); original = copy.deepcopy(data)
        data['utterances'][0]['words'].insert(0, {'text': ' ', 'start_time': -1, 'end_time': -1})
        planned = plan(data)
        self.assertEqual([c['text'] for c in planned['captions']], ['你好', '世界'])
        self.assertEqual(planned['captions'][0]['anchor']['sourceStart']['num'], 1000)
        self.assertFalse(planned['termsVerified'])
        doc, bindings, media = fixture(); doc['captions'] = planned['captions']
        self.assertEqual(compile_document(doc, bindings, media, 'asr')['clips'][0]['captions'][0]['from'], 0)
        self.assertEqual(data['utterances'][0]['text'], original['utterances'][0]['text'])

    def test_cut_clause_and_text_mismatch_fail(self):
        with self.assertRaisesRegex(ValueError, 'cuts an ASR clause'):
            plan(result(), source_start_ms=1100)
        with self.assertRaisesRegex(ValueError, 'cuts an ASR clause'):
            plan(result(), source_end_ms=1700)
        data = result(); data['utterances'][0]['text'] = '换个产品'
        with self.assertRaisesRegex(ValueError, 'do not align'): plan(data)

    def test_bad_timing_empty_and_overlaps_fail(self):
        for value in [-1, True, 1.2, None]:
            data = result(); data['utterances'][0]['words'][0]['start_time'] = value
            with self.assertRaises(ValueError): plan(data)
        data = result(); data['utterances'][0]['words'][1]['end_time'] = 500
        with self.assertRaisesRegex(ValueError, 'overlaps'): plan(data)
        with self.assertRaisesRegex(ValueError, 'no timed speech'): plan(result(), source_start_ms=2000)

    def test_readability_warnings_do_not_claim_quality_pass(self):
        data = result('你好。')
        data['utterances'][0]['words'][0].update(start_time=0, end_time=50)
        data['utterances'][0]['words'][1].update(start_time=50, end_time=100)
        planned = plan(data)
        self.assertEqual({w['reason'] for w in planned['warnings']},
                         {'short_display_duration', 'reading_rate_exceeds_10_chars_per_second'})
        self.assertFalse(planned['termsVerified'])

    def test_layout_is_bounded_and_review_is_explicit(self):
        planned = plan(result('里面含有两大黄金成分。'))
        self.assertEqual(planned['captions'][0]['text'], '里面含有\n两大黄金成分')
        self.assertEqual(len(planned['warnings']), 1)
        with self.assertRaisesRegex(ValueError, 'two-line layout'): plan(result('一' * 19 + '。'))


if __name__ == '__main__': unittest.main()
