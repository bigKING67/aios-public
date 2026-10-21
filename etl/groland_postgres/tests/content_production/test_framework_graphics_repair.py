import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
from types import SimpleNamespace
from content_production import framework_review_graphics as graphics
from content_production.segment_suggestion_contract import snap_boundaries

class GraphicsRepair(unittest.TestCase):
    def events(self,tail=15000):
        return [dict(start_ms=0,end_ms=2000,kind='presenter',unit='A',review_unit='R'),
                dict(start_ms=2000,end_ms=2700,kind='other',unit='',review_unit='R'),
                dict(start_ms=2700,end_ms=tail,kind='own_detail',unit='A',review_unit='R')]

    def run_check(self,role,events):
        request=Mock(return_value=SimpleNamespace(payload=dict(role=role,graphic_overlay='large_graphics' if role=='presenter_overlay' else 'none',same_review=True,left_action='introduces test',right_action='does test',evidence='source graphics'),usage={},response_id='id'))
        with tempfile.TemporaryDirectory()as root,patch.object(graphics,'run_media',return_value=0):
            result=graphics.repair(events,Path('source'),Path(root),{},lambda:None,request)
        return result,request

    def test_title_extends_label_but_never_qualifying_duration(self):
        result,_=self.run_check('review_title',self.events())
        self.assertEqual(result[1]['unit'],'')
        self.assertEqual(result[1]['kind'],'independent_insert')
        self.assertEqual(result[1]['intro_unit'],'A')

    def test_only_visible_overlay_restores_recording_continuity(self):
        result,_=self.run_check('presenter_overlay',self.events())
        self.assertEqual((result[1]['kind'],result[1]['unit']),('own_detail','A'))
        for role in ['independent_insert','uncertain']:
            result,_=self.run_check(role,self.events())
            self.assertEqual(result,self.events())

    def test_short_fragments_are_not_joined(self):
        result,request=self.run_check('presenter_overlay',self.events(tail=11000))
        self.assertEqual(result,self.events(tail=11000));request.assert_not_called()

    def test_verified_boundary_nearest_cut_not_largest_visual_change(self):
        rows=[dict(start_ms=0,end_ms=18000),dict(start_ms=18000,end_ms=30000)]
        cuts={18000:[(17233,.7),(18566,.4)]}
        old,_=snap_boundaries(rows,cuts,500)
        new,_=snap_boundaries(rows,cuts,500,prefer_nearest=True)
        self.assertEqual(old[0]['end_ms'],17233)
        self.assertEqual(new[0]['end_ms'],18566)
