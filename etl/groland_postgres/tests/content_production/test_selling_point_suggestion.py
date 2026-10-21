import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import selling_point_suggestion as sp

FRAMES = [{'segment_id': 'f0', 'start_ms': 0, 'end_ms': 15000, 'label_name': '混剪口播'},
          {'segment_id': 'f1', 'start_ms': 15000, 'end_ms': 57000, 'label_name': '实拍内容'}]
LABELS = [{'key': 'moisturizing', 'name': '滋润保湿', 'definition': '讲滋润'},
          {'key': 'long_wear', 'name': '持妆', 'definition': '讲持妆'}]
KEYS = {'moisturizing', 'long_wear'}


def item(index, start, end, label='moisturizing', joins=False):
    return {'framework_index': index, 'start_sec': start, 'end_sec': end, 'label_key': label,
            'continues_previous': joins, 'quote': '上脸不干', 'reason': '口播讲滋润'}


class SellingPointSuggestionTests(unittest.TestCase):
    def test_one_complete_span_retains_all_evidenced_labels_without_duplicate_cuts(self):
        proposal = {**item(0, 1, 5), 'label_keys': ['skincare', 'moisturizing'],
                    'quote': '精华养肤，上脸不拔干'}
        segments, stats = sp.postprocess({'segments': [proposal]}, FRAMES, {'skincare', 'moisturizing'})
        self.assertEqual(len(segments), 1)
        self.assertEqual((segments[0]['start_ms'], segments[0]['end_ms']), (1000, 5000))
        self.assertEqual(segments[0]['label_keys'], ['moisturizing', 'skincare'])
        self.assertEqual(stats['kept'], 1)
        for bad in ([], ['moisturizing', 'unknown'], ['moisturizing', 'moisturizing']):
            with self.subTest(labels=bad):
                kept, _ = sp.postprocess({'segments': [{**proposal, 'label_keys': bad}]}, FRAMES,
                                         {'skincare', 'moisturizing'})
                self.assertEqual(kept, [], 'invalid secondary labels cannot be silently dropped')

    def test_confirmed_business_boundaries_are_not_keyword_only(self):
        prompt = sp.build_prompt(FRAMES, [{'key': key, 'name': key} for key in sp.LABEL_EVIDENCE])
        for phrase in ('仅即时吸油演示不算持妆', '长期养出更好皮肤状态', '成分后引出的即时保湿效果',
                       '其他背书仅包括化妆师和专家', '机构、奖项、普通消费者不归入', 'label_keys 数组'):
            self.assertIn(phrase, prompt)
        self.assertNotIn('同一时间只标一个卖点', prompt)
        self.assertNotIn('选证据最直接的一项', prompt)

    def test_filtered_spans_cannot_retarget_or_truncate_a_continuous_chain(self):
        cases = {
            # Observed on 蜜粉-008: dropping a separate natural-look block
            # made its retained successor join the earlier live-demo block.
            'removed_predecessor_after_hard_cut': [
                item(1, 20, 24), item(1, 27, 30, 'natural_look'),
                item(1, 31, 35, 'long_wear', joins=True)],
            'removed_continuous_middle': [
                item(1, 20, 24), item(1, 24, 28, 'natural_look', joins=True),
                item(1, 28, 35, 'long_wear', joins=True)],
            'removed_continuous_tail': [
                item(1, 20, 24), item(1, 24, 28, 'natural_look', joins=True)],
            'removed_first_point': [
                item(1, 20, 24, 'natural_look'), item(1, 24, 28, joins=True)],
            'removed_short_tail': [item(1, 20, 24), item(1, 24, 24.2, joins=True)],
            'removed_overlapping_successor': [item(1, 20, 26), item(1, 24, 30, joins=True)],
            'unlocated_continuous_tail': [item(1, 20, 24), item(1, None, 30, 'natural_look', joins=True)],
        }
        for name, items in cases.items():
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'continuous'):
                sp.postprocess({'segments': list(reversed(items))}, FRAMES, KEYS)

    def test_independent_filtered_span_and_fully_filtered_chain_are_safe(self):
        segments, stats = sp.postprocess({'segments': [
            item(1, 20, 24), item(1, 25, 29, 'natural_look'),
            item(1, 29, 33, 'natural_look', joins=True), item(1, 35, 40)]}, FRAMES, KEYS)
        self.assertEqual([(s['start_ms'], s['continues_previous']) for s in segments],
                         [(20000, False), (35000, False)])
        self.assertEqual(stats['dropped']['unknown_label'], 2)

    def test_prompt_lists_framework_segments_and_labels_and_schema_is_strict(self):
        prompt = sp.build_prompt(FRAMES, LABELS)
        self.assertIn('第 1 段 15.000–57.000 秒（0:15–0:57）：实拍内容', prompt)
        self.assertIn('moisturizing（滋润保湿）：讲滋润', prompt)
        self.assertIn(sp.LABEL_EVIDENCE['moisturizing'], prompt)
        self.assertNotIn(sp.LABEL_EVIDENCE['star_endorsement'], prompt)
        schema = sp.response_schema(['moisturizing', 'long_wear'])
        items = schema['properties']['segments']['items']
        self.assertFalse(items['additionalProperties'])
        self.assertEqual(items['properties']['label_keys']['items']['enum'], ['moisturizing', 'long_wear'])
        self.assertIn('continues_previous', items['required'])

    def test_transcript_hint_preserves_millisecond_bounds_and_complete_utterances(self):
        rows = [[120, 4080, '完整口播'], [4280, 9120, '第二句']]
        prompt = sp.build_prompt(FRAMES, LABELS, rows)
        self.assertIn('[0.120–4.080 秒] 完整口播', prompt)
        self.assertIn('[4.280–9.120 秒] 第二句', prompt)
        # A long utterance is omitted whole, not presented with a misleading
        # complete time range attached to a clipped sentence.
        hint = sp._transcript_hint(rows + [[9200, 14000, '长' * 6000]])
        self.assertIn('第二句', hint)
        self.assertNotIn('长', hint)
        self.assertEqual(sp._transcript_hint(None), '')

    def test_makeup_effect_includes_business_confirmed_finish_descriptions(self):
        labels = [{'key': 'no_caking', 'name': '妆效', 'definition': '本产品妆面表现'}]
        prompt = sp.build_prompt(FRAMES, labels)
        self.assertEqual(sp.PROMPT_VERSION, 'selling-point-v7')
        self.assertIn('no_caking（妆效）', prompt)
        for description in ('不卡粉', '不卡纹', '不斑驳', '不结块', '服帖', '自然', '清透', '不假白', '无粉感', '扒脸'):
            self.assertIn(description, prompt)
        self.assertIn('不要求同时出现“不卡粉”', prompt)
        self.assertNotIn('不能单独推出不卡粉', prompt)
        self.assertIn('使用前/其他产品的问题，不单独构成本产品妆效依据', prompt)
        # The broader business label keeps its stable key and source evidence.
        proposal = item(0, 1, 4, 'no_caking')
        proposal['quote'] = '上脸自然清透，没有粉感'
        segments, _ = sp.postprocess({'segments': [proposal]}, FRAMES, {'no_caking'})
        self.assertEqual((segments[0]['label_key'], segments[0]['quote']),
                         ('no_caking', '上脸自然清透，没有粉感'))

    def test_postprocess_clamps_drops_and_resets_continuity_at_segment_starts(self):
        payload = {'segments': [
            item(1, 20.0, 30.0, joins=True),              # first span of segment 1 → forced false
            item(1, 30.0, 40.0, 'long_wear', joins=True),  # continuous
            item(0, 14.8, 15.2),                           # too short after clamping
            item(1, 35.0, 45.0),                           # overlaps the previous span
            item(1, 56.8, 57.3),                           # clamped to 56.8–57.0, too short
            item(0, 1.0, 5.0, 'koc'),                      # unknown label
            item(5, 1.0, 5.0),                             # unknown framework segment
            item(0, -2.0, 5.0),                            # starts too far before its segment
        ]}
        segments, stats = sp.postprocess(payload, FRAMES, KEYS)
        self.assertEqual([(s['start_ms'], s['end_ms'], s['label_key'], s['continues_previous']) for s in segments],
                         [(20000, 30000, 'moisturizing', False), (30000, 40000, 'long_wear', True)])
        self.assertEqual(segments[0]['framework_segment_id'], 'f1')
        self.assertEqual(segments[0]['quote'], '上脸不干')
        self.assertEqual(stats['dropped'], {'unknown_label': 1, 'bad_framework': 2, 'too_short': 2, 'overlap': 1})
        self.assertEqual(stats['continuousCount'], 1)
        with self.assertRaises(ValueError):
            sp.postprocess({'segments': None}, FRAMES, KEYS)


if __name__ == '__main__':
    unittest.main()
