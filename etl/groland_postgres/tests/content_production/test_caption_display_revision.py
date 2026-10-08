"""Whole-edit readability, rather than isolated ASR windows, decides revisions."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.semantic_captions import plan_semantic_captions
from content_production.caption_revision import revise_captions
from edit_document_fixture import fixture


def sample(next_start=8480):
    tokens=list('就是这款')+['Glow','and','You']+list('白金洗发水')
    starts=[6200,6400,6480,6640,7000,7240,7360,7520,7680,7840,8000,8120]
    ends=[6400,6480,6640,6800,7240,7360,7440,7680,7800,8000,8120,8320]
    words=[{'text':t,'start_time':s,'end_time':e} for t,s,e in zip(tokens,starts,ends)]
    words += [{'text':c,'start_time':next_start+i*200,'end_time':next_start+(i+1)*200} for i,c in enumerate('非常好用')]
    raw={'utterances':[{'text':'就是这款GlowandYou白金洗发水，非常好用。','words':words}]}
    options=dict(model='fixture',clip_id='voice-clip',asset_version_id='voice-version',source_start_ms=6200,source_end_ms=next_start+800)
    plan=plan_semantic_captions(raw,call_model=lambda _: {'groups':[
        {'lines':['就是这款','GlowandYou']},{'lines':['白金洗发水']},{'lines':['非常好用']}]},**options)
    doc,_,_=fixture();doc['captionDisplayPolicy']='source-hold-v1';doc['captions']=plan['captions']
    doc['clips'][2]['sourceMap'][0].update(sourceStart={'num':6,'den':1},sourceEnd={'num':10,'den':1})
    return raw,plan,doc,options


class DisplayRevisionTests(unittest.TestCase):
    def test_display_aware_regroup_is_accepted_without_changing_source_words(self):
        raw,plan,doc,options=sample();before=copy.deepcopy(doc)
        call=MagicMock(return_value={'groups':[{'end':4,'lineEnds':[4]},{'end':12,'lineEnds':[7,12]}]})
        revised=revise_captions(raw,plan,call_model=call,display_document=doc,output_mode='boundaries',max_calls=1,**options)
        self.assertEqual(revised['warnings'],[])
        self.assertEqual(revised['revision']['appliedWindows'],1)
        self.assertEqual(revised['captions'][1]['text'],'GlowandYou\n白金洗发水')
        self.assertEqual(revised['displayAssessment']['displayCues'][1]['endFrame'],75)
        self.assertEqual(revised['captions'][-1],plan['captions'][-1])
        self.assertEqual(doc,before)
        self.assertEqual(call.call_count,1)

    def test_next_frozen_caption_prevents_false_local_success(self):
        raw,plan,doc,options=sample(next_start=8350)
        revised=revise_captions(raw,plan,call_model=lambda _: {'groups':[
            {'end':4,'lineEnds':[4]},{'end':12,'lineEnds':[7,12]}]},
            display_document=doc,output_mode='boundaries',max_calls=1,**options)
        self.assertEqual(revised['revision']['appliedWindows'],0)
        self.assertEqual(revised['captions'],plan['captions'])

    def test_mismatched_document_fails_before_model(self):
        raw,plan,doc,options=sample();doc['captions']=[];call=MagicMock()
        with self.assertRaisesRegex(ValueError,'frozen caption plan'):
            revise_captions(raw,plan,call_model=call,display_document=doc,**options)
        call.assert_not_called()

    def test_existing_line_boundary_can_move_without_model_or_new_word_split(self):
        raw,plan,doc,options=sample();call=MagicMock()
        revised=revise_captions(raw,plan,call_model=call,display_document=doc,
                               output_mode='boundaries',max_calls=0,**options)
        call.assert_not_called()
        self.assertEqual(revised['warnings'],[])
        self.assertEqual(revised['captions'][0]['text'],'就是这款')
        self.assertEqual(revised['captions'][1]['text'],'GlowandYou\n白金洗发水')
        self.assertEqual(revised['revision']['boundarySearch']['changes'][0]['boundaryAfter'],4)
        raw,plan,doc,options=sample(next_start=8350)
        revised=revise_captions(raw,plan,call_model=call,display_document=doc,
                               output_mode='boundaries',max_calls=0,**options)
        self.assertEqual(revised['captions'],plan['captions'])
        self.assertEqual(revised['revision']['boundarySearch']['changes'],[])


if __name__=='__main__': unittest.main()
