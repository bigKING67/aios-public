import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production import framework_shot_verifier as verifier
from content_production.segment_suggestion_provider import ProviderResult, SuggestionError
from content_production.segment_suggestion_contract import merge_usage
from content_production.execution import Cancelled


class VerifierTests(unittest.TestCase):
    def setUp(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        self.work=Path(folder.name);self.board=self.work/'board.jpg';self.board.write_bytes(b'fixture')
        self.provider=Mock(model=verifier.MODEL)
        self.provider.request_settings.return_value={'thinking':'enabled'}
        self.frames=[dict(index=0,start_ms=0,end_ms=12000)]
        self.payload={'segments':[dict(start_sec=0,end_sec=12,label_key='live_demo',
            visual_kind='single_presenter',endorsement_marker='',same_person_as_previous=False,
            continuous_start_sec=0,continuous_end_sec=12,confidence=.9,reason='visible') ]}
        self.obs={'shots':[dict(index=0,visible_person_id='P1',role='presenter',
            visible_link='same_person_visible',evidence='face')]}
        self.context={'units':[dict(unit_id=0,kind='demonstration',evidence='demo')]}
        self.usage={'total_tokens':10}

    def run_verify(self,tick=lambda:None):
        def account(value):
            self.usage=merge_usage(self.usage,value);return self.usage
        with patch.object(verifier.media,'prepare',return_value=(self.frames,[self.board])), \
             patch.object(verifier,'call_with_ticks',side_effect=lambda fn,*args:fn()):
            return verifier.verify(self.payload,Path('source'),Path('proxy'),12000,
                {'live_demo','mixed_voiceover'},self.work,{},tick,self.provider,900,account)

    def test_success_accounts_every_call_and_retains_source_receipt(self):
        self.provider.review.side_effect=[ProviderResult(self.obs,{'total_tokens':20},'one'),
            ProviderResult(self.context,{'total_tokens':30},'two')]
        payload,receipt=self.run_verify()
        self.assertEqual(self.usage,{'total_tokens':60})
        self.assertEqual(receipt['responseIds'],['one','two'])
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_failed_context_keeps_first_proposal_observation_and_failure_usage(self):
        self.provider.review.side_effect=[ProviderResult(self.obs,{'total_tokens':20},'one'),
            SuggestionError('provider_incomplete','incomplete',{'total_tokens':7})]
        with self.assertRaises(SuggestionError) as caught:self.run_verify()
        self.assertEqual(caught.exception.usage,{'total_tokens':37})

    def test_incomplete_observations_fail_before_additional_context_charge(self):
        self.provider.review.return_value=ProviderResult({'shots':[]},{'total_tokens':20},'one')
        with self.assertRaises(ValueError):self.run_verify()
        self.assertEqual(self.provider.review.call_count,1)
        self.assertEqual(self.usage,{'total_tokens':30})

    def test_cancellation_or_wrong_model_prevents_review_call(self):
        def cancel():raise Cancelled('cancelled')
        with self.assertRaises(Cancelled):self.run_verify(cancel)
        self.provider.review.assert_not_called()
        self.provider.model='doubao-seed-2-0-pro'
        with self.assertRaises(ValueError):self.run_verify()
        self.provider.review.assert_not_called()

    def test_one_bounded_fact_repair_is_billed_and_recorded(self):
        bad={'shots':[dict(self.obs['shots'][0],visible_person_id='')]}
        self.provider.review.side_effect=[ProviderResult(bad,{'total_tokens':20},'one'),
            ProviderResult(self.obs,{'total_tokens':7},'repair'),
            ProviderResult(self.context,{'total_tokens':30},'two')]
        payload,receipt=self.run_verify()
        self.assertEqual(self.usage,{'total_tokens':67})
        self.assertEqual(receipt['factRepairIndices'],[0])
        self.assertEqual(receipt['calls'],3)
        self.assertEqual(payload['segments'][0]['label_key'],'live_demo')

    def test_failed_fact_repair_is_not_retried_or_followed_by_context(self):
        bad={'shots':[dict(self.obs['shots'][0],visible_person_id='')]}
        self.provider.review.side_effect=[ProviderResult(bad,{'total_tokens':20},'one'),
            ProviderResult(bad,{'total_tokens':7},'repair')]
        with self.assertRaises(ValueError):self.run_verify()
        self.assertEqual(self.provider.review.call_count,2)
        self.assertEqual(self.usage,{'total_tokens':37})
