import unittest
from content_production import framework_editorial_audit as audit
from test_framework_editorial_audit import proof,segment,planned
class IdentityConflictTests(unittest.TestCase):
 def observation(self):
  p=dict(proof('external_voiceover'),b_person_is_speaking='yes',same_person='yes')
  p['voice_check']['match']='none'
  p['identity_check']=dict(appearance_a='A face',appearance_b1='B face',appearance_b2='B face',evidence='visible different faces',a_matches_b='no',b_same_person='yes')
  return p
 def test_independent_faces_and_distinct_voices_resolve_initial_av_conflict(self):
  rows=[segment(0,12000)]
  self.assertEqual(audit.apply(rows,planned(rows,12000),[self.observation()]),(rows,[]))
 def test_faces_do_not_turn_audio_disagreement_into_external_voice_proof(self):
  rows=[segment(0,12000)]
  for change in ('missing','unknown','changed','same'):
   p=self.observation()
   if change=='missing':del p['identity_check']
   if change=='unknown':p['identity_check']['a_matches_b']='uncertain'
   if change=='changed':p['identity_check']['b_same_person']='no'
   if change=='same':p['identity_check']['a_matches_b']='yes'
   with self.subTest(change=change):self.assertEqual(audit.apply(rows,planned(rows,12000),[p]),(rows,[]))
 def test_silent_face_is_not_proof_of_the_previous_speakers_voice(self):
  p=self.observation();p['b_person_is_speaking']='no'
  rows=[segment(0,12000)]
  self.assertEqual(audit.apply(rows,planned(rows,12000),[p]),(rows,[]))

class IdentityRoutingTests(unittest.TestCase):
 def test_only_speaking_identity_audio_conflicts_trigger_extra_observation(self):
  p=IdentityConflictTests().observation()
  self.assertTrue(audit.needs_identity_check(p))
  for key,value in [('same_person','no'),('b_person_is_speaking','no'),('b_person_is_speaking','uncertain')]:
   self.assertFalse(audit.needs_identity_check(dict(p,**{key:value})))
  for match in ['all','part','uncertain']:
   self.assertFalse(audit.needs_identity_check(dict(p,voice_check=dict(p['voice_check'],match=match))))

 def test_observe_reserves_and_persists_independent_identity_evidence(self):
  import tempfile,json
  from pathlib import Path
  from types import SimpleNamespace
  from unittest.mock import Mock,patch
  p=IdentityConflictTests().observation();face=p.pop('identity_check');voice=p.pop('voice_check')
  item=planned([segment(0,12000)],12000)[0]
  item.update(context_start_ms=0,context_end_ms=12000)
  request=Mock(return_value=SimpleNamespace(payload=p,response_id='test',usage={}))
  reserve=Mock()
  with tempfile.TemporaryDirectory() as root, patch.object(audit,'run_media',return_value=0), patch.object(audit.speaker,'observe',return_value=voice), patch.object(audit.identity,'observe',return_value=face) as observer:
   folder=Path(root)/'audit'
   result=audit.observe(Path('source.mp4'),item,folder,{},lambda:None,request,reserve_identity=reserve)
   reserve.assert_called_once();observer.assert_called_once()
   self.assertEqual(result['identity_check'],face)
   self.assertEqual(json.loads((folder/'evidence.json').read_text())['payload']['identity_check'],face)
