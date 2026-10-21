import unittest

from content_production.framework_overlap_repair import apply, conflicts, direction_conflicts


def event(a, b, kind, unit='A'):
    return dict(start_ms=a, end_ms=b, kind=kind, unit=unit)


class OverlapRepairTests(unittest.TestCase):
    def test_shared_preparation_does_not_join_talker_and_demonstrator(self):
        windows=[dict(events=[event(0,8000,'presenter','talker'),event(8000,8300,'own_detail','talker'),
                             event(8300,22000,'presenter','demo')])]
        proof=dict(middle_visible='hands',middle_function='product_operation',middle_owner='both',
                   middle_action='按压取粉',left_flow='仅介绍产品',right_flow='独立上脸操作',
                   outer_relation='same_review',left_demonstrates=False,right_demonstrates=True)
        result=apply(windows,(8000,8300),proof,anchors=[4000,10000])[0]['events']
        self.assertEqual([e['unit'] for e in result],['talker','demo','demo'])
        # A context window may not contain the unused talker's photo. The
        # selected demonstrator still must be visible at the bound source time.
        cropped=[dict(events=windows[0]['events'][1:])]
        result=apply(cropped,(8000,8300),proof,anchors=[4000,10000])[0]['events']
        self.assertEqual(result[0]['unit'],'demo')
        with self.assertRaisesRegex(ValueError,'local operation owner'):
            apply(cropped,(8000,8300),proof,anchors=[4000,30000])

    def test_bound_source_anchor_does_not_drift_to_next_windows_presenter(self):
        windows=[dict(events=[event(0,4000,'presenter','A'),event(4000,5000,'own_detail','B'),
                             event(5000,6000,'own_detail','A'),event(6000,15000,'presenter','B')]),
                 dict(events=[event(0,4000,'presenter','P7'),event(4000,5000,'own_detail','P7'),
                             event(5000,6000,'presenter','P7'),event(6000,15000,'presenter','P8')])]
        proof=dict(middle_visible='person',middle_function='skin_comparison',middle_owner='both',
                   middle_action='展示本次皮肤问题',left_flow='同一人开始测评',right_flow='该人继续',
                   outer_relation='same_review',left_demonstrates=False,right_demonstrates=False)
        result=apply(windows,(4000,5000),proof,anchors=[2000,5500])
        self.assertEqual([w['events'][1]['unit'] for w in result],['A','P7'])
        self.assertEqual(direction_conflicts(result),[])

    def test_conflicting_owners_use_anchor_positions_not_local_ids(self):
        a=dict(events=[event(0,5000,'presenter','A'),event(5000,6000,'own_detail','B'),
                       event(6000,15000,'presenter','B')])
        b=dict(events=[event(0,5000,'presenter','B'),event(5000,6000,'own_detail','B'),
                       event(6000,15000,'presenter','A')])
        self.assertEqual(direction_conflicts([a,b]),[(5000,6000)])
        b['events'][1]['unit']='A'
        self.assertEqual(direction_conflicts([a,b]),[])

    def test_inactive_role_conflict_does_not_reopen_an_already_mixed_region(self):
        a=dict(events=[event(0,5000,'independent_insert','')])
        b=dict(events=[event(0,5000,'own_detail','A')])
        self.assertEqual(conflicts([a,b],[(10000,20000)]),[])

    def test_different_subdivision_does_not_hide_conflicting_source_ownership(self):
        windows = [dict(events=[event(0,10000,'presenter'), event(10000,10500,'independent_insert',''),
                               event(10500,11200,'independent_insert',''), event(11200,20000,'presenter','B')]),
                   dict(events=[event(0,10000,'presenter','P7'), event(10000,11200,'own_detail','P7'),
                               event(11200,20000,'presenter','P8')])]
        self.assertEqual(conflicts(windows), [(10000,11200)])
        proof = dict(middle_visible='hands', middle_function='packaging_display', middle_owner='neither',
                     middle_action='外部布景中的包装展示', left_flow='主讲结束', right_flow='另一个来源',
                     outer_relation='independent_reviews', left_demonstrates=False, right_demonstrates=False)
        out = apply(windows, (10000,11200), proof)
        self.assertEqual(conflicts(out), [])
        self.assertEqual(out[1]['events'][1]['kind'], 'independent_insert')
        self.assertEqual(out[1]['events'][1]['unit'], '')
        self.assertEqual(windows[1]['events'][1]['kind'], 'own_detail')

    def test_uncertain_ownership_and_mismatched_presenter_are_not_resolved_by_voting(self):
        proof = dict(middle_visible='hands', middle_function='product_operation', middle_owner='uncertain',
                     middle_action='按压', left_flow='左', right_flow='右', outer_relation='uncertain',
                     left_demonstrates=False, right_demonstrates=False)
        with self.assertRaises(ValueError): apply([], (10000,11200), proof)
        proof['middle_owner'] = 'neither'
        with self.assertRaisesRegex(ValueError, 'presenter'):
            apply([dict(events=[event(10000,11200,'presenter')])], (10000,11200), proof)

    def test_own_detail_only_disagreement_does_not_create_a_false_insert(self):
        self.assertEqual(conflicts([dict(events=[event(0,12000,'own_detail')]),
                                    dict(events=[event(0,12000,'presenter')])]), [])


if __name__ == '__main__':
    unittest.main()
