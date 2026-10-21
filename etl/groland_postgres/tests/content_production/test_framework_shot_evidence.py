import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_shot_evidence import continuous_runs


def observe(intervals, roles):
    frames=[dict(index=i,start_ms=a,end_ms=b) for i,(a,b) in enumerate(intervals)]
    values=[]
    for i,(role,person,link) in enumerate(roles):
        values.append(dict(index=i,role=role,visible_person_id=person,visible_link=link,evidence='visible fact'))
    return frames, {'shots':values}


PERSON=('presenter','P1','same_person_visible')
AD=('product_ad','','none')
HAND=('hands_product','','none')
OWN=('hands_product','','matching_clothing_or_setting')


class ShotEvidenceTests(unittest.TestCase):
    def test_insert_resets_continuity_even_if_presenter_returns(self):
        f,p=observe([(0,7000),(7000,9000),(9000,18567),(18567,20000),(20000,22000)],
                    [PERSON,AD,PERSON,HAND,PERSON])
        result=continuous_runs(f,p)
        self.assertEqual(result['longest_ms'],9567)
        self.assertFalse(result['qualifies_duration'])
        self.assertEqual(len(result['barriers']),2)

    def test_own_matched_detail_does_not_reset(self):
        f,p=observe([(0,7000),(7000,9000),(9000,16000)],[PERSON,OWN,PERSON])
        self.assertEqual(continuous_runs(f,p)['longest_ms'],16000)

    def test_same_product_alone_does_not_establish_ownership(self):
        f,p=observe([(0,7000),(7000,9000),(9000,16000)],[PERSON,HAND,PERSON])
        self.assertEqual(continuous_runs(f,p)['longest_ms'],7000)

    def test_different_people_and_source_gaps_do_not_accumulate(self):
        for f,p in [observe([(0,8000),(8000,16000)],[PERSON,('presenter','P2','same_person_visible')]),
                    observe([(0,8000),(9000,17000)],[PERSON,PERSON])]:
            self.assertEqual(continuous_runs(f,p)['longest_ms'],8000)

    def test_exact_ten_seconds_is_not_enough(self):
        f,p=observe([(0,10000)],[PERSON]);self.assertFalse(continuous_runs(f,p)['qualifies_duration'])

    def test_missing_duplicate_or_invented_face_evidence_fails(self):
        f,p=observe([(0,8000),(8000,16000)],[PERSON,HAND])
        for observations in [p['shots'][:1], [p['shots'][0],p['shots'][0]],
                             [p['shots'][0],dict(p['shots'][1],visible_person_id='P1')]]:
            with self.assertRaises(ValueError):continuous_runs(f,{'shots':observations})

    def test_multiple_frames_in_one_shot_cannot_double_its_duration(self):
        f,p=observe([(0,6000),(0,6000)],[PERSON,PERSON])
        self.assertEqual(continuous_runs(f,p)['longest_ms'],6000)
        p['shots'][1].update(role='product_ad',visible_person_id='',visible_link='none')
        self.assertEqual(continuous_runs(f,p)['longest_ms'],0)
