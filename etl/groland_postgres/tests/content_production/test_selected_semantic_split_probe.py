import unittest
from selected_semantic_split_probe import comparison_input, validate_comparison, validate_observation
from content_production.selected_text_review import validate_vision, text_item


class SplitProbeTests(unittest.TestCase):
    def test_vision_requires_separate_text_observation_and_exact_visual_kinds(self):
        value = {'checks': [{'kind': k, 'verdict': 'uncertain', 'observation': '证据不足'}
                            for k in ('picture_narration', 'visible_artifacts')],
                 'visibleText': {'visibility': 'readable', 'texts': ['原字幕']}}
        self.assertEqual(validate_vision(value)[1]['texts'], ['原字幕'])
        value['checks'][1]['kind'] = 'visible_text'
        with self.assertRaises(ValueError): validate_vision(value)
        value['checks'][1]['kind'] = 'picture_narration'
        with self.assertRaises(ValueError): validate_vision(value)

    def test_missing_or_uncertain_observation_never_enters_text_judge(self):
        self.assertIsNone(comparison_input([], {'visibility': 'none_observed', 'texts': []}))
        self.assertIsNone(comparison_input([], {'visibility': 'uncertain', 'texts': ['部分字']}))
        for value in ({'visibility': 'readable', 'texts': []},
                      {'visibility': 'none_observed', 'texts': ['文字']},
                      {'visibility': 'readable', 'texts': [' ']},
                      {'visibility': 'readable', 'texts': ['文字'], 'approved': True}):
            with self.assertRaises(ValueError):
                validate_observation(value)

    def test_comparison_receives_text_evidence_not_expected_labels_or_video_facts(self):
        planned = [('negative_case', {'brief': '业务要求', 'narration': {'current': [{'text': '台词'}]},
                    'window': {'frames': 33}}, {'visible_text': 'issue_observed'})]
        payload = comparison_input(planned, {'visibility': 'readable', 'texts': ['字幕']})
        self.assertEqual(payload['items'], [{'id': '0', 'visibleTexts': ['字幕'],
                                            'brief': '业务要求', 'narration': {'current': [{'text': '台词'}]},
                                            'literalContextMatches': [{'text': '字幕', 'foundInCurrentNarration': False,
                                                                       'foundInNarrationContext': False, 'timingVerified': False}]}])

    def test_literal_evidence_distinguishes_adjacent_current_and_absent_without_approval(self):
        words = {'current': [{'text': '泡沫贼绵密'}],
                 'context': [{'text': '随便一揉\n'}, {'text': '泡沫贼绵密'}]}
        observation = {'visibility': 'readable', 'texts': ['泡沫贼绵密', '随便一揉 泡沫贼绵密', '完全没有泡沫']}
        item = text_item('a', observation, '保持原字幕', words)
        self.assertEqual([(x['foundInCurrentNarration'], x['foundInNarrationContext'])
                          for x in item['literalContextMatches']], [(True, True), (False, True), (False, False)])
        self.assertTrue(all(x['timingVerified'] is False for x in item['literalContextMatches']))
        self.assertNotIn('relation', item)
        self.assertNotIn('deliveryApproved', item)
        # Containment within a negation is still only a literal match, not semantic equivalence.
        negated = text_item('a', {'texts': ['有泡沫']}, '', {'current': [{'text': '没有泡沫'}]})
        self.assertTrue(negated['literalContextMatches'][0]['foundInCurrentNarration'])
        self.assertNotIn('relation', negated)

    def test_incomplete_duplicate_and_forged_verdicts_rejected(self):
        good = {'checks': [{'id': str(i), 'relation': 'uncertain', 'reason': '证据不足'} for i in range(3)]}
        self.assertEqual(len(validate_comparison(good, ['0', '1', '2'])), 3)
        for bad in ({'checks': good['checks'][:2]},
                    {'checks': [good['checks'][0]] * 3},
                    {'checks': [{'id': '0', 'relation': 'passed', 'reason': '通过'}]},
                    {'checks': good['checks'], 'deliveryApproved': True}):
            with self.assertRaises(ValueError):
                validate_comparison(bad, ['0', '1', '2'])


if __name__ == '__main__':
    unittest.main()
