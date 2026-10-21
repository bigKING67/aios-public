import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
import unittest
from content_production import framework_edge_ownership as edge, framework_window_audit as window
class EdgeTests(unittest.TestCase):
 def rows(self):
  return [dict(start_ms=0,end_ms=2000,kind='independent_insert',unit=''),dict(start_ms=2000,end_ms=4000,kind='own_detail',unit='tentative',needs_ownership=True),dict(start_ms=4000,end_ms=18000,kind='presenter',unit='A')]
 def proof(self,relation):return dict(kinds=['own_detail','presenter','presenter'],left_to_middle=relation,middle_to_right='same_review')
 def test_one_sided_flow_attaches_only_with_video_evidence(self):
  calls=[];joins=set();r=edge.repair(self.rows(),lambda t:(calls.append(t)or self.proof('own_detail')),joins)
  self.assertEqual(len(calls),1);self.assertEqual(r[1]['unit'],'A');self.assertFalse(r[1]['needs_ownership']);self.assertEqual(joins,{4000});self.assertEqual(r[0]['kind'],'independent_insert')
 def test_external_operation_does_not_borrow_adjacent_person_duration(self):
  r=edge.repair(self.rows(),lambda _:self.proof('separate_recording'),set());self.assertEqual(r[1]['kind'],'independent_insert');self.assertEqual(r[1]['unit'],'')
 def test_unknown_and_role_contradictions_still_fail(self):
  for p in [self.proof('uncertain'),dict(self.proof('own_detail'),kinds=['independent_insert','presenter','presenter'])]:
   with self.assertRaises(ValueError):edge.repair(self.rows(),lambda _:p,set())
 def test_no_fabricated_anchor_across_barrier(self):
  rows=self.rows()[1:];rows.insert(1,dict(start_ms=4000,end_ms=6000,kind='independent_insert',unit=''))
  r=edge.repair(rows,lambda _:self.fail('must not cross an insert'),set());self.assertTrue(r[0]['needs_ownership'])
 def test_existing_two_anchor_path_is_not_reclassified(self):
  rows=self.rows();rows[0].update(kind='presenter',unit='A');self.assertEqual(edge.repair(rows,lambda _:self.fail('existing ownership path'),set()),rows)
 def test_cross_window_static_conflict_gets_source_video_adjudication(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='presenter',unit='A')]
  cache={'links':{((4000,8000),(8000,12000)):'separate_recording'}};calls=[]
  proof=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='same_review')
  r=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache,context_ask=lambda t:(calls.append(t)or proof))
  self.assertEqual(len(calls),1);self.assertEqual({e['unit']for e in r},{'A'});self.assertEqual(cache['conflict_repairs'],1)
 def test_context_can_confirm_a_real_break_without_pooling(self):
  rows=[dict(start_ms=0,end_ms=12000,kind='presenter',unit='A')]
  cache={'links':{((4000,8000),(8000,12000)):'same_review'}}
  proof=dict(kinds=['presenter']*3,left_to_middle='same_review',middle_to_right='separate_recording')
  r=window.reveal_source_inserts(rows,lambda _:proof,[(4000,.8),(8000,.8)],source_cache=cache,context_ask=lambda _:proof)
  self.assertNotEqual(r[1]['unit'],r[2]['unit'])
if __name__=='__main__':unittest.main()
