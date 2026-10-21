import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production import framework_window_audit as window


class ContextRepairTests(unittest.TestCase):
    def test_missing_presenter_identity_requests_concrete_reobservation_without_guessing(self):
        calls=[]
        def request(prompt,schema,**kwargs):
            calls.append(prompt)
            action='talking_demo' if len(calls)==1 else 'external_scene'
            if len(calls)>1:
                self.assertIn('event 0',prompt)
                self.assertIn('分屏拼贴',prompt)
            return SimpleNamespace(payload={'events':[dict(start=0,end=4,unit='',person='',
                visible='person',action=action,appearance='four independent source panels')]},
                usage={},response_id='fixture')
        with tempfile.TemporaryDirectory() as tmp,patch.object(window,'run_media',return_value=0), \
                patch.object(window,'read_cuts',return_value=[]):
            result,receipt=window.verify([dict(start_ms=0,end_ms=4000,label_key='live_demo')],
                Path('source'),4000,Path(tmp),{},lambda:None,request)
        self.assertEqual(len(calls),2)
        self.assertEqual(receipt['windowRepairs'],1)
        self.assertEqual(result['segments'][0]['label_key'],'mixed_voiceover')

    def test_unclear_motion_gets_one_short_observation_without_guessing_it_is_an_insert(self):
        base=dict(middle_visible='uncertain',middle_action='blurred movement',middle_function='uncertain',
                  middle_owner='neither',outer_relation='same_review',left_flow='original flow',right_flow='original flow',
                  left_demonstrates=True,right_demonstrates=True)
        for function,expected in [('skin_comparison','live_demo'),('packaging_display','mixed_voiceover')]:
            calls=[]
            def observe(source,left,middles,right,*args):
                calls.append((left['start_ms'],right['end_ms']))
                if len(calls)==1:return [base]
                return [dict(base,middle_visible='hands',middle_function=function,
                             middle_owner='both' if function=='skin_comparison' else 'neither',
                             left_demonstrates=False,right_demonstrates=False)]
            def request(prompt,schema,**kwargs):
                self.assertIn('events',schema['properties'])
                events=[dict(start=a,end=b,unit='U1',person='P1',visible='person',action=action,appearance='same')
                        for a,b,action in [(0,7,'personal_application'),(7,7.5,'skin_comparison'),(7.5,15,'personal_application')]]
                return SimpleNamespace(payload={'events':events},usage={},response_id='fixture')
            with self.subTest(function=function),tempfile.TemporaryDirectory() as tmp, \
                    patch.object(window,'run_media',return_value=0),patch.object(window,'read_cuts',return_value=[]), \
                    patch.object(window.ownership,'observe_many',side_effect=observe):
                result,receipt=window.verify([dict(start_ms=0,end_ms=15000,label_key='mixed_voiceover')],
                    Path('source'),15000,Path(tmp),{},lambda:None,request)
                self.assertEqual(calls,[(0,15000),(5000,9500)])
                self.assertEqual((receipt['ownershipChecks'],receipt['ownershipVideoMs']),(2,19500))
                self.assertEqual({s['label_key'] for s in result['segments']},{expected})

    def test_invalid_zero_duration_insert_is_reobserved_without_discarding_it(self):
        calls=[]
        def request(prompt,schema,**kwargs):
            calls.append(kwargs)
            # The malformed insert cannot simply be dropped: doing so would
            # join two sub-10s presenters into a false live demonstration.
            events=[dict(start=0,end=7,unit='U1',person='P1',visible='person',action='talking_demo',appearance='A'),
                    dict(start=7,end=7 if len(calls)==1 else 8,unit='',person='',visible='product',
                         action='ingredient_ad',appearance='advert'),
                    dict(start=8,end=15,unit='U1',person='P1',visible='person',action='talking_demo',appearance='A')]
            return SimpleNamespace(payload={'events':events},usage={},response_id='fixture')
        with tempfile.TemporaryDirectory() as tmp,patch.object(window,'run_media',return_value=0), \
                patch.object(window,'read_cuts',return_value=[]), \
                patch.object(window.ownership,'repair',
                             side_effect=lambda rows,inspect,*,presenter_observer=None:(rows,set())):
            result,receipt=window.verify([dict(start_ms=0,end_ms=15000,label_key='mixed_voiceover')],
                Path('source'),15000,Path(tmp),{},lambda:None,request)
            self.assertEqual(receipt['windowRepairs'],1)
            self.assertEqual(len(calls),2)
            self.assertEqual({e['label_key'] for e in result['segments']},{'mixed_voiceover'})
        with tempfile.TemporaryDirectory() as tmp,patch.object(window,'run_media',return_value=0), \
                patch.object(window,'read_cuts',return_value=[]),patch.object(window,'MAX_WINDOW_REPAIRS',0):
            calls.clear()
            with self.assertRaisesRegex(ValueError,'Invalid local event evidence'):
                window.verify([dict(start_ms=0,end_ms=15000,label_key='mixed_voiceover')],
                    Path('source'),15000,Path(tmp),{},lambda:None,request)

    def run_verification(self, second_uncertain=False, cap=3, failure_code=None, completion_cap=3, bad_roles=False):
        calls=[]
        def request(prompt,schema,**kwargs):
            calls.append(kwargs)
            if 'events' in schema['properties']:
                value={'events':[dict(start=0,end=12,unit='U1',person='P1',visible='person',
                    action='personal_application',appearance='clothes and room')]}
            else:
                if len(calls)==2 and failure_code:
                    raise window.SuggestionError(failure_code,'incomplete fixture',{'output_tokens':8192})
                relation='uncertain' if len(calls)==2 or second_uncertain else 'same_review'
                value=dict(appearance=['same']*3,kinds=['presenter']*3,same_outer_person=True,
                           middle_owner='both',left_to_middle=relation,middle_to_right=relation)
                if bad_roles and len(calls)==2:
                    value['kinds']=['presenter','own_detail']*3
                if 'kind1' in schema['properties']:
                    value.pop('appearance');value.pop('kinds')
                    for i in range(1,4):value.update({f'appearance{i}':'same',f'kind{i}':'presenter'})
            if 'presenter_overlay_1' in schema['properties']:
                value.update({f'presenter_overlay_{i}':False for i in (1,2,3)})
            return SimpleNamespace(payload=value,usage={},response_id='fixture')
        with tempfile.TemporaryDirectory() as tmp,patch.object(window,'run_media',return_value=0), \
                patch.object(window.ownership,'run_media',return_value=0), patch.object(window,'read_cuts',return_value=[]), \
                patch.object(window,'MAX_CONTEXT_CHECKS',cap),patch.object(window,'MAX_COMPLETION_REPAIRS',completion_cap):
            result=window.verify([dict(start_ms=0,end_ms=12000,label_key='mixed_voiceover')],
                Path('source.mp4'),12000,Path(tmp),{},lambda:None,request)
        return result,calls

    def test_multiple_roles_per_image_are_reobserved_with_explicit_image_fields(self):
        (result,receipt),calls=self.run_verification(bad_roles=True)
        self.assertEqual(receipt['completionRepairs'],1)
        self.assertEqual(len(calls),3)
        self.assertEqual(calls[-1]['thinking'],'disabled')
        self.assertEqual(result['segments'][0]['label_key'],'live_demo')
        with self.assertRaisesRegex(ValueError,'Missing triad roles'):
            self.run_verification(bad_roles=True,completion_cap=0)

    def test_incomplete_triad_retries_once_without_reasoning_on_the_same_model_evidence(self):
        (result,receipt),calls=self.run_verification(failure_code='provider_incomplete')
        self.assertEqual(receipt['completionRepairs'],1)
        self.assertEqual(len(calls),3)
        self.assertEqual(calls[-1]['thinking'],'disabled')
        self.assertEqual(calls[-1]['boards'],calls[-2]['boards'])
        self.assertEqual(result['segments'][0]['label_key'],'live_demo')
        for code,cap in [('provider_error',3),('invalid_response',3),('provider_incomplete',0)]:
            with self.subTest(code=code,cap=cap),self.assertRaises(window.SuggestionError):
                self.run_verification(failure_code=code,completion_cap=cap)

    def test_source_video_resolves_static_uncertainty_once(self):
        (result,receipt),calls=self.run_verification()
        self.assertEqual(result['segments'][0]['label_key'],'live_demo')
        self.assertEqual((receipt['contextChecks'],receipt['contextVideoMs']),(1,12000))
        self.assertEqual(len(calls),3)
        self.assertIn('proxy',calls[-1])
        self.assertEqual(calls[-1]['fps'],1)
        self.assertEqual(calls[-1]['reasoning_effort'],'low')

    def test_repair_does_not_turn_persisting_uncertainty_into_success(self):
        with self.assertRaisesRegex(ValueError,'Unresolved'):
            self.run_verification(second_uncertain=True)
        with self.assertRaisesRegex(ValueError,'budget'):
            self.run_verification(cap=0)

    def test_same_review_insert_contradiction_needs_video_but_real_cut_does_not(self):
        proof={'kinds':['presenter','presenter','independent_insert'],
               'left_to_middle':'same_review','middle_to_right':'same_review'}
        self.assertTrue(window.needs_video_context(proof))
        proof['middle_to_right']='independent_insert'
        self.assertFalse(window.needs_video_context(proof))

    def test_same_video_operation_targets_share_one_request_and_budget_charge(self):
        calls=[]
        proof=dict(middle_visible='hands',middle_action='take powder',middle_function='product_operation',left_flow='introduce',
                   right_flow='apply',middle_owner='both',outer_relation='same_review',
                   left_demonstrates=False,right_demonstrates=True)
        def request(prompt,schema,**kwargs):
            calls.append(kwargs)
            if 'events' in schema['properties']:
                value={'events':[
                    dict(start=0,end=5,unit='U1',person='P1',visible='person',action='talking_demo',appearance='A'),
                    dict(start=5,end=6,unit='U1',person='',visible='hands',action='hand_operation',appearance='hands'),
                    dict(start=6,end=7,unit='U1',person='',visible='person',action='skin_comparison',appearance='skin'),
                    dict(start=7,end=15,unit='U1',person='P2',visible='person',action='personal_application',appearance='B')]}
            else:
                self.assertIn('observations',schema['properties'])
                value={'observations':[dict(proof,index=1,middle_function='skin_comparison'),dict(proof,index=0)]}
            if 'presenter_overlay_1' in schema['properties']:
                value.update({f'presenter_overlay_{i}':False for i in (1,2,3)})
            return SimpleNamespace(payload=value,usage={},response_id='fixture')
        with tempfile.TemporaryDirectory() as tmp,patch.object(window,'run_media',return_value=0), \
                patch.object(window.ownership,'run_media',return_value=0), patch.object(window,'read_cuts',return_value=[]):
            result,receipt=window.verify([dict(start_ms=0,end_ms=15000,label_key='mixed_voiceover')],
                Path('source'),15000,Path(tmp),{},lambda:None,request)
        self.assertEqual(len(calls),2)
        self.assertEqual((receipt['ownershipChecks'],receipt['ownershipTargets'],receipt['ownershipVideoMs']),(1,2,15000))
        self.assertEqual(result['segments'][0]['label_key'],'live_demo')

    def test_batch_targets_cannot_be_duplicated_or_missing(self):
        proof=dict(middle_visible='hands',middle_action='take powder',middle_function='product_operation',left_flow='introduce',
                   right_flow='apply',middle_owner='both',outer_relation='same_review',
                   left_demonstrates=False,right_demonstrates=True)
        for payload in [{'observations':[dict(proof,index=0)]},
                        {'observations':[dict(proof,index=0),dict(proof,index=0)]}]:
            with self.assertRaisesRegex(ValueError,'operation targets'):
                window.ownership.decode_batch(payload,2)
