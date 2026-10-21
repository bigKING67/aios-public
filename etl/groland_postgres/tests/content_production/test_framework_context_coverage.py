import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
import sys,unittest
from pathlib import Path
from types import SimpleNamespace
from content_production import framework_context_coverage as coverage,framework_composition as comp
from content_production import framework_editorial_audit as av
from content_production.segment_suggestion_provider import ProviderResult,SuggestionError

def run(a,b,qualified=True):return dict(start_ms=a,end_ms=b,qualifies=qualified,tolerance=False)
def window(a,b,runs):return dict(start=a,end=b,measured={'runs':runs})
class CoverageTests(unittest.TestCase):
 def test_agreeing_context_fills_short_proposal_hole_without_new_inference(self):
  seg=[dict(start_ms=10000,end_ms=12000,label_key='mixed_voiceover')]
  result=coverage.fill(seg,[dict(core_start=0,core_end=10000),dict(core_start=12000,core_end=30000)], [window(0,30000,[run(0,30000)])])
  self.assertEqual([(s['start_ms'],s['end_ms'])for s in result],[(10000,12000)])
  self.assertEqual(result[0]['witness'],(0,30000))
 def test_real_insert_and_conflicting_window_never_get_filled(self):
  seg=[dict(start_ms=10000,end_ms=12000,label_key='mixed_voiceover')]
  for receipts in ([window(0,30000,[run(0,10000),run(10000,12000,False),run(12000,30000)])], [window(0,30000,[run(0,30000)]),window(0,20000,[run(0,20000,False)])]):self.assertEqual(coverage.fill(seg,[],receipts),[])
 def test_short_runs_cannot_be_pooled_and_owned_core_is_untouched(self):
  seg=[dict(start_ms=8000,end_ms=12000,label_key='mixed_voiceover')]
  self.assertEqual(coverage.fill(seg,[],[window(0,20000,[run(0,9000,False),run(9000,20000,False)])]),[])
  self.assertEqual(coverage.fill(seg,[dict(core_start=8000,core_end=12000)],[window(0,30000,[run(0,30000)])]),[])
 def test_sub_sample_opening_flash_does_not_absorb_whole_review(self):
  seg=[dict(start_ms=0,end_ms=100,label_key='mixed_voiceover'),dict(start_ms=100,end_ms=30000,label_key='live_demo')]
  self.assertIsNone(av.opening_candidate(seg))
 def test_probability_only_selects_clarification_not_final_classification(self):
  answer=dict(type='choice',choice='assembled_support',confidence=.5,probabilities=dict(assembled_support=.62,independent_review=.36,own_review_step=.01,uncertain=.01))
  for role,expected in [('independent_review','live_demo'),('assembled_support','mixed_voiceover')]:
   calls=[]
   def request(*args,**kw):
    calls.append(args);return SimpleNamespace(payload={'observations':[dict(index=0,role=role,target_action='actual application',left_relation='left scene',right_relation='right scene',evidence='visible source evidence')]},usage={},response_id='fixture')
   decisions,_=comp.clarify({'q0':answer},[dict(start_ms=10000,end_ms=24000)],Path('fixture'),request)
   self.assertEqual(decisions,{0:expected});self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
