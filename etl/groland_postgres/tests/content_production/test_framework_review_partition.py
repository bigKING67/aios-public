import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_review_partition as partition
from content_production.framework_window_audit import finalize


def fixture():
    def segment(a,b,label='live_demo'):
        return dict(start_ms=a,end_ms=b,label_key=label,confidence=.9,reason='observed source')
    events=[dict(start_ms=a,end_ms=b,unit='review',kind=k,person=p,action=action,
                 needs_ownership=False,appearance=f'actual source {p or "hands"}')
            for a,b,k,p,action in [(0,4200,'presenter','host','talking_demo'),
                                  (4200,7233,'own_detail','','hand_operation'),
                                  (7233,14333,'presenter','other','personal_application'),
                                  (14333,16967,'presenter','return','talking_demo')]]
    events[-1]['unit']='return'
    windows=[dict(start=0,end=20000,events=events)]
    segments=[segment(0,14333),segment(14333,16967),segment(16967,20000,'street_interview')]
    return segments,windows,[dict(start_ms=0,end_ms=14333,minimum=10001)]


def observation(target,group='assembled_recommendation'):
    roles=['review_origin','borrowed_support','borrowed_support','origin_return']
    return dict(target,payload=dict(group=group,evidence='actual sources and their relationship',
        observations=[dict(index=i,role=role,appearance=e['appearance'],
                           source_evidence='visible original source and actual narration',
                           own_speech='observed' if i==0 else 'not_applicable')
                      for i,(e,role) in enumerate(zip(target['events'],roles))]))


class ReviewPartitionTests(unittest.TestCase):
    def test_cross_person_operation_selects_source_parts_and_short_return(self):
        segments,windows,_=fixture()
        targets=partition.plan(segments,windows)
        self.assertEqual(len(targets),1)
        self.assertEqual((targets[0]['start_ms'],targets[0]['end_ms']),(0,16967))
        self.assertEqual([(e['start_ms'],e['end_ms']) for e in targets[0]['events']],
                         [(0,4200),(4200,7233),(7233,14333),(14333,16967)])

    def test_same_person_own_operations_do_not_trigger_extra_partition(self):
        segments,windows,_=fixture()
        windows[0]['events'][2]['person']='host'
        self.assertEqual(partition.plan(segments,windows),[])

    def test_borrowed_parts_cannot_keep_a_pooled_claim_or_promote_closing_return(self):
        segments,windows,claims=fixture()
        targets=partition.plan(segments,windows)
        result,revised,receipt=partition.apply(segments,claims,targets,[observation(targets[0])])
        self.assertEqual(revised,[])
        self.assertEqual([(s['start_ms'],s['end_ms'],s['label_key']) for s in result],
                         [(0,4200,'live_demo'),(4200,16967,'mixed_voiceover'),(16967,20000,'street_interview')])
        final,corrections=finalize(result,dict(liveClaims=revised,reviewPartition=receipt))
        self.assertEqual(corrections,0)
        self.assertEqual(final,result)
        # Without actual source-excerpt proof the 4.2s fragment still fails.
        self.assertEqual(finalize(result,dict(liveClaims=revised))[0][0]['label_key'],'mixed_voiceover')

    def test_real_cooperative_review_is_preserved_without_duration_changes(self):
        segments,windows,claims=fixture()
        targets=partition.plan(segments,windows)
        proof=observation(targets[0],group='single_review')
        for row in proof['payload']['observations']: row['role']='own_step'
        result,revised,receipt=partition.apply(segments,claims,targets,[proof])
        self.assertEqual(result,segments)
        self.assertEqual(revised,claims)
        self.assertFalse(receipt['corrections'])

    def test_topic_only_or_unknown_original_speech_cannot_certify_short_excerpt(self):
        segments,windows,claims=fixture()
        target=partition.plan(segments,windows)[0]
        for speech in ['uncertain','not_applicable']:
            proof=observation(target);proof['payload']['observations'][0]['own_speech']=speech
            with self.assertRaisesRegex(ValueError,'original speech'):
                partition.apply(segments,claims,[target],[proof])

    def test_foreign_picture_or_shifted_boundary_cannot_borrow_excerpt_proof(self):
        segments,windows,claims=fixture()
        target=partition.plan(segments,windows)[0]
        result,claims,receipt=partition.apply(segments,claims,[target],[observation(target)])
        for segment in [dict(result[0],end_ms=7233),dict(result[0],start_ms=1),result[1]]:
            self.assertFalse(partition.supports(segment,dict(reviewPartition=receipt)))

    def test_incomplete_duplicate_stale_and_uncertain_observations_fail(self):
        segments,windows,claims=fixture();target=partition.plan(segments,windows)[0]
        for change in ['missing','duplicate','stale','uncertain']:
            proof=observation(target)
            if change=='missing': proof['payload']['observations'].pop()
            if change=='duplicate': proof['payload']['observations'][1]['index']=0
            if change=='stale': proof['end_ms']+=1
            if change=='uncertain': proof['payload']['group']='uncertain'
            with self.assertRaises(ValueError): partition.apply(segments,claims,[target],[proof])
        self.assertEqual(segments,fixture()[0])

    def test_gap_or_unresolved_source_does_not_invent_partition_edges(self):
        segments,windows,_=fixture()
        for change in ['gap','uncertain']:
            actual=copy.deepcopy(windows)
            if change=='gap': actual[0]['events'][1]['start_ms']+=1
            else: actual[0]['events'][1]['needs_ownership']=True
            self.assertEqual(partition.plan(segments,actual),[])
