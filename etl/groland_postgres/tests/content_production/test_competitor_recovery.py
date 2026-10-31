import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import contract, offline, recovery, selling_recovery, structure, taxonomy
from content_production.execution import Cancelled
from content_production.segment_suggestion_provider import ProviderResult, SuggestionError
from content_production.stage_timings import StageTimings

FRAMES = [{'segment_id': '0', 'start_ms': 0, 'end_ms': 31133, 'label_key': 'live_demo', 'label_name': '实拍内容'}]
LABELS = [{'key': 'moisturizing', 'name': '滋润保湿'}, {'key': 'no_caking', 'name': '妆效'}]
TRANSCRIPT = [[11230, 14930, '哇，好神奇啊，是不是很方便，'], [15010, 15555, '还很润。'],
              [16020, 21400, '你这妆色好好啊。']]
BAD = {'segments': [
    {'framework_index': 0, 'start_sec': 15.01, 'end_sec': 15.555, 'label_keys': ['moisturizing'],
     'continues_previous': False, 'quote': '还很润。'},
    {'framework_index': 0, 'start_sec': 16.02, 'end_sec': 21.4, 'label_keys': ['no_caking'],
     'continues_previous': True, 'quote': '你这妆色好好啊。'}]}
GOOD = {'segments': [{'framework_index': 0, 'start_sec': 11.23, 'end_sec': 15.555,
                      'label_keys': ['moisturizing'], 'continues_previous': False,
                      'quote': '哇，好神奇啊，是不是很方便，还很润。'}]}


class Provider:
    def __init__(self, *replies):
        self.replies, self.prompts, self.closed = list(replies), [], False

    def complete(self, prompt, _schema):
        self.prompts.append(prompt)
        reply = self.replies.pop(0)  # An unexpected third call fails the test.
        if isinstance(reply, Exception):
            raise reply
        return ProviderResult(payload=copy.deepcopy(reply), usage={'input_tokens': 100, 'output_tokens': 20},
                              response_id=f'r{len(self.prompts)}')

    def close(self):
        self.closed = True


class SellingRecoveryTest(unittest.TestCase):
    def run_case(self, provider, **kwargs):
        return selling_recovery.generate(FRAMES, LABELS, TRANSCRIPT, [], provider, StageTimings(), lambda: None, **kwargs)

    def test_short_clause_and_broken_chain_are_repaired_without_changing_input(self):
        before = copy.deepcopy((FRAMES, TRANSCRIPT))
        provider = Provider(BAD, GOOD)
        outcome = self.run_case(provider)
        self.assertEqual((FRAMES, TRANSCRIPT), before)
        self.assertEqual(len(outcome.points), 1)
        self.assertEqual((outcome.points[0]['start_ms'], outcome.points[0]['end_ms']), (11230, 15555))
        history = outcome.metadata['sellingPointRecovery']
        self.assertEqual(history['attempts'][0]['postprocess']['dropped']['too_short'], 1)
        self.assertEqual(history['attempts'][0]['postprocess']['dropped']['broken_chain'], 1)
        self.assertTrue(history['retryUsed'])
        self.assertFalse(history['exhausted'])
        self.assertNotIn('sellingPointError', outcome.metadata)
        self.assertEqual(outcome.usage, {'input_tokens': 200, 'output_tokens': 40})
        self.assertIn('完整口播句', provider.prompts[0])
        self.assertIn('filtered_all', provider.prompts[1])

    def test_genuine_empty_is_valid_but_empty_cannot_erase_failed_candidates(self):
        normal = Provider({'segments': []})
        self.assertNotIn('sellingPointError', self.run_case(normal).metadata)
        self.assertEqual(len(normal.prompts), 1)
        outcome = self.run_case(Provider(BAD, {'segments': []}))
        self.assertTrue(outcome.metadata['sellingPointRecovery']['exhausted'])
        self.assertIn('filtered_all', outcome.metadata['sellingPointError'])

    def test_historical_repair_has_only_one_remaining_call(self):
        provider = Provider(BAD)
        outcome = self.run_case(provider, allow_retry=False)
        self.assertEqual(len(provider.prompts), 1)
        self.assertTrue(outcome.metadata['sellingPointRecovery']['exhausted'])
        self.assertEqual(outcome.points, [])

    def test_historical_parse_error_is_in_first_request_with_no_extra_call(self):
        provider = Provider(GOOD)
        outcome = self.run_case(provider, allow_retry=False, previous_error='invalid_response: old body')
        self.assertEqual(len(provider.prompts), 1)
        self.assertIn('错误类型：invalid_response', provider.prompts[0])
        self.assertNotIn('old body', provider.prompts[0])
        self.assertFalse(outcome.metadata['sellingPointRecovery']['exhausted'])
        self.assertEqual(outcome.metadata['sellingPointRecovery']['feedback']['version'],
                         selling_recovery.FEEDBACK_VERSION)

    def test_parse_diagnostics_survive_exhausted_single_attempt(self):
        detail = {'version': 1, 'errorType': 'JSONDecodeError', 'jsonPosition': 4}
        provider = Provider(SuggestionError('invalid_response', '模型返回无法解析',
                                           {'input_tokens': 7}, diagnostics=detail))
        outcome = self.run_case(provider, allow_retry=False, previous_error='invalid_response')
        history = outcome.metadata['sellingPointRecovery']
        self.assertEqual(len(history['attempts']), 1)
        self.assertEqual(history['attempts'][0]['diagnostics'], detail)
        self.assertTrue(history['exhausted'])
        self.assertIn('sellingPointError', outcome.metadata)
        self.assertEqual(outcome.usage['input_tokens'], 7)

    def test_invalid_and_incomplete_output_can_retry_but_forbidden_cannot(self):
        for first in ({'wrong': []}, SuggestionError('provider_incomplete', '未完成', {'input_tokens': 7})):
            outcome = self.run_case(Provider(first, GOOD))
            self.assertNotIn('sellingPointError', outcome.metadata)
            self.assertEqual(outcome.usage['input_tokens'], 200 if isinstance(first, dict) else 107)
        provider = Provider(SuggestionError('provider_error', 'HTTP 403'))
        outcome = self.run_case(provider)
        self.assertEqual(len(provider.prompts), 1)
        self.assertFalse(outcome.metadata['sellingPointRecovery']['retryUsed'])
        self.assertIn('HTTP 403', outcome.metadata['sellingPointError'])

    def test_cancel_before_retry_preserves_known_usage_and_does_not_call_again(self):
        provider, ticks = Provider(BAD), []
        def tick():
            ticks.append(1)
            if len(ticks) > 1:
                raise Cancelled('stop')
        with self.assertRaises(Cancelled) as raised:
            selling_recovery.generate(FRAMES, LABELS, TRANSCRIPT, [], provider, StageTimings(), tick)
        self.assertEqual(raised.exception.billed_usage['input_tokens'], 100)
        self.assertEqual(len(provider.prompts), 1)


FRAMEWORK = [{'key': 'live_demo', 'name': '实拍内容'}]
PRESETS = ((2, FRAMEWORK, 1, LABELS), None)
VERSIONS = {'pipeline': 'test-pipeline', 'presets': {'framework': 2, 'sellingPoint': 1}, 'sellingPointPrompt': 'new-v2'}


def previous():
    return {'analysis_id': 'base', 'source_sha256': 'a' * 64, 'input_manifest_hash': 'b' * 64,
            'model_id': offline.MODEL, 'prompt_version': contract.PROMPT_VERSION,
            'taxonomy_version': taxonomy.TAXONOMY_VERSION, 'host_errors': [], 'evidence_objects': [{'objectKey': 'old'}],
            'card': {'evidence': [], 'segments': [], 'hook': {}, 'product': {}, 'claims': [], 'structure': {},
                     'framework': {'status': 'ok', **VERSIONS, 'sellingPointPrompt': 'old-v1',
                                   'segments': [{'startMs': 0, 'endMs': 31133, 'labelKey': 'live_demo'}],
                                   'transcript': copy.deepcopy(TRANSCRIPT), 'sellingPoints': [],
                                   'sellingPointError': 'filtered_all', 'sellingPointInput': {'screenLines': []},
                                   'labels': {'framework': {'live_demo': '实拍内容'}, 'sellingPoint': {}},
                                   'labelOrder': {'framework': ['live_demo'], 'sellingPoint': []},
                                   'costYuan': 9.9, 'usage': {'input_tokens': 9999}}}}


class PartReuseTest(unittest.TestCase):
    def plan(self, row):
        with patch.object(structure, 'versions', return_value=VERSIONS):
            return recovery.plan(row, PRESETS, 31.133)

    def test_model_and_framework_versions_fence_reuse(self):
        row = previous()
        row['model_id'] = 'different'
        self.assertIsNone(self.plan(row))
        row = previous()
        row['card']['framework']['pipeline'] = 'stale'
        plan = self.plan(row)
        self.assertTrue(plan.core)
        self.assertFalse(plan.framework)
        row = previous()
        row['host_errors'] = [{'severity': 'error', 'path': 'hook', 'message': 'bad ref'}]
        plan = self.plan(row)
        self.assertFalse(plan.core)
        self.assertTrue(plan.framework)
        row['card']['framework']['segments'][0]['endMs'] = 90000
        self.assertIsNone(self.plan(row))

    def test_invalid_stored_shapes_do_not_crash_or_reuse_broken_parts(self):
        row = previous()
        row['card'] = ['invalid']
        self.assertIsNone(self.plan(row))
        row = previous()
        row['host_errors'] = ['invalid']
        self.assertIsNone(self.plan(row))
        row = previous()
        row['card']['framework'] = ['invalid']
        self.assertFalse(self.plan(row).framework)
        row = previous()
        row['card']['framework']['segments'][0]['startMs'] = False
        self.assertFalse(self.plan(row).framework)

    def test_historical_empty_cannot_erase_known_filtered_candidates(self):
        plan = self.plan(previous())
        provider = Provider({'segments': []})
        with tempfile.TemporaryDirectory() as tmp:
            fw, _ = recovery.rebuild_structure(plan, PRESETS, Path('source'), 31.133, Path(tmp), lambda: None,
                                               lambda: provider, StageTimings(), allow_retry=False)
        self.assertIn('filtered_all', fw['sellingPointError'])
        self.assertTrue(fw['sellingPointRecovery']['exhausted'])

    def test_invalid_transcript_is_refreshed_without_rebuilding_framework(self):
        row = previous()
        row['card']['framework']['transcript'] = [[0, 999999, 'stale']]
        plan = self.plan(row)
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(recovery.segment_transcript, 'transcribe_local', return_value=(TRANSCRIPT, {})) as asr:
            fw, _ = recovery.rebuild_structure(plan, PRESETS, Path('source'), 31.133, Path(tmp), lambda: None,
                                               lambda: Provider(GOOD), StageTimings(), allow_retry=False)
        asr.assert_called_once()
        self.assertEqual(fw['transcript'], TRANSCRIPT)
        self.assertEqual(fw['segments'], row['card']['framework']['segments'])
        self.assertNotIn('transcriptError', fw)

    def test_selling_repair_keeps_framework_transcript_and_charges_only_new_call(self):
        row, provider = previous(), Provider(GOOD)
        before = copy.deepcopy(row)
        plan = self.plan(row)
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(recovery.segment_transcript, 'transcribe_local', side_effect=AssertionError('ASR must be reused')), \
                patch.object(recovery, 'build_proxy', side_effect=AssertionError('cached OCR must be reused')):
            fw, _ = recovery.rebuild_structure(plan, PRESETS, Path('source'), 31.133, Path(tmp), lambda: None,
                                               lambda: provider, StageTimings(), allow_retry=False)
        self.assertEqual(row, before)
        self.assertEqual(fw['segments'], row['card']['framework']['segments'])
        self.assertEqual(fw['transcript'], TRANSCRIPT)
        self.assertEqual(len(fw['sellingPoints']), 1)
        self.assertEqual(fw['usage']['input_tokens'], 100)
        self.assertLess(fw['costYuan'], 0.001)
        self.assertNotIn('sellingPointError', fw)
        self.assertTrue(provider.closed)
        record = recovery.card_record(plan, 31.133)
        self.assertEqual(record['cost']['online_yuan'], 0)
        self.assertEqual(record['input_manifest']['reusedCardAnalysisId'], 'base')

    def test_complete_structure_reuse_preserves_actual_prompt_version(self):
        row = previous()
        row['card']['framework'].pop('sellingPointError')
        plan = self.plan(row)
        with tempfile.TemporaryDirectory() as tmp:
            fw, recorded = recovery.rebuild_structure(plan, PRESETS, Path('source'), 31.133, Path(tmp), lambda: None,
                                                       lambda: self.fail('no provider call'), StageTimings())
        self.assertEqual(recorded['sellingPointPrompt'], 'old-v1')
        self.assertEqual(fw['usage'], {})
        self.assertEqual(fw['costYuan'], 0)


if __name__ == '__main__':
    unittest.main()
