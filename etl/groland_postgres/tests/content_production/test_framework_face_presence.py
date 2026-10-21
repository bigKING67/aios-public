import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_face_presence import reconcile
from content_production.framework_shot_evidence import continuous_runs


class FacePresenceTests(unittest.TestCase):
    def test_positive_face_resolves_only_hand_claim_without_inventing_identity(self):
        frames=[dict(index=0,start_ms=0,end_ms=12000,face_boxes=[[20,100,220,220]])]
        original=dict(index=0,role='hands_product',visible_person_id='P1',
                      visible_link='matching_clothing_or_setting',evidence='only hands')
        payload,changes=reconcile(frames,{'shots':[original]})
        self.assertEqual(continuous_runs(frames,payload)['longest_ms'],12000)
        self.assertEqual(original['role'],'hands_product')
        self.assertTrue(changes[0]['localFacePositive'])

    def test_no_positive_face_removes_hand_identity_not_a_proven_face(self):
        frame=dict(index=0,start_ms=0,end_ms=12000,face_boxes=[])
        hand=dict(index=0,role='hands_product',visible_person_id='P1',
                  visible_link='same_person_visible',evidence='hand')
        payload,_=reconcile([frame],{'shots':[hand]})
        self.assertEqual(continuous_runs([frame],payload)['longest_ms'],0)
        face=dict(hand,role='presenter')
        payload,_=reconcile([frame],{'shots':[face]})
        self.assertEqual(continuous_runs([frame],payload)['longest_ms'],12000)

    def test_product_ad_false_positive_does_not_manufacture_person(self):
        frame=dict(index=0,start_ms=0,end_ms=12000,face_boxes=[[20,100,220,220]])
        ad=dict(index=0,role='product_ad',visible_person_id='',visible_link='none',evidence='ingredients')
        payload,_=reconcile([frame],{'shots':[ad]})
        self.assertEqual(continuous_runs([frame],payload)['longest_ms'],0)
