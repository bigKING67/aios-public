import copy
import unittest

from content_production import framework_offer_tail as module


def target():
    return dict(index=1,start_ms=9000,end_ms=40000,context_start_ms=0)


def proof(roles):
    intervals=[dict(start_ms=a,end_ms=b) for a,b in [(9000,11000),(11000,14000),(14000,18000)]]
    return dict(target(),intervals=intervals,payload={'items':[
        dict(index=i,role=role,words='原片台词',evidence='具体购买利益或独立内容依据')
        for i,role in enumerate(roles)]})


class OfferTailTests(unittest.TestCase):
    def test_verified_offer_and_nearby_product_evidence_required(self):
        segments=[dict(start_ms=0,end_ms=9000,label_key='promotion'),
                  dict(start_ms=9000,end_ms=40000,label_key='mixed_voiceover')]
        promotion={'payload':{'items':[dict(index=0,role='independent_offer')]}}
        windows=[{'events':[dict(start_ms=11000,end_ms=13000,action='packaging_display',visible='product')]}]
        self.assertEqual(module.plan(segments,promotion,windows),[target()])
        self.assertEqual(module.plan(segments,{},windows),[])
        self.assertEqual(module.plan(segments,promotion,[]),[])
        windows[0]['events'][0].update(start_ms=30000,end_ms=32000)
        self.assertEqual(module.plan(segments,promotion,windows),[])

    def test_only_contiguous_positive_prefix_extends(self):
        p=proof(['same_offer','other_content','same_offer'])
        self.assertEqual(module.extension(target(),p),(11000,False))
        p=proof(['other_content','same_offer','same_offer'])
        self.assertEqual(module.extension(target(),p),(9000,False))

    def test_unknown_does_not_swallow_remaining_montage(self):
        self.assertEqual(module.extension(target(),proof(['same_offer','uncertain','same_offer'])),(11000,True))

    def test_interval_binding_and_complete_index_mapping(self):
        original=proof(['same_offer','same_offer','other_content'])
        for change in ('gap','wrong_target','missing','duplicate','out_of_budget'):
            p=copy.deepcopy(original)
            if change=='gap':p['intervals'][1]['start_ms']+=1
            elif change=='wrong_target':p['start_ms']+=1
            elif change=='missing':p['payload']['items'].pop()
            elif change=='duplicate':p['payload']['items'][-1]['index']=0
            else:p['intervals'][-1]['end_ms']=30000
            with self.assertRaises(ValueError,msg=change):module.extension(target(),p)

    def test_price_claim_without_actual_words_cannot_extend(self):
        p=proof(['same_offer','same_offer','other_content'])
        p['payload']['items'][0]['words']=''
        with self.assertRaises(ValueError):module.extension(target(),p)

    def test_no_source_cuts_means_no_new_boundary(self):
        self.assertEqual(module.extension(target(),dict(target(),intervals=[],payload=None)),(9000,False))

    def test_transition_frames_collapse_to_an_actual_peak_not_average(self):
        values=[(10100,.7),(10133,.2),(10200,.3),(10600,.5),(11000,.02),(22000,.8)]
        self.assertEqual(module.strong_cuts(values,9000),[10100,10600])


if __name__ == '__main__':
    unittest.main()
