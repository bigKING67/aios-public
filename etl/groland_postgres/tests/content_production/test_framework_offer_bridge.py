import copy
import unittest

from content_production import framework_offer_bridge as bridge


class OfferContextTests(unittest.TestCase):
    def setUp(self):
        self.segments=[dict(start_ms=a,end_ms=b,label_key=label) for a,b,label in
            [(0,6000,'promotion'),(6000,16000,'mixed_voiceover'),(16000,19000,'promotion')]]
        self.payload=dict(items=[dict(index=0,role='independent_offer',linked_index=-1),
            dict(index=1,role='recommendation_material',linked_index=-1),
            dict(index=2,role='dependent_offer_content',linked_index=0)])

    def test_enclosed_illustration_requires_actual_ownership_before_promotion(self):
        groups=bridge.plan(self.segments,self.payload)
        self.assertEqual(len(groups),1)
        separated=bridge.apply(self.segments,groups[0],dict(relationship='separate_content',evidence='New review starts'))
        self.assertEqual(separated,self.segments)
        joined=bridge.apply(self.segments,groups[0],dict(relationship='one_offer',evidence='Same offer illustrated then closed'))
        self.assertEqual([s['label_key'] for s in joined],['promotion']*3)
        self.assertEqual([(s['start_ms'],s['end_ms']) for s in joined],[(0,6000),(6000,16000),(16000,19000)])
        self.assertEqual(self.segments[1]['label_key'],'mixed_voiceover')

    def test_far_activity_or_intervening_review_is_not_absorbed(self):
        for label in ('live_demo','street_interview'):
            segments=copy.deepcopy(self.segments);segments[1]['label_key']=label
            self.assertEqual(bridge.plan(segments,self.payload),[])
        segments=copy.deepcopy(self.segments);segments[1]['end_ms']=26000;segments[2].update(start_ms=26000,end_ms=29000)
        self.assertEqual(bridge.plan(segments,self.payload),[])
        segments=copy.deepcopy(self.segments);segments[1]['start_ms']+=1
        self.assertEqual(bridge.plan(segments,self.payload),[])
        payload=copy.deepcopy(self.payload);payload['items'][2]['linked_index']=1
        self.assertEqual(bridge.plan(self.segments,payload),[])

    def test_unresolved_context_cannot_turn_into_success(self):
        group=bridge.plan(self.segments,self.payload)[0]
        for proof in ({},dict(relationship='uncertain',evidence='Not enough detail'),
                      dict(relationship='one_offer',evidence='')):
            with self.assertRaisesRegex(ValueError,'Unresolved'):
                bridge.apply(self.segments,group,proof)


if __name__=='__main__':
    unittest.main()
