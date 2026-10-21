import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_shot_audit import plan, apply, decode_observations, borrowed_frames
from content_production.segment_suggestion_contract import postprocess, PROMPT_V13
KEYS={'mixed_voiceover','live_demo','street_interview','promotion'}


def item(a,b,label='live_demo',kind='single_presenter',same=False):
    return dict(start_sec=a,end_sec=b,label_key=label,visual_kind=kind,same_person_as_previous=same,
                endorsement_marker='',continuous_start_sec=a if kind=='single_presenter' else None,
                continuous_end_sec=b if kind=='single_presenter' else None,reason='observation',confidence=.9)


def facts(intervals):
    frames=[];values=[]
    for i,(a,b,p) in enumerate(intervals):
        frames.append(dict(index=i,start_ms=a,end_ms=b))
        values.append(dict(index=i,visible_person_id=p,role='presenter' if p else 'product_ad',
                           visible_link='same_person_visible' if p else 'none',evidence='visible fact'))
    return frames,{'shots':values}


class ShotAuditTests(unittest.TestCase):
    def evaluate(self,items,intervals,kinds):
        p=plan({'segments':items},KEYS,100000)
        f,o=facts(intervals)
        context={'units':[dict(unit_id=i,kind=k,evidence='editorial fact') for i,k in kinds.items()]}
        return apply(p,f,o,context)

    def test_product_insert_blocks_invented_twenty_second_witness(self):
        payload,stats=self.evaluate([item(0,21)],[(0,7000,'P1'),(7000,9000,''),
            (9000,18567,'P1'),(18567,20000,''),(20000,21000,'P1')],{})
        self.assertEqual(payload['segments'][0]['label_key'],'mixed_voiceover')
        self.assertEqual(stats['units'][0]['longestMs'],9567)

    def test_long_same_person_review_can_be_restored_by_independent_facts(self):
        payload,_=self.evaluate([item(0,70,'mixed_voiceover')],[(0,27000,'P1'),(27000,30000,''),
            (30000,70000,'P1')],{0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_short_sandwich_is_not_promoted_by_duration_only(self):
        payload,_=self.evaluate([item(0,3,'mixed_voiceover','montage'),item(3,14),
            item(14,25,'mixed_voiceover','montage')],[(3000,14000,'P1'),
            (14000,18000,'P2'),(18000,22000,'P3'),(22000,25000,'P4')],
            {1:'demonstration',2:'short_insert'})
        self.assertEqual(payload['segments'][1]['label_key'],'mixed_voiceover')

    def test_two_short_people_at_tail_remain_montage(self):
        payload,_=self.evaluate([item(0,11),item(11,23)],[(0,11000,'P1'),(11000,23000,'P2')],
                                {0:'demonstration',1:'demonstration'})
        self.assertEqual([s['label_key'] for s in payload['segments']],['mixed_voiceover']*2)

    def test_qualified_single_closing_demo_has_no_music_penalty(self):
        payload,_=self.evaluate([item(0,70),item(70,82)],[(0,70000,'P1'),(70000,82000,'P2')],{1:'short_insert'})
        self.assertEqual(payload['segments'][-1]['label_key'],'live_demo')

    def test_same_presenter_wrapup_is_retained_in_demonstration(self):
        payload,_=self.evaluate([item(0,70),item(70,84,'promotion','other',True)],
                               [(0,84000,'P1')],{1:'independent_promotion'})
        segments,_=postprocess(payload,100000,KEYS,version=PROMPT_V13)
        self.assertEqual(len(segments),1)
        self.assertEqual(segments[0]['label_key'],'live_demo')

    def test_missing_context_does_not_partially_apply(self):
        with self.assertRaises(ValueError):
            self.evaluate([item(0,12)],[(0,12000,'P1')],{})

    def test_montage_claim_still_gets_independent_visual_audit(self):
        payload,_=self.evaluate([item(0,24,'mixed_voiceover','montage')],
            [(0,24000,'P1')],{0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_one_long_shot_cannot_promote_a_whole_multi_source_montage(self):
        payload,_=self.evaluate([item(0,27,'mixed_voiceover','montage')],
            [(0,3000,'P1'),(3000,16500,'P2'),(16500,19500,'P3'),(19500,27000,'P4')],
            {0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'mixed_voiceover')

    def test_dominant_qualified_reviewer_retains_own_comparison_content_unit(self):
        payload,receipt=self.evaluate([item(0,55,'mixed_voiceover','montage')],
            [(0,24000,'P1'),(24000,25200,'P2'),(25200,55000,'P1')],{0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')
        self.assertEqual(receipt['units'][0]['longestMs'],29800)

    def test_source_audit_restores_original_live_proposal_after_false_association(self):
        original=dict(item(0,47,kind='borrowed_endorsement'),endorsement_marker='@某作者同款')
        payload,_=self.evaluate([original],[(0,2000,'P1'),(2000,5000,''),
            (5000,27000,'P1'),(27000,28500,'P2'),(28500,30500,''),(30500,47000,'P1')],
            {0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_single_review_with_internal_illustration_keeps_measured_core(self):
        payload,receipt=self.evaluate([item(0,71,'mixed_voiceover')],
            [(0,51000,'P1'),(51000,62000,'P2'),(62000,71000,'P1')],{0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')
        self.assertEqual(receipt['units'][0]['longestMs'],51000)
        self.assertEqual(payload['segments'][0]['continuous_end_sec'],51)

    def test_twenty_four_second_uninterrupted_presenter_is_not_a_short_quote(self):
        payload,_=self.evaluate([item(0,24,'mixed_voiceover','montage')],
            [(0,24000,'P1')],{0:'short_insert'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_own_steps_mislabelled_as_montage_rejoin_qualified_review(self):
        payload,_=self.evaluate([item(0,50),item(50,61,'mixed_voiceover','montage'),
            item(61,70,'mixed_voiceover')],[(0,70000,'P1')],{1:'demonstration',2:'demonstration'})
        self.assertEqual(len(payload['segments']),1)
        self.assertEqual(payload['segments'][0]['end_sec'],70)

    def test_independent_insert_cannot_rejoin_same_returning_presenter(self):
        payload,_=self.evaluate([item(0,50),item(50,61,'mixed_voiceover','montage'),
            item(61,70,'mixed_voiceover')],[(0,50000,'P1'),(50000,61000,''),(61000,70000,'P1')],
            {1:'demonstration',2:'demonstration'})
        self.assertEqual([s['label_key'] for s in payload['segments']],
                         ['live_demo','mixed_voiceover','mixed_voiceover'])

    def test_visual_continuation_closes_proposal_rounding_gaps_before_short_step_gating(self):
        payload,_=self.evaluate([item(0,20),item(20.1,29.8,same=True),item(29.9,45,same=True)],
            [(0,45000,'P1')],{1:'demonstration'})
        self.assertEqual(len(payload['segments']),1)
        self.assertEqual(payload['segments'][0]['end_sec'],45)

    def test_independent_review_disproves_product_association_marker(self):
        marked=dict(item(0,40),endorsement_marker='某明星同款')
        payload,_=self.evaluate([marked],[(0,40000,'P1')],{0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')
        self.assertEqual(payload['segments'][0]['endorsement_marker'],'')

    def test_unsubstantiated_borrowed_claim_is_audited(self):
        payload,_=self.evaluate([item(0,40,'mixed_voiceover','borrowed_endorsement')],
            [(0,40000,'P1')],{0:'demonstration'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_boundary_sliver_does_not_hide_a_long_uninterrupted_presenter(self):
        payload,_=self.evaluate([item(0,54.6,'mixed_voiceover','borrowed_endorsement')],
            [(0,54200,'P1'),(54200,54600,'P2')],{0:'borrowed_recommendation'})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_next_shot_boundary_sliver_does_not_relabel_whole_presenter(self):
        planned=plan({'segments':[item(0,40.3)]},KEYS,100000)
        f,o=facts([(0,40000,'P1'),(40000,40300,'P2')]);o['shots'][-1]['role']='borrowed_recommendation'
        payload,_=apply(planned,f,o,{'units':[]})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_short_illustration_and_return_do_not_restart_a_qualified_review(self):
        payload,stats=self.evaluate([item(0,50),item(50,61,'mixed_voiceover','montage'),
            item(61,70,'mixed_voiceover'),item(70,82)],
            [(0,50000,'P1'),(50000,61000,'P2'),(61000,70000,'P1'),(70000,82000,'P3')],
            {1:'short_insert',2:'short_insert',3:'demonstration'})
        self.assertEqual([(s['start_sec'],s['end_sec'],s['label_key']) for s in payload['segments']],
                         [(0,70,'live_demo'),(70,82,'live_demo')])
        self.assertEqual(payload['segments'][0]['continuous_end_sec'],50)

    def test_return_does_not_swallow_an_independent_borrowed_recommendation(self):
        payload,_=self.evaluate([item(0,50),item(50,61,'mixed_voiceover','montage'),
            item(61,70,'mixed_voiceover')],
            [(0,50000,'P1'),(50000,61000,'P2'),(61000,70000,'P1')],
            {1:'borrowed_recommendation',2:'short_insert'})
        self.assertEqual(len(payload['segments']),3)
        self.assertEqual(payload['segments'][1]['label_key'],'mixed_voiceover')

    def test_illustration_and_return_in_one_proposed_span_rejoin_same_review(self):
        payload,_=self.evaluate([item(0,50),item(50,70,'mixed_voiceover','montage'),item(70,82)],
            [(0,50000,'P1'),(50000,61000,'P2'),(61000,70000,'P1'),(70000,82000,'P3')],
            {1:'short_insert',2:'demonstration'})
        self.assertEqual([(s['start_sec'],s['end_sec']) for s in payload['segments']],[(0,70),(70,82)])

    def test_actual_source_text_overrides_duration_but_identity_caption_does_not(self):
        for text,kind,expected in [('@明星某某','source','mixed_voiceover'),
                ('某演员 推荐','identity','mixed_voiceover'),
                ('品牌明星推荐官 某某','identity','live_demo'),
                ('品牌明星推荐官 某某','source','live_demo')]:
            with self.subTest(text=text,kind=kind):
                p=plan({'segments':[item(0,40)]},KEYS,100000)
                f,o=facts([(0,40000,'P1')]);o['shots'][0]['role']='borrowed_recommendation'
                o['markers']=[dict(text=text,kind=kind,start_i=0,end_i=0)]
                payload,_=apply(p,f,o,{'units':[]})
                self.assertEqual(payload['segments'][0]['label_key'],expected)

    def test_next_host_rounding_sliver_does_not_hide_return_to_qualified_review(self):
        payload,_=self.evaluate([item(0,50),item(50,70.1,'mixed_voiceover','montage'),item(70.1,83)],
            [(0,50000,'P1'),(50000,61000,'P2'),(61000,70000,'P1'),(70000,83000,'P3')],
            {1:'short_insert',2:'demonstration'})
        self.assertEqual([(s['start_sec'],s['end_sec']) for s in payload['segments']],[(0,70.1),(70.1,83)])

    def test_compact_observation_and_source_scope_are_validated(self):
        payload=decode_observations({'shots':[dict(i=0,p='P1',r=0,l=0)],'markers':[]})
        self.assertEqual(payload['shots'][0]['role'],'presenter')
        with self.assertRaises(ValueError):decode_observations({'shots':[dict(i=0,p='P1',r=True,l=0)],'markers':[]})
        with self.assertRaises(ValueError):decode_observations({'shots':[dict(i=0,p='P1',r=0,l=0)]})
        with self.assertRaises(ValueError):borrowed_frames([dict(index=0)],
            {'markers':[dict(text='@明星某某',kind='source',start_i=0,end_i=9)]})

    def test_news_headline_is_not_source_attribution(self):
        indices=borrowed_frames([dict(index=0)],{'markers':[dict(
            text='化妆师被明星某某反向安利遮瑕液',kind='source',start_i=0,end_i=0)]})
        self.assertEqual(indices,set())

    def test_single_frame_source_caption_does_not_claim_whole_long_shot(self):
        p=plan({'segments':[item(0,30)]},KEYS,100000)
        f,o=facts([(0,30000,'P1'),(0,30000,'P1'),(0,30000,'P1')])
        o['markers']=[dict(text='@明星某某',kind='source',start_i=0,end_i=0)]
        payload,_=apply(p,f,o,{'units':[]})
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_qualified_review_wrapup_can_include_short_product_cards(self):
        payload,stats=self.evaluate([item(0,70),item(70,84,'promotion','other',True)],
            [(0,72000,'P1'),(72000,73000,''),(73000,77000,'P1'),
             (77000,79000,''),(79000,84000,'P1')],{1:'independent_promotion'})
        self.assertEqual(len(payload['segments']),1)
        self.assertEqual(payload['segments'][0]['end_sec'],84)
        self.assertEqual(payload['segments'][0]['continuous_end_sec'],70)
        self.assertTrue(stats['units'][-1]['samePresenterWrapup'])
        self.assertEqual(stats['units'][-1]['longestMs'],5000)

    def test_product_only_or_new_host_promotion_remains_separate(self):
        for tail in [[(70000,84000,'')],[(70000,84000,'P2')]]:
            payload,_=self.evaluate([item(0,70),item(70,84,'promotion','other',True)],
                [(0,70000,'P1')]+tail,{1:'independent_promotion'})
            self.assertEqual(payload['segments'][-1]['label_key'],'promotion')

    def test_single_presenter_in_independent_sales_chapter_is_not_a_demo(self):
        payload,_=self.evaluate([item(0,50),item(50,64,'street_interview','other'),
            item(64,80,'promotion')],[(0,50000,'P1'),(64000,80000,'P1')],
            {2:'independent_promotion'})
        self.assertEqual(payload['segments'][-1]['label_key'],'promotion')

    def test_independent_final_sales_cards_correct_montage_without_relabelling_intro(self):
        payload,_=self.evaluate([item(0,14,'mixed_voiceover','montage'),item(14,54),
            item(54,75,'mixed_voiceover','montage')],
            [(0,14000,''),(14000,54000,'P1'),(54000,60000,''),(60000,68000,'P2'),(68000,75000,'')],
            {0:'independent_promotion',2:'independent_promotion'})
        self.assertEqual([s['label_key'] for s in payload['segments']],
                         ['mixed_voiceover','live_demo','promotion'])

    def test_wrapup_matches_boundary_presenter_not_an_earlier_longest_shot(self):
        payload,_=self.evaluate([item(0,70),item(70,84,'promotion','other',True)],
            [(0,50000,'P2'),(50000,72000,'P1'),(72000,73000,''),
             (73000,77000,'P1'),(77000,79000,''),(79000,84000,'P1')],{1:'independent_promotion'})
        self.assertEqual(len(payload['segments']),1)

    def test_short_unqualified_presenter_cannot_claim_wrapup_exception(self):
        payload,_=self.evaluate([item(0,8),item(8,20,'promotion','other',True)],
            [(0,9000,'P1'),(9000,12000,''),(12000,20000,'P1')],
            {0:'demonstration',1:'independent_promotion'})
        self.assertEqual(payload['segments'][-1]['label_key'],'promotion')
