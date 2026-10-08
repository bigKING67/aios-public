import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.segment_suggestion_contract import (
    DEFAULT_PROMPT_VERSION, PROMPT_V1, PROMPT_V2, PROMPT_V3, PROMPT_V4, build_prompt, drop_confirmed_duplicates, inherited_product,
    job_labels, postprocess, preset_labels, response_schema,
)

LABELS = [
    {'key': 'alpha', 'name': '甲类', 'definition': '甲类的定义文字'},
    {'key': 'beta', 'name': '乙类', 'definition': ''},
]
KEYS = {'alpha', 'beta'}


def seg(start, end, label='alpha', confidence=0.8, reason='r'):
    return {'start_sec': start, 'end_sec': end, 'label_key': label, 'confidence': confidence, 'reason': reason}


class PromptTests(unittest.TestCase):
    def test_prompt_and_schema_come_from_the_preset(self):
        labels = preset_labels(LABELS)
        prompt = build_prompt('自定义预设', labels)
        self.assertIn('自定义预设', prompt)
        self.assertIn('alpha（甲类）：甲类的定义文字', prompt)
        self.assertIn('beta（乙类）：无补充定义', prompt)
        # Nothing from the framework seed leaks into a different preset.
        self.assertNotIn('混剪口播', prompt)
        schema = response_schema(labels)
        item = schema['properties']['segments']['items']
        self.assertEqual(item['properties']['label_key']['enum'], ['alpha', 'beta'])
        self.assertEqual(set(item['required']), {'start_sec', 'end_sec', 'label_key', 'confidence', 'reason'})
        self.assertFalse(item['additionalProperties'])
        self.assertEqual(DEFAULT_PROMPT_VERSION, 'segment-suggest-v4')

    def test_v1_prompt_is_unchanged_and_rejects_shot_statistics(self):
        labels = preset_labels(LABELS)
        prompt = build_prompt('自定义预设', labels, PROMPT_V1)
        expected = '''你是短视频广告内容结构分析师。这是一条完整视频（含声音），由若干内容段按时间顺序拼接而成。
请结合画面和声音，把整条视频按时间顺序切分为连续、不重叠、尽量覆盖全片的内容段，并用「自定义预设」分类体系给每段打一个标签。同一标签可以在片中出现多次。
标签（label_key 只能取以下 key 之一）：
- alpha（甲类）：甲类的定义文字
- beta（乙类）：无补充定义，按名称判断。
要求：start_sec/end_sec 为相对视频开头的秒数；confidence 为 0 到 1 之间你对该段标签的把握；reason 用 30 字以内说明画面或声音依据。无法判断的内容不要编造标签，可以省略该时间段。'''
        self.assertEqual(prompt, expected)
        with self.assertRaises(ValueError):
            build_prompt('自定义预设', labels, PROMPT_V1, '镜头切换统计')
        with self.assertRaises(ValueError):
            build_prompt('自定义预设', labels, 'segment-suggest-v9')

    def test_v2_prompt_embeds_statistics_guidance_and_omission(self):
        labels = preset_labels(LABELS)
        hint = '镜头切换统计（本地画面检测，场景阈值 0.3）：全片 10s，共 2 个切点'
        prompt = build_prompt('自定义预设', labels, PROMPT_V2, hint)
        self.assertIn(hint, prompt)
        self.assertIn('alpha（甲类）：甲类的定义文字', prompt)
        self.assertIn('只作剪辑节奏参考，可能漏检或误检', prompt)
        self.assertIn('不属于任何候选类别的内容可以省略，不要为了覆盖全片而硬归类', prompt)
        self.assertIn('应归入其所在的混剪段', prompt)
        self.assertIn('只有候选类别中存在对应含义的类别时才适用', prompt)
        self.assertNotIn('尽量覆盖全片', prompt)
        # Guidance is structural: no framework seed label name is hardcoded.
        for name in ('混剪口播', '实拍内容', '街采', '机制', 'KOC'):
            self.assertNotIn(name, prompt)
        without = build_prompt('自定义预设', labels, PROMPT_V2)
        self.assertIn('本次没有镜头切换统计', without)
        self.assertNotIn('可能漏检或误检', without)

    def test_invalid_presets_are_rejected(self):
        for labels in ([], [{'key': 'a', 'name': 'A', 'definition': 'x'}] * 2, [{'key': '', 'name': 'A', 'definition': ''}],
                       [{'key': 'a', 'name': 'A'}], 'alpha'):
            with self.assertRaises(ValueError):
                preset_labels(labels)


class JobLabelTests(unittest.TestCase):
    def test_subset_limits_prompt_schema_and_keeps_preset_order(self):
        labels = preset_labels(LABELS + [{'key': 'gamma', 'name': '丙类', 'definition': '丙'}])
        subset = job_labels(labels, {'labelKeys': ['gamma', 'alpha'], 'provider': 'mock'})
        self.assertEqual([label['key'] for label in subset], ['alpha', 'gamma'])
        prompt = build_prompt('预设', subset)
        self.assertIn('alpha（甲类）', prompt)
        self.assertNotIn('beta', prompt)
        self.assertNotIn('乙类', prompt)
        enum = response_schema(subset)['properties']['segments']['items']['properties']['label_key']['enum']
        self.assertEqual(enum, ['alpha', 'gamma'])

    def test_legacy_jobs_use_every_label(self):
        labels = preset_labels(LABELS)
        for settings in (None, {}, {'provider': 'ark'}):
            self.assertEqual(job_labels(labels, settings), labels)

    def test_malformed_or_unknown_subsets_are_rejected(self):
        labels = preset_labels(LABELS)
        for keys in ([], ['alpha', 'alpha'], ['alpha', 'zeta'], 'alpha', [1], None):
            with self.subTest(keys=keys), self.assertRaises(ValueError):
                job_labels(labels, {'labelKeys': keys})

    def test_postprocess_drops_labels_outside_the_subset(self):
        result, stats = postprocess({'segments': [seg(0, 5), seg(5, 10, 'beta')]}, 60000, {'alpha'})
        self.assertEqual([s['label_key'] for s in result], ['alpha'])
        self.assertEqual(stats['dropped']['unknown_label'], 1)
        self.assertEqual(stats['unknownLabels'], ['beta'])


class PostprocessTests(unittest.TestCase):
    def run_pp(self, segments, duration_ms=60000, min_ms=1000):
        return postprocess({'segments': segments}, duration_ms, KEYS, min_ms)

    def test_clamps_sorts_and_converts_to_ms(self):
        result, stats = self.run_pp([seg(30, 70, 'beta'), seg(-2, 12.3456)])
        self.assertEqual([(s['start_ms'], s['end_ms'], s['label_key']) for s in result],
                         [(0, 12346, 'alpha'), (30000, 60000, 'beta')])
        self.assertEqual(stats['kept'], 2)

    def test_unknown_labels_and_invalid_numbers_are_dropped_and_recorded(self):
        result, stats = self.run_pp([seg(0, 5, 'gamma'), seg(5, 'x'), seg(9, 8), seg(70, 80), seg(10, 20, True)])
        self.assertEqual(result, [])
        self.assertEqual(stats['dropped']['unknown_label'], 2)
        self.assertEqual(stats['dropped']['invalid_range'], 3)
        self.assertEqual(stats['unknownLabels'], ['gamma'])

    def test_overlaps_are_trimmed_so_later_starts_at_earlier_end(self):
        result, stats = self.run_pp([seg(0, 10), seg(8, 20, 'beta'), seg(19, 25, 'beta')])
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in result], [(0, 10000), (10000, 25000)])
        self.assertEqual(stats['dropped']['overlap_consumed'], 0)
        self.assertEqual(stats['merged'], 1)

    def test_fully_covered_segments_are_consumed(self):
        result, stats = self.run_pp([seg(0, 20), seg(5, 10, 'beta')])
        self.assertEqual(len(result), 1)
        self.assertEqual(stats['dropped']['overlap_consumed'], 1)

    def test_adjacent_same_label_merges_with_conservative_confidence(self):
        result, stats = self.run_pp([seg(0, 10, confidence=0.9, reason='a'), seg(10.2, 20, confidence=0.6, reason='b'),
                                     seg(20, 30, 'beta')])
        self.assertEqual([(s['start_ms'], s['end_ms'], s['label_key']) for s in result],
                         [(0, 20000, 'alpha'), (20000, 30000, 'beta')])
        self.assertEqual(result[0]['confidence'], 0.6)
        self.assertEqual(result[0]['reason'], 'a；b')
        self.assertEqual(stats['merged'], 1)
        # A gap larger than the tolerance keeps separate spans.
        result, _ = self.run_pp([seg(0, 10), seg(11, 20)])
        self.assertEqual(len(result), 2)

    def test_short_spans_are_dropped_after_merging(self):
        result, stats = self.run_pp([seg(0, 0.6), seg(0.6, 1.2), seg(1.2, 1.7, 'beta'), seg(1.7, 10, 'beta')])
        # The two alpha fragments merge into 1.2 s and survive; beta fragments merge too.
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in result], [(0, 1200), (1200, 10000)])
        result, stats = self.run_pp([seg(0, 0.5), seg(0.5, 10, 'beta')])
        self.assertEqual([(s['start_ms'], s['label_key']) for s in result], [(500, 'beta')])
        self.assertEqual(stats['dropped']['too_short'], 1)

    def test_confidence_and_reason_are_bounded(self):
        result, _ = self.run_pp([seg(0, 5, confidence=7, reason='x' * 500), seg(5, 10, 'beta', confidence=float('nan'), reason=3)])
        self.assertEqual(result[0]['confidence'], 1.0)
        self.assertEqual(len(result[0]['reason']), 200)
        self.assertIsNone(result[1]['confidence'])
        self.assertEqual(result[1]['reason'], '')

    def test_malformed_payload_and_duration_raise(self):
        with self.assertRaises(ValueError):
            postprocess({'items': []}, 1000, KEYS)
        with self.assertRaises(ValueError):
            postprocess({'segments': []}, 0, KEYS)
        self.assertEqual(postprocess({'segments': []}, 1000, KEYS)[0], [])


class ConfirmedDuplicateTests(unittest.TestCase):
    CONFIRMED = [{'start_ms': 0, 'end_ms': 107000, 'label_key': 'mixed_voiceover', 'product_name': '样片'},
                 {'start_ms': 127000, 'end_ms': 137800, 'label_key': 'promotion', 'product_name': '样片'}]

    def test_near_identical_same_label_suggestions_are_skipped(self):
        suggestions = [{'start_ms': 0, 'end_ms': 106800, 'label_key': 'mixed_voiceover'},       # repeat
                       {'start_ms': 106800, 'end_ms': 126967, 'label_key': 'street_interview'},  # new
                       {'start_ms': 126967, 'end_ms': 137800, 'label_key': 'promotion'},         # repeat
                       {'start_ms': 0, 'end_ms': 107000, 'label_key': 'live_demo'}]              # other label
        kept, skipped = drop_confirmed_duplicates(suggestions, self.CONFIRMED)
        self.assertEqual(skipped, 2)
        self.assertEqual([s['label_key'] for s in kept], ['street_interview', 'live_demo'])
        partial = [{'start_ms': 0, 'end_ms': 60000, 'label_key': 'mixed_voiceover'}]  # IoU 0.56 is a real re-cut
        self.assertEqual(drop_confirmed_duplicates(partial, self.CONFIRMED), (partial, 0))

    def test_product_comes_from_the_asset_else_one_agreed_confirmed_product(self):
        self.assertEqual(inherited_product('面霜', self.CONFIRMED), '面霜')
        self.assertEqual(inherited_product(None, self.CONFIRMED), '样片')
        mixed = self.CONFIRMED + [{'start_ms': 0, 'end_ms': 1, 'label_key': 'koc', 'product_name': '精华'}]
        self.assertIsNone(inherited_product(None, mixed))
        self.assertIsNone(inherited_product(None, []))


if __name__ == '__main__':
    unittest.main()


class PromptV3Tests(unittest.TestCase):
    labels = [{'key': 'a', 'name': '甲', 'definition': ''}, {'key': 'b', 'name': '乙', 'definition': ''}]

    def test_v3_is_v2_plus_the_endorsement_rule(self):
        v2 = build_prompt('自定义预设', self.labels, PROMPT_V2, '切点统计')
        v3 = build_prompt('自定义预设', self.labels, PROMPT_V3, '切点统计')
        self.assertIn('6. 判断"连续实拍"看的是同一人物、同一场景持续多久', v3)
        self.assertNotIn('6. 判断', v2)
        head, _, tail = v3.partition('\n6. 判断')
        self.assertEqual(head + '\n要求' + tail.split('\n要求', 1)[1], v2)

    def test_v3_stays_label_agnostic(self):
        for name in ('混剪口播', '实拍内容', '街采', '机制', 'KOC'):
            self.assertNotIn(name, build_prompt('自定义预设', self.labels, PROMPT_V3))

    def test_default_is_v4(self):
        self.assertEqual(DEFAULT_PROMPT_VERSION, PROMPT_V4)

    def test_v4_is_v3_plus_the_person_rules_and_field(self):
        v3 = build_prompt('自定义预设', self.labels, PROMPT_V3, '切点统计')
        v4 = build_prompt('自定义预设', self.labels, PROMPT_V4, '切点统计')
        head, _, tail = v4.partition('\n7. 主要出镜人物')
        self.assertIn('same_person_as_previous', tail)
        self.assertEqual(head + '\n要求' + tail.split('\n要求', 1)[1], v3)
        for name in ('混剪口播', '实拍内容', '街采', '机制', 'KOC'):
            self.assertNotIn(name, v4)

    def test_only_v4_schema_requires_the_person_field(self):
        item = lambda version: response_schema(self.labels, version)['properties']['segments']['items']
        self.assertNotIn('same_person_as_previous', item(PROMPT_V3)['properties'])
        self.assertNotIn('same_person_as_previous', item(None)['required'])
        self.assertIn('same_person_as_previous', item(PROMPT_V4)['required'])
        self.assertEqual(item(PROMPT_V4)['properties']['same_person_as_previous'], {'type': 'boolean'})


class LabelMinimumTests(unittest.TestCase):
    keys = {'mix', 'live', 'street'}

    def run_pp(self, segs, minimums=None, duration=200_000):
        payload = {'segments': [{'start_sec': a, 'end_sec': b, 'label_key': k, 'confidence': 0.9, 'reason': 'r'} for a, b, k in segs]}
        from content_production.segment_suggestion_contract import postprocess
        result, stats = postprocess(payload, duration, self.keys, 1000, minimums)
        return [(s['start_ms'] / 1000, s['end_ms'] / 1000, s['label_key']) for s in result], stats

    def test_short_span_between_same_labels_is_absorbed_after_merging(self):
        # Two touching short 'live' spans merge to 25s, still under the 30s minimum.
        result, stats = self.run_pp([(0, 72, 'mix'), (72, 88, 'live'), (88, 97, 'live'), (97, 107, 'mix'), (107, 127, 'street')],
                                    {'live': 30_000})
        self.assertEqual(result, [(0, 107, 'mix'), (107, 127, 'street')])
        self.assertEqual(stats['absorbedShort'], 1)

    def test_single_touching_neighbour_and_long_spans(self):
        result, _ = self.run_pp([(0, 10, 'live'), (10, 120, 'mix')], {'live': 30_000})
        self.assertEqual(result, [(0, 120, 'mix')])
        result, _ = self.run_pp([(0, 20, 'mix'), (20, 115, 'live'), (115, 130, 'mix')], {'live': 30_000})
        self.assertEqual(result, [(0, 20, 'mix'), (20, 115, 'live'), (115, 130, 'mix')])

    def test_isolated_short_span_is_kept(self):
        result, _ = self.run_pp([(0, 10, 'mix'), (20, 30, 'live'), (40, 50, 'street')], {'live': 30_000})
        self.assertEqual(result, [(0, 10, 'mix'), (20, 30, 'live'), (40, 50, 'street')])

    def test_different_neighbours_choose_the_longer(self):
        result, _ = self.run_pp([(0, 50, 'mix'), (50, 60, 'live'), (60, 70, 'street')], {'live': 30_000})
        self.assertEqual(result, [(0, 60, 'mix'), (60, 70, 'street')])

    def test_without_minimums_output_is_unchanged(self):
        segs = [(0, 72, 'mix'), (72, 97, 'live'), (97, 107, 'mix')]
        result, stats = self.run_pp(segs)
        self.assertEqual(result, [(0, 72, 'mix'), (72, 97, 'live'), (97, 107, 'mix')])
        self.assertNotIn('absorbedShort', stats)

    def run_people(self, segs, minimums):
        """segs: (start, end, label, same_person_as_previous)."""
        payload = {'segments': [{'start_sec': a, 'end_sec': b, 'label_key': k, 'confidence': 0.9, 'reason': 'r',
                                 'same_person_as_previous': p} for a, b, k, p in segs]}
        result, stats = postprocess(payload, 200_000, self.keys, 1000, minimums)
        return [(s['start_ms'] / 1000, s['end_ms'] / 1000, s['label_key']) for s in result], stats, result

    def test_minimum_applies_per_person_when_the_model_reports_person_changes(self):
        # 2026-10-01: three different people, each under 30s, merged to 45s 'live' and passed the minimum.
        segs = [(0, 52.8, 'mix', False), (52.8, 72.1, 'live', False), (72.1, 88.5, 'live', False),
                (88.5, 97.7, 'live', False), (97.7, 107, 'mix', False), (107, 127, 'street', False)]
        result, stats, raw = self.run_people(segs, {'live': 30_000})
        self.assertEqual(result, [(0, 107, 'mix'), (107, 127, 'street')])
        self.assertEqual((stats['absorbedShort'], stats['personSplits']), (3, 3))
        self.assertTrue(all('same_person' not in s for s in raw))

    def test_same_person_pieces_still_merge_before_the_minimum(self):
        # One person split by step or scene: 20s + 25s pieces form one 45s live span.
        segs = [(0, 12, 'mix', False), (12, 32, 'live', False), (32, 57, 'live', True), (57, 80, 'mix', False)]
        result, stats, _ = self.run_people(segs, {'live': 30_000})
        self.assertEqual(result, [(0, 12, 'mix'), (12, 57, 'live'), (57, 80, 'mix')])
        self.assertEqual(stats['absorbedShort'], 0)

    def test_long_spans_of_different_people_end_as_one_segment(self):
        segs = [(0, 40, 'live', False), (40, 80, 'live', False), (80, 90, 'mix', False)]
        result, _, _ = self.run_people(segs, {'live': 30_000})
        self.assertEqual(result, [(0, 80, 'live'), (80, 90, 'mix')])

    def test_person_changes_only_matter_for_labels_with_a_minimum(self):
        segs = [(0, 10, 'mix', False), (10, 20, 'mix', False), (20, 60, 'live', False)]
        result, _, _ = self.run_people(segs, {'live': 30_000})
        self.assertEqual(result, [(0, 20, 'mix'), (20, 60, 'live')])

    def test_preset_min_duration_is_validated(self):
        from content_production.segment_suggestion_contract import label_minimums
        labels = preset_labels([{'key': 'live', 'name': '实拍', 'definition': '', 'minDurationSec': 30},
                                {'key': 'mix', 'name': '混剪', 'definition': ''}])
        self.assertEqual(label_minimums(labels), {'live': 30_000})
        for bad in (0, -1, 'x', 4000):
            with self.assertRaises(ValueError):
                preset_labels([{'key': 'live', 'name': '实拍', 'definition': '', 'minDurationSec': bad}])


class DegenerateAnswerTests(unittest.TestCase):
    KEYS = ['mixed_voiceover', 'live_demo', 'street_interview']

    def payload(self, *labels):
        return {'segments': [{'start_sec': i * 10, 'end_sec': (i + 1) * 10, 'label_key': key}
                             for i, key in enumerate(labels)]}

    def test_single_label_over_three_segments_is_degenerate(self):
        from content_production.segment_suggestion_contract import degenerate_label
        self.assertEqual(degenerate_label(self.payload('street_interview', 'street_interview', 'street_interview'),
                                          self.KEYS, 160_000), 'street_interview')

    def test_mixed_labels_short_answers_short_films_and_single_candidate_are_not(self):
        from content_production.segment_suggestion_contract import degenerate_label
        self.assertIsNone(degenerate_label(self.payload('live_demo', 'live_demo', 'promotion'), self.KEYS, 160_000))
        self.assertIsNone(degenerate_label(self.payload('live_demo', 'live_demo'), self.KEYS, 160_000))
        self.assertIsNone(degenerate_label(self.payload('live_demo', 'live_demo', 'live_demo'), self.KEYS, 30_000))
        self.assertIsNone(degenerate_label(self.payload('live_demo', 'live_demo', 'live_demo'), ['live_demo'], 160_000))
        self.assertIsNone(degenerate_label({'segments': 'x'}, self.KEYS, 160_000))

    def test_merge_usage_sums_numbers_one_level_deep(self):
        from content_production.segment_suggestion_contract import merge_usage
        merged = merge_usage({'total_tokens': 10, 'details': {'cached': 1}, 'model': 'a'},
                             {'total_tokens': 5, 'details': {'cached': 2, 'audio': 3}, 'flag': True})
        self.assertEqual(merged, {'total_tokens': 15, 'details': {'cached': 3, 'audio': 3}, 'model': 'a', 'flag': True})


class BoundarySnapTests(unittest.TestCase):
    SEGMENTS = [{'start_ms': 0, 'end_ms': 10_000, 'label_key': 'a'}, {'start_ms': 10_000, 'end_ms': 20_000, 'label_key': 'b'},
                {'start_ms': 20_000, 'end_ms': 21_500, 'label_key': 'c'}]

    def test_moves_touching_boundaries_to_the_strongest_cut(self):
        from content_production.segment_suggestion_contract import snap_boundaries
        cuts = {10_000: [(9_700, 0.25), (9_830, 0.6), (10_100, 0.3)], 20_000: [(19_800, 0.5)]}
        snapped, shifts = snap_boundaries(self.SEGMENTS, cuts, 1000)
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in snapped], [(0, 9_830), (9_830, 19_800), (19_800, 21_500)])
        self.assertEqual(shifts, [-170, -200])
        self.assertEqual(self.SEGMENTS[0]['end_ms'], 10_000)  # input untouched

    def test_keeps_boundary_without_candidates_or_when_a_side_would_get_too_short(self):
        from content_production.segment_suggestion_contract import snap_boundaries
        snapped, shifts = snap_boundaries(self.SEGMENTS, {20_000: [(20_800, 0.9)]}, 1000)
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in snapped], [(0, 10_000), (10_000, 20_000), (20_000, 21_500)])
        self.assertEqual(shifts, [])

    def test_sliver_gaps_count_as_one_boundary_and_are_closed(self):
        from content_production.segment_suggestion_contract import snap_boundaries, snap_points
        sliver = [{'start_ms': 0, 'end_ms': 37_390}, {'start_ms': 37_400, 'end_ms': 72_000}]
        self.assertEqual(snap_points(sliver), [(0, 37_395)])
        snapped, shifts = snap_boundaries(sliver, {37_395: [(37_100, 0.7)]}, 1000)
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in snapped], [(0, 37_100), (37_100, 72_000)])
        self.assertEqual(shifts, [-295])

    def test_wide_gaps_and_overlaps_are_left_alone(self):
        from content_production.segment_suggestion_contract import snap_boundaries, snap_points
        gapped = [{'start_ms': 0, 'end_ms': 9_000}, {'start_ms': 10_000, 'end_ms': 20_000}]
        self.assertEqual(snap_points(gapped), [])
        snapped, shifts = snap_boundaries(gapped, {9_500: [(9_400, 0.9)]}, 1000)
        self.assertEqual((snapped, shifts), (gapped, []))

