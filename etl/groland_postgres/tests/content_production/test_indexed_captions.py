import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.indexed_captions import plan_indexed_captions

class IndexedTests(unittest.TestCase):
    def plan(self, response, tokens=None):
        tokens=tokens or list('谁能不爱啊')
        result={'utterances':[{'text':''.join(tokens),'words':[
            {'text':t,'start_time':i*250,'end_time':(i+1)*250} for i,t in enumerate(tokens)]}]}
        callback=MagicMock(return_value=response)
        plan=plan_indexed_captions(result,call_model=callback,model='fixture',clip_id='voice',
            asset_version_id='frozen',source_start_ms=0,source_end_ms=len(tokens)*250)
        return plan,callback
    def test_text_is_reconstructed_including_negation(self):
        plan,_=self.plan({'groups':[{'end':5,'lineEnds':[5]}]})
        self.assertEqual(plan['captions'][0]['text'],'谁能不爱啊')
        self.assertEqual(plan['provenance']['outputMode'],'boundaries')
    def test_single_line_fit_preserves_clause_breaks_and_timing(self):
        from content_production.caption_boundary_layout import fit_boundaries
        words=[{'text':c,'startMs':i*200,'endMs':(i+1)*200} for i,c in enumerate('关键是它')]
        original={'groups':[{'end':4,'lineEnds':[3,4]}]}
        fitted,repairs=fit_boundaries(words,original,set(),[4])
        self.assertEqual(fitted,{'groups':[{'end':4,'lineEnds':[4]}]})
        self.assertEqual(repairs[0]['reason'],'short_clause_single_line')
        self.assertEqual(original['groups'][0]['lineEnds'],[3,4])
        self.assertEqual(fit_boundaries(words,original,set(),[3,4]),(original,[]))
    def test_missing_tail_duplicate_and_injected_text_are_rejected(self):
        for response in [{'groups':[{'end':4,'lineEnds':[4]}]},
            {'groups':[{'end':5,'lineEnds':[2,2]}]},
            {'groups':[{'end':5,'lineEnds':[5],'text':'谁能爱啊'}]},
            {'groups':[{'end':True,'lineEnds':[True]}]}]:
            with self.subTest(response=response),self.assertRaises(ValueError): self.plan(response)
    def test_brand_spanning_asr_words_is_protected(self):
        plan,call=self.plan({'groups':[{'end':3,'lineEnds':[3]}]},['Glow','and','You'])
        payload=json.loads(call.call_args.args[0][1]['content'])
        self.assertEqual(payload['forbiddenEnds'],[1,2])
        self.assertEqual(plan['captions'][0]['text'],'GlowandYou')
        with self.assertRaises(ValueError):
            self.plan({'groups':[{'end':3,'lineEnds':[1,3]}]},['Glow','and','You'])

    def test_responses_transport_uses_boundary_schema(self):
        from content_production.semantic_captions import chat_completion_callback
        response=MagicMock(status_code=200)
        response.iter_content.return_value=[json.dumps({'status':'completed','output_text':
            json.dumps({'groups':[{'end':5,'lineEnds':[5]}]})}).encode()]
        with patch('requests.post') as post:
            post.return_value.__enter__.return_value=response
            callback=chat_completion_callback(base_url='https://fixture.invalid/v3',api_key='fixture',
                model='fixture',protocol='responses',output_mode='boundaries')
            self.assertEqual(callback([])['groups'][0]['end'],5)
            item=post.call_args.kwargs['json']['text']['format']['schema']['properties']['groups']['items']
            self.assertEqual(item['required'],['end','lineEnds'])
            self.assertNotIn('lines',item['properties'])

    def test_host_fits_wide_group_without_deleting_or_splitting_brand(self):
        tokens=list('就是这款')+['Glow','and','You']+list('白金洗发水')
        plan,_=self.plan({'groups':[{'end':12,'lineEnds':[7,12]}]},tokens)
        self.assertEqual(''.join(c['text'].replace('\n','') for c in plan['captions']),''.join(tokens))
        self.assertEqual(len(plan['captions']),2)
        self.assertIn('GlowandYou',plan['captions'][0]['text'].split('\n'))
        self.assertEqual(len(plan['provenance']['hostLineLayout']),1)
