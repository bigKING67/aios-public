import json
import os
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import breakdown_terms as terms  # noqa: E402
from content_production.competitor_analysis import enrichment  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')


def line(id_, modality, content):
    return {'id': id_, 'modality': modality, 'content': content, 'quality': 'clear',
            'time': {'kind': 'interval', 'start_sec': 0.0, 'end_sec': 1.0}}


def card(cues=('celebrity_endorsement',)):
    return {
        'product': {'brand': '甲', 'name': '散粉', 'category': 'loose_powder'},
        'hook': {'speech': '早上起来不想化妆', 'onscreen_text': None},
        'evidence': [line('s1', 'speech', '早上起来不想化妆、着急出门你就用它'),
                     line('t2', 'onscreen_text', '何泓姗同款'),
                     line('s3', 'speech', '秋天约会不想频繁补妆'),
                     line('v4', 'visual', '女生上脸')],
        'claims': [{'text': '一整天不脱妆', 'selling_point': 'long_wear'}],
        'purchase_question': '着急出门时怎么快速上妆',
        'dimensions': {'trust_cues': {'labels': [{'cue': cue, 'raw': '演员陈紫函出镜推荐'} for cue in cues]}},
    }


def scene(text='早上赶时间', pain='不想化妆、着急出门', point='no_caking', refs=('s1',), other=''):
    return {'scene': text, 'pain': pain, 'selling_point': point, 'other_point': other,
            'audience_tags': ['上班族'], 'evidence_refs': list(refs)}


class SceneTerms(unittest.TestCase):
    def test_a_bare_filming_location_is_not_a_scene(self):
        for text in ('日常居家化妆定妆场景', '直播间选购场景', '户外露天场景', '室内居家自然光场景', '化妆台前'):
            self.assertTrue(terms.is_location_only(text), text)
        for text in ('早上赶时间', '日常通勤快速出门场景', '秋天约会', '夏季户外运动出汗', '熬夜后'):
            self.assertFalse(terms.is_location_only(text), text)
        self.assertFalse(terms.is_location_only(''))

    def test_scene_keys_fold_spellings(self):
        self.assertEqual(terms.normalize_scene('上班路上'), '通勤')
        self.assertEqual(terms.normalize_scene('上班路上的场景'), '通勤')
        self.assertEqual(terms.normalize_scene('着急出门时'), '早上赶时间')
        self.assertEqual(terms.normalize_scene(' 秋天 约会 '), '秋天约会')
        self.assertEqual(terms.normalize_scene('秋天约会'), '秋天约会')
        self.assertEqual(terms.normalize_scene('秋冬干燥季节'), '秋冬')
        self.assertEqual(terms.normalize_scene('秋季'), '秋冬')
        self.assertEqual(terms.normalize_scene('日常长时间带妆'), '长时间带妆')
        self.assertEqual(terms.normalize_scene('早起赶时间出门'), '早上赶时间')
        self.assertEqual(terms.normalize_scene('日常'), '日常')


class NameTerms(unittest.TestCase):
    def test_brand_spellings_share_a_key(self):
        a, b = terms.brand_key('蒂洛薇（Dirovo）'), terms.brand_key('Dirovo（蒂洛薇）')
        self.assertEqual(a[0], b[0])
        self.assertEqual(a[1], '蒂洛薇（Dirovo）')
        self.assertEqual(terms.brand_key('DPDP')[0], terms.brand_key('dpdp ')[0])
        self.assertNotEqual(terms.brand_key('花西子')[0], terms.brand_key('花间颂')[0])
        self.assertIsNone(terms.brand_key(None))
        self.assertIsNone(terms.brand_key('  '))

    def test_endorser_names_drop_account_marks_and_suffixes(self):
        self.assertEqual(terms.endorser_key('@何泓姗'), ('何泓姗', '何泓姗'))
        self.assertEqual(terms.endorser_key('何泓姗同款')[0], terms.endorser_key('何泓姗')[0])
        self.assertEqual(terms.endorser_key('Ally 推荐')[0], 'ally')
        self.assertIsNone(terms.endorser_key('@同款'))
        self.assertIsNone(terms.endorser_key(None))
        self.assertIsNone(terms.endorser_key('化妆课的老师'))
        self.assertIsNone(terms.endorser_key('一位博主'))
        self.assertEqual(terms.endorser_key('金婧')[0], terms.endorser_key('金靖')[0])


class EnrichmentContract(unittest.TestCase):
    def test_digest_holds_only_citable_text(self):
        digest = enrichment.digest(card())
        self.assertEqual([item['id'] for item in digest['lines']], ['s1', 't2', 's3'])
        prompt = enrichment.build_prompt(card())
        self.assertIn('场景不是拍摄地点', prompt)
        self.assertIn('不要凭长相', prompt)
        self.assertIn('何泓姗同款', prompt)
        schema = enrichment.response_schema()
        self.assertEqual(schema['properties']['scene_pains']['items']['properties']['selling_point']['enum'],
                         ['moisturizing', 'skincare', 'no_caking', 'long_wear', 'other'])

    def test_scenes_need_a_situation_a_reference_and_a_known_point(self):
        result, issues = enrichment.validate({'scene_pains': [
            scene(),
            scene(text='日常居家化妆定妆场景'),
            scene(refs=()),
            scene(refs=('v4',)),
            scene(text='秋天约会', pain='不想频繁补妆', point='other', refs=('s3',)),
        ], 'endorsers': []}, card())
        self.assertEqual([(s['scene'], s['selling_point']) for s in result['scene_pains']], [('早上赶时间', 'no_caking')])
        self.assertEqual(len([i for i in issues if i[0] == 'warning']), 2)
        # Only the first three are looked at; a scene past them is never kept.
        result, issues = enrichment.validate({'scene_pains': [
            scene(text='秋天约会', pain='不想频繁补妆', point='other', refs=('s3',), other='便携'),
            scene(text='秋天约会', pain='不想频繁补妆', point='other', refs=('s3',)),
            scene(), scene(text='熬夜后'),
        ], 'endorsers': []}, card())
        self.assertEqual([(s['scene'], s['other_point']) for s in result['scene_pains']],
                         [('秋天约会', '便携'), ('早上赶时间', '')])
        self.assertTrue(any('原词' in i[2] for i in issues))

    def test_an_endorser_name_must_be_written_in_the_text(self):
        result, issues = enrichment.validate({'scene_pains': [], 'endorsers': [
            {'name': '何泓姗', 'role': 'celebrity', 'evidence_refs': ['t2']},
            {'name': '@何泓姗', 'role': 'celebrity', 'evidence_refs': ['t2']},
            {'name': '陈紫函', 'role': 'celebrity', 'evidence_refs': []},
            {'name': '杨幂', 'role': 'celebrity', 'evidence_refs': ['s1']},
            {'name': None, 'role': 'kol', 'evidence_refs': []},
        ]}, card())
        self.assertEqual([(e['name'], e['role']) for e in result['endorsers']],
                         [('何泓姗', 'celebrity'), ('陈紫函', 'celebrity'), (None, 'kol')])
        self.assertTrue(any('杨幂' in i[2] for i in issues))
        self.assertTrue(any(i[0] == 'info' and 'KOL' in i[2] for i in issues))
        result, issues = enrichment.validate({'scene_pains': [], 'endorsers': [
            {'name': '化妆课的老师', 'role': 'expert', 'evidence_refs': []}]},
            {**card(), 'dimensions': {'trust_cues': {'labels': [{'cue': 'expert_endorsement', 'raw': '化妆课的老师推荐'}]}}})
        self.assertEqual(result['endorsers'], [{'name': None, 'role': 'expert', 'evidence_refs': []}])

    def test_no_endorser_without_an_endorsement_cue(self):
        result, issues = enrichment.validate(
            {'scene_pains': [], 'endorsers': [{'name': '何泓姗', 'role': 'celebrity', 'evidence_refs': ['t2']}]},
            card(cues=('user_word_of_mouth',)))
        self.assertEqual(result['endorsers'], [])
        self.assertEqual(issues[0][0], 'warning')

    def test_a_result_of_the_wrong_shape_is_an_error(self):
        self.assertIsNone(enrichment.validate({'scene_pains': []}, card())[0])
        self.assertEqual(enrichment.validate([], card())[1][0][0], 'error')

    def test_estimate_is_bounded_by_the_prompt_size(self):
        est = enrichment.estimate([card(), card()])
        self.assertEqual(est['films'], 2)
        self.assertGreater(est['yuan_estimate'], 0)
        self.assertLess(est['yuan_estimate'], 0.05)


class FakeClient:
    def __init__(self, payload):
        self.payload, self.requests = payload, []

    def _post(self, request):
        self.requests.append(request)
        return {'status': 'completed', 'usage': {'input_tokens': 1500, 'output_tokens': 300},
                'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(self.payload)}]}]}


@unittest.skipUnless(DB, 'disposable database required')
class EnrichmentQueueTest(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        self.aweme = str(7_100_000_000_000_000_000 + uuid.uuid4().int % 10**12)
        enrichment._state['allowed'] = None
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO competitor.videos (aweme_id, share_url) VALUES (%s, 'https://v.douyin.com/x/')",
                        (self.aweme,))
            cur.execute('INSERT INTO competitor.analyses (aweme_id) VALUES (%s) RETURNING analysis_id::TEXT', (self.aweme,))
            self.analysis = cur.fetchone()[0]
        self.conn.commit()
        self.addCleanup(self._cleanup)
        self.set_card(card())

    def set_card(self, value):
        with self.conn.cursor() as cur:
            cur.execute("""UPDATE competitor.analyses SET card = %s, status = 'succeeded', model_id = 'fixture',
              source_sha256 = %s, input_manifest_hash = %s, prompt_version = 'fixture', taxonomy_version = 'fixture',
              finished_at = NOW() WHERE analysis_id = %s""", (json.dumps(value), 'a' * 64, 'b' * 64, self.analysis))
        self.conn.commit()

    def _cleanup(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM competitor.analyses WHERE aweme_id = %s', (self.aweme,))
            cur.execute('DELETE FROM competitor.videos WHERE aweme_id = %s', (self.aweme,))
        self.conn.commit()

    def stored(self):
        with self.conn.cursor() as cur:
            cur.execute("""SELECT status, error_code, result, host_errors, cost_yuan FROM competitor.film_enrichments
              WHERE analysis_id = %s""", (self.analysis,))
            return cur.fetchone()

    def claim_mine(self):
        """Claims queued rows until this fixture's; rows of other tests are failed out of the way."""
        while True:
            job = enrichment.claim(self.conn)
            self.assertIsNotNone(job)
            if job['aweme_id'] == self.aweme:
                return job
            enrichment.fail(self.conn, job, 'skipped', 'other fixture row')

    def test_nothing_is_queued_unless_enabled(self):
        os.environ.pop(enrichment.SINCE_ENV, None)
        enrichment.queue_new(self.conn)
        self.assertIsNone(self.stored())

    def test_backfill_queues_once_and_a_run_keeps_only_checked_items(self):
        rows = [r for r in enrichment.missing(self.conn, limit=1000) if r['aweme_id'] == self.aweme]
        self.assertEqual(len(rows), 1)
        enrichment.queue(self.conn, rows)
        enrichment.queue(self.conn, rows)
        self.assertEqual([r for r in enrichment.missing(self.conn) if r['aweme_id'] == self.aweme], [])
        payload = {'scene_pains': [scene(), scene(text='直播间')],
                   'endorsers': [{'name': '何泓姗', 'role': 'celebrity', 'evidence_refs': ['t2']}]}
        job = self.claim_mine()
        self.assertEqual(enrichment.run(self.conn, job, FakeClient(payload)), 'succeeded')
        status, code, result, issues, cost = self.stored()
        self.assertEqual((status, code), ('succeeded', None))
        self.assertEqual([s['scene'] for s in result['scene_pains']], ['早上赶时间'])
        self.assertEqual(result['endorsers'][0]['name'], '何泓姗')
        self.assertTrue(any('拍摄地点' in i[2] for i in issues))
        self.assertGreater(cost, 0)

    def test_an_unreadable_answer_fails_with_its_cost(self):
        enrichment.queue(self.conn, [{'analysis_id': self.analysis, 'aweme_id': self.aweme}])
        job = self.claim_mine()

        class Broken(FakeClient):
            def _post(self, request):
                response = super()._post(request)
                response['output'][0]['content'][0]['text'] = 'not json'
                return response
        self.assertEqual(enrichment.run(self.conn, job, Broken({})), 'failed')
        status, code, *_rest, cost = self.stored()
        self.assertEqual((status, code), ('failed', 'invalid_response'))
        self.assertGreater(cost, 0)

    def test_the_daily_limit_stops_claims(self):
        enrichment.queue(self.conn, [{'analysis_id': self.analysis, 'aweme_id': self.aweme}])
        os.environ[enrichment.LIMIT_ENV] = '0'
        try:
            self.assertIsNone(enrichment.claim(self.conn))
        finally:
            os.environ.pop(enrichment.LIMIT_ENV, None)
        self.assertEqual(self.stored()[0], 'queued')


if __name__ == '__main__':
    unittest.main()
