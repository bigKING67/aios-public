import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
import unittest
from content_production import framework_context_observations as context
class OverlayTests(unittest.TestCase):
 def proof(self):return dict(kinds=['presenter','other','other'],left_to_middle='same_review',middle_to_right='same_review',presenter_overlay_1=False,presenter_overlay_2=True,presenter_overlay_3=True)
 def test_graphic_cover_preserves_observed_underlying_presenter(self):
  self.assertEqual(context.normalize(self.proof())['kinds'],['presenter']*3)
 def test_real_insert_is_not_bridged_by_same_voice_or_unknown_views(self):
  p=self.proof();p.update(presenter_overlay_2=False,kinds=['presenter','independent_insert','other'])
  self.assertEqual(context.normalize(p)['kinds'],p['kinds'])
  p=self.proof();p['kinds'][0]='other';self.assertEqual(context.normalize(p)['kinds'],['other']*3)
 def test_real_relationship_break_is_preserved(self):
  p=self.proof();p['left_to_middle']='separate_recording';self.assertEqual(context.normalize(p)['kinds'],p['kinds'])
 def test_missing_duplicate_roles_or_invalid_flags_rejected(self):
  for p in [dict(self.proof(),kinds=['presenter']*6),dict(self.proof(),presenter_overlay_2='yes')]:
   with self.assertRaises(ValueError):context.normalize(p)
if __name__=='__main__':unittest.main()
