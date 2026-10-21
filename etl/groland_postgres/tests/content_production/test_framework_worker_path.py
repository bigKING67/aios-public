"""Worker-level source verification ordering without a database or paid calls."""
import contextlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production import segment_suggestion_worker as worker
from content_production.segment_suggestion_provider import ProviderResult, SuggestionError


class FrameworkWorkerPathTests(unittest.TestCase):
    def setUp(self):
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.work=Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        proxy=self.work/'proxy.mp4';proxy.write_bytes(b'fixture')
        source={'labels':[{'key':k,'name':k,'definition':''} for k in
               ('live_demo','mixed_voiceover')],'durationMs':30000,'presetName':'framework'}
        for name,value in [('load_source',source),('probe',{'durationMs':30000}),
                           ('build_proxy',proxy),('_shot_hint',(None,{}))]:
            self.stack.enter_context(patch.object(worker,name,return_value=value))
        for name in ['heartbeat','record_request']:
            self.stack.enter_context(patch.object(worker,name))
        self.publish=self.stack.enter_context(patch.object(worker,'publish',return_value=True))
        self.verify=self.stack.enter_context(patch.object(worker.framework_shot_verifier,'verify'))
        self.provider=Mock(model='doubao-seed-2-1-lite-260915',name='ark')
        self.provider.request_settings.return_value={'thinking':'enabled'}
        self.payload={'segments':[dict(start_sec=0,end_sec=12,label_key='live_demo',
            visual_kind='single_presenter',endorsement_marker='',continuous_start_sec=0,
            continuous_end_sec=12,same_person_as_previous=False,confidence=.9,reason='face'),
            dict(start_sec=12,end_sec=30,label_key='mixed_voiceover',visual_kind='montage',
            endorsement_marker='',continuous_start_sec=None,continuous_end_sec=None,
            same_person_as_previous=False,confidence=.9,reason='montage')]}
        self.provider.suggest.return_value=ProviderResult(self.payload,{'total_tokens':10},'first')
        self.stack.enter_context(patch.dict('os.environ',{'CONTENT_AI_STUDIO_SEGMENT_COVERS':'0'}))

    def run_job(self, version=worker.PROMPT_V15):
        return worker.suggest(Mock(),{'source_content_hash':'fixture'},self.provider,Mock(),
            self.work,min_ms=1000,proxy_limit=1000,prompt_version=version,snap=False)

    def test_v17_routes_editorial_gate_and_preserves_visual_witness_gate(self):
        self.verify.return_value = (self.payload, {'liveClaims': [dict(start_ms=0,end_ms=12000,minimum=10001)]})
        self.run_job(worker.PROMPT_V17)
        self.assertEqual(self.verify.call_args.kwargs, {'continuity':True,'editorial':True})
        self.assertEqual(self.publish.call_args.args[3][0]['label_key'],'live_demo')

    def test_v17_failed_editorial_gate_retains_usage_and_never_publishes(self):
        def invalid(*args, **kwargs):
            self.assertTrue(kwargs['editorial'])
            args[-1]({'total_tokens':30})
            raise ValueError('Unresolved editorial speaker ownership')
        self.verify.side_effect=invalid
        with self.assertRaises(SuggestionError) as caught:self.run_job(worker.PROMPT_V17)
        self.assertEqual(caught.exception.usage,{'total_tokens':40})
        self.publish.assert_not_called()

    def test_verifier_changes_and_all_usage_reach_publish(self):
        def verified(*args):
            args[-1]({'total_tokens':20})
            result={'segments':[dict(s,label_key='mixed_voiceover',visual_kind='montage')
                    for s in self.payload['segments']]}
            return result,{'policy':'fixture','calls':1}
        self.verify.side_effect=verified
        self.run_job()
        call=self.publish.call_args
        self.assertEqual([s['label_key'] for s in call.args[3]],['mixed_voiceover'])
        self.assertEqual(call.kwargs['usage'],{'total_tokens':30})
        self.assertEqual(call.kwargs['summary']['frameworkVerification']['calls'],1)

    def test_failed_visual_audit_never_publishes_and_keeps_usage(self):
        def invalid(*args):
            args[-1]({'total_tokens':20})
            raise ValueError('incomplete coverage')
        self.verify.side_effect=invalid
        with self.assertRaises(SuggestionError) as caught:self.run_job()
        self.assertEqual(caught.exception.code,'invalid_response')
        self.assertEqual(caught.exception.usage,{'total_tokens':30})
        self.publish.assert_not_called()

    def test_initial_incomplete_uses_same_lite_once_and_counts_both_requests(self):
        self.provider.thinking='enabled'; self.provider.fps=2
        self.provider.suggest.side_effect=SuggestionError('provider_incomplete','incomplete',{'total_tokens':10})
        self.provider.review.return_value=ProviderResult(self.payload,{'total_tokens':20},'repaired')
        self.verify.return_value=(self.payload,{'liveClaims':[dict(start_ms=0,end_ms=12000,minimum=10001)]})
        self.run_job(worker.PROMPT_V17)
        self.provider.suggest.assert_called_once(); self.provider.review.assert_called_once()
        self.assertEqual(self.provider.review.call_args.kwargs['thinking'],'disabled')
        self.assertEqual(self.publish.call_args.kwargs['usage'],{'total_tokens':30})

    def test_initial_transport_error_is_not_retried(self):
        self.provider.thinking='enabled'
        self.provider.suggest.side_effect=SuggestionError('provider_error','network',{})
        with self.assertRaises(SuggestionError):
            self.run_job(worker.PROMPT_V17)
        self.provider.review.assert_not_called(); self.publish.assert_not_called()
