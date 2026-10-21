import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production import framework_review_membership as membership
from content_production.framework_window_audit import finalize


class ReviewMembershipTests(unittest.TestCase):
    def segment(self, a, b, label):
        return dict(start_ms=a, end_ms=b, label_key=label, confidence=.9, reason='source')

    def claim(self, a=0, b=30000):
        return dict(start_ms=a, end_ms=b, minimum=10001)

    def observed(self, target, relationship):
        return dict(target, payload={**{k:'实际人物与操作证据' for k in
            ('anchor_visible', 'target_visible', 'source_relation', 'flow_relation', 'evidence')},
            'relationship':relationship})

    def test_interrupted_short_fragments_cannot_create_a_core(self):
        segments = [self.segment(0,7000,'live_demo'), self.segment(7000,9000,'mixed_voiceover'),
                    self.segment(9000,18500,'live_demo')]
        self.assertEqual(membership.plan(segments, []), [])
        self.assertEqual(membership.plan(segments, [dict(start_ms=9000,end_ms=18500,minimum=9000)]), [])

    def test_duration_gate_exposes_target_hidden_by_short_live_fragment(self):
        segments = [self.segment(0,30000,'live_demo'), self.segment(30000,36000,'live_demo'),
                    self.segment(36000,60000,'mixed_voiceover')]
        claims = [self.claim(), self.claim(30000,41000)]
        self.assertEqual(membership.plan(segments, claims), [])
        eligible, corrections = finalize(segments, dict(liveClaims=claims))
        self.assertEqual(corrections, 1)
        targets = membership.plan(eligible, claims)
        self.assertEqual([(p['start_ms'],p['end_ms']) for p in targets], [(30000,60000)])
        self.assertEqual(targets[0]['anchor_end_ms'], 30000)
        unchanged, restored = membership.apply(eligible, targets,
            [self.observed(targets[0], 'separate_content')])
        self.assertEqual(unchanged, eligible)
        self.assertEqual(restored, [])

    def test_own_return_keeps_boundary_and_never_adds_duration_claim(self):
        segments = [self.segment(0,30000,'live_demo'), self.segment(30000,35000,'mixed_voiceover')]
        claims = [self.claim()]
        targets = membership.plan(segments, claims)
        result, corrections = membership.apply(segments, targets, [self.observed(targets[0], 'continuing_review')])
        receipt = dict(liveClaims=claims, reviewMembership=dict(corrections=corrections))
        output, demotions = finalize(result, receipt)
        self.assertEqual([s['label_key'] for s in output], ['live_demo','live_demo'])
        self.assertEqual(output[1]['start_ms'], 30000)
        self.assertEqual(demotions, 0)
        self.assertEqual(receipt['liveClaims'], [self.claim()])
        result[0]['label_key'] = 'mixed_voiceover'
        self.assertFalse(membership.supports(result[1], result, receipt))

    def test_source_observed_snap_preserves_owned_ending_without_pooling(self):
        rows = [self.segment(0,30000,'live_demo'), self.segment(30000,35000,'mixed_voiceover')]
        claims = [self.claim()]
        target = membership.plan(rows,claims)[0]
        restored, changes = membership.apply(rows,[target],[self.observed(target,'continuing_review')])
        restored[1]['end_ms'] = 35100
        event = dict(start_ms=33000,end_ms=35100,unit='review-ending',kind='presenter')
        window = dict(start=0,end=40000,events=[event])
        receipt = dict(liveClaims=claims,reviewMembership=dict(corrections=changes),windows=[window])
        output, demotions = finalize(restored,receipt)
        self.assertEqual([s['label_key'] for s in output],['live_demo','live_demo'])
        self.assertEqual(demotions,0)
        self.assertEqual(receipt['liveClaims'],claims)
        # Neither a timing allowance nor a nearby observed person suffices:
        # the complete added range must end at that same source event's edge.
        for bad in [dict(event,kind='independent_insert'),dict(event,unit=''),
                    dict(event,needs_ownership=True),dict(event,subject_conflict=True),
                    dict(event,start_ms=35000),dict(event,end_ms=35200)]:
            with self.subTest(event=bad):
                invalid = dict(receipt,windows=[dict(window,events=[bad])])
                self.assertFalse(membership.supports(restored[1],restored,invalid))
        self.assertFalse(membership.supports(restored[1],restored,dict(receipt,windows=[])))
        conflicting = dict(window,events=[dict(event,kind='independent_insert')])
        self.assertFalse(membership.supports(restored[1],restored,dict(receipt,windows=[window,conflicting])))
        excessive = dict(restored[1],end_ms=35400)
        self.assertFalse(membership.supports(excessive,restored,dict(receipt,
            windows=[dict(window,events=[dict(event,end_ms=35400)])])))
        restored[0]['label_key']='mixed_voiceover'
        self.assertFalse(membership.supports(restored[1],restored,receipt))

    def test_foreign_review_and_uncertainty_leave_target_unchanged(self):
        segments = [self.segment(0,30000,'live_demo'), self.segment(30000,50000,'mixed_voiceover')]
        targets = membership.plan(segments, [self.claim()])
        for relation in ('separate_content', 'uncertain'):
            result, corrections = membership.apply(segments, targets, [self.observed(targets[0], relation)])
            self.assertEqual(result, segments)
            self.assertEqual(corrections, [])

    def return_fixture(self):
        segments = [self.segment(0,30000,'live_demo'), self.segment(30000,31200,'mixed_voiceover'),
                    self.segment(31200,60000,'live_demo')]
        claims = [self.claim(), self.claim(31200,60000)]
        window = dict(measured=dict(runs=[dict(start_ms=a,end_ms=b,unit=u) for a,b,u in
            [(0,30000,'p1'),(30000,31200,'detail'),(31200,60000,'p1')]]),
            events=[dict(start_ms=30000,end_ms=31200,kind='own_detail',action='skin_comparison',
                         visible='person',needs_ownership=False)])
        return segments,claims,window

    def test_brief_illustration_observes_return_and_requires_both_qualified_cores(self):
        segments,claims,window = self.return_fixture()
        targets = membership.plan(segments,claims,[window])
        self.assertEqual(targets[0]['return_start_ms'],31200)
        proof = self.observed(targets[0],'continuing_review')
        proof['payload'].update(return_visible='原主讲人返回',outer_relation='same_review',insert_role='local_illustration')
        output,corrections = membership.apply(segments,targets,[proof])
        receipt = dict(liveClaims=claims, reviewMembership=dict(corrections=corrections))
        self.assertEqual(finalize(output,receipt)[1],0)
        self.assertEqual(receipt['liveClaims'],claims)
        output[2]['label_key']='mixed_voiceover'
        self.assertFalse(membership.supports(output[1],output,receipt))
        self.assertNotIn('return_start_ms', membership.plan(segments,claims[:1],[window])[0])

    def test_return_alone_cannot_absorb_independent_advertisement(self):
        segments,claims,window = self.return_fixture()
        targets = membership.plan(segments,claims,[window])
        proof = self.observed(targets[0],'continuing_review')
        proof['payload'].update(return_visible='原主讲人返回',outer_relation='same_review',insert_role='independent_content')
        self.assertEqual(membership.apply(segments,targets,[proof]),(segments,[]))
        window['events'][0]['action']='ingredient_ad'
        self.assertNotIn('return_start_ms',membership.plan(segments,claims,[window])[0])
        window['events'][0]['action']='skin_comparison'
        window['measured']['runs'][-1]['unit']='different-person'
        self.assertNotIn('return_start_ms',membership.plan(segments,claims,[window])[0])

    def test_product_illustration_needs_actual_return_and_two_separate_cores(self):
        segments,claims,window=self.return_fixture()
        window['events'][0].update(kind='independent_insert',action='ingredient_ad',visible='product')
        target=membership.plan(segments,claims,[window])[0]
        self.assertIn('return_start_ms',target)
        self.assertNotIn('source_barriers',target)
        proof=self.observed(target,'continuing_review')
        proof['payload'].update(return_visible='主讲返回开展测试',outer_relation='same_review',insert_role='local_illustration')
        self.assertEqual(membership.apply(segments,[target],[proof])[0][1]['label_key'],'live_demo')
        proof['payload']['insert_role']='independent_content'
        self.assertEqual(membership.apply(segments,[target],[proof]),(segments,[]))
        short_claims=[claims[0],dict(start_ms=31200,end_ms=40700,minimum=9000)]
        target=membership.plan(segments,short_claims,[window])[0]
        self.assertNotIn('return_start_ms',target)
        self.assertIn('source_barriers',target)

    def test_review_with_presenter_inside_target_is_not_a_standalone_product_insert(self):
        segments=[self.segment(0,3500,'mixed_voiceover'),self.segment(3500,60000,'live_demo')]
        window=dict(events=[dict(start_ms=0,end_ms=1800,kind='independent_insert',action='packaging_display'),
            dict(start_ms=1800,end_ms=2600,kind='presenter',action='talking_demo'),
            dict(start_ms=2600,end_ms=3500,kind='independent_insert',action='packaging_display')])
        target=membership.plan(segments,[self.claim(3500,60000)],[window])[0]
        self.assertNotIn('source_barriers',target)

    def test_opening_setup_requires_qualified_core_and_same_question_extent(self):
        segments = [self.segment(0,7000,'mixed_voiceover'), self.segment(7000,40000,'live_demo')]
        targets = membership.plan(segments, [self.claim(7000,40000)])
        self.assertEqual(targets[0]['indices'], [0])
        wrong = self.observed(targets[0], 'continuing_review')
        wrong['end_ms'] = 8000
        with self.assertRaises(ValueError):
            membership.apply(segments, targets, [wrong])
        segments[0]['end_ms'] = segments[1]['start_ms'] = 12000
        self.assertEqual(membership.plan(segments, [self.claim(12000,40000)]), [])

    def test_does_not_cross_interview_or_relabel_adjacent_independent_reviews(self):
        segments = [self.segment(0,30000,'live_demo'), self.segment(30000,45000,'live_demo'),
                    self.segment(45000,60000,'street_interview'), self.segment(60000,75000,'promotion')]
        self.assertEqual(membership.plan(segments, [self.claim(), self.claim(30000,45000)]), [])

    def test_product_and_shared_narration_cannot_override_independent_source(self):
        segments = [self.segment(0,1700,'mixed_voiceover'), self.segment(1700,60000,'live_demo')]
        windows = [dict(events=[dict(start_ms=0,end_ms=1700,kind='independent_insert',action='packaging_display')])]
        targets = membership.plan(segments,[self.claim(1700,60000)],windows)
        self.assertEqual(len(targets[0]['source_barriers']),1)
        proof = self.observed(targets[0],'continuing_review')
        proof['payload'].update(source_link='editorial_only',test_connection_evidence='仅产品和旁白一致')
        self.assertEqual(membership.apply(segments,targets,[proof]),(segments,[]))
        proof['payload']['source_link']='uncertain'
        self.assertEqual(membership.apply(segments,targets,[proof]),(segments,[]))
        # A real test transition can overturn the preliminary source label;
        # changes of scene are not an unconditional rejection either.
        proof['payload'].update(source_link='observed_test_connection',test_connection_evidence='实际操作动作和现场器材接续')
        result,corrections=membership.apply(segments,targets,[proof])
        self.assertEqual(result[0]['label_key'],'live_demo')
        receipt=dict(liveClaims=[self.claim(1700,60000)],reviewMembership=dict(corrections=corrections))
        self.assertEqual(finalize(result,receipt)[1],0)

    def test_source_recheck_is_bound_and_does_not_invent_missing_proof(self):
        segments=[self.segment(0,30000,'live_demo'),self.segment(30000,34000,'mixed_voiceover')]
        windows=[dict(events=[dict(start_ms=30000,end_ms=34000,kind='independent_insert',action='ingredient_ad')])]
        target=membership.plan(segments,[self.claim()],windows)[0]
        proof=self.observed(target,'continuing_review')
        with self.assertRaises(ValueError):
            membership.apply(segments,[target],[proof])
        proof['payload'].update(source_link='observed_test_connection',test_connection_evidence='test')
        proof['source_barriers']=[]
        with self.assertRaises(ValueError):
            membership.apply(segments,[target],[proof])
        windows[0]['events'][0]['start_ms']=34000
        windows[0]['events'][0]['end_ms']=35000
        self.assertNotIn('source_barriers',membership.plan(segments,[self.claim()],windows)[0])

    def test_forged_or_stale_evidence_cannot_restore_an_unrelated_interval(self):
        segments = [self.segment(0,30000,'live_demo'), self.segment(30000,35000,'mixed_voiceover')]
        targets = membership.plan(segments, [self.claim()])
        output, corrections = membership.apply(segments, targets, [self.observed(targets[0], 'continuing_review')])
        receipt = dict(liveClaims=[self.claim()], reviewMembership=dict(corrections=corrections))
        unrelated = dict(output[1], end_ms=60000)
        self.assertFalse(membership.supports(unrelated, output, receipt))
        bad = copy.deepcopy(segments)
        bad[1]['label_key'] = 'street_interview'
        with self.assertRaises(ValueError):
            membership.apply(bad, targets, [self.observed(targets[0], 'continuing_review')])


class OpeningSlateTests(unittest.TestCase):
    segment=ReviewMembershipTests.segment
    claim=ReviewMembershipTests.claim
    observed=ReviewMembershipTests.observed
    def slate_fixture(self):
        segments=[self.segment(0,100,'mixed_voiceover'),self.segment(100,39000,'live_demo')]
        claims=[self.claim(100,39000)]
        window=dict(events=[dict(start_ms=0,end_ms=100,kind='independent_insert',action='packaging_display')])
        return segments,claims,window

    def test_identity_slate_requires_source_check_and_qualified_following_core(self):
        rows,claims,window=self.slate_fixture()
        target=membership.plan(rows,claims,[window])[0]
        self.assertTrue(target['opening_slate'])
        p=self.observed(target,'continuing_review')
        p['payload'].update(source_link='opening_identity_slate',test_connection_evidence='首帧产品卡与演示中实物一致，无独立广告内容')
        output,changes=membership.apply(rows,[target],[p])
        self.assertEqual([s['label_key'] for s in output],['live_demo','live_demo'])
        self.assertEqual(output[0]['end_ms'],100)
        receipt=dict(liveClaims=claims,reviewMembership=dict(corrections=changes))
        self.assertEqual(finalize(output,receipt)[1],0)
        output[1]['label_key']='mixed_voiceover'
        self.assertFalse(membership.supports(output[0],output,receipt))
        self.assertEqual(membership.plan(rows,[],[window]),[])

    def test_subsecond_unknown_person_or_ingredient_ad_is_not_an_identity_card(self):
        rows,claims,window=self.slate_fixture()
        self.assertEqual(membership.plan(rows,claims,[]),[])
        for kind,action in [('presenter','talking_demo'),('independent_insert','ingredient_ad')]:
            w=copy.deepcopy(window);w['events'][0].update(kind=kind,action=action)
            self.assertEqual(membership.plan(rows,claims,[w]),[])

    def test_uncertain_or_separate_product_content_is_not_absorbed(self):
        rows,claims,window=self.slate_fixture();target=membership.plan(rows,claims,[window])[0]
        for link,relation in [('editorial_only','continuing_review'),('uncertain','continuing_review'),('opening_identity_slate','separate_content')]:
            p=self.observed(target,relation);p['payload'].update(source_link=link,test_connection_evidence='实际内容')
            self.assertEqual(membership.apply(rows,[target],[p]),(rows,[]))
        ordinary=dict(target);ordinary.pop('opening_slate')
        p=self.observed(ordinary,'continuing_review');p['payload'].update(source_link='opening_identity_slate',test_connection_evidence='首卡')
        with self.assertRaises(ValueError):membership.apply(rows,[ordinary],[p])


class OpeningSourceFrameTests(unittest.TestCase):
    def test_decoded_pts_exclude_frame_at_target_end(self):
        import json
        from unittest.mock import patch
        from pathlib import Path
        frames={'frames':[{'best_effort_timestamp_time':str(t)} for t in [0,.033333,.066667,.1,.133333]]}
        with patch('content_production.shot_catalog.run',return_value=json.dumps(frames)):
            self.assertEqual(membership.opening_frame_times(Path('source.mp4'),.1,{},lambda:None),[0,.033333,.066667])

    def test_missing_frames_cannot_use_an_unbound_seek(self):
        from unittest.mock import patch
        from pathlib import Path
        with patch('content_production.shot_catalog.run',return_value='{"frames":[]}'):
            with self.assertRaisesRegex(ValueError,'no bound source frames'):
                membership.opening_frame_times(Path('source.mp4'),.1,{},lambda:None)
