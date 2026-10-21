import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from content_production import framework_operation_provenance as provenance
from content_production import framework_editorial_audit as audit
from content_production.segment_suggestion_provider import ProviderResult
from test_framework_editorial_audit import proof, planned, segment

class ProvenanceRepair(unittest.TestCase):
    def test_semantic_comparison_cannot_override_different_source(self):
        original=dict(middle_visible='person',middle_function='skin_comparison',middle_owner='left')
        for left,right,expected in [('no','no','neither'),('uncertain','no','left'),('yes','no','left')]:
            payload={'left_anchor':'left source','right_anchor':'right source','observations':[dict(index=0,target_image_position=2,target_face_extent='full_face',left_person_match=left,right_person_match=right,evidence='visible source comparison')]}
            request=Mock(return_value=ProviderResult(payload,{},'id'))
            with tempfile.TemporaryDirectory() as root:
                result=provenance.check([original],[Path('a'),Path('b'),Path('c')],Path(root),request)
            self.assertEqual(result[0]['middle_owner'],expected)
            self.assertEqual(original['middle_owner'],'left')

    def test_physical_difference_is_not_overridden_by_shared_semantic_review(self):
        from content_production import framework_review_ownership as own
        events=[dict(start_ms=0,end_ms=4000,kind='presenter',unit='A',review_unit='R'),
                dict(start_ms=4000,end_ms=6000,kind='own_detail',unit='A',review_unit='R',action='skin_comparison'),
                dict(start_ms=6000,end_ms=15000,kind='presenter',unit='A',review_unit='R')]
        proof=dict(middle_visible='person',middle_action='different model comparison',middle_function='skin_comparison',
            middle_owner='neither',outer_relation='same_review',left_flow='host',right_flow='host',
            left_demonstrates=False,right_demonstrates=False,physical_source_different=True)
        result,joins=own.repair(events,lambda *_:proof)
        self.assertEqual((result[1]['kind'],result[1]['unit']),('independent_insert',''))
        self.assertFalse(joins)

    def test_sparse_event_indices_are_bound_by_exact_attachment_positions(self):
        original=dict(middle_visible='person',middle_function='skin_comparison',middle_owner='left')
        skipped=dict(original,middle_visible='hands')
        values=[dict(index=i,target_image_position=i+2,target_face_extent='full_face',left_person_match='no',right_person_match='no',evidence='different full face')for i in range(2)]
        request=Mock(return_value=ProviderResult({'left_anchor':'left source','right_anchor':'right source','observations':values},{},'id'))
        with tempfile.TemporaryDirectory()as root:
            output=provenance.check([skipped,skipped,original,original],[Path(str(i))for i in range(6)],Path(root),request)
        self.assertEqual([v['middle_owner']for v in output],['left','left','neither','neither'])
        values[1]['target_image_position']=2
        with tempfile.TemporaryDirectory()as root,self.assertRaisesRegex(ValueError,'Incomplete'):
            provenance.check([skipped,skipped,original,original],[Path(str(i))for i in range(6)],Path(root),request)

    def test_wear_result_also_checks_visible_subject_before_borrowing_duration(self):
        values=[dict(middle_visible='person',middle_function='wear_result',middle_owner='left')]
        request=Mock(return_value=ProviderResult({'left_anchor':'left source','right_anchor':'right source',
            'observations':[dict(index=0,target_image_position=2,target_face_extent='full_face',
                left_person_match='no',right_person_match='no',evidence='different full face')]},{},'id'))
        with tempfile.TemporaryDirectory()as root:
            output=provenance.check(values,[Path('a'),Path('b'),Path('c')],Path(root),request)
        self.assertEqual(output[0]['middle_owner'],'neither')
        self.assertTrue(output[0]['physical_source_different'])

    def test_long_opening_requires_full_source_extent(self):
        rows=[segment(0,4000,'mixed_voiceover'),segment(4000,80000)]
        items=planned(rows,80000)
        proofs=[proof(opening='montage_sequence'),proof(),proof()]
        full=dict(start_ms=0,target_start_ms=4000,end_ms=80000,
                  payload=dict(target_role='independent_review',evidence='whole process is independent'))
        output,_=audit.apply(rows,items,proofs,complete_opening={1:full})
        self.assertEqual(output,rows)
        self.assertEqual(proofs[0]['opening_link'],'montage_sequence')
        with self.assertRaisesRegex(ValueError,'checked context'):
            audit.apply(rows,items,proofs,complete_opening={1:dict(full,end_ms=40000)})
        full['payload']['target_role']='assembled_support'
        output,_=audit.apply(rows,items,proofs,complete_opening={1:full})
        self.assertEqual([(x['start_ms'],x['end_ms'],x['label_key'])for x in output],[(0,80000,'mixed_voiceover')])

    def test_application_eye_is_not_exempt_from_source_check_by_a_hand_role(self):
        values=[dict(middle_visible='hands',middle_function='product_operation',middle_owner='left')]
        evidence=dict(index=0,target_image_position=2,target_face_extent='partial_face',
                      left_person_match='no',right_person_match='no',evidence='different visible eyebrow and eye structure')
        response=ProviderResult(dict(left_anchor='left face',right_anchor='right face',observations=[evidence]),{},'id')
        with tempfile.TemporaryDirectory()as root:
            result=provenance.check(values,[Path('a'),Path('b'),Path('c')],Path(root),Mock(return_value=response),
                source_events=[dict(action='application_detail',source_role_reobserved=True)])
        self.assertEqual(result[0]['middle_visible'],'person')
        self.assertTrue(result[0]['physical_source_different'])
        evidence['left_person_match']=evidence['right_person_match']='uncertain'
        with tempfile.TemporaryDirectory()as root:
            result=provenance.check([dict(values[0],middle_visible='person')],
                [Path('a'),Path('b'),Path('c')],Path(root),Mock(return_value=response))
        self.assertEqual(result[0]['middle_owner'],'left')
        self.assertNotIn('physical_source_different',result[0])
