"""Semantic examples exercise orchestration contracts with explicit model answers, not model accuracy."""
import copy
import unittest
from unittest.mock import patch

from test_competitor_report_breakdown import FakeClient, TODAY, enriched, review_of
from content_production.competitor_analysis import opening_formulas as of, report_breakdown as rb

TEXTS = ['花间颂，你给我退钱！之前一块饼的钱，现在发两个！',
         '早知道晚两天买了，同样的钱现在能拿双份。',
         '刚买完就看到这个活动，感觉自己亏了一盒！',
         '你给我退钱，用了过敏。']


def semantic_batch():
    rows = [enriched(str(i + 1), '甲' if i < 3 else '乙', text, [], []) for i, text in enumerate(TEXTS)]
    return rb.build_batch(rows, 'loose_powder', 'all', TODAY, min_films=1)


def answer(b):
    same = [g['id'] for g in b['hookGroups'] if g['text'] in TEXTS[:3]]
    different = [g['id'] for g in b['hookGroups'] if g['text'] == TEXTS[3]]
    return {'formulas': [{'id': 'f1', 'template': '[品牌]，买早了真亏！那时[原条件]，如今却[现优惠]！',
                          'meaning': '过去购买不如现在优惠划算', 'logic': '用后悔抱怨强调现在优惠',
                          'groups': same, 'examples': same[:2]}], 'other_groups': different}


class SemanticFormulasTest(unittest.TestCase):
    def test_different_wording_groups_without_fixed_phrase_gate(self):
        b = semantic_batch()
        result = answer(b)
        self.assertEqual(of.validate_formulas(result, b), [])
        report, _, spent = of.generate(b, FakeClient(result, review_of(result)))
        self.assertEqual(spent['calls'], 2)
        self.assertEqual(report['formulas'][0]['films'], 3)
        self.assertEqual({s['opening'] for s in report['formulas'][0]['sources']}, set(TEXTS[:3]))
        self.assertEqual(report['unassignedSources'][0]['opening'], TEXTS[3])

    def test_lexically_similar_but_opposite_meaning_not_premerged(self):
        rows = [enriched('1', '甲', '你给我退钱，之前一盒现在两盒', [], []),
                enriched('2', '甲', '你给我退钱，之前两盒现在一盒', [], [])]
        b = rb.build_batch(rows, 'loose_powder', 'all', TODAY, min_films=1)
        self.assertEqual(len(b['hookGroups']), 2)

    def test_duplicate_source_text_retains_all_videos_and_timing(self):
        row = enriched('1', '甲', TEXTS[0], [], [])
        row['card']['hook'].update(speech=None, onscreen_text=TEXTS[0], evidence_refs=['t1'])
        row['card']['evidence'] = [{'id': 't1', 'modality': 'onscreen_text', 'start_sec': 0, 'end_sec': 2.6, 'content': TEXTS[0]}]
        rows = [copy.deepcopy(row) for _ in range(7)]
        for i, item in enumerate(rows):
            item['aweme_id'] = str(i)
        b = rb.build_batch(rows, 'loose_powder', 'all', TODAY, min_films=1)
        result = answer(b)
        formula = of.formula_rows(result, b)[0]
        self.assertEqual(formula['films'], 7)
        self.assertEqual(len(formula['sources']), 7)
        self.assertEqual(formula['sources'][0]['openingKind'], 'onscreen_text')
        self.assertEqual(formula['sources'][0]['evidence'], [{'start': 0, 'end': 2.6}])

    def test_missing_or_unknown_review_is_failure_not_approval(self):
        b = semantic_batch()
        result = answer(b)
        for review in ({'members': []}, {'members': [{'group': 'g999', 'formula': 'f1', 'verdict': 'match', 'reason': '相似'}]}, 'invalid'):
            with self.subTest(review=review), self.assertRaises(rb.ReportFailed):
                of.generate(b, FakeClient(result, review))

    def test_review_input_does_not_grow_with_reposted_source_ids(self):
        b = semantic_batch()
        result = answer(b)
        prompt = of.review_prompt(b, result)
        b['hookGroups'][0]['films'] *= 1000
        self.assertEqual(of.review_prompt(b, result), prompt)
        for text in TEXTS:
            self.assertIn(text, prompt)

    def test_all_input_is_seen_or_explicitly_rejected_before_billing(self):
        b = semantic_batch()
        b['hookGroups'] = [{'id': f'g{i}', 'text': str(i), 'films': [str(i)]} for i in range(of.MAX_GROUPS + 1)]
        client = FakeClient()
        with self.assertRaises(rb.ReportFailed) as caught:
            of.generate(b, client)
        self.assertEqual(caught.exception.code, 'sample_too_large')
        self.assertEqual(client.requests, [])

    def test_reading_reuses_independent_formulas_without_regrouping(self):
        b = semantic_batch()
        result, _, _ = of.generate(b, FakeClient(answer(b), review_of(answer(b))))
        reading = {'hook_insights': [], 'scene_insights': [], 'endorser_insights': [], 'golden_structures': [], 'next_actions': [], 'limitations': []}
        with patch.object(of, 'generate', side_effect=AssertionError('cached formulas must not be billed again')):
            report, _, spent = rb.generate(b, FakeClient(reading), cached_formulas=result)
        self.assertEqual(spent['calls'], 1)
        self.assertEqual(report['formulas'], result['formulas'])


if __name__ == '__main__':
    unittest.main()
