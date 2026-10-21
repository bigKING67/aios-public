import copy
import unittest

from content_production import framework_short_review as review
from content_production.framework_window_audit import finalize
from content_production.framework_review_membership import supported_core


class ShortReviewTests(unittest.TestCase):
    def fixture(self):
        run = dict(start_ms=10000,end_ms=18500,unit='u1',people=['p1'],clipped=False,
                   allow_tolerance=True,ambiguous=False,qualifies=False)
        event = dict(start_ms=10000,end_ms=18500,unit='u1',person='p1',kind='presenter',
                     visible='person',action='personal_application',needs_ownership=False)
        window = dict(start=0,end=30000,measured=dict(runs=[run]),events=[event])
        segments = [dict(start_ms=0,end_ms=30000,label_key='mixed_voiceover',confidence=.9,reason='source')]
        return segments,[window]

    def observation(self,target,status='complete_demonstration'):
        return dict(target,payload=dict(visible_person='同人',action_flow='亲自涂抹',ending_evidence='效果展示',
            neighbor_relation='独立演示',status=status,continuous_person=True,personal_demonstration=True))

    def test_positive_observation_creates_exact_witness_not_ten_second_credit(self):
        segments,windows = self.fixture()
        targets = review.plan(segments,windows,30000)
        result,claims,corrections = review.apply(segments,[],targets,[self.observation(targets[0])])
        self.assertEqual([(s['start_ms'],s['end_ms'],s['label_key']) for s in result],
                         [(0,10000,'mixed_voiceover'),(10000,18500,'live_demo'),(18500,30000,'mixed_voiceover')])
        self.assertEqual(claims[0]['minimum'],8500)
        self.assertEqual(finalize(result,dict(liveClaims=claims))[1],0)
        self.assertFalse(supported_core(result[1],claims))
        result[1]['end_ms']-=1
        self.assertEqual(finalize(result,dict(liveClaims=claims))[1],1)
        self.assertEqual(len(corrections),1)

    def test_incomplete_or_interrupted_observation_cannot_qualify(self):
        segments,windows=self.fixture(); targets=review.plan(segments,windows,30000)
        for status in ('partial_excerpt','interrupted_source','uncertain'):
            self.assertEqual(review.apply(segments,[],targets,[self.observation(targets[0],status)]), (segments,[],[]))
        proof=self.observation(targets[0]); proof['payload']['personal_demonstration']=False
        self.assertEqual(review.apply(segments,[],targets,[proof]),(segments,[],[]))

    def test_return_after_insert_and_multiple_people_cannot_be_candidates(self):
        segments,windows=self.fixture()
        interrupted=copy.deepcopy(windows)
        interrupted[0]['measured']['runs'].append(dict(start_ms=0,end_ms=7000,unit='u1',people=['p1']))
        self.assertEqual(review.plan(segments,interrupted,30000),[])
        barrier=copy.deepcopy(windows)
        barrier[0]['measured']['runs'].append(dict(start_ms=9000,end_ms=10000,unit='',people=[]))
        self.assertEqual(review.plan(segments,barrier,30000),[])
        conflict=copy.deepcopy(windows)
        conflict[0]['measured']['runs'][0]['people'].append('p2')
        self.assertEqual(review.plan(segments,conflict,30000),[])

    def foreign_person_fixture(self):
        segments,windows=self.fixture()
        windows[0]['measured']['runs'][0]['end_ms']=19766
        windows[0]['events'][0]['end_ms']=19766
        windows[0]['measured']['runs'].insert(0,dict(start_ms=0,end_ms=10000,unit='',
            people=[],clipped=False,ambiguous=False,allow_tolerance=True,qualifies=False))
        windows[0]['events'].insert(0,dict(start_ms=0,end_ms=10000,unit='',person='p0',
            kind='independent_insert',visible='person',needs_ownership=False,subject_conflict=False))
        return segments,windows

    def test_near_ten_second_review_after_a_foreign_person_gets_a_bound_check(self):
        segments,windows=self.foreign_person_fixture()
        # Runs carry encoded source-unit identities; events carry this
        # window's raw person IDs. Never compare the two representations.
        for run in windows[0]['measured']['runs']:
            run['people']=['["person", "'+p+'"]' for p in run['people']]
        targets=review.plan(segments,windows,30000)
        self.assertEqual([(t['start_ms'],t['end_ms']) for t in targets],[(10000,19766)])
        for status in ('partial_excerpt','interrupted_source','uncertain'):
            self.assertEqual(review.apply(segments,[],targets,[self.observation(targets[0],status)]),
                             (segments,[],[]))
        output,claims,_=review.apply(segments,[],targets,[self.observation(targets[0])])
        self.assertEqual([(s['start_ms'],s['end_ms']) for s in output if s['label_key']=='live_demo'],
                         [(10000,19766)])
        self.assertEqual(claims[0]['minimum'],9766)

    def test_foreign_person_exception_rejects_same_unknown_or_incomplete_neighbor(self):
        for problem in ('same_person','ambiguous','clipped','unknown','ownership','missing_frame'):
            segments,windows=self.foreign_person_fixture()
            neighbor=windows[0]['measured']['runs'][0]
            event=windows[0]['events'][0]
            if problem=='same_person':
                neighbor['people']=['p1'];event['person']='p1'
            elif problem in ('ambiguous','clipped'):
                neighbor[problem]=True
            elif problem=='unknown':
                event['kind']='unknown'
            elif problem=='ownership':
                event['needs_ownership']=True
            else:
                event['end_ms']-=1
            self.assertEqual(review.plan(segments,windows,30000),[],problem)

    def test_clipped_conflicting_or_protected_source_not_reopened(self):
        segments,windows=self.fixture()
        for field in ('clipped','ambiguous'):
            invalid=copy.deepcopy(windows);invalid[0]['measured']['runs'][0][field]=True
            self.assertEqual(review.plan(segments,windows+invalid,30000),[])
        windows[0]['measured']['runs'][0]['allow_tolerance']=False
        self.assertEqual(review.plan(segments,windows,30000),[])
        segments,windows=self.fixture();segments[0]['label_key']='promotion'
        self.assertEqual(review.plan(segments,windows,30000),[])

    def test_bound_evidence_does_not_move_target_or_accept_incomplete_payload(self):
        segments,windows=self.fixture();targets=review.plan(segments,windows,30000)
        proof=self.observation(targets[0]);proof['end_ms']+=100
        with self.assertRaises(ValueError): review.apply(segments,[],targets,[proof])
        proof=self.observation(targets[0]);proof['payload'].pop('ending_evidence')
        with self.assertRaises(ValueError): review.apply(segments,[],targets,[proof])


if __name__=='__main__':
    unittest.main()
