import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_production.competitor_analysis import contract, snapshots  # noqa: E402
from content_production.competitor_analysis import taxonomy as tx  # noqa: E402
from test_competitor_analysis import CONTEXT, card  # noqa: E402

TODAY = dt.date(2026, 10, 23)


def row(film, value=None, days_ago=0, version=tx.TAXONOMY_VERSION, status='succeeded'):
    value = card() if value is None else value
    stored = {**value, 'structure': contract.normalize(value, 20.0)}
    issues = contract.validate(value, CONTEXT)
    seen = dt.datetime(2026, 10, 23, 12, tzinfo=snapshots.BUSINESS_TZ) - dt.timedelta(days=days_ago)
    return {'analysis_id': f'id-{film}', 'aweme_id': film, 'status': status, 'taxonomy_version': version,
            'source_sha256': f'sha-{film}', 'card': stored, 'title': f'作品 {film}', 'first_seen_at': seen,
            'host_errors': [{'severity': s, 'path': p, 'message': m} for s, p, m in issues]}


def framed(segments, points, speech='鼻翼出油怎么办', version=1):
    """A card with a built structure: framework label keys in order, selling-point label sets."""
    value = card()
    value['hook']['speech'] = speech
    value['framework'] = {
        'status': 'ok', 'presets': {'framework': version, 'sellingPoint': version},
        'labels': {'framework': {'mix': '混剪口播', 'live': '实拍内容', 'deal': '机制'},
                   'sellingPoint': {'wear': '持妆', 'look': '妆效', 'moist': '滋润保湿'}},
        'labelOrder': {'framework': ['mix', 'live', 'deal'], 'sellingPoint': ['wear', 'look', 'moist']},
        'segments': [{'startMs': i * 1000, 'endMs': i * 1000 + 900, 'labelKey': key} for i, key in enumerate(segments)],
        'sellingPoints': [{'startMs': i * 1000, 'endMs': i * 1000 + 500, 'labelKeys': keys} for i, keys in enumerate(points)],
    }
    return value


def stat(snapshot, stat_id):
    dimension, label = stat_id.split(':')
    return next(r for r in snapshot['payload']['rows'] if (r['dimension'], r['label']) == (dimension, label))


class BuildTest(unittest.TestCase):
    def test_counts_only_the_current_taxonomy(self):
        rows = [row('1'), row('2'), row('3', version='competitor-taxonomy-v2')]
        snapshot = snapshots.build(rows, 'loose_powder', 'all', TODAY)
        self.assertEqual(snapshot['films'], 2)
        self.assertEqual(snapshot['payload']['sample']['otherVersions'], {'competitor-taxonomy-v2': 1})
        self.assertEqual((stat(snapshot, 'hook:problem_named')['numerator'],
                          stat(snapshot, 'hook:problem_named')['denominator']), (2, 2))
        self.assertEqual(set(snapshot['payload']['films']), {'1', '2'})

    def test_windows_use_the_business_date(self):
        rows = [row('new', days_ago=0), row('week', days_ago=6), row('old', days_ago=7), row('older', days_ago=40)]
        films = {period: snapshots.build(rows, 'loose_powder', period, TODAY)['films']
                 for period in ('2026-10-23..2026-10-23', '2026-10-01..2026-10-31', '2026-10-16..2026-10-17',
                                '2026-01-01..2026-12-31', 'all', 'last7', 'last30')}
        self.assertEqual(films, {'2026-10-23..2026-10-23': 1, '2026-10-01..2026-10-31': 3,
                                 '2026-10-16..2026-10-17': 2, '2026-01-01..2026-12-31': 4, 'all': 4,
                                 'last7': 2, 'last30': 3})

    def test_precomputes_months_years_and_recent_days(self):
        cushion = card()
        cushion['product']['category'] = 'cushion'
        rows = [row('1', days_ago=0), row('2', days_ago=80), row('3', cushion, days_ago=3)]
        self.assertEqual(snapshots.calendar_windows(rows, 'loose_powder', TODAY), {
            'all', '2026-10-23..2026-10-23', '2026-10-01..2026-10-31', '2026-01-01..2026-12-31',
            '2026-08-01..2026-08-31'})  # the day 80 days back is left to a request
        self.assertIn('2026-10-20..2026-10-20', snapshots.calendar_windows(rows, 'all', TODAY))
        self.assertEqual(snapshots.calendar_windows([], 'cushion', TODAY), {'all'})

    def test_window_keys_and_names(self):
        self.assertEqual(snapshots.window_bounds('2024-02-01..2024-02-29'), (dt.date(2024, 2, 1), dt.date(2024, 2, 29)))
        for bad in ('last7', '2026-10-02..2026-10-01', '2026-10-01..', '2026-13-01..2026-13-02'):
            with self.assertRaises(ValueError):
                snapshots.window_bounds(bad)
        self.assertEqual([snapshots.window_name(k) for k in (
            'all', 'last30', '2026-10-26..2026-10-26', '2024-02-01..2024-02-29', '2026-01-01..2026-12-31',
            '2026-09-03..2026-10-02')], ['全部时间', '近 30 天', '2026/10/26', '2024 年 2 月', '2026 年',
                                         '2026/09/03 - 2026/10/02'])

    def test_cohort_is_the_card_category(self):
        cushion = card()
        cushion['product']['category'] = 'cushion'
        rows = [row('1'), row('2', cushion)]
        self.assertEqual(snapshots.build(rows, 'loose_powder', 'all', TODAY)['films'], 1)
        self.assertEqual(snapshots.build(rows, 'all', 'all', TODAY)['films'], 2)
        self.assertEqual(snapshots.cohorts(rows), ['all', 'cushion', 'loose_powder'])

    def test_empty_cohort_still_has_a_snapshot(self):
        snapshot = snapshots.build([], 'loose_powder', 'last7', TODAY)
        self.assertEqual((snapshot['films'], snapshot['families'], snapshot['payload']['rows']), (0, 0, []))
        self.assertTrue(snapshot['input_snapshot'])

    def test_free_text_labels_merge_spacing_and_count_films_once(self):
        first, second = card(), card()
        first['dimensions']['scenes']['labels'] = [
            {'label': '通勤 补妆', 'source': 'shown', 'evidence_refs': []},
            {'label': '通勤补妆', 'source': 'stated', 'evidence_refs': []}]
        second['dimensions']['scenes']['labels'] = [{'label': '约会', 'source': 'inferred', 'evidence_refs': []}]
        scenes = snapshots.build([row('1', first), row('2', second)], 'loose_powder', 'all', TODAY)['payload']['text']['scenes']
        self.assertEqual(scenes['denominator'], 2)
        self.assertEqual(len(scenes['labels']), 2)
        commute = next(label for label in scenes['labels'] if label['text'] == '通勤 补妆')
        self.assertEqual((commute['films'], commute['kinds'], commute['example_films']),
                         (1, {'shown': 1, 'stated': 1}, ['1']))

    def test_card_without_structure_is_reported_not_counted(self):
        broken = row('2')
        del broken['card']['structure']
        snapshot = snapshots.build([row('1'), broken], 'loose_powder', 'all', TODAY)
        self.assertEqual((snapshot['films'], snapshot['payload']['sample']['unreadable']), (1, 1))

    def test_partial_card_missing_parts_is_reported_not_counted(self):
        broken = row('2', status='partial')
        del broken['card']['hook']
        snapshot = snapshots.build([row('1'), broken], 'loose_powder', 'all', TODAY)
        self.assertEqual((snapshot['films'], snapshot['payload']['sample']['unreadable']), (1, 1))

    def test_dimensions_without_labels_keep_their_denominator(self):
        value = card()
        value['dimensions']['trust_cues']['labels'] = []
        snapshot = snapshots.build([row('1', value), row('2', value)], 'loose_powder', 'all', TODAY)
        self.assertFalse([r for r in snapshot['payload']['rows'] if r['dimension'] == 'trust_cues'])
        dimensions = snapshot['payload']['dimensions']
        self.assertEqual((dimensions['trust_cues']['denominator'], dimensions['trust_cues']['family_denominator']), (2, 1))
        self.assertEqual((dimensions['offer_and_cta']['denominator'], dimensions['offer_and_cta']['unassessable_count']),
                         (0, 2))

    def test_cohorts_keep_existing_snapshots_to_rewrite_them_empty(self):
        self.assertEqual(snapshots.cohorts([row('1')], existing=['cushion']), ['all', 'cushion', 'loose_powder'])


class StructureRankTest(unittest.TestCase):
    def rows(self):
        return [
            # 1 and 2 share an opening (one family): one structure, counted once.
            row('1', framed(['mix', 'mix', 'live', 'deal'], [['look'], ['wear']])),
            row('2', framed(['mix', 'live', 'live', 'deal'], [['wear', 'look']])),
            row('3', framed(['mix', 'live', 'deal'], [['moist']], speech='夏天脱妆有救了吗')),
            row('4', framed(['live'], [], speech='这款散粉我回购了三次')),
            row('5'),  # no structure built
        ]

    def compass(self):
        day = dt.date(2026, 10, 20)
        return {'1': [(day, 'room-a', 250000.0, 500000.0)],
                '2': [(day, 'room-a', 250000.0, 500000.0), (day - dt.timedelta(days=30), 'room-b', 1e6, None)],
                '4': [(day, 'room-c', 50000.0, 75000.0)]}

    def structures(self, period='all', compass=None):
        return snapshots.build(self.rows(), 'loose_powder', period, TODAY, compass)['payload']['structures']

    def test_framework_structures_merge_repeats_and_count_families(self):
        result = self.structures(compass=self.compass())
        self.assertEqual((result['films'], result['missing']), (4, 1))
        lane = result['framework']
        self.assertEqual((lane['films'], lane['families'], lane['empty']), (4, 3, 0))
        top = lane['rows'][0]
        self.assertEqual((top['key'], top['labels'], top['films'], top['families']),
                         ('mix > live > deal', ['mix', 'live', 'deal'], 3, 2))
        self.assertEqual(result['labels']['framework']['mix'], '混剪口播')

    def test_selling_points_are_a_set_in_preset_order(self):
        lane = self.structures()['sellingPoint']
        self.assertEqual(lane['empty'], 1)  # film 4 states no selling point
        # Ranked by films since structure v3: the re-posted 'wear + look' (2 films, one family) leads.
        self.assertEqual([(r['key'], r['films'], r['families']) for r in lane['rows']],
                         [('wear + look', 2, 1), ('moist', 1, 1)])

    def test_elements_count_films_and_families_per_lane(self):
        lanes = self.structures()
        framework = {e['key']: (e['kind'], e['label'], e['films'], e['families']) for e in lanes['framework']['elements']}
        self.assertEqual(framework['has_live'], ('has', 'live', 4, 3))
        self.assertEqual(framework['has_mix'], ('has', 'mix', 3, 2))
        self.assertEqual(framework['first_mix'][2:], (3, 2))
        self.assertEqual(framework['first_live'][2:], (1, 1))
        self.assertEqual(framework['last_deal'][2:], (3, 2))
        # Repeats merge before counting steps: mix > live > deal is 3 steps, live alone 1.
        self.assertEqual(framework['steps_three'][2:], (3, 2))
        self.assertEqual(framework['steps_short'][2:], (1, 1))
        self.assertNotIn('steps_long', framework)
        points = {e['key']: (e['films'], e['families']) for e in lanes['sellingPoint']['elements']}
        self.assertEqual(points, {'has_wear': (2, 1), 'has_look': (2, 1), 'has_moist': (1, 1), 'points_few': (3, 2)})

    def test_element_keys_spell_a_stat_id(self):
        import re
        from content_production.competitor_analysis import report, structure_ranks
        for lane, keys in (('framework', ['mixed_voiceover', 'promotion'] * 3), ('sellingPoint', ['a', 'b', 'c', 'd'])):
            for key, _, _ in structure_ranks.elements_of(lane, keys):
                self.assertTrue(re.fullmatch(report.STAT_REF, f'comp:framework_element:{key}'), key)

    def test_sales_count_each_room_day_once_and_follow_the_window(self):
        rows = {r['key']: r for r in self.structures(compass=self.compass())['framework']['rows']}
        # room-a on 10-20 is shared by films 1 and 2; room-b's open top band leaves no upper bound.
        self.assertEqual(rows['mix > live > deal']['sales'], {'min': 1250000.0, 'max': None, 'rooms': 2, 'roomDays': 2})
        self.assertEqual(rows['mix > live > deal']['exampleFilms'], ['2', '1', '3'])
        october = {r['key']: r for r in self.structures('2026-10-01..2026-10-31', self.compass())['framework']['rows']}
        self.assertEqual(october['mix > live > deal']['sales'], {'min': 250000.0, 'max': 500000.0, 'rooms': 1, 'roomDays': 1})
        self.assertEqual(self.structures(compass=self.compass())['sales'], {'available': True, 'films': 3})

    def test_without_the_ranking_tables_sales_are_unavailable(self):
        result = self.structures()
        self.assertEqual(result['sales'], {'available': False, 'films': 0})
        self.assertEqual(result['framework']['rows'][0]['sales'], {'min': 0, 'max': 0, 'rooms': 0, 'roomDays': 0})

    def test_newer_preset_names_win(self):
        old, new = framed(['mix'], [['wear']], version=1), framed(['mix'], [['wear']], speech='另一个开头', version=2)
        new['framework']['labels']['framework']['mix'] = '混剪'
        result = snapshots.build([row('1', new), row('2', old)], 'loose_powder', 'all', TODAY)['payload']['structures']
        self.assertEqual(result['labels']['framework']['mix'], '混剪')

    def test_each_lane_takes_names_from_its_own_newest_preset(self):
        newer_framework = framed(['mix'], [['wear']])
        newer_framework['framework']['presets'] = {'framework': 3, 'sellingPoint': 1}
        newer_framework['framework']['labels']['sellingPoint']['wear'] = '持妆（旧）'
        newer_points = framed(['mix'], [['wear']], speech='另一个开头')
        newer_points['framework']['presets'] = {'framework': 2, 'sellingPoint': 2}
        newer_points['framework']['labels']['framework']['mix'] = '混剪（旧）'
        labels, _ = snapshots.structure_ranks.dictionary(
            [newer_framework['framework'], newer_points['framework']])
        self.assertEqual((labels['framework']['mix'], labels['sellingPoint']['wear']), ('混剪口播', '持妆'))


def enriched(film, brand, speech, scenes=(), endorsers=(), cues=('celebrity_endorsement',)):
    value = framed(['mix', 'live'], [['wear']], speech=speech)
    value['product']['brand'] = brand
    value['dimensions']['trust_cues'] = {'assessment': 'assessable',
                                         'labels': [{'cue': cue, 'raw': '', 'evidence_refs': []} for cue in cues]}
    stored = row(film, value)
    stored['enrichment_id'] = f'e-{film}'
    stored['enrichment'] = {
        'scene_pains': [{'scene': scene, 'pain': pain, 'selling_point': point, 'other_point': other,
                         'audience_tags': ['油皮'], 'evidence_refs': ['s1']} for scene, pain, point, other in scenes],
        'endorsers': [{'name': name, 'role': role, 'evidence_refs': []} for name, role in endorsers]}
    return stored


class BreakdownTest(unittest.TestCase):
    def rows(self):
        commute = ('上班路上', '出油脱妆', 'long_wear', '')
        return [
            # 1 and 2 re-post one material (one opening family) under two brand spellings.
            enriched('1', '蒂洛薇（Dirovo）', '油皮姐妹别再用控油散粉了', [commute], [('@何泓姗', 'celebrity')]),
            enriched('2', 'Dirovo（蒂洛薇）', '油皮姐妹别再用控油散粉了', [commute, commute], [('何泓姗同款', 'celebrity')]),
            enriched('3', '花西子', '最近很火的散粉我买回来了', [('通勤', '下午脱妆', 'long_wear', ''),
                                                          ('秋天约会', '不想补妆', 'other', '便携')],
                     [(None, 'kol')], cues=('kol_endorsement', 'user_word_of_mouth')),
            enriched('4', None, '最近很火的散粉我买回来了，直接上脸', [], [('化妆课的老师', 'expert')]),
            row('5', framed(['mix'], [['wear']], speech='这款散粉我回购了三次')),  # no extraction yet
        ]

    def compass(self):
        day = dt.date(2026, 10, 20)
        return {'2': [(day, 'room-a', 250000.0, 500000.0)], '3': [(day, 'room-b', 75000.0, 100000.0)]}

    def build(self, compass=None):
        return snapshots.build(self.rows(), 'loose_powder', 'all', TODAY, compass)['payload']

    def test_counts_films_and_brands_with_spellings_folded(self):
        result = self.build()['breakdown']
        self.assertEqual((result['films'], result['enriched']), (5, 4))
        self.assertEqual(result['brands'], {'brands': 3, 'unknown': 1})  # Dirovo, 花西子, 甲
        self.assertFalse(result['sales']['available'])
        hook = result['hook']
        self.assertEqual((hook['films'], hook['groups']), (5, 3))
        first = hook['rows'][0]
        self.assertEqual((first['films'], first['brands'], first['text']), (2, 1, '油皮姐妹别再用控油散粉了'))

    def test_scenes_fold_synonyms_once_per_film(self):
        rows = {r['key']: r for r in self.build()['breakdown']['scene']['rows']}
        commute = rows['通勤|long_wear']
        self.assertEqual((commute['films'], commute['brands'], commute['pain']), (3, 2, '出油脱妆'))
        self.assertEqual(commute['audiences'], ['油皮'])
        other = rows['秋天约会|other|便携']
        self.assertEqual((other['sellingPoint'], other['otherPoint'], other['films']), ('other', '便携', 1))

    def test_endorsers_by_name_with_unnamed_and_other_cues_apart(self):
        result = self.build()['breakdown']['endorser']
        self.assertEqual([(r['name'], r['role'], r['films'], r['brands']) for r in result['rows']],
                         [('何泓姗', 'celebrity', 2, 1)])
        self.assertEqual(result['unnamed'], {'expert': {'films': 1, 'brands': 0}, 'kol': {'films': 1, 'brands': 1}})
        self.assertEqual(result['other']['cues'], {'user_word_of_mouth': 1})

    def test_top_films_follow_sales_and_keep_one_per_material(self):
        result = self.build(self.compass())['breakdown']
        top = result['hook']['rows'][0]['top']
        self.assertEqual([(t['film'], t['salesMin']) for t in top], [('2', 250000.0)])
        commute = next(r for r in result['scene']['rows'] if r['key'] == '通勤|long_wear')
        self.assertEqual([t['film'] for t in commute['top']], ['2', '3'])
        self.assertEqual(commute['top'][1]['opening'], '最近很火的散粉我买回来了')
        # Without sales every film is still listed, in film order.
        plain = next(r for r in self.build()['breakdown']['scene']['rows'] if r['key'] == '通勤|long_wear')
        self.assertEqual([(t['film'], t['salesMin']) for t in plain['top']], [('1', None), ('3', None)])

    def test_structure_rows_count_brands_and_extraction_moves_the_input(self):
        payload = self.build()
        row_ = payload['structures']['framework']['rows'][0]
        self.assertEqual((row_['films'], row_['brands']), (4, 2))
        before = snapshots.build(self.rows(), 'loose_powder', 'all', TODAY)['input_snapshot']
        changed = self.rows()
        changed[3]['enrichment_id'] = 'e-4b'
        self.assertNotEqual(snapshots.build(changed, 'loose_powder', 'all', TODAY)['input_snapshot'], before)


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, sql, params=None):
        self.conn.executed.append(sql)
        self.result = self.conn.answer(sql)

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result


class FakeConn:
    def __init__(self, latest=None, privileges=(True, True, True, True), existing=(), recent=(), requests=()):
        self.latest, self.privileges, self.existing = latest, privileges, existing
        self.recent, self.requests = recent, requests
        self.executed, self.commits, self.rollbacks = [], 0, 0

    def cursor(self, cursor_factory=None):
        return FakeCursor(self)

    def answer(self, sql):
        if sql.startswith('SELECT COUNT(*)'):
            return (3, dt.datetime(2026, 10, 23, 1, tzinfo=dt.timezone.utc))
        if 'source_watermark FROM' in sql:
            return (self.latest,) if self.latest else None
        if 'to_regclass' in sql:
            return (True,)
        if 'has_table_privilege' in sql:
            return self.privileges
        if sql == snapshots.RECENT_WINDOWS_SQL:
            return list(self.recent)
        if sql.startswith('SELECT DISTINCT cohort'):
            return [(cohort,) for cohort in self.existing]
        if sql == snapshots.LOAD_SQL:
            return [row('1')]
        if sql == snapshots.CLAIM_REQUESTS_SQL:
            return list(self.requests)
        if sql == snapshots.COMPASS_SQL:
            return [('1', dt.date(2026, 10, 23), 'room-a', 250000, 500000)]
        return None

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class RefreshTest(unittest.TestCase):
    def setUp(self):
        snapshots._state.update(next_check=0.0, allowed=None)

    def test_unchanged_watermark_writes_nothing(self):
        conn = FakeConn()
        conn.latest = snapshots.watermark(conn, TODAY)
        self.assertEqual(snapshots.refresh(conn, today=TODAY), 0)
        self.assertFalse([sql for sql in conn.executed if sql == snapshots.UPSERT_SQL])

    def test_watermark_names_the_code_versions(self):
        self.assertTrue(snapshots.watermark(FakeConn(), TODAY).startswith(
            f'{snapshots.stats.STATS_VERSION}|{tx.TAXONOMY_VERSION}|{contract.NORMALIZATION_VERSION}|'
            f'{snapshots.structure_ranks.STRUCTURE_VERSION}|'))

    def test_watermark_moves_with_compass_imports_when_readable(self):
        self.assertIn('|3@2026-10-23T01:00:00+00:00|', snapshots.watermark(FakeConn(), TODAY))
        self.assertIn('|-|2026-10-23', snapshots.watermark(FakeConn(privileges=(True, False, True)), TODAY))

    def test_compass_rows_load_as_floats(self):
        self.assertEqual(snapshots.load_compass(FakeConn()), {'1': [(dt.date(2026, 10, 23), 'room-a', 250000.0, 500000.0)]})
        self.assertIsNone(snapshots.load_compass(FakeConn(privileges=(False, False, False))))

    def test_moved_watermark_writes_every_cohort_and_window_then_prunes(self):
        conn = FakeConn(latest='old', existing=['cushion'], recent=[('loose_powder', '2026-09-01..2026-10-23')])
        written = snapshots.refresh(conn, today=TODAY)
        # all and loose_powder: all, the film's day, month and year; loose_powder also its custom
        # window still being read; cushion (films gone): all.
        self.assertEqual(written, 4 + 5 + 1)
        self.assertEqual(conn.executed.count(snapshots.UPSERT_SQL), written)
        self.assertEqual(conn.executed[-1], snapshots.PRUNE_SQL)

    def test_role_without_full_write_access_stops_checking(self):
        conn = FakeConn(latest='old', privileges=(True, False, True, True))  # INSERT but no UPDATE
        self.assertIsNone(snapshots.maybe_refresh(conn))
        self.assertFalse(snapshots.due(now=10_000.0))
        self.assertNotIn(snapshots.UPSERT_SQL, conn.executed)

    def test_failure_rolls_back_and_returns_none(self):
        conn = FakeConn(latest='old')
        conn.answer = lambda sql: (_ for _ in ()).throw(RuntimeError('db down'))
        self.assertIsNone(snapshots.maybe_refresh(conn))
        self.assertEqual(conn.rollbacks, 1)

    def test_requested_windows_are_computed_then_dropped(self):
        conn = FakeConn(requests=[('loose_powder', '2026-10-20..2026-10-23'), ('all', '2026-10-01..2026-10-02')])
        self.assertEqual(snapshots.maybe_process_requests(conn), 2)
        self.assertEqual(conn.executed.count(snapshots.UPSERT_SQL), 2)
        self.assertEqual(conn.executed.count(snapshots.DELETE_REQUEST_SQL), 2)
        self.assertEqual(snapshots.process_requests(FakeConn(), today=TODAY), 0)

    def test_requests_wait_for_a_role_that_can_write(self):
        conn = FakeConn(privileges=(True, True, True, False), requests=[('all', '2026-10-01..2026-10-02')])
        self.assertIsNone(snapshots.maybe_process_requests(conn))
        self.assertTrue(snapshots.disallowed())
        self.assertNotIn(snapshots.UPSERT_SQL, conn.executed)

    def test_checks_at_most_once_per_interval(self):
        self.assertTrue(snapshots.due(now=100.0))
        self.assertFalse(snapshots.due(now=100.0 + snapshots.CHECK_INTERVAL_SECONDS - 1))
        self.assertTrue(snapshots.due(now=100.0 + snapshots.CHECK_INTERVAL_SECONDS))


if __name__ == '__main__':
    unittest.main()
