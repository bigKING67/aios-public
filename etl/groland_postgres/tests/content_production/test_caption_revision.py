import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.semantic_captions import plan_semantic_captions
from content_production.caption_revision import revise_captions

TEXT = '头油头痒还掉小雪花的还是用它'
ORIGINAL = {'groups': [{'lines': ['头油头痒还掉', '小雪花的还是用它']}]}
BETTER = {'groups': [{'lines': ['头油头痒']}, {'lines': ['还掉小雪花的', '还是用它']}]}


def fixture():
    result = {'utterances': [{'text': '头油头痒，还掉小雪花的还是用它。',
        'words': [{'text': c, 'start_time': i*200, 'end_time': (i+1)*200} for i,c in enumerate(TEXT)]}]}
    options = dict(model='fixture', clip_id='v', asset_version_id='a', source_start_ms=0, source_end_ms=2800)
    plan = plan_semantic_captions(result, call_model=lambda _: ORIGINAL, **options)
    return result, plan, options


class CaptionRevisionTests(unittest.TestCase):
    def test_layout_repair_needs_no_model_and_keeps_cue_times(self):
        text='关键是它洗一次管三天'
        raw={'utterances':[{'text':text+'。','words':[
            {'text':c,'start_time':i*300,'end_time':(i+1)*300} for i,c in enumerate(text)]}]}
        options=dict(model='fixture',clip_id='v',asset_version_id='a',source_start_ms=0,source_end_ms=len(text)*300)
        original=plan_semantic_captions(raw,call_model=lambda _: {'groups':[
            {'lines':['关键是','它']},{'lines':['洗一次管三天']}]},**options)
        before=copy.deepcopy(original);model=MagicMock()
        revised=revise_captions(raw,original,call_model=model,max_calls=0,**options)
        model.assert_not_called()
        self.assertEqual(original,before)
        self.assertEqual(revised['captions'][0]['text'],'关键是它')
        self.assertEqual(revised['captions'][0]['anchor'],original['captions'][0]['anchor'])
        self.assertEqual(revised['warnings'],[])
        self.assertEqual(revised['revision']['hostLineLayout'][0]['reason'],'short_clause_single_line')

    def test_improvement_is_grounded_and_original_immutable(self):
        result, original, options = fixture(); before = copy.deepcopy(original); calls=[]
        def model(messages): calls.append(messages); return BETTER
        revised = revise_captions(result, original, call_model=model, **options)
        self.assertEqual(revised['warnings'], [])
        self.assertEqual(revised['revision']['appliedWindows'], 1)
        self.assertEqual(original, before)
        self.assertEqual(len(calls), 1)
        self.assertIn('issues', json.loads(calls[0][1]['content']))

    def test_indexed_revision_preserves_text_and_records_candidate_version(self):
        result, original, options = fixture()
        response = {'groups':[{'end':4,'lineEnds':[4]},{'end':14,'lineEnds':[10,14]}]}
        revised = revise_captions(result, original, call_model=lambda _: response,
                                 output_mode='boundaries', max_calls=1, **options)
        self.assertEqual(revised['warnings'], [])
        self.assertEqual(revised['revision']['appliedWindows'],1)
        self.assertEqual(''.join(c['text'].replace('\n','') for c in revised['captions']),TEXT)
        self.assertEqual(revised['revision']['attempts'][0]['candidateProvenance']['outputMode'],'boundaries')

    def test_invalid_or_unimproved_candidate_keeps_original(self):
        result, original, options = fixture()
        for response in [ORIGINAL, {'groups': [{'lines': ['篡改']}] }]:
            revised = revise_captions(result, original, call_model=lambda _: response, **options)
            self.assertEqual(revised['captions'], original['captions'])
            self.assertEqual(revised['revision']['appliedWindows'], 0)

    def test_budget_and_stale_source_are_checked_before_call(self):
        result, original, options = fixture(); model=MagicMock()
        revised=revise_captions(result, original, call_model=model, max_calls=0, **options)
        self.assertEqual(revised['captions'], original['captions']); model.assert_not_called()
        original['captions'][0]['anchor']['assetVersionId']='stale'
        with self.assertRaisesRegex(ValueError, 'binding'):
            revise_captions(result, original, call_model=model, **options)
        model.assert_not_called()

    def test_transport_failure_preserves_candidate(self):
        result, original, options = fixture()
        revised=revise_captions(result, original, call_model=MagicMock(side_effect=TimeoutError()), **options)
        self.assertEqual(revised['captions'], original['captions'])
        self.assertEqual(revised['revision']['attempts'][0]['status'], 'transport_failed')


if __name__ == '__main__': unittest.main()
