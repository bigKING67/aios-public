import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import selling_point_screen, segment_transcript  # noqa: E402
from content_production.competitor_analysis import structure  # noqa: E402
from content_production.execution import Cancelled  # noqa: E402
from content_production.segment_suggestion_provider import ProviderResult  # noqa: E402
from content_production.stage_timings import StageTimings  # noqa: E402

FRAMEWORK = [{'key': 'mixed_voiceover', 'name': '混剪口播', 'definition': ''},
             {'key': 'live_demo', 'name': '实拍内容', 'definition': ''}]
POINTS = [{'key': 'no_caking', 'name': '妆效', 'definition': ''}, {'key': 'long_wear', 'name': '持妆', 'definition': ''}]
SEGMENTS = [{'start_ms': 0, 'end_ms': 8000, 'label_key': 'live_demo'},
            {'start_ms': 8000, 'end_ms': 20000, 'label_key': 'mixed_voiceover'}]
TRANSCRIPT = [[0, 2000, '开场'], [9000, 12000, '这个睫毛膏不结块'], [12000, 15000, '一整天不晕']]


class FakeProvider:
    def __init__(self, payload):
        self.payload, self.prompts, self.closed = payload, [], False

    def complete(self, prompt, schema):
        self.prompts.append((prompt, schema))
        return ProviderResult(payload=self.payload, usage={'input_tokens': 1000, 'output_tokens': 100}, response_id='r1')

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, rows):
        self.rows, self.rolled_back = rows, False

    def cursor(self, **_kwargs):
        conn = self

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, _sql, params):
                self.key = params[0]

            def fetchone(self):
                return conn.rows.get(self.key)
        return Cursor()

    def commit(self):
        pass

    def rollback(self):
        self.rolled_back = True


PRESETS = {'framework': {'version': 2, 'labels': FRAMEWORK}, 'selling_point': {'version': 1, 'labels': POINTS}}


class GenerateTest(unittest.TestCase):
    def run_generate(self, payload, segments=SEGMENTS, transcript=TRANSCRIPT):
        provider = FakeProvider(payload)
        with patch('content_production.framework_v2.pipeline.run', return_value=(segments, {}, {'input_tokens': 5000})), \
                patch.object(segment_transcript, 'transcribe_local', return_value=(transcript, {})), \
                patch.object(selling_point_screen, 'screen_lines', return_value=(['[9.0–12.0 秒] 不结块'], {})):
            result = structure.generate(Path('s.mp4'), Path('p.mp4'), 20000, FRAMEWORK, POINTS, provider,
                                        Path(self.tmp), {}, lambda: None)
        return provider, result

    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()

    def test_selling_points_point_back_to_the_full_framework_list(self):
        payload = {'segments': [{'framework_index': 1, 'start_sec': 9.0, 'end_sec': 12.0, 'label_keys': ['no_caking'],
                                 'continues_previous': False, 'quote': '这个睫毛膏不结块', 'reason': '口播'}]}
        provider, (segments, found, transcript, usage, problems) = self.run_generate(payload)
        self.assertNotIn('sellingPointError', problems)
        self.assertFalse(problems['sellingPointRecovery']['retryUsed'])
        self.assertEqual(problems['sellingPointInput']['screenLines'], ['[9.0–12.0 秒] 不结块'])
        self.assertEqual(len(provider.prompts), 1)
        self.assertIn('下面列出全部框架段', provider.prompts[0][0])
        self.assertIn('实拍内容', provider.prompts[0][0])
        self.assertEqual(found[0]['segment_index'], 1)
        self.assertEqual(usage, {'input_tokens': 6000, 'output_tokens': 100})
        card = structure.shape(segments, found, transcript, usage, FRAMEWORK, POINTS, {'pipeline': 'v'})
        self.assertEqual(card['status'], 'ok')
        self.assertEqual(card['segments'][1], {'startMs': 8000, 'endMs': 20000, 'labelKey': 'mixed_voiceover'})
        self.assertEqual(card['sellingPoints'], [{'startMs': 9000, 'endMs': 12000, 'labelKeys': ['no_caking'],
                                                  'segmentIndex': 1, 'quote': '这个睫毛膏不结块'}])
        self.assertEqual(card['labels']['sellingPoint']['no_caking'], '妆效')
        self.assertEqual(card['labelOrder'], {'framework': ['mixed_voiceover', 'live_demo'], 'sellingPoint': ['no_caking', 'long_wear']})
        self.assertEqual(card['transcript'][1], [9000, 12000, '这个睫毛膏不结块'])
        self.assertGreater(card['costYuan'], 0)

    def test_a_failed_selling_point_call_keeps_segments_and_script(self):
        from content_production.segment_suggestion_provider import SuggestionError

        class Failing(FakeProvider):
            def complete(self, prompt, schema):
                raise SuggestionError('provider_incomplete', '模型未完成输出', {'input_tokens': 900})
        provider = Failing({})
        timings = StageTimings()
        with patch('content_production.framework_v2.pipeline.run', return_value=(SEGMENTS, {}, {'input_tokens': 5000})), \
                patch.object(segment_transcript, 'transcribe_local', return_value=(TRANSCRIPT, {})), \
                patch.object(selling_point_screen, 'screen_lines', return_value=([], {})):
            segments, found, transcript, usage, problems = structure.generate(
                Path('s.mp4'), Path('p.mp4'), 20000, FRAMEWORK, POINTS, provider, Path(self.tmp), {}, lambda: None,
                timings=timings)
        self.assertEqual((segments, found, transcript), (SEGMENTS, [], TRANSCRIPT))
        self.assertEqual(problems['sellingPointError'], 'provider_incomplete: 模型未完成输出')
        self.assertTrue(problems['sellingPointRecovery']['exhausted'])
        self.assertEqual(len(problems['sellingPointRecovery']['attempts']), 2)
        self.assertEqual(usage, {'input_tokens': 6800})
        measured = timings.snapshot('before_result_write')['stages']
        self.assertEqual(measured['selling_cloud']['failures'], 2)
        self.assertIn('asr_local', measured)
        self.assertIn('framework_total', measured)

    def test_screen_text_reuses_the_pipeline_ocr(self):
        provider = FakeProvider({'segments': []})
        shots = [{'start': 0.0, 'end': 8.0, 'ocr': ['明星同款']}, {'start': 8.0, 'end': 20.0, 'ocr': ['不结块']}]

        def run(*_args, evidence_sink=None, **_kwargs):
            evidence_sink({'shots': shots})
            return SEGMENTS, {}, {}
        with patch('content_production.framework_v2.pipeline.run', side_effect=run), \
                patch.object(segment_transcript, 'transcribe_local', return_value=(TRANSCRIPT, {})), \
                patch.object(selling_point_screen, 'screen_lines', side_effect=AssertionError('no second OCR pass')):
            structure.generate(Path('s.mp4'), Path('p.mp4'), 20000, FRAMEWORK, POINTS, provider, Path(self.tmp), {}, lambda: None)
        prompt = provider.prompts[0][0]
        self.assertIn('[0.0–8.0 秒] 明星同款', prompt)
        self.assertIn('[8.0–20.0 秒] 不结块', prompt)
        self.assertIsNone(structure.screen_from_shots([]))

    def test_cancelled_selling_call_keeps_framework_and_selling_usage(self):
        cancelled = Cancelled('stop')
        cancelled.billed_usage = {'input_tokens': 100}
        with patch('content_production.framework_v2.pipeline.run', return_value=(SEGMENTS, {}, {'input_tokens': 5000})), \
                patch.object(segment_transcript, 'transcribe_local', return_value=(TRANSCRIPT, {})), \
                patch.object(structure, '_selling_points', side_effect=cancelled):
            with self.assertRaises(Cancelled) as raised:
                structure.generate(Path('s.mp4'), Path('p.mp4'), 20000, FRAMEWORK, POINTS, FakeProvider({}),
                                   Path(self.tmp), {}, lambda: None)
        self.assertEqual(raised.exception.billed_usage, {'input_tokens': 5100})

    def test_selling_points_are_found_in_live_footage_too(self):
        payload = {'segments': [{'framework_index': 0, 'start_sec': 0.0, 'end_sec': 2.0, 'label_keys': ['long_wear'],
                                 'continues_previous': False, 'quote': '开场', 'reason': '口播'}]}
        provider, (_, found, _, _, _) = self.run_generate(payload, segments=SEGMENTS[:1])
        self.assertEqual(len(provider.prompts), 1)
        self.assertEqual([(item['segment_index'], item['label_keys']) for item in found], [(0, ['long_wear'])])

    def test_a_failed_transcript_keeps_the_framework_segments(self):
        provider = FakeProvider({'segments': []})
        with patch('content_production.framework_v2.pipeline.run', return_value=(SEGMENTS, {}, {'input_tokens': 5000})), \
                patch.object(segment_transcript, 'transcribe_local', side_effect=RuntimeError('403')):
            segments, found, transcript, _, problems = structure.generate(
                Path('s.mp4'), Path('p.mp4'), 20000, FRAMEWORK, POINTS, provider, Path(self.tmp), {}, lambda: None)
        self.assertEqual((segments, found, transcript, provider.prompts, problems),
                         (SEGMENTS, [], [], [], {'transcriptError': 'RuntimeError: 403'}))
        card = structure.shape(segments, found, transcript, {}, FRAMEWORK, POINTS, {}, problems)
        self.assertEqual((card['status'], card['transcriptError']), ('ok', 'RuntimeError: 403'))


class QuoteTest(unittest.TestCase):
    def test_quotes_lose_the_modality_prefix_and_outer_quotes(self):
        self.assertEqual(structure.clean_quote('口播“说是加了什么冰感保湿”。'), '说是加了什么冰感保湿')
        self.assertEqual(structure.clean_quote('口播“说是加了什么冰感保湿”'), '说是加了什么冰感保湿')
        self.assertEqual(structure.clean_quote('字幕：「明星同款」'), '明星同款')
        self.assertEqual(structure.clean_quote('“一整天”不晕“真的”'), '“一整天”不晕“真的”')
        self.assertEqual(structure.clean_quote('屏幕文字显示：ally爱用底妆'), '屏幕文字显示：ally爱用底妆')


class BuildTest(unittest.TestCase):
    def test_missing_preset_is_unavailable(self):
        field, recorded = structure.build(structure.load_presets(FakeConn({})), Path('s.mp4'), 20.0, Path('.'), lambda: None)
        self.assertEqual((field['status'], recorded), ('unavailable', None))

    def test_a_node_without_local_v2_is_unavailable(self):
        def provider():
            raise structure.Unavailable('当前节点没有本地框架切段（local-v2）')
        field, recorded = structure.build(structure.load_presets(FakeConn(PRESETS)), Path('s.mp4'), 20.0, Path('.'), lambda: None, provider)
        self.assertEqual(field, {'status': 'unavailable', 'reason': '当前节点没有本地框架切段（local-v2）'})
        self.assertIsNone(recorded)

    def test_failures_and_a_stopping_worker_keep_the_card(self):
        provider = FakeProvider({})
        for error, reason in ((RuntimeError('ocr down'), 'RuntimeError: ocr down'),
                              (Cancelled('stop'), 'worker 停止，未生成框架与脚本')):
            with patch.object(structure, 'versions', return_value={'pipeline': 'v'}), \
                    patch('content_production.segment_suggestion_provider.build_proxy', return_value=Path('p.mp4')), \
                    patch.object(structure, 'generate', side_effect=error):
                field, _ = structure.build(structure.load_presets(FakeConn(PRESETS)), Path('s.mp4'), 20.0, Path('.'), lambda: None, lambda: provider)
            self.assertEqual((field['status'], field['reason']), ('failed', reason))
        self.assertTrue(provider.closed)


if __name__ == '__main__':
    unittest.main()
