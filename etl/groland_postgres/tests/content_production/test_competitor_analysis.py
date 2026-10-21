import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import contract, dedup, evaluation, report, stats  # noqa: E402
import numpy as np  # noqa: E402

CONTEXT = {'video_id': 'f1', 'duration_sec': 20.0, 'audio': 'available', 'hook_clip': True, 'brand': None}


def evidence(id_, modality, start, end=None, content='原句'):
    kind = 'interval' if end is not None else 'point'
    return {'id': id_, 'modality': modality, 'content': content, 'quality': 'clear',
            'time': {'kind': kind, 'start_sec': start, 'end_sec': end}}


def segment(id_, start, end, role, claims=(), refs=()):
    return {'id': id_, 'start_sec': start, 'end_sec': end, 'primary_role': role, 'secondary_roles': [],
            'content_forms': ['talking_head'], 'voice_form': 'on_camera', 'tone': 'chatty', 'music': 'soft', 'sfx': [],
            'summary': '', 'claim_refs': list(claims), 'evidence_refs': list(refs)}


def card():
    return {
        'analysis_status': 'complete', 'limitations': [], 'summary': '', 'purchase_question': '',
        'product': {'brand': '甲', 'name': '散粉', 'category': 'loose_powder', 'evidence_refs': ['s1']},
        'evidence': [evidence('s1', 'speech', 0.2, 2.5, '鼻翼出油怎么办'), evidence('v2', 'visual', 0.0, 2.9),
                     evidence('s3', 'speech', 5.0, 8.0, '控油一整天'), evidence('v4', 'visual', 9.0, 12.0)],
        'hook': {'assessment': 'assessable', 'speech': '鼻翼出油怎么办', 'onscreen_text': None, 'visual': '',
                 'mechanism_ids': ['problem_named'], 'audio_cues': ['question_open'], 'why_keep_watching': '',
                 'evidence_refs': ['s1', 'v2'],
                 'complete_hook_end_sec': None},
        'segments': [segment('g1', 0, 3, 'attention', refs=['s1', 'v2']), segment('g2', 3, 9, 'claim', ['c1']),
                     segment('g3', 9, 12.5, 'claim'), segment('g4', 12.5, 20, 'proof', refs=['v4'])],
        'claims': [{'id': 'c1', 'text': '控油一整天', 'selling_point': 'long_wear', 'qualifiers': [],
                    'stated_refs': ['s3'], 'shown_refs': ['v4'], 'evidence_form': 'on_face',
                    'support': 'shown_limited', 'limitation': ''}],
        'dimensions': {
            'audiences': {'assessment': 'assessable', 'labels': []},
            'scenes': {'assessment': 'assessable', 'labels': []},
            'trust_cues': {'assessment': 'assessable', 'labels': [{'cue': 'kol_endorsement', 'raw': '', 'evidence_refs': []}]},
            'offer_and_cta': {'assessment': 'unassessable', 'offers': [], 'cta': []},
            'sound': {'assessment': 'assessable', 'summary': ''},
        },
        'transfer': {'methods': [], 'brand_dependent': [], 'we_need': []},
        'unmapped_labels': [],
    }


def errors(value, context=CONTEXT):
    return [issue for issue in contract.validate(value, context) if issue[0] == 'error']


class ContractTest(unittest.TestCase):
    def test_valid_card_has_no_errors(self):
        self.assertEqual(errors(card()), [])

    def test_schema_is_strict_everywhere(self):
        def walk(node):
            if isinstance(node, dict):
                if node.get('type') == 'object':
                    self.assertFalse(node['additionalProperties'])
                    self.assertEqual(sorted(node['required']), sorted(node['properties']))
                for value in node.values():
                    walk(value)
        walk(contract.response_schema())

    def test_from_provider_flattens_segment_evidence(self):
        value = card()
        provider = {k: v for k, v in value.items() if k != 'evidence'}
        by_id = {item['id']: item for item in value['evidence']}
        provider['segments'] = [{**{k: v for k, v in seg.items() if k not in ('evidence_refs', 'claim_refs')},
                                 'evidence': [by_id[r] for r in seg['evidence_refs']]} for seg in value['segments']]
        provider['segments'][1]['evidence'] = [by_id['s3']]
        flat = contract.from_provider(provider)
        self.assertEqual([e['id'] for e in flat['evidence']], ['s1', 'v2', 's3', 'v4'])
        self.assertEqual(flat['segments'][1]['claim_refs'], ['c1'])
        self.assertEqual(errors(flat), [])

    def test_wrong_types_never_crash(self):
        value = card()
        value['segments'][0]['start_sec'] = '0'
        value['evidence'][0]['time']['start_sec'] = 'x'
        self.assertTrue(errors(value))
        self.assertEqual(contract.normalize(value, 20.0)['path'], ['claim', 'proof'])

    def test_hook_must_not_cite_evidence_after_three_seconds(self):
        value = card()
        value['hook']['evidence_refs'].append('s3')
        self.assertTrue(any('前3秒' in issue[2] for issue in errors(value)))

    def test_shown_ref_must_be_visual(self):
        value = card()
        value['claims'][0]['shown_refs'] = ['s3']
        self.assertTrue(any('不是画面模态' in issue[2] for issue in errors(value)))

    def test_support_without_visual_evidence_is_rejected(self):
        value = card()
        value['claims'][0]['shown_refs'] = []
        self.assertTrue(errors(value))

    def test_undefined_and_out_of_range_references(self):
        value = card()
        value['segments'][0]['evidence_refs'] = ['4']
        value['evidence'][3]['time']['end_sec'] = 30
        messages = [issue[2] for issue in errors(value)]
        self.assertTrue(any('未定义' in m for m in messages))
        self.assertTrue(any('越界' in m for m in messages))

    def test_id_prefix_must_match_modality(self):
        value = card()
        value['evidence'][1]['modality'] = 'speech'
        self.assertTrue(any('前缀' in issue[2] for issue in errors(value)))

    def test_repeated_chant_is_a_review_hint_not_an_error(self):
        value = card()
        value['evidence'][0]['content'] = 'DPDP的锁光气垫，DPDP气垫吧，DPDP啊，他们家出了新的气垫，DPDP啊。'
        issues = contract.validate(value, CONTEXT)
        self.assertFalse(errors(value))
        self.assertTrue(any(issue[0] == 'warning' and '重复' in issue[2] for issue in issues))

    def test_speech_without_audio_track(self):
        self.assertTrue(errors(card(), {**CONTEXT, 'audio': 'absent'}))
        value = card()
        value['dimensions']['sound']['assessment'] = 'unassessable'
        self.assertEqual(errors(value, {**CONTEXT, 'audio': 'transcript_only', 'transcript': []}), [])

    def test_sound_needs_a_real_audio_track(self):
        self.assertTrue(any('没有原声' in issue[2] for issue in
                            errors(card(), {**CONTEXT, 'audio': 'transcript_only', 'transcript': []})))

    def test_transcript_prompt_lists_segments(self):
        prompt = contract.build_prompt({**CONTEXT, 'audio': 'transcript_only',
                                        'transcript': [[65000, 79500, '控油一整天']]})
        self.assertIn('[65.0-79.5秒] 控油一整天', prompt)

    def test_overlapping_segments(self):
        value = card()
        value['segments'][1]['start_sec'] = 1.0
        self.assertTrue(any('重叠' in issue[2] for issue in errors(value)))


class NormalizeTest(unittest.TestCase):
    def test_adjacent_same_role_merges_and_keeps_sources(self):
        result = contract.normalize(card(), 20.0)
        self.assertEqual(result['path'], ['attention', 'claim', 'proof'])
        self.assertEqual(result['coarse_nodes'][1]['source_segment_ids'], ['g2', 'g3'])

    def test_unknown_role_and_real_gap_break_merges(self):
        value = card()
        value['segments'].insert(2, segment('u', 9, 10, 'unknown'))
        value['segments'][3]['start_sec'] = 10
        self.assertEqual(contract.normalize(value, 20.0)['path'], ['attention', 'claim', 'unknown', 'claim', 'proof'])
        value = card()
        value['segments'][2]['start_sec'] = 10.5
        result = contract.normalize(value, 20.0)
        self.assertEqual(result['path'], ['attention', 'claim', 'claim', 'proof'])
        self.assertEqual(result['unknown_intervals'], [[9.0, 10.5]])

    def test_boundary_jitter_is_not_a_gap(self):
        value = card()
        value['segments'][2]['start_sec'] = 9.6
        result = contract.normalize(value, 20.0)
        self.assertEqual(result['path'], ['attention', 'claim', 'proof'])
        self.assertEqual(result['unknown_intervals'], [])


class StatsTest(unittest.TestCase):
    def record(self, film, value):
        return {'film': film, 'card': value, 'structure': contract.normalize(value, 20.0),
                'issues': contract.validate(value, CONTEXT)}

    def test_same_assessable_set_for_numerator_and_denominator(self):
        partial = card()
        partial['hook']['assessment'] = 'partial'
        records = [self.record('a', card()), self.record('b', card()), self.record('c', partial)]
        row = next(r for r in stats.compute(records, 'x') if r['stat_id'] == 'x:hook:problem_named')
        self.assertEqual((row['numerator'], row['denominator'], row['partial_count']), (2, 2, 1))

    def test_bad_claim_leaves_only_that_claim(self):
        bad = card()
        bad['claims'][0]['shown_refs'] = ['s3']
        rows = stats.compute([self.record('a', card()), self.record('b', bad)], 'x')
        point = next(r for r in rows if r['stat_id'] == 'x:selling_point:long_wear')
        hook = next(r for r in rows if r['stat_id'] == 'x:hook:problem_named')
        self.assertEqual((point['numerator'], point['denominator']), (1, 2))
        self.assertEqual((hook['numerator'], hook['denominator']), (2, 2))

    def test_bad_evidence_blocks_only_parts_citing_it(self):
        bad = card()
        bad['evidence'][2]['time']['end_sec'] = 1.0  # s3 broken; cited by claim c1 only
        rows = stats.compute([self.record('a', bad)], 'x')
        self.assertFalse([r for r in rows if r['dimension'] == 'selling_point'])
        hook = next(r for r in rows if r['stat_id'] == 'x:hook:problem_named')
        self.assertEqual((hook['numerator'], hook['denominator'], hook['blocked_count']), (1, 1, 0))

    def test_reused_opening_counts_once_per_family(self):
        other = card()
        other['hook']['speech'] = '完全不同的开头，讲别的事情'
        rows = stats.compute([self.record('a', card()), self.record('b', card()), self.record('c', other)], 'x')
        row = next(r for r in rows if r['stat_id'] == 'x:hook:problem_named')
        self.assertEqual((row['numerator'], row['denominator']), (3, 3))
        self.assertEqual((row['family_numerator'], row['family_denominator']), (2, 2))

    def test_sound_dimensions_count_selling_segments(self):
        value = card()
        value['segments'][3].update(primary_role='offer', tone='urgent_sell', music='upbeat', sfx=['beat_hit'])
        rows = {r['stat_id']: r for r in stats.compute([self.record('a', value)], 'x')}
        self.assertIn('x:sell_tone:urgent_sell', rows)
        self.assertNotIn('x:sell_tone:chatty', rows)
        self.assertEqual(rows['x:hook_audio:question_open']['numerator'], 1)
        self.assertIn('x:sfx:beat_hit', rows)

    def test_zero_denominator_has_no_rate(self):
        rows = stats.compute([self.record('a', card())], 'x')
        self.assertFalse([r for r in rows if r['dimension'] == 'offer_and_cta'])

    def test_cohorts_split_by_category(self):
        cushion = card()
        cushion['product']['category'] = 'cushion'
        result = stats.by_cohort([self.record('a', card()), self.record('b', cushion)])
        self.assertEqual((result['all']['films'], result['cushion']['films']), (2, 1))


def stat(stat_id, n, d):
    side, dimension, label = stat_id.split(':', 2)
    return {'stat_id': stat_id, 'dimension': dimension, 'label': label, 'numerator': n, 'denominator': d,
            'family_numerator': n, 'family_denominator': d}


class ReportTest(unittest.TestCase):
    COMP = [stat('comp:sfx:variety', 8, 18), stat('comp:hook:offer', 3, 18)]
    OURS = [stat('ours:sfx:variety', 15, 16), stat('ours:sfx:ding', 12, 16)]

    def test_missing_side_gets_a_citable_zero_row(self):
        rows = {r['stat_id']: r for r in report.select_stats(self.COMP, self.OURS)}
        self.assertEqual((rows['comp:sfx:ding']['family_numerator'], rows['comp:sfx:ding']['family_denominator']), (0, 18))
        self.assertNotIn('ours:hook:offer', rows)  # no ours row for that dimension to borrow a denominator from

    def test_comparison_is_sorted_by_gap(self):
        lines = report.comparison_lines(report.select_stats(self.COMP, self.OURS)).split('\n')
        self.assertTrue(lines[0].startswith('- 差距75个百分点 sfx:ding'))
        self.assertIn('差距49个百分点 sfx:variety', lines[1])

    def test_validator_rejects_changed_numbers_and_unknown_refs(self):
        batch = {'stats': report.select_stats(self.COMP, self.OURS), 'films': [{'film': '竞品-001'}], 'ours_films': []}
        result = {'stats_used': [{'stat_id': 'comp:sfx:variety', 'family_numerator': 9, 'family_denominator': 18}],
                  'insights': [{'id': 'i1', 'statement': '我方音效用得多七成', 'strength': 'descriptive',
                                'stat_refs': ['ours:sfx:x'], 'film_refs': ['竞品-009'], 'counter_film_refs': [],
                                'implication': '', 'limitation': ''}],
                  'sound_insights': [], 'diagnoses': [], 'next_actions': []}
        messages = ' '.join(issue[2] for issue in report.validate(result, batch))
        for expected in ('改了数', '不存在的统计', '不存在的片子', '比例数字'):
            self.assertIn(expected, messages)


class DedupTest(unittest.TestCase):
    rng = np.random.default_rng(7)

    def film(self, audio, visual):
        return {'audio': audio, 'visual': visual, 'duration': len(audio) * dedup.AUDIO_FRAME_SEC}

    def noisy(self, values, bits, width):
        flips = np.zeros(len(values), dtype=values.dtype)
        for i in range(len(values)):
            for bit in self.rng.choice(width, bits, replace=False):
                flips[i] |= values.dtype.type(1) << values.dtype.type(int(bit))
        return values ^ flips

    def random_film(self, seconds):
        audio = self.rng.integers(0, 2 ** 32, int(seconds / dedup.AUDIO_FRAME_SEC), dtype=np.uint32)
        visual = self.rng.integers(0, 2 ** 63, seconds * dedup.VISUAL_FPS, dtype=np.uint64)
        return audio, visual

    def test_trimmed_noisy_copy_is_a_repost(self):
        audio, visual = self.random_film(60)
        copy = self.film(self.noisy(audio[20:], 5, 32), self.noisy(visual[3:], 6, 64))
        self.assertEqual(dedup.relation(self.film(audio, visual), copy)[0], 'repost')

    def test_same_opening_different_body(self):
        audio, visual = self.random_film(60)
        other_audio, other_visual = self.random_film(60)
        n_a, n_v = int(10 / dedup.AUDIO_FRAME_SEC), 10 * dedup.VISUAL_FPS
        mixed = self.film(np.concatenate([audio[:n_a], other_audio[n_a:]]), np.concatenate([visual[:n_v], other_visual[n_v:]]))
        self.assertEqual(dedup.relation(self.film(audio, visual), mixed)[0], 'shared_opening')

    def test_unrelated_films_are_distinct(self):
        self.assertEqual(dedup.relation(self.film(*self.random_film(60)), self.film(*self.random_film(60)))[0], 'distinct')

    def test_missing_audio_falls_back_to_visual(self):
        audio, visual = self.random_film(30)
        silent = self.film(np.zeros(0, dtype=np.uint32), visual)
        self.assertEqual(dedup.relation(silent, self.film(np.zeros(0, dtype=np.uint32), visual))[0], 'repost')


class EvaluationTest(unittest.TestCase):
    UTTERANCES = [[200, 2500, '鼻翼出油怎么办？'], [5000, 8000, '控油一整天，现在是11:38']]

    def test_quotes_ignore_numeral_style(self):
        value = card()
        value['evidence'][2]['content'] = '控油一整天，现在是十一点三十八'
        rows = evaluation.check_quotes(value, self.UTTERANCES)
        self.assertEqual([row['status'] for row in rows], ['ok', 'ok'])

    def test_mistimed_and_unheard_quotes(self):
        value = card()
        value['evidence'][0]['time'] = {'kind': 'interval', 'start_sec': 14, 'end_sec': 16}
        value['evidence'][2]['content'] = '完全不一样的一句话'
        statuses = {row['id']: row['status'] for row in evaluation.check_quotes(value, self.UTTERANCES)}
        self.assertEqual(statuses, {'s1': 'mistimed', 's3': 'not_heard'})

    def test_hook_speech_window(self):
        self.assertEqual(evaluation.hook_speech_check(card(), self.UTTERANCES, 3.0)[0], 'ok')
        value = card()
        value['hook']['speech'] = None
        self.assertEqual(evaluation.hook_speech_check(value, self.UTTERANCES, 3.0)[0], 'missed_speech')


if __name__ == '__main__':
    unittest.main()
