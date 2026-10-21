import copy
import unittest

from content_production.framework_overlap_repair import fragmented_operations
from content_production.framework_context_coverage import qualified_core_prefixes
from content_production.framework_window_audit import overlay, finalize


def event(a,b,kind,unit='A'):
    return dict(start_ms=a,end_ms=b,kind=kind,unit=unit)


class FragmentedOperations(unittest.TestCase):
    def test_owned_hand_then_conflicting_powder_macro_is_one_observation_target(self):
        left=event(0,8000,'presenter','A')
        hand=dict(event(8000,8500,'own_detail','detail'),visible='hands',action='hand_operation')
        macro=dict(event(8500,12000,'independent_insert',''),visible='product',
                   action='packaging_display',observed_function='product_operation')
        right=event(12000,25000,'presenter','B')
        a=dict(events=[left,hand,macro,right],measured={'runs':[dict(start_ms=12000,qualifies=True)]})
        b=dict(events=[left,dict(hand,unit='A'),dict(macro,kind='own_detail',unit='A'),right],
               measured={'runs':[]})
        self.assertEqual(fragmented_operations([a,b]),[(8000,12000)])
        self.assertEqual(a['events'][2]['kind'],'independent_insert')
        for change in ('unobserved_macro','real_packshot','ingredient_ad','missing_other_owner','gap'):
            x,y=copy.deepcopy(a),copy.deepcopy(b)
            if change=='unobserved_macro':x['events'][2].pop('observed_function')
            if change=='real_packshot':x['events'][2]['observed_function']='packaging_display'
            if change=='ingredient_ad':x['events'][2]['observed_function']='ingredient_ad'
            if change=='missing_other_owner':y['events'][2]['kind']='independent_insert'
            if change=='gap':x['events'][2]['start_ms']+=10
            self.assertEqual(fragmented_operations([x,y]),[],change)

    def test_damaged_operation_tail_only_triggers_bounded_source_observation(self):
        left=event(0,8000,'presenter','A')
        insert=dict(event(8000,8500,'independent_insert',''),visible='hands',action='hand_operation')
        tail=dict(event(8500,12000,'own_detail','detail'),visible='hands',action='hand_operation')
        right=event(12000,25000,'presenter','B')
        a=dict(events=[left,insert,tail,right],measured={'runs':[dict(start_ms=12000,qualifies=True)]})
        b=dict(events=[left,dict(insert,kind='own_detail',unit='Q'),dict(tail,unit='Q'),right],measured={'runs':[]})
        self.assertEqual(fragmented_operations([a,b]),[(8000,12000)])
        self.assertEqual(a['events'][1]['kind'],'independent_insert')
        for change in ('no_conflict','packshot','no_complete_neighbor','short_total','gap'):
            x,y=copy.deepcopy(a),copy.deepcopy(b)
            if change=='no_conflict': y['events'][1]['kind']='independent_insert'
            if change=='packshot': x['events'][1]['action']='packaging_display'
            if change=='no_complete_neighbor': x['measured']['runs'][0]['qualifies']=False
            if change=='short_total': x['events'][0]['start_ms']=3000
            if change=='gap': x['events'][2]['start_ms']+=10
            self.assertEqual(fragmented_operations([x,y]),[],change)

    def test_source_repaired_witness_can_restore_only_its_unchanged_prefix(self):
        patch=dict(start_ms=36000,end_ms=45000,label_key='live_demo',witness=(32000,45000),minimum=10001)
        window=dict(core_start=0,core_end=36000,events=[dict(start_ms=32000,end_ms=38000,
            kind='presenter',unit='local-A',needs_ownership=False)])
        witness=dict(core_start=36000,core_end=72000,events=[],measured={'runs':[
            dict(start_ms=32000,end_ms=45000,qualifies=True,clipped=False)]})
        result=qualified_core_prefixes([patch],[window,witness])
        self.assertEqual([(p['start_ms'],p['end_ms']) for p in result],[(32000,36000)])
        self.assertEqual(result[0]['witness'],(32000,45000))
        self.assertEqual(qualified_core_prefixes([patch],[window]),[])
        for field,value in [('kind','independent_insert'),('needs_ownership',True),('unit','')]:
            changed=dict(window,events=[dict(window['events'][0],**{field:value})])
            self.assertEqual(qualified_core_prefixes([patch],[changed,witness]),[])

    def test_window_seam_cannot_demote_a_complete_review_or_merge_its_next_person(self):
        patches=[dict(start_ms=36000,end_ms=45366,label_key='live_demo',
                      witness=(32733,45366),minimum=10001),
                 dict(start_ms=45366,end_ms=57400,label_key='live_demo',
                      witness=(45366,57400),minimum=10001,preserve_start=True)]
        owner=dict(core_start=0,core_end=36000,events=[event(32733,40300,'presenter')])
        witness=dict(core_start=36000,core_end=72000,events=[],measured={'runs':[
            dict(start_ms=32733,end_ms=45366,qualifies=True,clipped=False)]})
        restored=qualified_core_prefixes(patches,[owner,witness])
        base=[dict(start_ms=0,end_ms=57400,label_key='mixed_voiceover')]
        result=overlay(base,restored+patches,57400)
        result,demotions=finalize(result,dict(liveClaims=[
            dict(start_ms=a,end_ms=b,minimum=10001) for a,b in ((32733,45366),(45366,57400))]))
        self.assertEqual(demotions,0)
        self.assertEqual([(s['start_ms'],s['end_ms'],s['label_key']) for s in result],
            [(0,32733,'mixed_voiceover'),(32733,45366,'live_demo'),(45366,57400,'live_demo')])
        for field,value in [('qualifies',False),('clipped',True),('start_ms',33000),('end_ms',45000)]:
            altered=copy.deepcopy(witness)
            altered['measured']['runs'][0][field]=value
            self.assertEqual(qualified_core_prefixes(patches,[owner,altered]),[])

    def test_source_cut_or_person_change_in_prefix_prevents_restore(self):
        patch=dict(start_ms=36000,end_ms=45000,label_key='live_demo',witness=(32000,45000),minimum=10001)
        events=[event(32000,34000,'presenter','A'),event(34000,38000,'presenter','B')]
        witness=dict(core_start=36000,core_end=72000,events=[],measured={'runs':[
            dict(start_ms=32000,end_ms=45000,qualifies=True,clipped=False)]})
        self.assertEqual(qualified_core_prefixes([patch],
            [dict(core_start=0,core_end=36000,events=events),witness]),[])


if __name__ == '__main__':
    unittest.main()
