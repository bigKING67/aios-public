"""Edge-window Lite review layout (framework v2 review v3)."""
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.framework_v2 import review, rules
from content_production.segment_suggestion_provider import SuggestionError

LIVE, MIXED, STREET = rules.LIVE, rules.MIXED, rules.STREET


def answer(*parts, reason=''):
    extra = {} if reason is None else {'reason': reason}
    return {'segments': [{'start': a, 'end': b, 'label': label, **extra} for a, b, label in parts]}


class EdgeWindowTests(unittest.TestCase):
    def test_short_live_is_whole_and_long_live_gets_head_and_tail(self):
        segs = [[0, 20, MIXED], [20, 35, LIVE], [35, 60, MIXED], [60, 140, LIVE], [140, 160, STREET]]
        self.assertEqual(review.edge_windows(segs, 160), [[12, 43, 'whole'], [52, 85, 'head'], [115, 148, 'tail']])

    def test_overlapping_windows_merge_into_one_whole_window(self):
        segs = [[0, 10, MIXED], [10, 50, LIVE], [50, 56, MIXED], [56, 70, LIVE], [70, 80, MIXED]]
        self.assertEqual(review.edge_windows(segs, 80), [[2, 78, 'whole']])

    def test_windows_stay_inside_the_film(self):
        self.assertEqual(review.edge_windows([[0, 12, LIVE], [12, 15, MIXED]], 15), [[0.0, 15, 'whole']])


class EdgeAnswerTests(unittest.TestCase):
    def test_head_keeps_only_the_start_of_the_review(self):
        got = review.edge_answer('head', 52, 85, answer((0, 6, '混剪口播'), (6, 20, '实拍内容'), (20, 33, '混剪口播')))
        self.assertEqual(got, answer((0.0, 6, '混剪口播'), (6, 33, '实拍内容'), reason=None))

    def test_tail_keeps_only_the_end_of_the_review(self):
        got = review.edge_answer('tail', 115, 148, answer((0, 5, '混剪口播'), (5, 21, '实拍内容'), (21, 33, '混剪口播')))
        self.assertEqual(got, answer((0.0, 21, '实拍内容'), (21, 33, '混剪口播'), reason=None))

    def test_edge_without_live_keeps_the_rules_and_whole_is_unchanged(self):
        none = answer((0, 33, '混剪口播'))
        self.assertIsNone(review.edge_answer('head', 52, 85, none))
        self.assertIsNone(review.edge_answer('tail', 115, 148, none))
        self.assertIs(review.edge_answer('whole', 12, 43, none), none)


class EdgeReviewTests(unittest.TestCase):
    def run_review(self, segs, duration, cuts, replies):
        prompts = []

        class Provider:
            def review(self, text, schema, **kwargs):
                prompts.append((text, schema))
                kind = 'closing' if '「街采」' in text else 'head' if '结尾处' in text else 'tail'
                reply = replies[kind]
                if isinstance(reply, Exception):
                    raise reply
                return SimpleNamespace(payload=reply, usage={'input_tokens': 1}, response_id=kind)

        with tempfile.TemporaryDirectory() as tmp, patch.object(review, 'clip', lambda *a: Path(tmp) / 'c.mp4'):
            out, receipts = review.review(Provider(), Path('x.mp4'), segs, [], cuts, duration, Path(tmp), {})
        return out, receipts, prompts

    def test_review_moves_only_the_edges_of_a_long_live_segment(self):
        segs = [[0.0, 20.0, MIXED], [20.0, 100.0, LIVE], [100.0, 160.0, MIXED]]
        replies = {'head': answer((0, 14, '混剪口播'), (14, 33, '实拍内容')),
                   'tail': answer((0, 10, '混剪口播'), (10, 20, '实拍内容'), (20, 33, '混剪口播')),
                   'closing': SuggestionError('provider_error', 'boom')}
        out, receipts, prompts = self.run_review(segs, 160.0, [26.0, 95.0], replies)
        self.assertEqual(out, [[0.0, 26.0, MIXED], [26.0, 95.0, LIVE], [95.0, 160.0, MIXED]])
        self.assertEqual([r['kind'] for r in receipts], ['head', 'tail', 'closing'])
        self.assertEqual(receipts[-1]['error'], 'provider_error')
        self.assertTrue(all('5. 这个片段' in text for text, _ in prompts[:2]))

    def test_closing_review_sets_every_label_in_the_last_window_last(self):
        segs = [[0.0, 60.0, LIVE], [60.0, 100.0, MIXED]]
        replies = {'head': answer((0, 33, '实拍内容')),
                   'tail': answer((0, 33, '实拍内容')),
                   'closing': answer((0, 5, '实拍内容'), (5, 25, '街采'), (25, 45, '机制'))}
        out, receipts, prompts = self.run_review(segs, 100.0, [60.0, 80.0], replies)
        self.assertEqual(out, [[0.0, 60.0, LIVE], [60.0, 80.0, STREET], [80.0, 100.0, rules.PROMOTION]])
        self.assertEqual(receipts[-1]['window'], [55.0, 100.0])
        closing_schema = prompts[-1][1]['properties']['segments']['items']['properties']['label']['enum']
        self.assertEqual(closing_schema, ['实拍内容', '混剪口播', '街采', '机制'])
        self.assertEqual(review.SCHEMA['properties']['segments']['items']['properties']['label']['enum'],
                         ['实拍内容', '混剪口播'])

    def test_whole_window_prompt_is_the_plain_prompt(self):
        self.assertEqual(review.prompt(20, 'whole'), review.PROMPT.format(dur=20))
        self.assertLess(review.prompt(20, 'head').index('5. 这个片段'), review.prompt(20, 'head').index('只输出区间'))


if __name__ == '__main__':
    unittest.main()
