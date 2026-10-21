import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production import framework_recording_groups as groups


class RecordingGroupsTests(unittest.TestCase):
    def fixture(self):
        segments=[dict(start_ms=0,end_ms=17000,label_key='live_demo',confidence=.9,reason='proposal')]
        claims=[dict(start_ms=0,end_ms=17000,minimum=10001)]
        events=[dict(start_ms=a,end_ms=b,kind=k,unit='u',appearance=f'image{i}',action=action,
                     person='p',needs_ownership=False)for i,(a,b,k,action)in enumerate([
            (0,4000,'own_detail','hand_operation'),(4000,8000,'own_detail','wear_result'),
            (8000,13000,'presenter','personal_application'),(13000,17000,'presenter','talking_demo')])]
        events[2]['source_observed_kind']='own_detail'
        windows=[dict(start=0,end=17000,events=events)]
        return segments,claims,windows

    def proof(self,target,foreign=2):
        rows=[dict(image_position=i+1,recording_id=f'R{i+1}',own_review_link='absent'if i==foreign else'observed',
                   appearance='actual source',physical_evidence='different set and makeup',flow_evidence='no owned test link')
              for i in range(len(target['events']))]
        return dict(target,payload=dict(observations=rows))

    def test_short_shot_chain_needs_source_evidence_not_automatic_demotion(self):
        s,c,w=self.fixture();targets=groups.plan(s,w,c)
        self.assertEqual(len(targets),1)
        self.assertEqual(s[0]['label_key'],'live_demo')
        self.assertEqual(groups.plan(s,w,[dict(c[0],minimum=9000)]),[])
        # A single sufficiently long observed recording needs no extra call.
        w[0]['events'][0]['end_ms']=10000;w[0]['events'][1]['start_ms']=10000
        self.assertEqual(groups.plan(s,w,c),[])

    def test_explicit_internal_foreign_recording_cuts_all_overlapping_claims(self):
        s,c,w=self.fixture();t=groups.plan(s,w,c)[0];p=self.proof(t)
        cuts=groups.barriers(t,p)
        self.assertEqual([(v['start_ms'],v['end_ms'])for v in cuts],[(8000,13000)])
        claims=groups.split_claims([*c,dict(start_ms=-5000,end_ms=22000,minimum=10001)],cuts)
        self.assertFalse(any(v['start_ms']<8000 and v['end_ms']>13000 for v in claims))
        with patch.object(groups,'observe',return_value=p):
            result,revised,receipt=groups.verify(s,Path('source'),Path('work'),{},lambda:None,None,claims=c,windows=w)
        self.assertEqual([(v['start_ms'],v['end_ms'],v['label_key'])for v in result],[(0,17000,'mixed_voiceover')])
        self.assertEqual([(v['start_ms'],v['end_ms'])for v in revised],[(0,8000),(13000,17000)])
        self.assertEqual(receipt['durationCorrections'],3)
        self.assertEqual(c,[dict(start_ms=0,end_ms=17000,minimum=10001)])

    def test_own_flow_unknown_and_edge_recordings_do_not_create_internal_barriers(self):
        s,c,w=self.fixture();t=groups.plan(s,w,c)[0]
        for link in ['observed','uncertain']:
            p=self.proof(t);p['payload']['observations'][2]['own_review_link']=link
            self.assertEqual(groups.barriers(t,p),[])
        self.assertEqual(groups.barriers(t,self.proof(t,foreign=3)),[])
        p=self.proof(t);p['payload']['observations'][2]['recording_id']='R2'
        self.assertEqual(groups.barriers(t,p),[])
        p=self.proof(t);p['payload']['observations'][2]['recording_id']='uncertain'
        self.assertEqual(groups.barriers(t,p),[])

    def test_actual_image_binding_and_completeness_are_required(self):
        s,c,w=self.fixture();t=groups.plan(s,w,c)[0]
        p=self.proof(t);p['payload']['observations'].reverse()
        self.assertEqual(groups.barriers(t,p)[0]['start_ms'],8000)
        for wrong in [dict(p,end_ms=18000),dict(p,payload=dict(observations=p['payload']['observations'][:-1]))]:
            with self.assertRaises(ValueError):groups.barriers(t,wrong)
        p=self.proof(t);p['payload']['observations'][2]['image_position']=1
        with self.assertRaises(ValueError):groups.barriers(t,p)

    def test_resolved_operation_bridge_and_real_insert_are_not_reopened(self):
        s,c,w=self.fixture()
        with patch.object(groups.composition,'review_bridge',return_value=dict(operation_start_ms=4000)):
            self.assertEqual(groups.plan(s,w,c),[])
        w[0]['events'][1]['kind']='independent_insert'
        self.assertEqual(groups.plan(s,w,c),[])

    def test_recording_difference_cannot_override_owned_skin_comparison(self):
        s,c,w=self.fixture()
        t=groups.plan(s,w,c)[0]
        skin=copy.deepcopy(t)
        skin['events'][2].update(kind='own_detail',action='skin_comparison')
        self.assertEqual(groups.barriers(skin,self.proof(skin)),[])
        w[0]['events'][2].update(kind='own_detail',action='skin_comparison')
        self.assertEqual(groups.plan(s,w,c),[])
        # Even a presenter's application needs a real role discrepancy before
        # this additional audit, not just multiple short cuts or different IDs.
        s,c,w=self.fixture();w[0]['events'][2].pop('source_observed_kind')
        self.assertEqual(groups.plan(s,w,c),[])

    def test_budget_is_checked_before_observation_and_split_claims_preserve_minimum(self):
        claims=[dict(start_ms=0,end_ms=40000,minimum=10001)]
        revised=groups.split_claims(claims,[dict(start_ms=17000,end_ms=19000)])
        self.assertEqual(revised,[dict(start_ms=0,end_ms=17000,minimum=10001),dict(start_ms=19000,end_ms=40000,minimum=10001)])
        s,c,w=self.fixture()
        with patch.object(groups,'MAX_GROUPS',0),self.assertRaises(ValueError):groups.plan(s,w,c)
