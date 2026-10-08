import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, MagicMock
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.semantic_captions import prepare_words, ground_boundaries, plan_semantic_captions, chat_completion_callback, text_groups_to_boundaries, speech_context, merge_short_groups


def source():
    return {'utterances': [{'words': [{'text': c, 'start_time': i * 200, 'end_time': (i + 1) * 200}
                                    for i, c in enumerate('头油头痒还掉小雪花的还是用它')]}]}


def answer():
    return {'groups': [{'end': 14, 'lineEnds': [6, 14]}]}


class SemanticCaptionTests(unittest.TestCase):
    def test_exact_text_source_clock_and_model_receipt(self):
        original = source(); before = copy.deepcopy(original); calls = []
        def model(messages):
            calls.append(messages)
            return {"groups": [{"lines": ["头油头痒还掉", "小雪花的还是用它"]}]}
        plan = plan_semantic_captions(original, call_model=model, model='fixture', clip_id='voice',
            asset_version_id='frozen', source_start_ms=1000, source_end_ms=3800, asr_origin_ms=1000)
        self.assertEqual(plan['captions'][0]['text'], '头油头痒还掉\n小雪花的还是用它')
        self.assertEqual(plan['captions'][0]['anchor']['sourceStart']['num'], 1000)
        self.assertEqual(original, before)
        self.assertEqual(len(calls), 1)
        self.assertEqual(plan['provenance']['model'], 'fixture')

    def test_model_cannot_rewrite_omit_overflow_or_split_terms(self):
        words = prepare_words(source(), 0, 2800)
        invalid = [ {'groups': []}, {'groups': [{'end': 13, 'lineEnds': [6, 13]}]},
            {'groups': [{'end': 15, 'lineEnds': [6, 15]}]},
            {'groups': [{'end': 14, 'lineEnds': [14]}]},
            {'groups': [{'end': 14, 'lineEnds': [7, 14]}]},
            {'groups': [{'end': 14, 'lineEnds': [6, 14], 'text': 'new'}]},
            {'groups': [{'end': 14, 'lineEnds': [True, 14]}]} ]
        for reply in invalid:
            with self.subTest(reply=reply), self.assertRaises(ValueError):
                ground_boundaries(words, reply, 'voice', 'frozen', ('小雪花',))

    def test_real_brand_line_overflow_is_not_silently_accepted(self):
        text = ['就', '是', '这', '款', 'Glow', 'and', 'You', '白', '金']
        result = {'utterances': [{'text': ''.join(text), 'words': [
            {'text': word, 'start_time': i*200, 'end_time': (i+1)*200}
            for i, word in enumerate(text)]}]}
        model = MagicMock(return_value={'groups': [{'lines': ['就是这款', 'GlowandYou白金']}]})
        with self.assertRaisesRegex(ValueError, 'line exceeds capacity'):
            plan_semantic_captions(result, call_model=model, model='fixture', clip_id='voice',
                asset_version_id='frozen', source_start_ms=0, source_end_ms=1800,
                protected_terms=('GlowandYou',))
        self.assertEqual(model.call_count, 1)

    def test_cut_word_and_overlapping_groups_fail(self):
        with self.assertRaises(ValueError): prepare_words(source(), 100, 2800)
        words = prepare_words(source(), 0, 2800); words[5]['endMs'] = 1300
        with self.assertRaisesRegex(ValueError, 'overlap'):
            ground_boundaries(words, {'groups': [{'end': 6, 'lineEnds': [6]}, {'end': 14, 'lineEnds': [14]}]}, 'v', 'a')

    def test_invalid_local_parameters_do_not_call_model(self):
        model = MagicMock()
        for args in [{'protected_terms': ('',)}, {'asset_version_id': ''}, {'model': ''}]:
            options = dict(call_model=model, model='fixture', clip_id='voice', asset_version_id='frozen',
                           source_start_ms=0, source_end_ms=2800)
            options.update(args)
            with self.assertRaises(ValueError): plan_semantic_captions(source(), **options)
        model.assert_not_called()

    def test_text_lines_must_match_source_and_renderer_capacity(self):
        words = prepare_words(source(), 0, 2800)
        valid = {'groups': [{'lines': ['头油头痒还掉', '小雪花的还是用它']}]}
        self.assertEqual(text_groups_to_boundaries(words, valid), answer())
        for lines in [['头油头痒还掉', '小雪花的'], ['改写'], ['头油头痒还掉', '小雪花的', '还是用它']]:
            with self.assertRaises(ValueError): text_groups_to_boundaries(words, {'groups': [{'lines': lines}]})

    def test_punctuation_and_pause_context_is_grounded_before_call(self):
        raw = source(); raw['utterances'][0]['text'] = '头油头痒，还掉小雪花的还是用它。'
        words = prepare_words(raw, 0, 2800)
        context = speech_context(raw, words, 0)
        self.assertEqual(context['punctuationHints'], [{'afterWord': 4, 'mark': '，'}, {'afterWord': 14, 'mark': '。'}])
        self.assertEqual(context['pauses'], [])
        shifted = prepare_words(raw, 1000, 3800, 1000)
        self.assertEqual(speech_context(raw, shifted, 1000), context)
        raw['utterances'][0]['text'] = '不同的原文'
        callback = MagicMock()
        with self.assertRaisesRegex(ValueError, 'does not align'):
            plan_semantic_captions(raw, call_model=callback, model='fixture', clip_id='v', asset_version_id='a', source_start_ms=0, source_end_ms=2800)
        callback.assert_not_called()

    def test_cross_clause_candidate_is_not_silently_quality_passed(self):
        raw = source(); raw['utterances'][0]['text'] = '头油头痒，还掉小雪花的还是用它。'
        plan = plan_semantic_captions(raw, call_model=lambda _: {'groups': [{'lines': ['头油头痒还掉', '小雪花的还是用它']}]},
            model='fixture', clip_id='v', asset_version_id='a', source_start_ms=0, source_end_ms=2800)
        self.assertIn('crosses_asr_clause_boundary', [w['reason'] for w in plan['warnings']])

    def test_short_cues_merge_only_within_clause_and_line_budget(self):
        words = [{'text': c, 'startMs': i * 160, 'endMs': (i+1) * 160} for i, c in enumerate('发缝宽的也用它')]
        answer = {'groups': [{'end': 4, 'lineEnds': [4]}, {'end': 7, 'lineEnds': [7]}]}
        merged, count = merge_short_groups(words, answer, [{'afterWord': 7, 'mark': '，'}])
        self.assertEqual(merged, {'groups': [{'end': 7, 'lineEnds': [7]}]})
        self.assertEqual(count, 1)
        self.assertEqual(merge_short_groups(words, answer, [{'afterWord': 4, 'mark': '，'}]), (answer, 0))
        self.assertEqual(merge_short_groups(words, answer, []), (answer, 0))
        words[4]['startMs'] += 500
        self.assertEqual(merge_short_groups(words, answer, [{'afterWord': 7, 'mark': '，'}]), (answer, 0))

    def test_latin_brand_uses_display_budget_without_changing_text(self):
        words = [{'text': 'Glow', 'startMs': 0, 'endMs': 400},
                 {'text': 'and', 'startMs': 400, 'endMs': 700},
                 {'text': 'You', 'startMs': 700, 'endMs': 1000}]
        response = {'groups': [{'lines': ['GlowandYou']}]}
        boundaries = text_groups_to_boundaries(words, response)
        plan = ground_boundaries(words, boundaries, 'v', 'a')
        self.assertEqual(plan['captions'][0]['text'], 'GlowandYou')
        for oversized in ['一' * 10, 'W' * 10, 'a' * 13]:
            with self.assertRaisesRegex(ValueError, 'capacity'):
                text_groups_to_boundaries([{'text': oversized}], {'groups': [{'lines': [oversized]}]})

    def test_complete_clauses_on_separate_lines_are_not_cross_clause_errors(self):
        raw = source(); raw['utterances'][0]['text'] = '头油头痒还掉，小雪花的还是用它。'
        plan = plan_semantic_captions(raw, call_model=lambda _: {'groups': [{'lines': ['头油头痒还掉', '小雪花的还是用它']}]},
            model='fixture', clip_id='v', asset_version_id='a', source_start_ms=0, source_end_ms=2800)
        self.assertNotIn('crosses_asr_clause_boundary', [w['reason'] for w in plan['warnings']])

    def test_responses_transport(self):
        response = MagicMock(); response.__enter__.return_value = response; response.status_code = 200
        body = {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps({'groups': []})}]}]}
        response.iter_content.return_value = [json.dumps(body).encode()]
        callback = chat_completion_callback(base_url='https://example.com/v3', api_key='fixture', model='fixture', protocol='responses')
        with patch('requests.post', return_value=response) as post:
            self.assertEqual(callback([]), {'groups': []})
            self.assertTrue(post.call_args.args[0].endswith('/responses'))
            self.assertFalse(post.call_args.kwargs['json']['store'])

    def test_isolated_subject_is_flagged_but_complete_short_answer_is_allowed(self):
        for spoken, lines, expected in [
            ('关键是它洗一次管三天。', [['关键是', '它'], ['洗一次管三天']], True),
            ('关键是它洗一次管三天。', [['关键是'], ['它洗一次管三天']], False),
            ('谁来？我。然后走。', [['谁来'], ['我'], ['然后走']], False),
        ]:
            text = ''.join(''.join(group) for group in lines)
            raw = {'utterances': [{'text': spoken, 'words': [
                {'text': c, 'start_time': i*300, 'end_time': (i+1)*300} for i,c in enumerate(text)]}]}
            plan = plan_semantic_captions(raw,
                call_model=lambda _: {'groups': [{'lines': group} for group in lines]},
                model='fixture', clip_id='v', asset_version_id='a', source_start_ms=0, source_end_ms=len(text)*300)
            reasons = {w['reason'] for w in plan['warnings']}
            self.assertEqual('isolated_subject_before_continuation' in reasons, expected)

    def test_transport_is_bounded_and_does_not_retry(self):
        callback = chat_completion_callback(base_url='https://example.com/v1', api_key='fixture', model='fixture')
        response = MagicMock(); response.__enter__.return_value = response; response.status_code = 200
        response.iter_content.return_value = [json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(answer())}}]}).encode()]
        with patch('requests.post', return_value=response) as post:
            self.assertEqual(callback([]), answer()); self.assertEqual(post.call_count, 1)
            self.assertFalse(post.call_args.kwargs['allow_redirects'])
        response.status_code = 429
        with patch('requests.post', return_value=response) as post, self.assertRaisesRegex(ValueError, '429'):
            callback([])
        self.assertEqual(post.call_count, 1)


if __name__ == '__main__': unittest.main()
