import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.semantic_captions import plan_semantic_captions


class GroupRepairTests(unittest.TestCase):
    def fixture(self):
        words = list('就是这款') + ['Glow','and','You'] + list('白金洗发水')
        return {'utterances':[{'text':''.join(words),'words':[
            {'text':w,'start_time':i*250,'end_time':(i+1)*250} for i,w in enumerate(words)]}]}

    def plan(self, model, **kw):
        return plan_semantic_captions(self.fixture(),call_model=model,model='fixture',clip_id='voice',
            asset_version_id='frozen',source_start_ms=0,source_end_ms=3000,**kw)

    def test_neighbor_regroup_keeps_brand_text_and_clock_with_one_extra_call(self):
        model = MagicMock(side_effect=[
            {'groups':[{'lines':['就是这款','GlowandYou白金']},{'lines':['洗发水']}]},
            {'groups':[{'lines':['就是这款','GlowandYou']},{'lines':['白金洗发水']}]}])
        p = self.plan(model,repair_calls=1)
        self.assertEqual(model.call_count,2)
        self.assertEqual(''.join(c['text'].replace('\n','') for c in p['captions']),'就是这款GlowandYou白金洗发水')
        self.assertIn('GlowandYou',p['captions'][0]['text'].split('\n'))
        self.assertEqual(p['captions'][-1]['anchor']['sourceEnd']['num'],3000)
        self.assertEqual(len(p['provenance']['layoutRepairs']),1)
        self.assertFalse(p['termsVerified'])

    def test_default_does_not_spend_on_repair(self):
        model=MagicMock(return_value={'groups':[{'lines':['就是这款','GlowandYou白金']},{'lines':['洗发水']}]})
        with self.assertRaisesRegex(ValueError,'exceeds capacity'): self.plan(model)
        self.assertEqual(model.call_count,1)

    def test_rewrite_is_not_repairable_and_invalid_budget_never_calls(self):
        model=MagicMock(return_value={'groups':[{'lines':['改写']} ]})
        with self.assertRaises(ValueError): self.plan(model,repair_calls=1)
        self.assertEqual(model.call_count,1)
        model.reset_mock()
        with self.assertRaises(ValueError): self.plan(model,repair_calls=3)
        model.assert_not_called()

    def test_repair_must_not_split_brand_across_lines(self):
        model=MagicMock(side_effect=[
            {'groups':[{'lines':['就是这款','GlowandYou白金']},{'lines':['洗发水']}]},
            {'groups':[{'lines':['就是这款Glow','andYou白金']},{'lines':['洗发水']}]}])
        with self.assertRaises(ValueError): self.plan(model,repair_calls=2)
        self.assertEqual(model.call_count,2)

    def test_late_negation_omission_blocks_repair_even_if_earlier_line_overflows(self):
        result = self.fixture()
        utterance = result['utterances'][0]
        utterance['text'] += '谁能不爱啊'
        utterance['words'].append({'text':'谁能不爱啊','start_time':3000,'end_time':4000})
        model=MagicMock(return_value={'groups':[
            {'lines':['就是这款','GlowandYou白金']},{'lines':['洗发水']},{'lines':['谁能爱啊']}]})
        with self.assertRaisesRegex(ValueError,'changed source text'):
            plan_semantic_captions(result,call_model=model,model='fixture',clip_id='voice',
                asset_version_id='frozen',source_start_ms=0,source_end_ms=4000,repair_calls=1)
        self.assertEqual(model.call_count,1)
