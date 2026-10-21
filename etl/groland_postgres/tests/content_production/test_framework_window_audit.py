import sys
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_window_audit as window
from content_production import framework_continuity as continuity


def segment(a, b, label='mixed_voiceover'):
    return dict(start_ms=a, end_ms=b, label_key=label, reason='', confidence=.9)


def event(a, b, unit='A', kind='presenter'):
    return dict(start=a, end=b, unit=unit, kind=kind, appearance='visible clothes')


class WindowAuditTests(unittest.TestCase):
    def test_wear_test_recording_conflict_requires_video_before_assigning_ownership(self):
        rows=[dict(start_ms=0,end_ms=12000,unit='A',kind='own_detail',
                   action='wear_result',visible='person',person='P1')]
        static=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='separate_recording')
        dynamic=dict(static,middle_to_right='own_detail')
        calls=[]
        fixed=window.reveal_source_inserts(rows,lambda _:static,[(4000,.7),(8000,.7)],
                                           context_ask=lambda t:(calls.append(t) or dynamic))
        self.assertEqual(len(calls),1)
        self.assertFalse(any(e.get('needs_ownership') for e in fixed))
        separate=window.reveal_source_inserts(rows,lambda _:static,[(4000,.7),(8000,.7)],
                                              context_ask=lambda _:static)
        self.assertNotEqual(separate[1]['unit'], separate[2]['unit'])
        self.assertFalse(any(e.get('needs_ownership') for e in separate))
        window.event_facts(separate,12000)
        # Interior steps already have the normal ownership route. The edge
        # repair must not override its source roles with another observation.
        rows=[dict(start_ms=0,end_ms=4000,unit='A',kind='presenter'),
              dict(rows[0], start_ms=4000, end_ms=16000),
              dict(start_ms=16000,end_ms=20000,unit='A',kind='presenter')]
        fixed=window.reveal_source_inserts(rows,lambda _:static,[(8000,.7),(12000,.7)],
                                           context_ask=lambda _:self.fail('both ownership anchors exist'))
        self.assertTrue(fixed[1]['needs_ownership'])

    def test_insert_bounded_operation_conflict_gets_video_context_and_reuses_same_proof(self):
        rows=[dict(start_ms=0,end_ms=2000,unit='',kind='independent_insert'),
              dict(start_ms=2000,end_ms=14000,unit='A',kind='own_detail',
                   action='skin_comparison', visible='person', person='P1'),
              dict(start_ms=14000,end_ms=16000,unit='',kind='independent_insert')]
        proof=dict(kinds=['presenter']*3,left_to_middle='separate_recording',middle_to_right='same_review')
        cache={};calls=[]
        initial=window.reveal_source_inserts(rows,lambda _:proof,[(6000,.7),(10000,.7)],source_cache=cache,
            context_ask=lambda _:self.fail('no ownership failure yet'))
        self.assertTrue(initial[1]['needs_ownership'])
        fixed=window.reveal_source_inserts(rows,lambda _:proof,[(6000,.7),(10000,.7)],source_cache=cache,
            context_ask=lambda t:(calls.append(t) or proof), resolve_unanchored=True)
        self.assertEqual(len(calls),1)
        self.assertNotEqual(fixed[1]['unit'],fixed[2]['unit'])
        window.event_facts(fixed,16000)
        replay=window.reveal_source_inserts(rows,lambda _:self.fail('duplicate images'),
            [(6000,.7),(10000,.7)],source_cache=cache,context_ask=lambda _:self.fail('duplicate video'),
            resolve_unanchored=True)
        self.assertEqual(replay,fixed)

    def test_video_flow_can_resolve_cached_static_outfit_difference_without_requiring_same_clothes(self):
        rows=[dict(start_ms=0,end_ms=2000,unit='',kind='independent_insert'),
              dict(start_ms=2000,end_ms=14000,unit='A',kind='own_detail',
                   action='wear_result', visible='person', person='P1'),
              dict(start_ms=14000,end_ms=16000,unit='',kind='independent_insert')]
        static=dict(kinds=['presenter']*3,left_to_middle='separate_recording',middle_to_right='same_review')
        dynamic=dict(static,left_to_middle='own_detail')
        cache={}
        window.reveal_source_inserts(rows,lambda _:static,[(6000,.7),(10000,.7)],source_cache=cache)
        fixed=window.reveal_source_inserts(rows,lambda _:static,[(6000,.7),(10000,.7)],source_cache=cache,
            context_ask=lambda _:dynamic,resolve_unanchored=True)
        self.assertFalse(any(e.get('needs_ownership') for e in fixed))
        self.assertEqual({e['unit'] for e in fixed[1:-1]}, {'A'})

    def test_same_review_opening_operation_uses_source_proof_without_a_left_anchor(self):
        rows=[dict(start_ms=0,end_ms=1600,unit='',kind='independent_insert',
                   action='external_scene',visible='person',person='P1',review_unit='U1'),
              dict(start_ms=1600,end_ms=16000,unit='P1',kind='presenter',person='P1',review_unit='U1')]
        observed=dict(kinds=['own_detail','presenter','presenter'],same_outer_person=True,
                      left_to_middle='own_detail',middle_to_right='same_review')
        edges=set();calls=[]
        fixed=window.repair_review_prefix(rows,lambda t:(calls.append(t) or observed),edges)
        self.assertEqual(calls,[[800,6400,11200]])
        self.assertEqual(edges,{1600})
        self.assertEqual(fixed[0]['unit'],'P1')
        self.assertEqual(len(window.review_groups(fixed)),1)
        self.assertEqual(rows[0]['kind'],'independent_insert')
        observed['left_to_middle']='independent_insert'
        self.assertEqual(window.repair_review_prefix(rows,lambda _:observed,set()),rows)

    def test_prefix_repair_never_absorbs_ads_other_people_or_window_edges(self):
        first=dict(start_ms=0,end_ms=1600,unit='',kind='independent_insert',
                   action='external_scene',visible='person',person='P1',review_unit='U1')
        following=dict(start_ms=1600,end_ms=16000,unit='P1',kind='presenter',person='P1',review_unit='U1')
        for change in ({'action':'ingredient_ad'},{'person':'P2'},{'review_unit':'U2'},
                       {'start_ms':100},{'visible':'product'}):
            rows=[dict(first,**change),following]
            self.assertEqual(window.repair_review_prefix(rows,lambda _:self.fail('unrelated prefix'),set()),rows)

    def test_static_faces_do_not_erase_review_comparison_function_before_context_verification(self):
        rows=[dict(start_ms=0,end_ms=12000,unit='A',kind='own_detail',appearance='same review',
                   visible='person',person='P1',action='skin_comparison')]
        proof=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='separate_recording')
        fixed=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(7000,.7)])
        self.assertEqual([e['kind'] for e in fixed],['own_detail']*3)
        self.assertEqual([e['unit'] for e in fixed],['A']*3)
        # They still require contextual ownership; the static portrait does not
        # grant duration to a group with no actual presenter anchor.
        with self.assertRaisesRegex(ValueError,'Unresolved'):
            window.event_facts(fixed)

    def test_source_static_application_does_not_erase_the_video_presenter(self):
        rows=[dict(start_ms=0,end_ms=12000,unit='A',kind='presenter',appearance='visible host',
                   visible='person',person='P1',action='personal_application')]
        proof=dict(kinds=['own_detail']*3,left_to_middle='own_detail',middle_to_right='own_detail')
        fixed=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(7000,.7)])
        self.assertEqual([e['kind'] for e in fixed],['presenter']*3)
        self.assertEqual([e['source_observed_kind'] for e in fixed],['own_detail']*3)
        proof['kinds'][1]='independent_insert'
        proof.update(left_to_middle='independent_insert',middle_to_right='independent_insert')
        fixed=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(7000,.7)])
        self.assertEqual(fixed[1]['kind'],'independent_insert')

    def test_overlapping_windows_reuse_only_exact_physical_shots_and_links(self):
        cache={};cuts=[(4000,.9),(6000,.8)]
        rows=[dict(start_ms=0,end_ms=12000,unit='P1',kind='presenter',appearance='person')]
        proof=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='same_review')
        first=window.reveal_source_inserts(rows,lambda _:proof,cuts,source_cache=cache)
        rows[0]['unit']='another-window-P7'
        second=window.reveal_source_inserts(rows,lambda _:self.fail('duplicate source evidence'),cuts,source_cache=cache)
        self.assertEqual(cache['reused'],1)
        self.assertEqual([e['unit'] for e in second],['another-window-P7']*3)
        rows[0]['start_ms']=1000
        calls=[]
        window.reveal_source_inserts(rows,lambda t:(calls.append(t) or proof),cuts,source_cache=cache)
        self.assertEqual(len(calls),1)  # Clipped context is different evidence.

    def test_unlisted_product_shot_inside_short_event_breaks_the_qualified_claim(self):
        rows=[dict(start_ms=a,end_ms=b,unit='A',kind='presenter',appearance='person')
              for a,b in [(0,9500),(9500,12500)]]
        def ask(times):
            self.assertEqual(times[:2],[10250,11750])
            return dict(kinds=['independent_insert','presenter','presenter'],
                        left_to_middle='independent_insert',middle_to_right='same_review')
        fixed=window.reveal_source_inserts(rows,ask,[(11000,.7)])
        self.assertEqual([(e['start_ms'],e['end_ms'],e['kind']) for e in fixed],
                         [(0,9500,'presenter'),(9500,11000,'independent_insert'),(11000,12500,'presenter')])
        frames,facts=window.event_facts(fixed)
        result,_=continuity.apply({'segments':[]},frames,facts,12500)
        self.assertEqual({s['label_key'] for s in result['segments']},{'mixed_voiceover'})

    def test_short_hidden_insert_inside_long_event_is_sampled_at_its_actual_shot(self):
        rows=[dict(start_ms=0,end_ms=25000,unit='A',kind='presenter',appearance='person')]
        def ask(times):
            self.assertEqual(times,[6000,12750,19250])
            return dict(kinds=['presenter','independent_insert','presenter'],
                        left_to_middle='independent_insert',middle_to_right='independent_insert')
        fixed=window.reveal_source_inserts(rows,ask,[(12000,.8),(13500,.7)])
        frames,facts=window.event_facts(fixed)
        result,receipt=continuity.apply({'segments':[]},frames,facts,25000)
        self.assertEqual([s['label_key'] for s in result['segments']],
                         ['live_demo','mixed_voiceover','live_demo'])
        self.assertEqual([r['end_ms']-r['start_ms'] for r in receipt['runs']],[12000,1500,11500])

    def test_strong_pixels_alone_do_not_break_a_review(self):
        rows=[dict(start_ms=0,end_ms=12000,unit='A',kind='presenter',appearance='person')]
        proof=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='same_review')
        verified=set()
        fixed=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.9),(6000,.8)],verified)
        self.assertEqual(verified,{4000,6000})
        self.assertEqual(window.refine_group(fixed,lambda _:self.fail('duplicate paid join check'),[],0,verified),fixed)
        frames,facts=window.event_facts(fixed)
        result,_=continuity.apply({'segments':[]},frames,facts,12000)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key']) for s in result['segments']],[(0,12,'live_demo')])

    def test_presenter_and_own_application_are_compatible_but_insert_conflicts_are_not(self):
        rows=[dict(start_ms=0,end_ms=12000,unit='A',kind='presenter',appearance='person',action='personal_application')]
        proof=dict(kinds=['presenter','own_detail','presenter'],left_to_middle='same_review',middle_to_right='same_review')
        fixed=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.9)])
        self.assertEqual([e['kind'] for e in fixed],['presenter','presenter'])
        proof['kinds'][2]='independent_insert'
        with self.assertRaisesRegex(ValueError,'Conflicting source-shot'):
            window.reveal_source_inserts(rows,lambda _:proof,[(4000,.9)])

    def test_film_set_is_not_automatically_an_external_insert_for_a_continuous_actor(self):
        rows=[dict(start_ms=0,end_ms=18000,unit='',kind='independent_insert',appearance='film set',
                   action='external_scene',visible='person',person='P1')]
        proof=dict(kinds=['presenter','own_detail','own_detail'],left_to_middle='own_detail',middle_to_right='same_review')
        fixed=window.recover_presenters(rows,lambda _:proof)
        self.assertEqual(fixed[0]['kind'],'presenter')
        rows[0]['end_ms']=3000
        self.assertEqual(window.recover_presenters(rows,lambda _:self.fail('short insert'))[0]['kind'],'independent_insert')

    def test_face_detector_miss_is_checked_without_promoting_long_hand_only_shot(self):
        rows = [dict(start_ms=a, end_ms=b, unit=u, kind='own_detail', appearance='') for a,b,u in
                [(0,12000,'A'),(12000,25000,'B')]]
        def ask(times):
            return {'kinds': ['presenter'] * 3 if times[0] < 12000 else ['own_detail'] * 3}
        result = window.recover_presenters(rows, ask)
        self.assertEqual([e['kind'] for e in result], ['presenter','own_detail'])
        frames, facts = window.event_facts(result)
        measured, _ = continuity.apply({'segments': []}, frames, facts, 25000)
        self.assertEqual([e['label_key'] for e in measured['segments']], ['live_demo','mixed_voiceover'])

    def test_face_positive_repairs_visible_person_without_turning_hands_into_people(self):
        events = [dict(start_ms=a, end_ms=b, unit=u, kind=k, appearance='') for a,b,u,k in
                  [(0,14000,'A','own_detail'),(14000,26000,'B','own_detail'),(26000,40000,'C','presenter')]]
        def annotate(frames, work):
            for f in frames: f['face_boxes'] = [[1,1,100,100]] if f['index'] == 0 else []
        with tempfile.TemporaryDirectory() as folder, patch.object(window,'run_media',return_value=0), \
                patch.object(window.presence,'annotate',side_effect=annotate):
            fixed = window.visible_presenters(events,Path('source'),Path(folder),{},lambda:None)
        self.assertEqual([e['kind'] for e in fixed], ['presenter','own_detail','presenter'])
        self.assertEqual(events[0]['kind'], 'own_detail')
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 40000)
        self.assertEqual([s['label_key'] for s in result['segments']], ['live_demo','mixed_voiceover','live_demo'])

    def test_long_montage_has_disjoint_cores_and_overlap_for_complete_reviews(self):
        rows = window.windows([segment(0, 100000)], 120000)
        self.assertEqual([(r['core_start'], r['core_end']) for r in rows], [(0, 36000), (36000, 72000), (72000, 100000)])
        self.assertEqual((rows[1]['start'], rows[1]['end']), (24000, 84000))
        self.assertLessEqual(max(r['end'] - r['start'] for r in rows), 60000)

    def test_proposal_label_boundaries_do_not_restart_the_observation_grid(self):
        rows = [segment(0,16600),segment(16600,90800,'live_demo'),segment(90800,125800)]
        self.assertEqual(window.windows(rows,163600),window.windows([segment(0,125800)],163600))
        self.assertEqual(len(window.windows(rows,163600)),4)
        # Interview/promotion ranges are not turned into a review window.
        separate=window.windows([segment(0,12000),segment(12000,25000,'street_interview'),
                                 segment(25000,45000,'live_demo')],45000)
        self.assertEqual([(s['core_start'],s['core_end']) for s in separate],[(0,12000),(25000,45000)])

    def test_long_live_is_verified_and_interview_taxonomy_is_preserved(self):
        rows = window.windows([segment(0, 50000, 'live_demo'), segment(50000, 62000, 'live_demo'),
                               segment(62000, 80000, 'street_interview')], 80000)
        self.assertEqual([(r['core_start'],r['core_end']) for r in rows],
                         [(0,36000),(36000,62000)])

    def test_rounding_gaps_align_to_real_source_cuts_before_duration(self):
        payload = {'events': [event(0, 9.6), event(10.0, 19.2, 'B')]}
        values = window.align_events(payload, 23000, 42333, [(32966, .7), (33366, .14)])
        self.assertEqual(values[0]['end_ms'], 32966)
        self.assertEqual(values[1]['start_ms'], 32966)
        frames, facts = window.event_facts(values)
        result, receipt = continuity.apply({'segments': []}, frames, facts, 42333)
        self.assertEqual([s['label_key'] for s in result['segments']][-2:], ['live_demo', 'live_demo'])

    def test_adjacent_coarse_edges_cannot_steal_each_others_source_cut(self):
        payload = {'events': [event(0, 15.6, 'A'),
                              event(15.6, 16.6, '', 'independent_insert'),
                              event(16.6, 48, 'B')]}
        # Both coarse edges see the strongest cut at 16.400. Greedily giving
        # it to the first edge then mistakes face motion at 17.200 for the
        # second edge, dropping the new presenter's first 800 milliseconds.
        cuts = [(15233, .618763), (16400, .645281), (17200, .051420)]
        values = window.align_events(payload, 0, 48000, cuts)
        self.assertEqual([(v['start_ms'], v['end_ms']) for v in values],
                         [(0, 15233), (15233, 16400), (16400, 48000)])
        self.assertEqual(values[-1]['unit'], 'B')

    def test_cut_contention_cannot_move_an_edge_without_a_real_transition(self):
        payload = {'events': [event(0,9.5),event(9.5,10.5,'B'),
                              event(10.5,11.5,'C'),event(11.5,20,'D')]}
        cuts = [(9733,.502172),(11066,.555186),(12133,.492386)]
        values = window.align_events(payload,0,20000,cuts)
        self.assertEqual([e['end_ms'] for e in values[:-1]],[9733,11066,12133])

    def test_event_coverage_and_range_are_checked(self):
        invalid = [{'events': []}, {'events': [event(0, 4), event(6, 12)]},
                   {'events': [event(0, 50)]}, {'events': [event(0, float('nan'))]}]
        for payload in invalid:
            with self.assertRaises(ValueError): window.align_events(payload, 0, 12000, [])

    def test_different_clothes_split_the_falsely_continuous_event(self):
        source = dict(start_ms=90550, end_ms=105566, unit='A', kind='presenter', appearance='two scenes')
        proof = dict(appearance=['beige', 'pink', 'pink'], kinds=['presenter'] * 3,
                     left_to_middle='separate_recording', middle_to_right='same_review')
        parts = window.refine_event(source, proof, [91250, 98058, 104866], [(94233, .056), (95666, .042)], 0)
        self.assertEqual([(p['start_ms'], p['end_ms']) for p in parts], [(90550, 94233), (94233, 105566)])
        self.assertNotEqual(parts[0]['unit'], parts[1]['unit'])

    def test_verified_person_change_replaces_coarse_identity_before_tolerance(self):
        rows=[dict(start_ms=a,end_ms=b,unit='coarse',kind='presenter',person='P1',visible='person',appearance='')
              for a,b in [(0,7500),(7500,17200)]]
        def ask(times):
            return dict(appearance=['A','B','B'],kinds=['presenter']*3,
                        left_to_middle='different_person' if times[0]<7500 else 'same_review',
                        middle_to_right='same_review')
        fixed=window.refine_group(rows,ask,[(7500,.5)],0)
        frames,facts=window.event_facts(fixed)
        result,_=continuity.apply({'segments':[]},frames,facts,17200)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key'])for s in result['segments']],
                         [(0,7.5,'mixed_voiceover'),(7.5,17.2,'live_demo')])

    def test_later_join_cannot_silently_erase_a_source_verified_presenter(self):
        rows = [dict(start_ms=a,end_ms=b,unit='coarse',kind='presenter',person='P1',
                     visible='person',appearance='actual source view',source_cut_checked=True,
                     source_observed_kind='presenter')
                for a,b in [(0,3000),(3000,7500),(7500,10500),(10500,17200)]]
        static = dict(appearance=['A','A','B'],kinds=['presenter','presenter','independent_insert'],
                      same_outer_person=True,middle_owner='left',
                      left_to_middle='same_review',middle_to_right='independent_insert')
        dynamic = dict(static,kinds=['presenter']*3,same_outer_person=False,
                       middle_to_right='different_person')
        calls=[]
        fixed=window.refine_group(rows,lambda _:static,[(7500,.5)],0,{3000,10500},
            context_ask=lambda times,positions:(calls.append((times,positions)) or dynamic))
        frames,facts=window.event_facts(fixed)
        result,_=continuity.apply({'segments':[]},frames,facts,17200)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key'])for s in result['segments']],
                         [(0,7.5,'mixed_voiceover'),(7.5,17.2,'live_demo')])
        self.assertEqual(calls,[([1500,5250,9000],[3])])
        # A video check can confirm the insert instead; the earlier static
        # observation is a reason to inspect, never authority to force live.
        kept=window.refine_group(rows,lambda _:static,[(7500,.5)],0,{3000,10500},
                                 context_ask=lambda *_:static)
        self.assertEqual(kept[2]['kind'],'independent_insert')
        with self.assertRaisesRegex(ValueError,'source role'):
            window.refine_group(rows,lambda _:static,[(7500,.5)],0,{3000,10500})

    def test_unknown_or_unlocatable_transition_does_not_publish_guess(self):
        source = dict(start_ms=0, end_ms=15000, unit='A', kind='presenter', appearance='')
        proof = dict(appearance=['A', 'B', 'A'], kinds=['presenter'] * 3,
                     left_to_middle='different_person', middle_to_right='different_person')
        with self.assertRaises(ValueError): window.refine_event(source, proof, [700, 7500, 14300], [], 0)
        proof['left_to_middle'] = 'uncertain'
        with self.assertRaises(ValueError): window.refine_event(source, proof, [700, 7500, 14300], [(5000, .5)], 0)

    def test_insert_roles_cannot_be_erased_by_same_review_relationship(self):
        source = dict(start_ms=0, end_ms=15000, unit='A', kind='presenter', appearance='')
        proof = dict(appearance=['A', 'ad', 'A'], kinds=['presenter', 'independent_insert', 'presenter'],
                     left_to_middle='same_review', middle_to_right='same_review')
        with self.assertRaises(ValueError): window.refine_event(source, proof, [700, 7500, 14300], [], 0)

    def test_overlapping_witnesses_rejoin_review_across_artificial_window_boundary(self):
        patches = [dict(segment(0, 10000, 'live_demo'), witness=(0, 14000), minimum=10001),
                   dict(segment(10000, 20000, 'live_demo'), witness=(6000, 20000), minimum=10001)]
        result = window.overlay([segment(0, 20000)], patches, 20000)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['end_ms'], 20000)

    def test_two_people_with_disjoint_witnesses_keep_their_boundary(self):
        patches = [dict(segment(0, 12000, 'live_demo'), witness=(0, 12000), minimum=10001),
                   dict(segment(12000, 24000, 'live_demo'), witness=(12000, 24000), minimum=10001)]
        result = window.overlay([segment(0, 24000)], patches, 24000)
        self.assertEqual(len(result), 2)

    def test_core_person_boundary_survives_overlapping_context_witnesses(self):
        patches = [dict(segment(0,10000,'live_demo'),witness=(0,21000),minimum=10001),
                   dict(segment(10000,15000,'live_demo'),witness=(8000,15000),minimum=10001),
                   dict(segment(15000,28000,'live_demo'),witness=(15000,28000),minimum=10001,
                        preserve_start=True)]
        result=window.overlay([segment(0,28000)],patches,28000)
        self.assertEqual([(s['start_ms'],s['end_ms'])for s in result],[(0,15000),(15000,28000)])
        self.assertEqual([s['witness']for s in result],[(0,15000),(15000,28000)])

    def test_post_snap_rechecks_tolerance_without_extending_evidence(self):
        receipt = {'liveClaims': [dict(start_ms=10000, end_ms=19400, minimum=9000)]}
        valid, n = window.finalize([segment(10100, 19400, 'live_demo')], receipt)
        self.assertEqual(valid[0]['label_key'], 'live_demo')
        self.assertEqual(n, 0)
        invalid, n = window.finalize([segment(10600, 19400, 'live_demo')], receipt)
        self.assertEqual(invalid[0]['label_key'], 'mixed_voiceover')
        self.assertEqual(n, 1)

    def test_cropped_window_fragment_does_not_receive_tolerance(self):
        frames = [dict(index=0, start_ms=12000, end_ms=21500, clipped=True)]
        facts = {'shots': [dict(i=0, p='A', u='A', r='presenter', l='face')]}
        result, _ = continuity.apply({'segments': []}, frames, facts, 21500)
        self.assertEqual(result['segments'][-1]['label_key'], 'mixed_voiceover')

    def test_skin_closeup_sandwich_rejoins_same_presenters_review(self):
        events = [dict(start_ms=a, end_ms=b, unit=u, kind='presenter', appearance='')
                  for a,b,u in [(0,5000,'A'),(5000,7000,'B'),(7000,15000,'A')]]
        proof = dict(middle_owner='both', same_outer_person=True,
                     kinds=['presenter','own_detail','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 15000)
        self.assertEqual(result['segments'][0]['label_key'], 'live_demo')
        self.assertEqual(fixed[1]['kind'], 'own_detail')

    def test_independent_insert_is_not_reattached_by_returning_face(self):
        events = [dict(start_ms=a, end_ms=b, unit=u, kind=k, appearance='') for a,b,u,k in
                  [(0,7000,'A','presenter'),(7000,9000,'','independent_insert'),(9000,18567,'A','presenter')]]
        proof = dict(middle_owner='neither', same_outer_person=True,
                     kinds=['presenter','independent_insert','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 18567)
        self.assertEqual(result['segments'][0]['label_key'], 'mixed_voiceover')

    def test_detail_ownership_restores_first_person_without_swallowing_second(self):
        events = [dict(start_ms=a, end_ms=b, unit=u, kind=k, appearance='') for a,b,u,k in
                  [(0,8000,'A','presenter'),(8000,12500,'B','own_detail'),(12500,24500,'B','presenter')]]
        proof = dict(middle_owner='left', same_outer_person=False,
                     kinds=['presenter','own_detail','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 24500)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key']) for s in result['segments']],
                         [(0,12.5,'live_demo'),(12.5,24.5,'live_demo')])

    def test_unrelated_hands_do_not_pad_a_three_second_person_to_tolerance(self):
        events = [dict(start_ms=a, end_ms=b, unit=u, kind=k, appearance='') for a,b,u,k in
                  [(0,3000,'A','presenter'),(3000,9500,'A','own_detail'),(9500,13000,'B','presenter')]]
        proof = dict(middle_owner='neither', same_outer_person=False,
                     kinds=['presenter','independent_insert','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 13000)
        self.assertEqual(result['segments'][0]['label_key'], 'mixed_voiceover')

    def test_shared_observer_unit_does_not_skip_product_insert_check(self):
        events = [dict(start_ms=a, end_ms=b, unit='A', kind=k, appearance='') for a,b,k in
                  [(0,9567,'presenter'),(9567,10900,'own_detail'),(10900,12400,'presenter')]]
        proof = dict(middle_owner='neither', same_outer_person=True,
                     kinds=['presenter','independent_insert','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 12400)
        self.assertEqual(result['segments'][0]['label_key'], 'mixed_voiceover')

    def test_verified_own_comparison_can_repair_two_locally_different_ids(self):
        events = [dict(start_ms=a, end_ms=b, unit=u, kind=k, appearance='') for a,b,u,k in
                  [(0,5000,'A','presenter'),(5000,7000,'detail','own_detail'),(7000,15000,'B','presenter')]]
        proof = dict(middle_owner='both', same_outer_person=True,
                     kinds=['presenter','own_detail','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        self.assertEqual([e['unit'] for e in fixed], ['A'] * 3)

    def test_visible_other_presenter_is_not_erased_as_an_ownerless_detail(self):
        events = [dict(start_ms=a, end_ms=b, unit='A', kind=k, appearance='') for a,b,k in
                  [(0,4000,'presenter'),(4000,16000,'own_detail'),(16000,19000,'presenter')]]
        proof = dict(middle_owner='neither', same_outer_person=True,
                     kinds=['presenter','presenter','presenter'])
        fixed = window.repair_links(events, lambda times: proof)
        self.assertEqual(fixed[1]['kind'], 'presenter')
        self.assertNotEqual(fixed[1]['unit'], fixed[0]['unit'])

    def test_multiple_possible_change_events_require_more_evidence(self):
        source = dict(start_ms=0, end_ms=15000, unit='A', kind='presenter', appearance='')
        proof = dict(appearance=['A','B','B'], kinds=['presenter'] * 3,
                     left_to_middle='different_person', middle_to_right='same_review')
        with self.assertRaises(ValueError):
            window.refine_event(source, proof, [700,7500,14300], [(3000,.8),(5000,.5)], 0, [3000,5000])

    def test_multi_person_group_checks_every_observed_join(self):
        events = [dict(start_ms=a, end_ms=b, unit='wrong_shared_id', kind='presenter', appearance='')
                  for a,b in [(0,3000),(3000,16000),(16000,18000),(18000,20000),(20000,22000)]]
        def ask(times):
            owners = [next(i for i,e in enumerate(events) if e['start_ms'] <= t < e['end_ms']) for t in times]
            return dict(appearance=['visible'] * 3, kinds=['presenter'] * 3,
                        left_to_middle='same_review' if owners[0] == owners[1] else 'different_person',
                        middle_to_right='same_review' if owners[1] == owners[2] else 'different_person')
        fixed = window.refine_group(events, ask, [(3000,.8),(16000,.5),(18000,.6),(20000,.7)], 0)
        self.assertEqual(len({e['unit'] for e in fixed}), 5)
        frames, facts = window.event_facts(fixed)
        result, _ = continuity.apply({'segments': []}, frames, facts, 22000)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key']) for s in result['segments']],
                         [(0,3,'mixed_voiceover'),(3,16,'live_demo'),(16,22,'mixed_voiceover')])

    def test_group_verification_covers_two_short_events_wrongly_given_one_unit(self):
        events = [dict(start_ms=a, end_ms=b, unit='A', kind='presenter', appearance='')
                  for a,b in [(15666,23200),(23200,32966)]]
        groups = window.review_groups(events)
        self.assertEqual(len(groups), 1)
        combined = dict(events[0], end_ms=32966)
        proof = dict(appearance=['indoor green top','outdoor cardigan','outdoor cardigan'],
                     kinds=['presenter']*3, left_to_middle='different_person', middle_to_right='same_review')
        parts = window.refine_event(combined, proof, [16366,24316,32266], [(19400,.8),(23200,.4)], 1,
                                    [23200])
        frames, facts = window.event_facts(parts)
        result, _ = continuity.apply({'segments': []}, frames, facts, 32966)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key']) for s in result['segments']],
                         [(0,23.2,'mixed_voiceover'),(23.2,32.966,'live_demo')])
