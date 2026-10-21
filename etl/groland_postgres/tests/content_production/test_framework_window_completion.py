import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
import tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from content_production import framework_window_audit as w
class WindowCompletionTests(unittest.TestCase):
 def run_case(self,code='provider_incomplete',cap=3):
  calls=[]
  def request(prompt,schema,**kwargs):
   calls.append(kwargs)
   if len(calls)==1:raise w.SuggestionError(code,'truncated',{'output_tokens':8192})
   if 'events'in schema['properties']:
    value={'events':[dict(start=0,end=12,unit='U1',person='P1',visible='person',action='personal_application',appearance='same clothes and room')]}
   else:value=dict(appearance=['same']*3,kinds=['presenter']*3,same_outer_person=True,middle_owner='both',left_to_middle='same_review',middle_to_right='same_review')
   return SimpleNamespace(payload=value,usage={},response_id='fixture')
  with tempfile.TemporaryDirectory()as t,patch.object(w,'run_media',return_value=0),patch.object(w,'read_cuts',return_value=[]),patch.object(w,'MAX_COMPLETION_REPAIRS',cap):
   result,receipt=w.verify([dict(start_ms=0,end_ms=12000,label_key='live_demo')],Path('source'),12000,Path(t),{},lambda:None,request)
  return result,receipt,calls
 def test_exhausted_reasoning_recovers_once_without_relaxing_evidence(self):
  result,r,calls=self.run_case();self.assertEqual(len(calls),3);self.assertEqual(calls[1]['thinking'],'disabled');self.assertEqual(r['completionRepairs'],1);self.assertEqual(result['segments'][0]['label_key'],'live_demo')
 def test_no_transport_retry_or_budget_bypass(self):
  for code,cap in [('provider_error',3),('provider_incomplete',0)]:
   with self.assertRaises(w.SuggestionError):self.run_case(code,cap)
if __name__=='__main__':unittest.main()
