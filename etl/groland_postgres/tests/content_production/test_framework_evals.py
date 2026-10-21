import copy
import json
import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_eval_report import report, ledger
from content_production.framework_eval_runtime import Budget, response_hash
from content_production.framework_evals import scope_for, proposal_trace
from content_production.framework_eval_report import write_report
from content_production.framework_eval_runtime import RecordingProvider
from content_production.segment_suggestion_provider import SuggestionError
from content_production import framework_promotion as promotion


class EvalLoopTests(unittest.TestCase):
    def setUp(self):
        self.corpus = dict(films={f:dict(file=f+'.mp4', sourceSha256=f, segments=[[0,20,'实拍内容']])
                                 for f in ('a','b')}, labels=[dict(key='live_demo',name='实拍内容')],
                           assertions=[], gates=dict(minimum_accuracy=.9,maximum_regression=.02))
        self.base = [dict(film=f,pred=[[0,20,'实拍内容']])for f in ('a','b')]
        self.rows = [dict(r,sourceSha256=r['film']) for r in self.base]

    def test_missing_failure_and_inaccurate_cases_never_leave_denominator(self):
        for rows in (self.rows[:1], [self.rows[0],dict(film='b',error='timeout',sourceSha256='b')]):
            result=report(self.corpus,self.base,rows,['a','b'])
            self.assertFalse(result['adoptionPassed'])
            self.assertEqual(result['candidateMean'],.5)
            self.assertIn('incomplete_worker',result['films'][1]['failures'])

    def test_focused_success_is_not_full_adoption(self):
        result=report(self.corpus,self.base,self.rows[:1],['a'])
        self.assertTrue(result['scopedPassed'])
        self.assertFalse(result['adoptionPassed'])
        self.assertTrue(report(self.corpus,self.base,self.rows,['a','b'])['adoptionPassed'])

    def test_newer_adjudication_separates_old_gold_without_changing_score(self):
        from content_production.framework_failure_queue import write_queue
        self.corpus['assertions']=[dict(id='latest',film='a',start=0,end=20,label='混剪口播')]
        self.rows[0]['pred']=[[0,20,'混剪口播']]
        result=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(result['films'][0]['candidate'],0)
        self.assertEqual(result['adjudicatedEvaluation']['candidateMean'],1)
        self.assertTrue(result['adjudicatedEvaluation']['scopedPassed'])
        self.assertFalse(result['adoptionPassed'])
        with tempfile.TemporaryDirectory() as folder:
            queue=write_queue(Path(folder),result,self.rows)
        item=next(x for x in queue['items'] if x['film']=='a')
        self.assertEqual(item['errorSeconds'],0)
        self.assertEqual(item['referenceDifferences'][0]['resolvedByAdjudications'],['latest'])

    def test_parallel_owner_score_does_not_hide_failed_source_or_failed_guard(self):
        self.corpus['assertions']=[dict(id='latest',film='a',start=0,end=20,label='混剪口播')]
        self.rows[0]['pred']=[[0,20,'混剪口播']]
        self.rows[0]['sourceSha256']='wrong'
        result=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(result['adjudicatedEvaluation']['candidateMean'],1)
        self.assertFalse(result['adjudicatedEvaluation']['scopedPassed'])
        self.assertIn('source_mismatch',result['adjudicatedEvaluation']['films'][0]['failures'])
        self.rows[0]['sourceSha256']='a'
        self.rows[0]['pred']=[[0,1,'实拍内容'],[1,20,'混剪口播']]
        result=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertFalse(result['adjudicatedEvaluation']['scopedPassed'])

    def test_contradictory_active_owner_labels_fail_instead_of_last_write_wins(self):
        self.corpus['assertions']=[dict(id='old',film='a',start=0,end=20,label='混剪口播'),
            dict(id='new',film='a',start=1,end=10,label='实拍内容')]
        with self.assertRaisesRegex(ValueError,'Conflicting active'):
            report(self.corpus,self.base,self.rows,['a','b'])

    def test_known_regression_blocks_even_when_film_accuracy_passes(self):
        self.base[0]['pred'] = [[0,2,'混剪口播'], [2,20,'实拍内容']]
        self.rows[0]['pred'] = [[0,1,'混剪口播'], [1,20,'实拍内容']]
        initial = report(self.corpus, self.base, self.rows, ['a','b'])
        self.assertTrue(initial['regressionPassed'])
        self.assertFalse(initial['adoptionPassed'])
        self.corpus['regressionCases'] = [dict(id='fixed_span',film='a',start=0,end=1,label='实拍内容')]
        result = report(self.corpus, self.base, self.rows, ['a','b'])
        self.assertFalse(result['adoptionPassed'])
        self.assertIn('regression_case:fixed_span', result['films'][0]['failures'])
        self.assertEqual(result['assertions'][0]['kind'], 'regression')

    def test_regression_guard_cannot_override_business_reference(self):
        self.corpus['regressionCases'] = [dict(id='guard',film='a',start=0,end=20,label='混剪口播')]
        self.rows[0]['pred'] = [[0,20,'混剪口播']]
        result = report(self.corpus, self.base, self.rows, ['a','b'])
        self.assertEqual(result['films'][0]['candidate'], 0)
        self.assertNotIn('resolvedByAdjudications', result['films'][0]['errors'][0])

    def test_source_boundary_guard_rejects_a_higher_rounded_score(self):
        self.corpus['films']['a']['segments'] = [[0,10,'实拍内容'],[10,20,'混剪口播']]
        self.base[0]['pred'] = [[0,9.3,'实拍内容'],[9.3,20,'混剪口播']]
        self.rows[0]['pred'] = copy.deepcopy(self.base[0]['pred'])
        self.corpus['regressionCases'] = [dict(id='source_onset',film='a',start=9.3,end=10,
            label='混剪口播',source_boundary=9.3,
            source_before_label='实拍内容',source_after_label='混剪口播')]
        precise = report(self.corpus,self.base,self.rows,['a','b'])
        self.assertTrue(precise['regressionPassed'])
        self.assertFalse(precise['adoptionPassed'])
        self.assertNotIn('resolvedByAdjudications',precise['films'][0]['exactErrors'][0])
        self.rows[0]['pred'] = [[0,10,'实拍内容'],[10,20,'混剪口播']]
        rounded = report(self.corpus,self.base,self.rows,['a','b'])
        self.assertGreater(rounded['candidateMean'],precise['candidateMean'])
        self.assertFalse(rounded['regressionPassed'])
        self.assertIn('regression_case:source_onset',rounded['films'][0]['failures'])

    def test_source_guard_requires_the_actual_label_transition_without_a_gap(self):
        self.corpus['films']['a']['segments'] = [[0,10,'实拍内容'],[10,20,'混剪口播']]
        self.corpus['regressionCases'] = [dict(id='source_onset',film='a',start=9.3,end=10,
            label='混剪口播',source_boundary=9.3,
            source_before_label='实拍内容',source_after_label='混剪口播')]
        wrong = [
            [[0,8.5,'实拍内容'],[8.5,9.3,'混剪口播'],[9.3,20,'混剪口播']],
            [[0,9.3,'实拍内容'],[9.302,20,'混剪口播']],
            [[0,9.333,'实拍内容'],[9.333,20,'混剪口播']],
        ]
        for pred in wrong:
            self.rows[0]['pred'] = pred
            result = report(self.corpus,self.base,self.rows,['a','b'])
            self.assertFalse(result['assertions'][0]['passed'])
        self.rows[0]['pred'] = [[0,9.3,'实拍内容'],[9.3,9.8,'混剪口播'],[9.8,20,'混剪口播']]
        self.assertTrue(report(self.corpus,self.base,self.rows,['a','b'])['assertions'][0]['passed'])

    def test_terminal_frame_guard_does_not_allow_the_ordinary_span_tolerance(self):
        self.corpus['regressionCases']=[dict(id='tail',film='a',start=19.95,end=20,
            label='实拍内容',terminal_boundary=20)]
        for end in (19.969,20.034):
            self.rows[0]['pred']=[[0,end,'实拍内容']]
            result=report(self.corpus,self.base,self.rows,['a','b'])
            self.assertFalse(result['assertions'][0]['passed'])
            self.assertIn('regression_case:tail',result['films'][0]['failures'])
        self.rows[0]['pred']=[[0,20,'实拍内容']]
        self.assertTrue(report(self.corpus,self.base,self.rows,['a','b'])['assertions'][0]['passed'])

    def test_terminal_frame_wrong_label_fails_even_with_the_correct_endpoint(self):
        self.corpus['regressionCases']=[dict(id='tail',film='a',start=19.959,end=20,
            label='实拍内容',terminal_boundary=20)]
        self.rows[0]['pred']=[[0,19.959,'实拍内容'],[19.959,20,'混剪口播']]
        result=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(result['candidateMean'],1)
        self.assertFalse(result['assertions'][0]['passed'])
        self.assertIn('regression_case:tail',result['films'][0]['failures'])
        self.assertFalse(result['adoptionPassed'])
        self.rows[0]['pred']=[[0,20,'实拍内容']]
        self.assertTrue(report(self.corpus,self.base,self.rows,['a','b'])['assertions'][0]['passed'])

    def test_partial_or_different_adjudication_does_not_hide_actual_error(self):
        self.rows[0]['pred']=[[0,20,'混剪口播']]
        for end,label in [(10,'混剪口播'),(20,'机制')]:
            self.corpus['assertions']=[dict(id='partial',film='a',start=0,end=end,label=label)]
            result=report(self.corpus,self.base,self.rows,['a','b'])
            self.assertNotIn('resolvedByAdjudications',result['films'][0]['errors'][0])

    def test_integer_tail_outside_decoded_video_is_not_missing_footage(self):
        from content_production.framework_failure_queue import write_queue
        self.corpus['annotationTiming'] = dict(id='integer', boundaryToleranceSeconds=1)
        self.rows[0]['pred'] = [[0,19.966,'实拍内容']]
        self.rows[0]['sourceVideoExtent'] = dict(kind='decoded_video_endpoint', sourceSha256='a',
            videoEndMs=19966,lastFrameStartMs=19933.333,lastFrameEndMs=19966.667)
        result = report(self.corpus,self.base,self.rows,['a','b'])
        self.assertTrue(result['adoptionPassed'])
        self.assertEqual(result['sourceExtentDifferences'],1)
        self.assertEqual(result['films'][0]['exactErrors'][0]['end'],20)
        without_proof = copy.deepcopy(self.rows)
        del without_proof[0]['sourceVideoExtent']
        raw = report(self.corpus,self.base,without_proof,['a','b'])
        self.assertEqual(result['candidateMean'],raw['candidateMean'])
        self.assertFalse(raw['adoptionPassed'])
        with tempfile.TemporaryDirectory() as folder:
            queue = write_queue(Path(folder),result,self.rows)
        item = next(x for x in queue['items'] if x['film']=='a')
        self.assertFalse(item['adoptionBlocking'])
        self.assertEqual(item['category'],'annotation_beyond_video')
        self.assertEqual(len(item['sourceExtentDifferences']),1)

    def test_endpoint_evidence_cannot_excuse_real_tail_errors(self):
        self.corpus['annotationTiming'] = dict(id='integer', boundaryToleranceSeconds=1)
        good = dict(self.rows[0], pred=[[0,19.966,'实拍内容']], sourceVideoExtent=dict(
            kind='decoded_video_endpoint',sourceSha256='a',videoEndMs=19966,
            lastFrameStartMs=19933.333,lastFrameEndMs=19966.667))
        cases = []
        for end in (19.9,19.95,19.967):
            row = copy.deepcopy(good);row['pred'][0][1]=end;cases.append(row)
        row = copy.deepcopy(good);row['pred'][0][2]='混剪口播';cases.append(row)
        row = copy.deepcopy(good);row['sourceVideoExtent']['sourceSha256']='other';cases.append(row)
        row = copy.deepcopy(good);row['sourceVideoExtent']['videoEndMs']=19950
        row['pred'][0][1]=19.95;cases.append(row)
        row = copy.deepcopy(good);row['sourceVideoExtent']['lastFrameEndMs']=float('nan');cases.append(row)
        row = copy.deepcopy(good);row['sourceSha256']='other';row['sourceVideoExtent']['sourceSha256']='other';cases.append(row)
        row = copy.deepcopy(good);row['pred']=[[0,19.9,'实拍内容'],[19.95,19.966,'实拍内容']];cases.append(row)
        row = copy.deepcopy(good);row['pred'][0][1]=18.966
        row['sourceVideoExtent'].update(videoEndMs=18966,lastFrameStartMs=18933.333,lastFrameEndMs=18966.667);cases.append(row)
        for row in cases:
            with self.subTest(row=row):
                result=report(self.corpus,self.base,[row,self.rows[1]],['a','b'])
                self.assertFalse(result['adoptionPassed'])
                self.assertEqual(result['sourceExtentDifferences'],0)

    def test_unresolved_narrator_evidence_remains_visible_with_matching_labels(self):
        self.rows[0]['publication']={'summary':{'frameworkVerification':{'narratorReturn':{
            'unresolved':[dict(start_ms=1000,end_ms=15000)]}}}}
        result=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(result['films'][0]['auxiliaryWarnings'][0]['resolution'],'narrator_return_unresolved')
        self.assertFalse(result['adoptionPassed'])

    def test_unresolved_short_review_remains_visible_with_matching_labels(self):
        self.rows[0]['publication']={'summary':{'frameworkVerification':{'shortReviews':{
            'unresolved':[dict(start_ms=1000,end_ms=9500)]}}}}
        result=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(result['films'][0]['auxiliaryWarnings'][0]['resolution'],'short_review_unresolved')
        self.assertFalse(result['adoptionPassed'])

    def test_subsecond_error_cannot_hide_behind_per_second_perfect_score(self):
        from content_production.framework_failure_queue import write_queue
        self.rows[0]['pred'] = [[0,10,'实拍内容'], [10,10.117,'混剪口播'], [10.117,20,'实拍内容']]
        result = report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(result['candidateMean'], 1)
        self.assertTrue(result['regressionPassed'])
        self.assertFalse(result['repairComplete'])
        self.assertFalse(result['adoptionPassed'])
        self.assertEqual(result['films'][0]['exactErrors'][0]['end'], 10.117)
        with tempfile.TemporaryDirectory() as folder:
            queue = write_queue(Path(folder),result,self.rows)
        self.assertEqual(queue['items'][0]['errorSeconds'], .117)
        self.assertTrue(queue['items'][0]['adoptionBlocking'])

    def test_missing_worker_is_not_diagnosed_as_classification_error(self):
        from content_production.framework_failure_queue import write_queue
        rows = self.rows[:1]
        with tempfile.TemporaryDirectory() as folder:
            queue = write_queue(Path(folder), report(self.corpus,self.base,rows,['a','b']), rows)
        missing = next(item for item in queue['items'] if item['film']=='b')
        self.assertEqual(missing['category'], 'missing_worker_result')
        self.assertEqual(missing['priority'], 0)
        self.assertEqual(missing['errorSpans'], [])
        self.assertEqual(missing['errorSeconds'], 0)

    def test_source_change_and_lost_person_boundary_fail(self):
        self.corpus['assertions']=[dict(id='person',film='a',start=10,end=20,label='实拍内容',person_boundary=10)]
        self.rows[1]['sourceSha256']='changed'
        r=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertFalse(r['adoptionPassed'])
        self.assertIn('adjudicated_case:person',r['films'][0]['failures'])
        self.assertIn('source_mismatch',r['films'][1]['failures'])

    def test_duplicate_extra_unknown_scope_rejected(self):
        for rows in (self.rows+self.rows[:1],self.rows+[dict(film='extra')]):
            with self.assertRaises(ValueError):report(self.corpus,self.base,rows,['a','b'])
        for scope in ('a,a','../x','not-found'):
            with self.assertRaises(ValueError):scope_for(self.corpus,scope)

    def test_stage_hint_compares_actual_proposal_not_model_score(self):
        self.rows[0].update(pred=[[0,20,'机制']],raw=[dict(start_sec=0,end_sec=20,label_key='机制')])
        r=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(r['films'][0]['errors'][0]['stageHint'],'initial_proposal_survived')
        self.rows[0]['raw'][0]['label_key']='live_demo'
        r=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertEqual(r['films'][0]['errors'][0]['stageHint'],'introduced_or_shifted_after_proposal')

    def test_proposal_trace_uses_completed_proposal_after_incomplete_receipt(self):
        proposal = dict(responseId='repaired', payload={'segments': [{'start_sec': 0, 'end_sec': 20}]})
        calls = [dict(code='provider_incomplete'), proposal, dict(payload={'events': []})]
        self.assertEqual(proposal_trace(calls)['raw'], proposal['payload']['segments'])
        self.assertEqual(proposal_trace(calls)['rawResponseId'], 'repaired')

    def test_proposal_trace_follows_actual_response_id_not_first_or_audit(self):
        first = dict(responseId='first', payload={'segments': [1]})
        used = dict(responseId='used', payload={'segments': [2]})
        calls = [first, used, dict(payload={'events': []}), dict(responseId='audit', payload={'segments': [3]})]
        self.assertEqual(proposal_trace(calls, {'summary': {'responseId': 'used'}})['raw'], [2])
        self.assertEqual(proposal_trace(calls)['raw'], [2])
        with self.assertRaises(ValueError):
            proposal_trace(calls, {'summary': {'responseId': 'missing'}})

    def test_cost_includes_failed_calls_excludes_replay_and_preserves_unknowns(self):
        r=ledger([dict(reused=True,usage={'input_tokens':999}),dict(error='timeout'),
                  dict(usage={'input_tokens':12,'output_tokens':3})])
        self.assertEqual((r['newCalls'],r['failedCalls'],r['unknownUsageCalls'],r['inputTokens']),(2,1,1,12))
        self.assertIsNone(r['currencyCost'])

    def test_profile_separates_paid_latency_reasoning_and_unknown_old_tapes(self):
        profile=dict(schemaFields=['observations'], thinking='enabled', reasoningEffort='low')
        usage=dict(input_tokens=12, output_tokens=8, input_tokens_details={'cached_tokens':4},
                   output_tokens_details={'reasoning_tokens':6})
        calls=[dict(api='responses',requestProfile=profile,usage=usage,providerSeconds=2.5),
               dict(api='responses',error='timeout',providerSeconds=3.5),
               dict(api='responses',payload={'old':True},usage={'input_tokens':5}),
               dict(reused=True,usage=usage,providerSeconds=99)]
        result=ledger(calls)
        self.assertEqual((result['newCalls'],result['replayedCalls'],result['failedCalls']),(3,1,1))
        self.assertEqual((result['providerSeconds'],result['timedCalls'],result['missingTimingCalls']),(6,2,1))
        self.assertEqual((result['knownReasoningTokens'],result['missingReasoningBreakdownCalls']),(6,2))
        self.assertEqual((result['knownCachedInputTokens'],result['missingCacheBreakdownCalls']),(4,2))
        self.assertEqual(sum(g['inputTokens'] for g in result['byRequestSchema']),17)
        self.assertEqual(sum(g['providerSeconds'] for g in result['byRequestSchema']),6)
        self.assertIsNone(result['byRequestSchema'][2]['thinking'])
        # A recorded NaN or boolean must not turn unknown timing into a measured zero.
        self.assertEqual(ledger([dict(providerSeconds=x) for x in (True,float('nan'),-1)])['missingTimingCalls'],3)

    def test_new_request_and_failed_request_keep_timing_without_logging_content(self):
        from content_production.segment_suggestion_provider import ArkSegmentProvider, ProviderResult
        with tempfile.TemporaryDirectory() as directory:
            provider=RecordingProvider(Path(directory),[],Budget(2),False,2)
            provider.live=True
            content=[dict(type='input_image',image_url='private-media'),
                     dict(type='input_text',text='private-prompt')]
            schema={'properties':{'observed':{'type':'boolean'}}}
            expected=ProviderResult({'observed':True},{'input_tokens':7},'probe-id')
            with patch.object(ArkSegmentProvider,'_request',return_value=expected), \
                 patch('content_production.framework_eval_runtime.time.monotonic',side_effect=[5,7.5]):
                self.assertEqual(provider._request(content,schema,'disabled',temperature=0),expected)
            error=SuggestionError('provider_timeout','unknown remote outcome')
            with patch.object(ArkSegmentProvider,'_request',side_effect=error), \
                 patch('content_production.framework_eval_runtime.time.monotonic',side_effect=[8,11]):
                with self.assertRaises(SuggestionError):
                    provider._request(content,schema,'enabled',temperature=0,reasoning_effort='low')
            saved=(Path(directory)/'calls.json').read_text()
            self.assertNotIn('private-media',saved)
            self.assertNotIn('private-prompt',saved)
            result=ledger(json.loads(saved))
            self.assertEqual((result['providerSeconds'],result['failedCalls'],result['unknownUsageCalls']),(5.5,1,1))

    def test_hash_changes_with_media_rules_model_settings(self):
        args=[['media-a'],{'rules':'a'},'enabled',0,'low']
        base=response_hash(*args)
        for index,value in ((0,['media-b']),(1,{'rules':'b'}),(2,'disabled'),(3,.1),(4,'medium')):
            changed=copy.deepcopy(args);changed[index]=value
            self.assertNotEqual(response_hash(*changed),base)

    def test_standalone_probe_creates_receipt_directory_before_call(self):
        from content_production.segment_suggestion_provider import ProviderResult
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)/'nested'/'probe'
            provider=RecordingProvider(work,[],Budget(1),False,1)
            self.assertTrue(work.is_dir())
            provider.live=True
            expected=ProviderResult({'observed':True},{'input_tokens':7},'probe-id')
            self.assertEqual(provider.invoke('key','responses',lambda:expected),expected)
            saved=json.loads((work/'calls.json').read_text())
            self.assertEqual(saved[0]['responseId'],'probe-id')
            self.assertEqual(saved[0]['usage'],{'input_tokens':7})

    def test_invalid_receipt_directory_fails_before_spending_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            blocked=Path(directory)/'file';blocked.write_text('preserve')
            budget=Budget(1)
            with self.assertRaises(FileExistsError):
                RecordingProvider(blocked,[],budget,True,1)
            self.assertEqual(budget.used,0)
            self.assertEqual(blocked.read_text(),'preserve')

    def test_global_budget_stops_before_extra_request(self):
        b=Budget(1);b.claim()
        with self.assertRaises(ValueError):b.claim()
        self.assertEqual(b.used,1)

    def test_recent_fixed_guard_is_not_hidden_by_older_weaker_baseline(self):
        self.base[0]['pred']=[[0,20,'机制']]
        self.corpus['guardBaselines']=[dict(name='recent-fixed-batch',rows=copy.deepcopy(self.rows[:1]))]
        self.rows[0]['pred']=[[0,18,'实拍内容'],[18,20,'机制']]
        r=report(self.corpus,self.base,self.rows,['a','b'])
        self.assertIn('guard_regression:recent-fixed-batch',r['films'][0]['failures'])
        self.assertFalse(r['adoptionPassed'])

    def test_changed_runtime_cannot_show_pass_in_markdown_while_json_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)
            (output/'manifest.json').write_text(json.dumps({'codeChangedDuringRun':['runtime.py']}))
            result=write_report(output,self.corpus,self.base,self.rows,['a','b'],[])
            self.assertFalse(result['adoptionPassed'])
            self.assertEqual(result['invalidReason'],'code_changed_during_run')
            self.assertIn('采用门禁：FAIL',(output/'report.md').read_text())

    def test_incomplete_response_replay_retains_error_without_another_paid_call(self):
        with tempfile.TemporaryDirectory() as directory:
            provider=object.__new__(RecordingProvider)
            provider.work=Path(directory);provider.calls=[]
            provider.cache={'key':[dict(requestHash='key',error='SuggestionError',code='provider_incomplete',
                                       usage={'total_tokens':12})]}
            with self.assertRaises(SuggestionError) as caught:
                provider.invoke('key','responses',lambda:self.fail('must replay the failure'))
            self.assertEqual(caught.exception.code,'provider_incomplete')
            self.assertEqual(caught.exception.usage,{'total_tokens':12})
            self.assertTrue(provider.calls[0]['reused'])

    def test_interrupted_run_cannot_be_adopted_even_if_all_rows_arrived(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output/'manifest.json').write_text(json.dumps({'interruptedBy': 'superseded_candidate'}))
            result = write_report(output,self.corpus,self.base,self.rows,['a','b'],[])
            self.assertEqual(result['candidateMean'], 1)
            self.assertFalse(result['adoptionPassed'])
            self.assertEqual(result['invalidReason'], 'evaluation_interrupted')
            self.assertIn('evaluation_interrupted', (output/'report.md').read_text())


class PromotionTests(unittest.TestCase):
    def segment(self,a,b,label):
        return dict(start_ms=a,end_ms=b,label_key=label)

    def proof(self,index,role,link=-1):
        return dict(index=index,role=role,linked_index=link,evidence='可见目标价格/推荐内容')

    def test_embedded_recommendation_and_real_mid_offer_are_distinct(self):
        s=[self.segment(0,20000,'mixed_voiceover'),self.segment(20000,30000,'promotion'),self.segment(30000,50000,'mixed_voiceover')]
        t=promotion.plan(s)
        for role,label in [('recommendation_material','mixed_voiceover'),('independent_offer','promotion')]:
            out,_=promotion.apply(s,t,dict(items=[self.proof(1,role)]))
            self.assertEqual(out[1]['label_key'],label)

    def test_price_card_requires_verified_adjacent_offer(self):
        s=[self.segment(0,4000,'mixed_voiceover'),self.segment(4000,20000,'promotion')]
        t=promotion.plan(s)
        proof=dict(items=[self.proof(0,'dependent_offer_content',1),self.proof(1,'independent_offer')])
        out,_=promotion.apply(s,t,proof)
        self.assertEqual([v['label_key']for v in out],['promotion','promotion'])
        proof['items'][1]['role']='recommendation_material'
        with self.assertRaises(ValueError):promotion.apply(s,t,proof)

    def test_distant_offer_reference_cannot_bridge_other_content_blocks(self):
        s=[self.segment(0,8000,'promotion'),self.segment(8000,30000,'mixed_voiceover'),
           self.segment(30000,40000,'street_interview'),self.segment(40000,60000,'promotion')]
        out,_=promotion.apply(s,promotion.plan(s),dict(items=[
            self.proof(0,'dependent_offer_content',3),self.proof(3,'independent_offer')]))
        self.assertEqual(out[0]['label_key'],'mixed_voiceover')
        self.assertEqual(out[3]['label_key'],'promotion')

    def test_uncertain_incomplete_and_fabricated_link_rejected(self):
        s=[self.segment(0,12000,'promotion')];t=promotion.plan(s)
        for payload in (dict(items=[]),dict(items=[self.proof(0,'uncertain')]),dict(items=[self.proof(0,'dependent_offer_content',1)])):
            with self.assertRaises(ValueError):promotion.apply(s,t,payload)

    def test_own_review_not_demoted_and_no_position_only_classification(self):
        s=[self.segment(0,30000,'live_demo'),self.segment(30000,35000,'mixed_voiceover')]
        self.assertEqual(promotion.plan(s),[])
        s=[self.segment(0,10000,'promotion')]
        out,c=promotion.apply(s,promotion.plan(s),dict(items=[self.proof(0,'own_review')]))
        self.assertEqual((out,c),(s,[]))
