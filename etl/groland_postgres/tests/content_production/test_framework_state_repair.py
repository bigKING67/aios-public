import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
import json, tempfile, unittest
from pathlib import Path
from content_production import framework_window_audit as w, framework_review_ownership as o
from content_production import framework_continuity as c
from content_production.framework_failure_queue import write_queue

class StateRepairTests(unittest.TestCase):
 def test_restored_presenter_is_measurable_but_does_not_borrow_identity(self):
  rows=[dict(start_ms=a,end_ms=b,unit=u,kind=k) for a,b,u,k in [(0,6000,'A','presenter'),(6000,8000,'','independent_insert'),(8000,14000,'A','presenter')]]
  proof=dict(middle_visible='person',middle_action='person talking',middle_function='presenter',middle_owner='left',outer_relation='same_review',left_flow='talk',right_flow='talk',left_demonstrates=False,right_demonstrates=False)
  events,joins=o.repair(rows,lambda *_:proof)
  self.assertEqual(events[1]['kind'],'presenter');self.assertTrue(events[1]['unit']);self.assertNotEqual(events[1]['unit'],'A');self.assertFalse(joins)
  frames,facts=w.event_facts(events)
  result,_=c.apply({'segments':[]},frames,facts,14000)
  self.assertEqual({s['label_key'] for s in result['segments']},{'mixed_voiceover'})
  with self.assertRaisesRegex(ValueError,'visible person'):o.repair(rows,lambda *_:dict(proof,middle_visible='product'))
 def test_role_conflict_resolved_by_context_and_barrier_preserved(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='presenter',unit='A')]
  cache={'roles':{(4000,8000):'presenter'}};calls=[]
  proof=dict(kinds=['presenter','independent_insert','presenter'],left_to_middle='independent_insert',middle_to_right='independent_insert')
  out=w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache,context_ask=lambda t:(calls.append(t)or proof))
  self.assertEqual(len(calls),1);self.assertEqual(out[1]['kind'],'independent_insert');self.assertEqual(out[1]['unit'],'')
  self.assertIn((4000,8000),cache['review_context_roles'])
 def test_resolved_context_role_outranks_later_static_disagreement(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='presenter',unit='A')]
  cache={'roles':{(4000,8000):'independent_insert'},'review_context_roles':{(4000,8000)}}
  proof=dict(kinds=['presenter']*3,left_to_middle='separate_recording',middle_to_right='separate_recording')
  out=w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache,context_ask=lambda _:self.fail('already resolved'))
  self.assertEqual(out[1]['kind'],'independent_insert')
 def test_different_person_and_separate_recording_both_preserve_a_source_break(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='presenter',unit='A')]
  pair=((0,4000),(4000,8000))
  cache={'links':{pair:'different_person'},'review_context_links':{pair}}
  proof=dict(kinds=['presenter']*3,left_to_middle='separate_recording',middle_to_right='same_review',_video_context=True)
  out=w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache)
  self.assertNotEqual(out[0]['unit'],out[1]['unit'])
  self.assertEqual(cache['links'][pair],'separate_recording')
 def test_unclassified_context_role_can_be_resolved_without_erasing_a_real_insert(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='presenter',unit='A')]
  cache={'roles':{(4000,8000):'other'},'review_context_roles':{(4000,8000)}}
  proof=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='same_review',_video_context=True)
  out=w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache)
  self.assertEqual(out[1]['kind'],'presenter')
  cache={'roles':{(4000,8000):'independent_insert'},'review_context_roles':{(4000,8000)}}
  with self.assertRaisesRegex(ValueError,'Conflicting source-shot observations'):
   w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache)
 def test_failure_queue_does_not_call_runtime_error_a_classification_error(self):
  with tempfile.TemporaryDirectory() as d:
   out=Path(d);report={'films':[dict(film='A',failures=['incomplete_worker'],workerError='ConnectionError',source='source.mp4',errors=[{'start':0,'end':99}])],'assertions':[]}
   result=write_queue(out,report,[dict(film='A',error='ConnectionError')])
   item=result['items'][0];self.assertEqual(item['category'],'runtime_or_provider');self.assertEqual(item['errorSpans'],[])
   self.assertTrue((out/'repair-queue.json').exists())
 def test_person_detail_and_relative_insert_agree_when_source_break_is_confirmed(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='own_detail',unit='A',visible='person',action='skin_comparison')]
  cache={'roles':{(4000,8000):'own_detail'},'review_context_roles':{(4000,8000)}}
  proof=dict(kinds=['own_detail','independent_insert','presenter'],left_to_middle='different_person',middle_to_right='different_person',_video_context=True)
  out=w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache)
  self.assertEqual(out[1]['kind'],'own_detail')
  self.assertEqual(len({e['unit']for e in out}),3)
  self.assertEqual(cache['relative_detail_roles'],1)
  rows[0]['visible']='product'
  cache={'roles':{(4000,8000):'own_detail'},'review_context_roles':{(4000,8000)}}
  with self.assertRaisesRegex(ValueError,'Conflicting source-shot observations'):
   w.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache)
 def test_passing_threshold_does_not_hide_remaining_errors_from_repair_queue(self):
  with tempfile.TemporaryDirectory()as d:
   out=Path(d)
   metrics=[dict(film='small',failures=[],workerError=None,source='small.mp4',errors=[dict(start=2,end=3)]),
            dict(film='large',failures=['below_minimum'],workerError=None,source='large.mp4',errors=[dict(start=0,end=20)])]
   artifact=write_queue(out,dict(films=metrics,assertions=[]),[])
   self.assertEqual([v['film']for v in artifact['items']],['large','small'])
   self.assertTrue(artifact['items'][1]['adoptionBlocking'])
   self.assertEqual(artifact['items'][1]['errorSeconds'],1)
   self.assertTrue((out/'repair-brief.md').is_file())
 def test_clear_product_insert_does_not_need_weaker_video_timestamp_guess(self):
  proof=dict(kinds=['presenter','independent_insert','independent_insert'],same_outer_person=False,
             middle_owner='neither',left_to_middle='separate_recording',middle_to_right='same_review')
  self.assertFalse(w.needs_video_context(proof))
  proof.update(kinds=['presenter','own_detail','presenter'],middle_owner='both')
  self.assertTrue(w.needs_video_context(proof))
 def test_repeated_remote_failures_stop_new_spend_without_hiding_prior_calls(self):
  from content_production.framework_eval_runtime import Budget
  from content_production.segment_suggestion_provider import SuggestionError
  b=Budget(20)
  b.claim();b.remote_result(SuggestionError('provider_error','transport failed'))
  b.remote_result()
  self.assertEqual(b.provider_failures,0)
  for _ in range(3):
   b.claim();b.remote_result(SuggestionError('provider_error','transport failed'))
  with self.assertRaisesRegex(ValueError,'provider unavailable'):b.claim()
  self.assertEqual(b.used,4)
  b.remote_result() # A previously in-flight success does not silently resume.
  with self.assertRaisesRegex(ValueError,'provider unavailable'):b.claim()
if __name__=='__main__':unittest.main()
