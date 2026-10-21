import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_review_ownership as ownership
from content_production import framework_window_audit as window
from content_production import framework_continuity as continuity


def events(rows):
    return [dict(start_ms=a, end_ms=b, unit=u, kind=k, appearance='visible evidence') for a,b,u,k in rows]


def proof(function='product_operation', owner='both', left=False, right=True):
    return dict(middle_visible='hands',middle_action='actual observed operation', middle_function=function,
                left_flow='introduction', right_flow='application and result', middle_owner=owner,
                outer_relation='same_review', left_demonstrates=left, right_demonstrates=right)


def measured(rows):
    frames, facts = window.event_facts(rows)
    return continuity.apply({'segments': []}, frames, facts, rows[-1]['end_ms'])[0]['segments']


class ReviewOwnershipTests(unittest.TestCase):
    def test_corrected_short_presenter_return_needs_source_identity_before_next_operation(self):
        rows=events([(0,4700,'A','presenter'),(4700,5367,'A','presenter'),
                     (5367,6467,'skin1','own_detail'),(6467,7567,'skin2','own_detail'),
                     (7567,8133,'anonymous','own_detail'),(8133,12633,'powder','own_detail'),
                     (12633,18533,'B','presenter'),(18533,20400,'arm','own_detail'),
                     (20400,24667,'B','presenter')])
        for e in rows:e['review_unit']='review'
        rows[4].update(visible='hands',person='')
        def ask(left,middle,right):
            if middle['start_ms']==7567:
                return dict(proof('presenter','left',False,False),middle_visible='person')
            if middle['start_ms'] in (5367,6467):
                return dict(proof('skin_comparison','left',False,False),middle_visible='person')
            return proof(left=middle['start_ms']==18533)
        calls=[]
        def identity(times):
            calls.append(times)
            return dict(same_outer_person=True,kinds=['presenter']*3,
                        left_to_middle='same_review',middle_to_right='same_review')
        fixed,joins=ownership.repair(rows,ask,presenter_observer=identity)
        self.assertEqual(len(calls),1)
        self.assertTrue(7567<calls[0][1]<calls[0][2]<8133)
        self.assertEqual(fixed[4]['visible'],'person')
        self.assertEqual({e['unit'] for e in fixed[:6]},{'A'})
        self.assertEqual({e['unit'] for e in fixed[6:]},{'B'})
        self.assertNotIn(12633,joins)
        self.assertEqual([(s['start_sec'],s['end_sec']) for s in measured(fixed)],
                         [(0,12.633),(12.633,24.667)])
        self.assertEqual(rows[4]['unit'],'anonymous')

    def test_review_owner_alone_cannot_bind_a_corrected_presenters_identity(self):
        rows=events([(0,6000,'A','presenter'),(6000,7000,'X','own_detail'),
                     (7000,19000,'B','presenter')])
        rows[1].update(person='',visible='hands')
        observation=dict(proof('presenter','left'),middle_visible='person')
        for same,kinds in [(False,['presenter']*3),(None,['presenter']*3),
                           (True,['presenter','independent_insert','presenter'])]:
            def identity(times):
                return dict(same_outer_person=same,kinds=kinds,
                            left_to_middle='same_review',middle_to_right='same_review')
            fixed,joins=ownership.repair(rows,lambda *_:observation,presenter_observer=identity)
            self.assertEqual([e['unit']for e in fixed],['A','X','B'])
            self.assertFalse(joins)

    def test_insert_first_observation_cannot_join_presenters_before_prior_details_resolve(self):
        # Real failure shape: an insert is observed before two earlier skin
        # details. Its nearest left anchor is only 0.566s, but the resolved
        # first review is 12.633s; the second is independently 12.034s.
        rows=events([(0,4700,'A','presenter'),(4700,5367,'A','presenter'),
                     (5367,6467,'skin1','own_detail'),(6467,7567,'skin2','own_detail'),
                     (7567,8133,'A','presenter'),(8133,8733,'','independent_insert'),
                     (8733,12633,'powder','own_detail'),(12633,14033,'B','presenter'),
                     (14033,18533,'B','presenter'),(18533,20400,'arm','own_detail'),
                     (20400,24667,'B','presenter')])
        calls=[]
        def ask(left,middle,right):
            calls.append(middle['start_ms'])
            if middle['start_ms'] in (5367,6467):
                return dict(proof('skin_comparison','left',False,False),middle_visible='person')
            if middle['start_ms']==18533:
                return proof(left=True,right=True)
            return proof(owner='left')
        result,joins=ownership.repair(rows,ask)
        self.assertEqual(calls[0],8133)
        self.assertEqual({e['unit']for e in result[:7]},{'A'})
        self.assertEqual({e['unit']for e in result[7:]},{'B'})
        self.assertNotIn(12633,joins)
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key'])for s in measured(result)],
                         [(0,12.633,'live_demo'),(12.633,24.667,'live_demo')])
        self.assertEqual(rows[5]['kind'],'independent_insert')

    def test_later_confirmed_insert_vetoes_a_deferred_operation_link(self):
        rows=events([(0,4000,'A','presenter'),(4000,5000,'','independent_insert'),
                     (5000,6000,'detail','own_detail'),(6000,18000,'B','presenter')])
        def ask(left,middle,right):
            return proof(owner='neither' if middle['start_ms']==5000 else 'left')
        result,joins=ownership.repair(rows,ask)
        self.assertEqual([e['unit']for e in result],['A','A','','B'])
        self.assertEqual(result[2]['kind'],'independent_insert')
        self.assertNotIn(6000,joins)

    def test_complete_prior_review_is_not_reopened_by_presenter_context_expansion(self):
        rows=events([(0,5367,'A','presenter'),(5367,7500,'A','own_detail'),
                     (7500,12633,'A','own_detail'),(12633,12933,'B','presenter'),
                     (12933,24666,'B','presenter')])
        for e in rows[:3]:e['review_unit']='review-A'
        for e in rows[3:]:e['review_unit']='review-B'
        def ask(left,middle,right):
            self.assertFalse(left.get('full_presenter_context',False))
            return proof()
        fixed,_=ownership.repair(rows,ask)
        self.assertEqual({e['unit'] for e in fixed[:3]},{'A'})
        self.assertEqual({e['unit'] for e in fixed[3:]},{'B'})
        self.assertEqual([s['label_key'] for s in measured(fixed)],['live_demo','live_demo'])

    def test_complementary_roles_need_full_presenter_context_before_joining_sources(self):
        rows=events([(0,3700,'A','presenter'),(3700,6600,'A','presenter'),
                     (6600,7500,'','own_detail'),(7500,7800,'B','presenter'),
                     (7800,25000,'B','presenter')])
        calls=[]
        def ask(left,middle,right):
            calls.append((left['start_ms'],left['end_ms'],right['start_ms'],right['end_ms']))
            if left['start_ms']==0 and right['end_ms']==25000:
                return dict(proof(owner='right'),outer_relation='independent_reviews')
            return proof()
        fixed,joins=ownership.repair(rows,ask)
        self.assertEqual(calls,[(3700,6600,7500,7800),(0,6600,7500,25000)])
        self.assertNotEqual(fixed[0]['unit'],fixed[-1]['unit'])
        self.assertNotIn(6600,joins)
        self.assertEqual(measured(fixed)[0]['label_key'],'mixed_voiceover')
        # The additional context is an observation, not a forced source split.
        owned,joins=ownership.repair(rows,lambda *_:proof())
        self.assertEqual({e['unit'] for e in owned},{'A'})
        self.assertIn(6600,joins)
        def foreign(left,middle,right):
            self.assertFalse(left.get('full_presenter_context',False))
            return proof(owner='neither')
        foreign_rows,_=ownership.repair(rows,foreign)
        self.assertEqual(foreign_rows[2]['kind'],'independent_insert')

    def test_visible_third_presenter_is_not_a_hand_operation_link_between_two_people(self):
        rows = events([(0,2000,'A','presenter'), (2000,8000,'X','own_detail'),
                       (8000,12000,'B','presenter')])
        observation = dict(proof(owner='left'), middle_visible='person',
                           middle_action='a third visible presenter applies powder to her own face')
        fixed, joins = ownership.repair(rows, lambda *_: observation)
        self.assertEqual([e['unit'] for e in fixed], ['A','A','B'])
        self.assertNotIn(8000, joins)
        self.assertEqual({s['label_key'] for s in measured(fixed)}, {'mixed_voiceover'})

    def test_multiple_operation_shots_cannot_merge_presenters_before_whole_gap_is_checked(self):
        for initially_insert in (False, True):
            rows = events([(0,5400,'A','presenter'), (5400,7600,'unassigned','own_detail'),
                           (7600,8200,'A','own_detail'),
                           (8200,12600,'A','independent_insert' if initially_insert else 'own_detail'),
                           (12600,24600,'B','presenter')])
            for e in rows[:-1]: e['review_unit'] = 'review_a'
            rows[-1]['review_unit'] = 'review_b'
            fixed, joins = ownership.repair(rows, lambda *args: proof(left=False, right=True))
            self.assertEqual([e['unit'] for e in fixed], ['A', 'A', 'A', 'A', 'B'])
            self.assertNotIn(12600, joins)
            self.assertEqual([(s['start_sec'], s['end_sec']) for s in measured(fixed)],
                             [(0,12.6), (12.6,24.6)])

    def test_unresolved_ownership_can_only_be_ignored_when_entire_bounded_run_is_too_short(self):
        rows = events([(0,1000,'','independent_insert'), (1000,4000,'X','own_detail'),
                       (4000,8000,'Y','own_detail'), (8000,9000,'','independent_insert')])
        rows[1]['needs_ownership'] = rows[2]['needs_ownership'] = True
        self.assertEqual({s['label_key'] for s in measured(rows)}, {'mixed_voiceover'})
        self.assertTrue(rows[1]['needs_ownership'])
        self.assertEqual(rows[1]['ownership_irrelevant_below_ms'],7000)
        for change in ('window_edge','unknown_barrier','gap','qualifying_upper_bound'):
            altered = [dict(e) for e in rows]
            if change == 'window_edge': altered = altered[1:]
            if change == 'unknown_barrier': altered[0]['kind'] = 'other'
            if change == 'gap': altered[2]['start_ms'] += 1
            if change == 'qualifying_upper_bound':
                altered[2]['end_ms'] = altered[3]['start_ms'] = 10000
                altered[3]['end_ms'] = 11000
            with self.subTest(change=change), self.assertRaisesRegex(ValueError,'Unresolved'):
                window.event_facts(altered)

    def test_source_endpoint_bounds_unknown_duration_but_window_endpoint_does_not(self):
        rows = events([(0,2000,'X','own_detail'),(2000,4800,'A','presenter'),
                       (4800,6000,'','independent_insert')])
        rows[0]['needs_ownership'] = True
        window.event_facts(rows)
        self.assertEqual(rows[0]['ownership_irrelevant_below_ms'],4800)
        tail = events([(10000,12000,'','independent_insert'),(12000,18000,'X','own_detail')])
        tail[1]['needs_ownership'] = True
        with self.assertRaisesRegex(ValueError,'Unresolved'):window.event_facts(tail)
        window.event_facts(tail,18000)
        self.assertEqual(tail[1]['ownership_irrelevant_below_ms'],6000)

    def test_only_fully_bounded_context_outside_owned_core_may_defer_ownership(self):
        rows = events([(0,12000,'A','presenter'), (12000,14000,'','independent_insert'),
                       (14000,20000,'B','presenter'), (20000,24000,'X','own_detail'),
                       (24000,26000,'','independent_insert')])
        rows[3]['needs_ownership'] = True
        window.event_facts(rows, 26000, core=(0, 14000))
        self.assertTrue(rows[3]['ownership_deferred_outside_core'])
        for core in ((0, 14001), (14000, 26000)):
            with self.subTest(core=core), self.assertRaisesRegex(ValueError, 'Unresolved'):
                window.event_facts(rows, 26000, core=core)
        # Missing context / unknown barriers cannot justify a deferred proof.
        rows[-1]['kind'] = 'other'
        with self.assertRaisesRegex(ValueError, 'Unresolved'):
            window.event_facts(rows, 26000, core=(0, 14000))

    def test_packaging_introduction_wraps_only_an_independently_qualified_core(self):
        for end,expected in [(17200,'live_demo'),(11000,'mixed_voiceover')]:
            rows=[(0,800,'A','presenter'),(800,1600,'','independent_insert'),
                         (1600,end,'A','presenter')]
            spans,extensions,receipt=self.outro_result(rows,proof('packaging_display','neither',False,False))
            self.assertEqual({s['label_key'] for s in spans},{expected})
            if expected=='live_demo':
                self.assertEqual(len(spans),1)
                self.assertEqual(spans[0]['witness'],(1600,end))
                self.assertEqual(extensions[0]['direction'],'intro')
            else:self.assertEqual(extensions,[])
        rows=[(0,800,'A','presenter'),(800,1600,'','independent_insert'),(1600,17200,'B','presenter')]
        spans,extensions,_=self.outro_result(rows,proof('packaging_display','neither',False,False))
        self.assertEqual(extensions,[])
        self.assertEqual(spans[0]['label_key'],'mixed_voiceover')

    def test_complete_prior_presenter_is_not_joined_using_only_its_short_final_anchor(self):
        rows=events([(0,7000,'A','presenter'),(7000,8500,'A','presenter'),
                     (8500,12500,'A','own_detail'),(12500,24500,'B','presenter')])
        # The immediate left anchor only holds a product. That observation
        # cannot erase the complete preceding person's accumulated own steps.
        fixed,joins=ownership.repair(rows,lambda *_:proof(left=False,right=True))
        self.assertEqual([e['unit'] for e in fixed],['A','A','A','B'])
        self.assertNotIn(12500,joins)
        self.assertEqual([(s['start_sec'],s['end_sec']) for s in measured(fixed)],[(0,12.5),(12.5,24.5)])

    def test_missing_detail_unit_requires_operation_evidence_before_measurement(self):
        payload = {'events': [dict(start=a, end=b, unit=u, kind=k, appearance='observed') for a,b,u,k in
                             [(0,4,'A','presenter'),(4,7,'','own_detail'),(7,14,'B','presenter')]]}
        rows = window.align_events(payload, 0, 14000, [])
        with self.assertRaisesRegex(ValueError, 'Unresolved'):
            window.event_facts(rows)
        fixed, _ = ownership.repair(rows, lambda *_: proof())
        self.assertEqual(measured(fixed)[0]['label_key'], 'live_demo')

    def test_next_presenters_hand_operation_cannot_erase_complete_prior_core(self):
        rows=events([(0,12000,'A','presenter'),(12000,21000,'A','presenter'),
                     (21000,22100,'','independent_insert'),(22100,34100,'B','presenter')])
        fixed,joins=ownership.repair(rows,lambda *_:proof(owner='right',left=False,right=True))
        self.assertEqual([e['unit'] for e in fixed],['A','A','B','B'])
        self.assertNotIn(21000,joins)
        self.assertEqual(fixed[2]['prior_review_extent_ms'],[0,21000])

    def test_short_introduction_can_still_join_next_owned_operation(self):
        rows=events([(0,4000,'A','presenter'),(4000,6000,'','independent_insert'),
                     (6000,18000,'B','presenter')])
        fixed,_=ownership.repair(rows,lambda *_:proof(owner='right',left=False,right=True))
        self.assertEqual([e['unit'] for e in fixed],['A','A','A'])

    def test_missing_unit_at_unobserved_edge_is_not_promoted_or_silently_accepted(self):
        payload = {'events': [dict(start=0, end=12, unit='', kind='own_detail', appearance='hands')]}
        rows = window.align_events(payload, 0, 12000, [])
        fixed, _ = ownership.repair(rows, lambda *_: self.fail('no context anchors'))
        with self.assertRaisesRegex(ValueError, 'Unresolved'):
            window.event_facts(fixed)
        payload['events'][0]['kind'] = 'presenter'
        with self.assertRaises(ValueError): window.align_events(payload, 0, 12000, [])

    def test_complementary_introduction_operation_and_application_form_one_review(self):
        rows = events([(0,4200,'A','presenter'),(4200,7200,'','independent_insert'),
                       (7200,14300,'B','presenter')])
        result, joins = ownership.repair(rows, lambda *args: proof())
        self.assertEqual([e['unit'] for e in result], ['A'] * 3)
        self.assertEqual(joins, {4200,7200})
        self.assertEqual(measured(result)[0]['label_key'], 'live_demo')
        # Static clothes comparisons must not undo checked review operations.
        fixed = window.refine_group(result, lambda *_: self.fail('redundant static check'), [], 0, joins)
        self.assertEqual(fixed, result)

    def test_complementary_review_does_not_require_operation_owned_by_both_roles(self):
        rows = events([(0,4200,'A','presenter'),(4200,7200,'','independent_insert'),
                       (7200,14300,'B','presenter')])
        result, _ = ownership.repair(rows, lambda *_: proof(owner='left'))
        self.assertEqual([e['unit'] for e in result], ['A'] * 3)
        self.assertEqual(measured(result)[0]['label_key'], 'live_demo')

    def test_unidentified_comparison_cannot_move_an_independent_presenter_boundary(self):
        rows = events([(0,6000,'A','presenter'),(6000,8000,'X','own_detail'),
                       (8000,20000,'B','presenter')])
        rows[1]['person'] = ''
        result, _ = ownership.repair(rows, lambda *_: proof('wear_result', 'right', True, True))
        self.assertEqual([e['unit'] for e in result], ['A','A','B'])
        rows[1]['person'] = 'visible_right_person'
        result, _ = ownership.repair(rows, lambda *_: proof('skin_comparison', 'right', True, True))
        self.assertEqual([e['unit'] for e in result], ['A','B','B'])

    def test_two_independent_demonstrations_keep_boundary_even_when_called_same_review(self):
        rows = events([(0,8000,'A','presenter'),(8000,12600,'B','own_detail'),
                       (12600,24600,'B','presenter')])
        result, joins = ownership.repair(rows, lambda *args: proof(left=True))
        self.assertEqual([e['unit'] for e in result], ['A','A','B'])
        self.assertNotIn(12600, joins)
        self.assertEqual([(s['start_sec'],s['end_sec']) for s in measured(result)], [(0,12.6),(12.6,24.6)])

    def test_demonstration_then_another_presenters_intro_is_not_complementary_review(self):
        rows = events([(0,6000,'A','presenter'),(6000,8000,'X','own_detail'),
                       (8000,15000,'B','presenter')])
        fixed, joins = ownership.repair(rows, lambda *_: proof('product_operation','both',True,False))
        self.assertEqual([e['unit'] for e in fixed], ['A','A','B'])
        self.assertNotIn(8000, joins)
        self.assertEqual({s['label_key'] for s in measured(fixed)}, {'mixed_voiceover'})

    def test_midpoint_skin_image_cannot_erase_an_observed_application_presenter(self):
        rows = events([(0,4000,'A','presenter'),(4000,5000,'A','own_detail'),
                       (5000,7500,'B','presenter'),(7500,8500,'B','own_detail'),
                       (8500,14000,'C','presenter')])
        rows[2]['action'] = 'personal_application'
        requested=[]
        def ask(left,middle,right):
            requested.append(middle['start_ms'])
            return proof('skin_comparison','left',True,True)
        fixed, _ = ownership.repair(rows, ask)
        self.assertNotIn(5000, requested)
        self.assertEqual(fixed[2]['kind'], 'presenter')
        self.assertEqual(fixed[2]['unit'], 'B')

    def test_comparison_step_with_unknown_physical_owner_requires_two_matching_flow_observations(self):
        rows=events([(0,5000,'A','presenter'),(5000,7100,'X','own_detail'),(7100,14600,'A','presenter')])
        for row in rows: row['review_unit']='review_a'
        rows[1]['action']='skin_comparison'
        operation=dict(proof('skin_comparison','neither',False,False),middle_visible='person')
        fixed,_=ownership.repair(rows,lambda *_:operation)
        self.assertEqual(measured(fixed)[0]['label_key'],'live_demo')
        self.assertEqual(fixed[1]['ownership_basis'],'observed_comparison_in_same_review')
        self.assertEqual(operation['middle_owner'],'neither')  # Cached observation stays intact.
        rows[1]['review_unit']='unrelated'
        fixed,_=ownership.repair(rows,lambda *_:operation)
        self.assertEqual({s['label_key'] for s in measured(fixed)},{'mixed_voiceover'})
        rows[1].update(review_unit='review_a',action='external_scene')
        fixed,_=ownership.repair(rows,lambda *_:operation)
        self.assertEqual({s['label_key'] for s in measured(fixed)},{'mixed_voiceover'})

    def test_skin_comparison_rejoins_returning_presenters_review(self):
        rows = events([(0,5000,'A','presenter'),(5000,7000,'X','own_detail'),
                       (7000,14600,'A','presenter')])
        result, _ = ownership.repair(rows, lambda *args: proof('skin_comparison', 'left', False, False))
        self.assertEqual([e['unit'] for e in result], ['A'] * 3)
        self.assertEqual(measured(result)[0]['label_key'], 'live_demo')

    def test_unclassified_action_with_explicit_no_owner_remains_a_barrier(self):
        rows=events([(0,7000,'A','presenter'),(7000,9000,'X','own_detail'),(9000,18500,'A','presenter')])
        fixed,_=ownership.repair(rows,lambda *_:proof('uncertain','neither'))
        self.assertEqual(fixed[1]['unit'],'')
        self.assertEqual({s['label_key'] for s in measured(fixed)},{'mixed_voiceover'})
        with self.assertRaises(ValueError):ownership.validate(proof('uncertain','both'))

    def test_presenter_holding_package_is_not_a_full_screen_product_insert(self):
        rows=events([(0,6000,'A','presenter'),(6000,7000,'X','own_detail'),(7000,13000,'A','presenter')])
        observed=dict(proof('packaging_display','left',True,True),middle_visible='person')
        fixed,_=ownership.repair(rows,lambda *_:observed)
        self.assertEqual(measured(fixed)[0]['label_key'],'live_demo')
        observed['middle_visible']='product'
        fixed,_=ownership.repair(rows,lambda *_:observed)
        self.assertEqual({s['label_key'] for s in measured(fixed)},{'mixed_voiceover'})

    def test_insert_function_vetoes_erroneous_same_review_owner(self):
        for function in ('ingredient_ad','external_makeup_scene','packaging_display'):
            with self.subTest(function=function):
                rows = events([(0,7000,'A','presenter'),(7000,8700,'A','own_detail'),
                               (8700,18267,'A','presenter')])
                result, joins = ownership.repair(rows, lambda *args: proof(function, 'left', True, True))
                self.assertFalse(joins)
                self.assertEqual(result[1]['unit'], '')
                self.assertEqual(measured(result)[0]['label_key'], 'mixed_voiceover')

    def outro_result(self, rows, observation):
        fixed, _ = ownership.repair(events(rows), lambda *_: observation)
        frames, facts = window.event_facts(fixed)
        _, receipt = continuity.apply({'segments': []}, frames, facts, fixed[-1]['end_ms'])
        spans, extensions = continuity.label_spans(receipt['runs'], [e for e in fixed if e.get('outro_unit') or e.get('intro_unit')])
        return spans, extensions, receipt

    def test_qualified_review_keeps_packaging_outro_but_core_excludes_insert_and_return(self):
        spans, extensions, receipt = self.outro_result(
            [(0,17100,'A','presenter'),(17100,18700,'','independent_insert'),(18700,21800,'A','presenter')],
            proof('packaging_display', 'neither', True, False))
        self.assertEqual([(s['start_ms'],s['end_ms'],s['label_key']) for s in spans], [(0,21800,'live_demo')])
        self.assertEqual(spans[0]['witness'], (0,17100))
        self.assertEqual([r['qualifies'] for r in receipt['runs']], [True,False,False])
        self.assertEqual(extensions[0]['core_end_ms'], 17100)
        claims = {'liveClaims': [dict(start_ms=0, end_ms=17100, minimum=10001)]}
        self.assertEqual(window.finalize(spans, claims)[0][0]['label_key'], 'live_demo')
        # Snapping away the qualified core must not let the outro claim itself.
        tail = [dict(spans[0], start_ms=17100)]
        self.assertEqual(window.finalize(tail, claims)[0][0]['label_key'], 'mixed_voiceover')

    def test_packaging_outro_cannot_qualify_a_short_interrupted_core(self):
        spans, extensions, _ = self.outro_result(
            [(0,9567,'A','presenter'),(9567,10967,'','independent_insert'),(10967,12467,'A','presenter')],
            proof('packaging_display', 'neither', True, False))
        self.assertFalse(extensions)
        self.assertEqual({s['label_key'] for s in spans}, {'mixed_voiceover'})

    def test_outro_never_bridges_ad_external_scene_or_different_presenter(self):
        for function, returning in [('ingredient_ad','A'),('external_makeup_scene','A'),('packaging_display','B')]:
            with self.subTest(function=function, returning=returning):
                spans, extensions, _ = self.outro_result(
                    [(0,17000,'A','presenter'),(17000,19000,'','independent_insert'),(19000,33000,returning,'presenter')],
                    proof(function, 'neither', True, False))
                self.assertFalse(extensions)
                self.assertEqual([s['label_key'] for s in spans], ['live_demo','mixed_voiceover','live_demo'])

    def test_outro_requires_observed_same_review_and_does_not_chain_more_inserts(self):
        rows=[(0,17000,'A','presenter'),(17000,19000,'','independent_insert'),(19000,22000,'A','presenter')]
        spans, extensions, _ = self.outro_result(rows, dict(proof('packaging_display','neither',True,False),
                                                         outer_relation='independent_reviews'))
        self.assertFalse(extensions)
        self.assertEqual(spans[0]['end_ms'], 17000)
        rows += [(22000,24000,'','independent_insert'),(24000,27000,'A','presenter')]
        spans, extensions, _ = self.outro_result(rows, proof('packaging_display','neither',True,False))
        self.assertEqual(len(extensions), 1)
        self.assertEqual([(s['end_ms'],s['label_key']) for s in spans],
                         [(22000,'live_demo'),(24000,'mixed_voiceover'),(27000,'mixed_voiceover')])

    def test_intro_and_hands_without_complete_presenter_demo_do_not_get_tolerance(self):
        rows = events([(0,2400,'A','presenter'),(2400,9500,'A','own_detail'),
                       (9500,13000,'B','presenter')])
        result, _ = ownership.repair(rows, lambda *args: proof(owner='left', left=False, right=False))
        self.assertEqual(measured(result)[0]['label_key'], 'mixed_voiceover')

    def test_ambiguous_both_owner_does_not_give_incomplete_intro_tolerance(self):
        rows = events([(0,2400,'A','presenter'),(2400,9500,'A','own_detail'),
                       (9500,13000,'B','presenter')])
        result, _ = ownership.repair(rows, lambda *_: proof(owner='both',left=False,right=False))
        self.assertEqual(measured(result)[0]['label_key'],'mixed_voiceover')
        self.assertFalse(result[0]['allow_tolerance'])

    def test_positive_face_hint_keeps_detail_ownership_audit(self):
        rows = events([(0,5000,'A','presenter'),(5000,7000,'X','presenter'),
                       (7000,14600,'A','presenter')])
        rows[1]['observed_kind'] = 'own_detail'
        result, _ = ownership.repair(rows, lambda *args: proof('skin_comparison', 'left', False, False))
        self.assertEqual(result[1]['kind'], 'own_detail')
        self.assertEqual(measured(result)[0]['label_key'], 'live_demo')

    def test_skin_comparison_belongs_to_left_without_swallowing_next_presenter(self):
        rows = events([(0,6000,'A','presenter'),(6000,8000,'X','own_detail'),
                       (8000,22000,'B','presenter')])
        result, joins = ownership.repair(rows, lambda *_: proof('skin_comparison', 'both', True, True))
        self.assertEqual([e['unit'] for e in result], ['A','A','B'])
        self.assertNotIn(8000, joins)

    def test_ownership_anchor_never_reaches_across_another_independent_insert(self):
        rows = events([(0,9000,'A','presenter'),(9000,11000,'','independent_insert'),
                       (11000,18000,'B','own_detail'),(18000,29000,'C','presenter')])
        requested = []
        def ask(left, middle, right):
            requested.append(middle['start_ms'])
            return proof('packaging_display', 'neither')
        result, joins = ownership.repair(rows, ask)
        self.assertNotIn(11000, requested)
        self.assertEqual(result[2]['unit'], 'B')
        self.assertFalse(joins)
        self.assertEqual(measured(result)[-1]['start_sec'], 18)

    def test_short_step_links_are_measured_only_after_whole_review_is_restored(self):
        rows = events([(0,5500,'A','presenter'),(5500,6600,'X','own_detail'),
                       (6600,7700,'Y','presenter'),(7700,12800,'Z','own_detail'),
                       (12800,24800,'B','presenter')])
        def ask(left, middle, right):
            return proof('skin_comparison' if middle['start_ms'] < 7700 else 'product_operation',
                         'left', True, True)
        result, joins = ownership.repair(rows, ask)
        self.assertEqual([e['unit'] for e in result], ['A'] * 4 + ['B'])
        self.assertEqual(measured(result)[0]['end_sec'], 12.8)

    def test_long_face_scene_uses_presenter_checks_instead_of_midpoint_operation(self):
        rows = events([(0,4000,'A','presenter'),(4000,18000,'B','presenter'),
                       (18000,23000,'C','presenter')])
        rows[1]['observed_kind'] = 'own_detail'
        result, joins = ownership.repair(rows, lambda *_: self.fail('long presenter is not one detail'))
        self.assertEqual(result, rows)
        self.assertFalse(joins)

    def test_own_outdoor_wear_result_preserves_verified_return(self):
        rows = events([(0,4000,'A','presenter'),(4000,5700,'A','presenter'),
                       (5700,12000,'A','presenter')])
        rows[1]['observed_kind'] = 'own_detail'
        result, joins = ownership.repair(rows, lambda *_: dict(
            proof('presenter', 'left', True, True), middle_visible='person'))
        self.assertEqual(joins, {4000,5700})
        self.assertEqual(measured(result)[0]['label_key'], 'live_demo')

    def test_invalid_and_unknown_observations_do_not_publish_guess(self):
        for value in ({}, proof('uncertain'), proof(owner='uncertain'), dict(proof(), left_demonstrates=1)):
            with self.assertRaises(ValueError): ownership.validate(value)
