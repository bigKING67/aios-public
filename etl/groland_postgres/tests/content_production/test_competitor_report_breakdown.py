import json
import os
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_production.competitor_analysis import report_breakdown as rb  # noqa: E402
from content_production.competitor_analysis import opening_formulas as of
from content_production.competitor_analysis import report_jobs  # noqa: E402
from test_competitor_snapshots import TODAY, enriched  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
# Six opening groups: two "别再" lines, two "最近很火" lines, one each of the rest.
OPENINGS = ['油皮姐妹别再用控油散粉了', '干皮姐妹别再乱买散粉了', '最近很火的散粉我买回来了',
            '大家都在问的那款气垫，我也入手了', '一盒用半年的秘密', '这样拍粉才服帖']
# Four brands over six openings: each opening's two films come from two brands.
BRANDS = ['甲', '乙', '丙', '丁']


def rows(count=12):
    built = []
    for index in range(count):
        built.append(enriched(str(7_000_000_000 + index), BRANDS[index % 4], OPENINGS[index % 6],
                              [('上班路上', '出油脱妆', 'long_wear', '')] if index % 2 else [],
                              [('何泓姗', 'celebrity')] if index % 3 == 0 else []))
    return built


def batch(count=12):
    return rb.build_batch(rows(count), 'loose_powder', 'all', TODAY)


def groups_of(b, *texts):
    return [g['id'] for g in b['hookGroups'] if g['text'] in texts]


def valid_formulas(b):
    return {'formulas': [
        {'id': 'f1', 'meaning': '纠正特定人群选品错误', 'logic': '点名人群再劝阻错误做法', 'template': '[人群]别再[错误做法]了', 'groups': groups_of(b, OPENINGS[0], OPENINGS[1]),
         'examples': groups_of(b, OPENINGS[0])},
        {'id': 'f2', 'meaning': '买热门产品准备亲自体验', 'logic': '借产品热度引出亲身尝试', 'template': '最近很火的[产品]我买回来了', 'groups': groups_of(b, OPENINGS[2], OPENINGS[3]),
         'examples': groups_of(b, OPENINGS[2])},
        {'id': 'f3', 'meaning': '小包装可以用很久', 'logic': '用使用时间制造好奇', 'template': '一盒用[时间]的秘密', 'groups': groups_of(b, OPENINGS[4]),
         'examples': groups_of(b, OPENINGS[4])}],
        'other_groups': groups_of(b, OPENINGS[5])}


def review_of(result, rejected=()):
    return {'members': [{'group': g, 'formula': f['id'], 'verdict': 'uncertain' if g in rejected else 'match',
                         'reason': '具体含义与表达逻辑相符' if g not in rejected else '共同含义证据不足'}
                        for f in result['formulas'] for g in f['groups']]}


def valid_reading():
    return {'hook_insights': [{'refs': ['f1'], 'statement': '点名人群加纠错，适合讲持妆'}],
            'scene_insights': [{'refs': ['s1'], 'statement': '通勤出油是主打场景'}],
            'endorser_insights': [{'refs': ['e1'], 'statement': '借明星同款带信任'}],
            'golden_structures': [{'refs': ['k1'], 'statement': '先混剪口播再上实拍'}],
            'next_actions': [{'id': 'a1', 'priority': 'now', 'structure': 'k1', 'formula': 'f1', 'scene': 's1',
                              'selling_points': '持妆', 'description': '拍一条通勤出油对比'}],
            'limitations': []}


class FakeClient:
    """Answers each call with the next payload (a dict, or a string sent as is)."""

    def __init__(self, *payloads):
        self.payloads, self.requests = list(payloads), []

    def _post(self, request):
        self.requests.append(request)
        payload = self.payloads.pop(0)
        text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        return {'status': 'completed', 'usage': {'input_tokens': 4000, 'output_tokens': 1000},
                'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}]}


class BatchTest(unittest.TestCase):
    def test_too_few_films_is_not_read(self):
        with self.assertRaises(rb.InsufficientSample):
            batch(6)

    def test_batch_counts_groups_scenes_endorsers_and_structures(self):
        b = batch()
        self.assertEqual((b['films'], b['brands'], b['enriched']), (12, 4, 12))
        self.assertEqual(len(b['hookGroups']), 6)
        self.assertEqual([len(g['films']) for g in b['hookGroups']], [2] * 6)
        self.assertEqual(b['scenes'][0]['id'], 's1')
        self.assertEqual((b['scenes'][0]['scene'], b['scenes'][0]['films']), ('通勤', 6))
        self.assertEqual((b['endorsers'][0]['name'], b['endorsers'][0]['films']), ('何泓姗', 4))
        self.assertEqual((b['structures'][0]['id'], b['structures'][0]['name']), ('k1', '混剪口播 → 实拍内容'))
        prompt = rb.reading_prompt(b, of.formula_rows(None, b))
        self.assertIn('本批没有我方数据', prompt)
        self.assertNotIn('销售额', prompt)


class FormulaTest(unittest.TestCase):
    def test_a_valid_partition_passes_and_rows_are_host_counted(self):
        b = batch()
        result = valid_formulas(b)
        self.assertEqual(of.validate_formulas(result, b), [])
        formulas = of.formula_rows(result, b)
        self.assertEqual([(f['id'], f['template'], f['films'], f['brands']) for f in formulas],
                         [('f1', '[人群]别再[错误做法]了', 4, 4), ('f2', '最近很火的[产品]我买回来了', 4, 4),
                          ('f3', '一盒用[时间]的秘密', 2, 2)])
        self.assertEqual(formulas[0]['examples'], [OPENINGS[0]])

    def test_partition_template_and_example_errors(self):
        b = batch()
        result = valid_formulas(b)
        result['other_groups'] = []                                    # a group left out
        result['formulas'][1]['groups'].append(result['formulas'][0]['groups'][0])  # a group twice
        result['formulas'][2]['template'] = '制造悬念'                     # no variable, no fixed phrase of its own
        result['formulas'][0]['examples'] = ['g99']
        messages = ' / '.join(m for _, _, m in of.validate_formulas(result, b))
        for expected in ('每条输入必须归类一次', '方括号变量', 'examples'):
            self.assertIn(expected, messages)

    def test_no_raw_text_fallback(self):
        self.assertEqual(of.formula_rows(None, batch()), [])



class GenerateTest(unittest.TestCase):
    def test_two_calls_and_a_valid_reading(self):
        b = batch()
        client = FakeClient(valid_formulas(b), review_of(valid_formulas(b)), valid_reading())
        report, issues, spent = rb.generate(b, client)
        self.assertEqual((report['formulaStatus'], spent['calls'], issues), ('ok', 3, []))
        self.assertEqual(report['formulas'][0]['template'], '[人群]别再[错误做法]了')
        self.assertEqual(report['next_actions'][0]['formula'], 'f1')
        self.assertEqual(spent['usage'], {'input_tokens': 12000, 'output_tokens': 3000})
        self.assertIn('修正上次问题', of.formula_prompt(b, [('error', 'groups', 'g1 出现了 2 次')]))
        # The formula call sorts without thinking and with more room; the reading thinks.
        self.assertEqual(client.requests[0]['thinking'], {'type': 'disabled'})
        self.assertEqual(client.requests[2]['thinking'], {'type': 'enabled'})

    def test_invalid_partition_retries_once_then_fails_without_raw_fallback(self):
        b = batch()
        bad = {**valid_formulas(b), 'other_groups': []}
        with self.assertRaises(rb.ReportFailed) as caught:
            rb.generate(b, FakeClient(bad, 'not json'))
        self.assertEqual(caught.exception.code, 'invalid_formulas')
        self.assertEqual(caught.exception.spent['calls'], 2)
        retried = FakeClient(bad, valid_formulas(b), review_of(valid_formulas(b)), valid_reading())
        self.assertEqual(rb.generate(b, retried)[0]['formulaStatus'], 'ok')
        self.assertIn('每条输入必须归类一次', retried.requests[1]['input'][0]['content'][0]['text'])

    def test_uncertain_member_is_excluded_without_losing_sources(self):
        b = batch()
        result = valid_formulas(b)
        rejected = result['formulas'][0]['groups'][:1]
        report, _, _ = of.generate(b, FakeClient(result, review_of(result, rejected)))
        assigned = [f['film'] for row in report['formulas'] for f in row['sources']]
        unassigned = [f['film'] for f in report['unassignedSources']]
        self.assertEqual(len(assigned + unassigned), b['films'])
        self.assertEqual(len(set(assigned + unassigned)), b['films'])
        for row in report['formulas']:
            self.assertEqual(len(row['sources']), row['films'])
        self.assertEqual(report['unassignedFilms'], 4)

    def test_a_reading_citing_unknown_rows_or_writing_numbers_fails(self):
        b = batch()
        reading = valid_reading()
        reading['scene_insights'][0]['refs'] = ['s9']
        reading['hook_insights'][0]['statement'] = '六成竞品都这样开头'
        reading['next_actions'][0]['structure'] = 'k9'
        with self.assertRaises(rb.ReportFailed) as caught:
            rb.generate(b, FakeClient(valid_formulas(b), review_of(valid_formulas(b)), reading))
        messages = ' / '.join(m for _, _, m in caught.exception.issues)
        for expected in ('s9', '比例或计数', 'k9'):
            self.assertIn(expected, messages)
        self.assertEqual(caught.exception.spent['calls'], 3)

    def test_frequency_words_are_warnings(self):
        b = batch()
        reading = valid_reading()
        reading['scene_insights'][0]['statement'] = '通勤出油是常见场景'
        _, issues, _ = rb.generate(b, FakeClient(valid_formulas(b), review_of(valid_formulas(b)), reading))
        self.assertEqual([severity for severity, *_ in issues], ['warning'])

    def test_inputs_record_keeps_counts_and_films(self):
        record = rb.inputs_record(batch())
        self.assertEqual(record['promptVersion'], rb.PROMPT_VERSION)
        self.assertEqual(record['sample'], {'films': 12, 'brands': 4, 'enriched': 12})
        self.assertEqual(set(record['scenes'][0]), {'id', 'films', 'brands', 'top', 'scene', 'pain', 'sellingPoint',
                                                    'otherPoint'})
        self.assertEqual(len(record['films']), 12)


@unittest.skipUnless(DB, 'disposable database required')
class ReportJobsTest(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        self.snapshot = uuid.uuid4().hex[:16]
        report_jobs._state['allowed'] = None
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM competitor.reports WHERE input_snapshot = %s', (self.snapshot,))
        self.conn.commit()

    def run_with(self, client, count=12, version=rb.PROMPT_VERSION, stale=False):
        self.snapshot = rb.build_batch(rows(count), 'loose_powder', 'all', TODAY, min_films=1)['inputSnapshot']
        if stale:
            self.snapshot = 'old-' + self.snapshot
        with self.conn.cursor() as cur:
            cur.execute("""INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version)
              VALUES ('loose_powder', 'all', %s, %s) RETURNING report_id::text""", (self.snapshot, version))
            report_id = cur.fetchone()[0]
        self.conn.commit()
        job = report_jobs.claim(self.conn)
        self.assertEqual(job['report_id'], report_id)
        fixture = rows(count)
        originals = report_jobs.snapshots.load_rows, report_jobs.snapshots.load_compass
        report_jobs.snapshots.load_rows, report_jobs.snapshots.load_compass = (lambda conn: fixture), (lambda conn: None)
        try:
            status = report_jobs.run(self.conn, job, client, today=TODAY)
        finally:
            report_jobs.snapshots.load_rows, report_jobs.snapshots.load_compass = originals
        with self.conn.cursor() as cur:
            cur.execute('SELECT status, error_code, cost_yuan, inputs, report, issues FROM competitor.reports '
                        'WHERE report_id = %s', (report_id,))
            return status, cur.fetchone()

    def test_a_valid_report_is_stored_with_its_inputs_and_cost(self):
        b = batch()
        status, (db_status, code, cost, inputs, report, issues) = self.run_with(FakeClient(valid_formulas(b), review_of(valid_formulas(b)), valid_reading()))
        self.assertEqual((status, db_status, code), ('succeeded', 'succeeded', None))
        self.assertGreater(cost, 0)
        self.assertEqual(inputs['promptVersion'], rb.PROMPT_VERSION)
        self.assertEqual(report['formulas'][0]['id'], 'f1')
        self.assertTrue(report_jobs.allowed(self.conn))

    def test_a_failed_reading_keeps_its_cost_and_issues(self):
        b = batch()
        reading = valid_reading()
        reading['next_actions'][0]['formula'] = 'f9'
        status, (db_status, code, cost, _, report, issues) = self.run_with(FakeClient(valid_formulas(b), review_of(valid_formulas(b)), reading))
        self.assertEqual((status, code), ('failed', 'invalid_report'))
        self.assertGreater(cost, 0)
        self.assertTrue(any('f9' in issue[2] for issue in issues))

    def test_too_small_a_sample_fails_without_calling_the_model(self):
        client = FakeClient()
        status, (db_status, code, cost, *_) = self.run_with(client, count=4)
        self.assertEqual((status, code, cost, client.requests), ('failed', 'insufficient_sample', None, []))

    def test_opening_only_job_succeeds_below_reading_threshold(self):
        b = rb.build_batch(rows(4), 'loose_powder', 'all', TODAY, min_films=1)
        result = valid_formulas(b)
        # The short sample has only the first two concepts; no artificial minimum formula count.
        result['formulas'] = [f for f in result['formulas'] if f['groups']]
        client = FakeClient(result, review_of(result))
        status, (_, code, cost, inputs, report, _) = self.run_with(client, count=4, version=of.PROMPT_VERSION)
        self.assertEqual((status, code), ('succeeded', None))
        self.assertEqual(inputs['promptVersion'], of.PROMPT_VERSION)
        self.assertEqual(len(client.requests), 2)
        self.assertNotIn('next_actions', report)
        self.assertEqual(sum(f['films'] for f in report['formulas']), 4)
        self.assertGreater(cost, 0)

    def test_changed_input_stops_before_billable_call(self):
        client = FakeClient()
        status, (_, code, cost, *_) = self.run_with(client, stale=True)
        self.assertEqual((status, code, cost, client.requests), ('failed', 'input_changed', None, []))



if __name__ == '__main__':
    unittest.main()
