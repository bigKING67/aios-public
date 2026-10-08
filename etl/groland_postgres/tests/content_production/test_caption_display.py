"""Source evidence stays fixed while explicitly enabled display holds are bounded."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.edit_document import compile_document, resolve_caption_display
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from edit_document_fixture import fixture


def cue(ident, start, end, text='完整字幕'):
    return {'id':ident, 'text':text, 'stylePreset':'basic-bottom-v1',
            'anchor':{'kind':'source','clipId':'voice-clip','assetVersionId':'voice-version',
                      'sourceStart':{'num':start,'den':1000},'sourceEnd':{'num':end,'den':1000}}}


class CaptionDisplayTests(unittest.TestCase):
    def test_opt_in_hold_and_receipt_match_renderer_without_mutation(self):
        doc, bindings, media = fixture()
        doc['captions']=[cue('a',1000,1500)]
        self.assertEqual(resolve_caption_display(doc)[0]['endFrame'],15)
        doc['captionDisplayPolicy']='source-hold-v1'
        before=copy.deepcopy(doc)
        spec=compile_document(doc,bindings,media,'hold')
        self.assertEqual(spec['clips'][0]['captions'][0]['to'],0.6)
        receipt=assess_rendered_captions(doc)
        self.assertEqual(receipt['displayCues'][0]['speechEndFrame'],15)
        self.assertEqual(receipt['displayCues'][0]['endFrame'],18)
        self.assertEqual(receipt['warnings'],[])
        self.assertEqual(doc,before)
        self.assertEqual(caption_delivery_reason({'editDocument':doc},{'caption_quality':receipt}),'caption_quality_pending')
        receipt['displayCues'][0]['endFrame']=19
        self.assertEqual(caption_delivery_reason({'editDocument':doc},{'caption_quality':receipt}),'caption_quality_receipt_invalid')

    def test_hold_stops_at_next_caption_cut_clip_end_and_budget(self):
        for start,end,next_start,expected in [(1000,1100,None,12), # 3+9 frames, still too short
                                              (1000,1500,1530,16), # next caption onset
                                              (2500,2950,None,60), # video cut at 2s timeline
                                              (4500,4950,None,120)]: # audio/document end
            with self.subTest(start=start):
                doc, bindings, media=fixture(); doc['captionDisplayPolicy']='source-hold-v1'
                doc['captions']=[cue('a',start,end)]
                if next_start: doc['captions'].append(cue('b',next_start,2500))
                compile_document(doc,bindings,media,'bounds')
                self.assertEqual(resolve_caption_display(doc)[0]['endFrame'],expected)
        doc,bindings,media=fixture();doc['captionDisplayPolicy']='source-hold-v1'
        doc['clips'][2]['timeline']['endFrame']=45
        doc['clips'][2]['sourceMap'][0].update(endFrame=45,sourceEnd={'num':5,'den':2})
        doc['captions']=[cue('a',2200,2400)]
        compile_document(doc,bindings,media,'clip end')
        self.assertEqual(resolve_caption_display(doc)[0]['endFrame'],45)

    def test_timeline_cues_are_not_extended_and_unknown_policy_fails(self):
        doc,bindings,media=fixture();doc['captionDisplayPolicy']='source-hold-v1'
        doc['captions']=[{'id':'title','text':'标题','stylePreset':'basic-bottom-v1',
                          'anchor':{'kind':'timeline','startFrame':0,'endFrame':10}}]
        self.assertEqual(resolve_caption_display(doc)[0]['endFrame'],10)
        self.assertEqual(assess_rendered_captions(doc)['status'],'needs_revision')
        doc['captionDisplayPolicy']='unknown'
        with self.assertRaisesRegex(ValueError,'display policy'): compile_document(doc,bindings,media,'invalid')


if __name__=='__main__': unittest.main()
