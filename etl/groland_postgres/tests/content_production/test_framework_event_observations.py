import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_event_observations as observations
from content_production import framework_window_audit as windows
from content_production import framework_review_ownership as ownership
from content_production import framework_continuity as continuity


def event(a, b, person='P1', action='personal_application', visible='person', unit='U1'):
    return dict(start=a,end=b,unit=unit,person=person,action=action,visible=visible,appearance='observed')


class EventObservationTests(unittest.TestCase):
    def test_same_content_id_cannot_merge_two_independent_presenters(self):
        payload = {'events':[event(0,12),event(12,24,person='P2')]}
        rows = windows.align_events(observations.decode(payload),0,24000,[])
        frames, facts = windows.event_facts(rows)
        result, _ = continuity.apply({'segments':[]},frames,facts,24000)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key']) for s in result['segments']],
                         [(0,12,'live_demo'),(12,24,'live_demo')])

    def test_visible_skin_face_keeps_its_operation_role(self):
        payload = {'events':[event(0,5),event(5,7,person='P2',action='skin_comparison'),event(7,15)]}
        rows = windows.align_events(observations.decode(payload),0,15000,[])
        self.assertEqual(rows[1]['kind'],'own_detail')
        proof = dict(middle_visible='hands',middle_action='own skin comparison',middle_function='skin_comparison',
                     left_flow='application',right_flow='result',middle_owner='both',
                     outer_relation='same_review',left_demonstrates=True,right_demonstrates=True)
        fixed, _ = ownership.repair(rows,lambda *_:proof)
        frames,facts = windows.event_facts(fixed)
        result,_ = continuity.apply({'segments':[]},frames,facts,15000)
        self.assertEqual(result['segments'][0]['label_key'],'live_demo')

    def test_hand_operation_is_not_a_new_visible_presenter(self):
        rows = observations.decode({'events':[event(0,5),event(5,8,person='',visible='hands',action='hand_operation'),event(8,16,person='P2')]})['events']
        self.assertEqual(rows[1]['kind'],'own_detail')
        self.assertNotEqual(rows[0]['unit'],rows[2]['unit'])

    def test_empty_review_ids_do_not_assign_other_people_to_a_later_presenter(self):
        rows=observations.decode({'events':[
            event(0,2,person='P1',action='skin_comparison',unit=''),
            event(2,4,person='P2',action='wear_result',unit=''),
            event(4,16,person='P3',unit='')]})['events']
        self.assertNotEqual(rows[0]['unit'],rows[2]['unit'])
        self.assertNotEqual(rows[1]['unit'],rows[2]['unit'])
        self.assertNotEqual(rows[0]['unit'],rows[1]['unit'])

    def test_product_insert_and_returning_short_fragment_never_accumulate(self):
        rows = windows.align_events(observations.decode({'events':[
            event(0,7),event(7,8.7,person='',visible='product',action='ingredient_ad'),
            event(8.7,18.267),event(18.267,19.6,person='',visible='hands',action='packaging_display'),
            event(19.6,21)]}),0,21000,[])
        frames,facts = windows.event_facts(rows)
        result,_ = continuity.apply({'segments':[]},frames,facts,21000)
        self.assertEqual({s['label_key'] for s in result['segments']},{'mixed_voiceover'})

    def test_visible_presenter_holding_packaging_or_overlay_keeps_own_recording(self):
        for action in ('packaging_display','ingredient_ad'):
            rows = windows.align_events(observations.decode({'events':[
                event(0,15),event(15,20,action=action)]}),0,20000,[])
            frames,facts=windows.event_facts(rows)
            result,_=continuity.apply({'segments':[]},frames,facts,20000)
            self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key'])for s in result['segments']],
                             [(0,20,'live_demo')])

    def test_visible_subject_and_person_id_must_be_consistent(self):
        for bad in [event(0,12,visible='hands'),event(0,12,person=''),
                    event(0,12,person='',visible='product')]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                observations.decode({'events':[bad]})

    def test_nonvisible_person_id_requires_context_before_either_label_is_published(self):
        rows=windows.align_events(observations.decode({'events':[
            event(0,5),event(5,7,visible='product',action='packaging_display'),event(7,15)]}),0,15000,[])
        self.assertEqual(rows[1]['person'],'')
        self.assertTrue(rows[1]['needs_ownership'])
        with self.assertRaisesRegex(ValueError,'Unresolved'):
            windows.event_facts(rows)
        proof=dict(middle_visible='person',middle_action='host holds package',middle_function='packaging_display',
                   left_flow='application',right_flow='result',middle_owner='left',outer_relation='same_review',
                   left_demonstrates=True,right_demonstrates=True)
        fixed,_=ownership.repair(rows,lambda *_:proof)
        frames,facts=windows.event_facts(fixed)
        result,_=continuity.apply({'segments':[]},frames,facts,15000)
        self.assertEqual(result['segments'][0]['label_key'],'live_demo')
        proof.update(middle_visible='product',middle_owner='neither')
        fixed,_=ownership.repair(rows,lambda *_:proof)
        frames,facts=windows.event_facts(fixed)
        result,_=continuity.apply({'segments':[]},frames,facts,15000)
        self.assertEqual({s['label_key'] for s in result['segments']},{'mixed_voiceover'})

    def test_external_scene_subject_contradiction_requires_reobservation(self):
        for visible in ('scene','product','hands','unknown'):
            with self.subTest(visible=visible),self.assertRaisesRegex(ValueError,'event 0'):
                observations.decode({'events':[event(0,2,visible=visible,action='external_scene',unit='')]})
        for person,visible in (('P1','person'),('','scene')):
            rows=observations.decode({'events':[event(0,2,person=person,visible=visible,
                                                       action='external_scene',unit='')]})['events']
            self.assertEqual(rows[0]['kind'],'independent_insert')
            self.assertEqual(rows[0]['unit'],'')
            self.assertFalse(rows[0]['subject_conflict'])

    def test_closeup_can_show_an_unidentified_face_without_becoming_a_presenter(self):
        rows = observations.decode({'events':[event(0,2,person='',action='skin_comparison')]})['events']
        self.assertEqual(rows[0]['kind'],'own_detail')
        self.assertEqual(rows[0]['person'],'')
        rows = observations.decode({'events':[event(0,12,action='hand_operation')]})['events']
        self.assertEqual(rows[0]['visible'],'person')
        self.assertEqual(rows[0]['kind'],'own_detail')

    def test_operation_budget_bounds_seconds_and_call_count(self):
        ownership.check_budget(20,200000,10000)
        ownership.check_budget(31,350000,10000)
        for args in [(32,20000,1000),(0,359000,1001),(0,0,0)]:
            with self.subTest(args=args),self.assertRaisesRegex(ValueError,'budget'):
                ownership.check_budget(*args)

    def test_own_wear_result_is_a_review_step_not_external_insert(self):
        rows = windows.align_events(observations.decode({'events':[
            event(0,5),event(5,7,person='P2',action='wear_result'),event(7,15)]}),0,15000,[])
        proof = dict(middle_visible='hands',middle_action='own outdoor wear test',middle_function='wear_result',
                     left_flow='application',right_flow='result',middle_owner='both',
                     outer_relation='same_review',left_demonstrates=True,right_demonstrates=True)
        fixed, joins = ownership.repair(rows,lambda *_:proof)
        self.assertEqual(len({e['unit'] for e in fixed}),1)
        self.assertEqual(joins,{5000,7000})
