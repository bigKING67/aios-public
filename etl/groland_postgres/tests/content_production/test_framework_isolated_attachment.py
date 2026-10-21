import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from content_production.segment_suggestion_provider import SuggestionError
from content_production import framework_isolated_attachment as m
from content_production.framework_window_audit import finalize


def segment(a, b, label):
    return dict(start_ms=a, end_ms=b, label_key=label, confidence=1, reason='')


class IsolatedAttachmentTests(unittest.TestCase):
    def setUp(self):
        self.segments = [segment(0, 20000, 'live_demo'), segment(20000, 24000, 'mixed_voiceover'),
                         segment(24000, 44000, 'street_interview')]
        self.claims = [dict(start_ms=0, end_ms=20000, minimum=10001)]
        self.proof = dict(one_quote='yes', live_source_relation='new_source',
                          interview_relation='separate_source', target_evidence='独立单人推荐',
                          source_evidence='D内未出现该人物', interview_evidence='非同次采访')

    def test_direction_comes_from_anchor_role_not_position(self):
        left = m.plan(self.segments, self.claims)[0]
        self.assertEqual(left['live_start_ms'], 0)
        reverse = [segment(0,20000,'street_interview'),segment(20000,24000,'mixed_voiceover'),
                   segment(24000,44000,'live_demo')]
        right = m.plan(reverse, [dict(start_ms=24000,end_ms=44000,minimum=10001)])[0]
        self.assertEqual(right['live_start_ms'], 24000)

    def test_interrupted_short_and_montage_neighbors_cannot_anchor(self):
        for label in ['mixed_voiceover', 'promotion']:
            rows=[dict(s) for s in self.segments];rows[2]['label_key']=label
            self.assertEqual(m.plan(rows,self.claims),[])
        self.assertEqual(m.plan(self.segments,[]),[])
        rows=[segment(0,9000,'live_demo'),segment(9000,13000,'mixed_voiceover'),
              segment(13000,33000,'street_interview')]
        self.assertEqual(m.plan(rows,[dict(start_ms=0,end_ms=9000,minimum=9000)]),[])

    def test_returning_source_participant_multiple_and_uncertain_do_not_attach(self):
        self.assertTrue(m.accepted(self.proof))
        for key,value in [('one_quote','no'),('one_quote','uncertain'),
                          ('live_source_relation','returning_source'),('live_source_relation','uncertain'),
                          ('interview_relation','participant'),('interview_relation','uncertain')]:
            self.assertFalse(m.accepted(dict(self.proof,**{key:value})))
        with self.assertRaises(ValueError):m.accepted(dict(self.proof,one_quote=True))

    def test_source_bound_support_never_pools_duration(self):
        target=m.plan(self.segments,self.claims)[0]
        rows=[dict(s) for s in self.segments];rows[1]['label_key']='live_demo'
        receipt=dict(liveClaims=self.claims,isolatedAttachment=dict(corrections=[dict(target,payload=self.proof)]))
        self.assertTrue(m.supports(rows[1],rows,receipt))
        final, changes = finalize(rows, receipt)
        self.assertEqual(changes, 0)
        self.assertEqual(len(final), 3)
        self.assertEqual(final[1]['start_ms'], 20000)
        self.assertEqual(final[1]['end_ms'], 24000)
        rows[0]['label_key']='mixed_voiceover'
        self.assertFalse(m.supports(rows[1],rows,receipt))
        self.assertFalse(m.supports(segment(19999,24000,'live_demo'),self.segments,receipt))
        self.assertEqual(receipt['liveClaims'],self.claims)

    def test_final_stage_keeps_exact_cuts_and_accounts_call(self):
        calls=[]
        provider=SimpleNamespace(review=lambda *a,**k: SimpleNamespace(
            payload=self.proof,usage={'input_tokens':12},response_id='fresh'))
        receipt=dict(liveClaims=self.claims,calls=5,responseIds=['old'])
        with tempfile.TemporaryDirectory() as tmp:
            rows=m.verify_final(self.segments,Path('proxy'),Path(tmp),lambda:None,
                provider,30,lambda usage:calls.append(usage),receipt)
        self.assertEqual([(s['start_ms'],s['end_ms']) for s in rows],
                         [(s['start_ms'],s['end_ms']) for s in self.segments])
        self.assertEqual(rows[1]['label_key'],'live_demo')
        self.assertEqual(self.segments[1]['label_key'],'mixed_voiceover')
        self.assertEqual(receipt['calls'],6)
        self.assertEqual(receipt['responseIds'],['old','fresh'])
        self.assertEqual(calls,[{'input_tokens':12}])

    def test_provider_failure_preserves_billed_usage(self):
        def fail(*a,**k):raise SuggestionError('provider_error','failed',{'input_tokens':7})
        receipt=dict(liveClaims=self.claims,calls=0,responseIds=[])
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SuggestionError) as caught:
                m.verify_final(self.segments,Path('proxy'),Path(tmp),lambda:None,
                    SimpleNamespace(review=fail),30,lambda u:{'input_tokens':107},receipt)
        self.assertEqual(caught.exception.usage,{'input_tokens':107})
        self.assertNotIn('isolatedAttachment',receipt)

    def test_gap_and_long_quote_are_not_isolated_targets(self):
        rows=[dict(s) for s in self.segments];rows[1]['start_ms']+=1
        self.assertEqual(m.plan(rows,self.claims),[])
        rows=[segment(0,20000,'live_demo'),segment(20000,30000,'mixed_voiceover'),
              segment(30000,50000,'street_interview')]
        self.assertEqual(m.plan(rows,self.claims),[])


if __name__ == '__main__':unittest.main()
