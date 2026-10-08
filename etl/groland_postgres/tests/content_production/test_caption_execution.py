import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from test_caption_display_revision import sample
from content_production.caption_execution import derive_caption_document
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from content_production.edit_document import compile_document
from edit_document_fixture import fixture


class CaptionExecutionTests(unittest.TestCase):
    def frozen(self):
        raw,_,doc,_=sample();doc['captionRepair']={'policy':'asr-boundary-repair-v1',
            'transcriptId':'00000000-0000-0000-0000-000000000001','clipId':'voice-clip',
            'assetVersionId':'voice-version','sourceSha256':'c'*64,'result':raw}
        return doc
    def test_compile_and_delivery_use_same_immutable_derivation(self):
        doc=self.frozen();before=copy.deepcopy(doc)
        derived,repair=derive_caption_document(doc)
        self.assertEqual(derived['captions'][1]['text'],'GlowandYou\n白金洗发水')
        self.assertEqual(derive_caption_document(doc),(derived,repair))
        self.assertEqual(doc,before)
        _,bindings,media=fixture();bindings['voice-version']['durationMs']=12000
        spec=compile_document(doc,bindings,media,'automatic repair')
        self.assertIn('GlowandYou\n白金洗发水',[c['text'] for p in spec['clips'] for c in p['captions']])
        quality=assess_rendered_captions(doc)
        self.assertEqual(quality['schema'],'aios.caption-quality.v3')
        self.assertEqual(quality['warnings'],[])
        self.assertEqual(caption_delivery_reason({'editDocument':doc},{'caption_quality':quality}),'caption_quality_pending')
        quality['repair']['captions'][0]['text']='篡改'
        self.assertEqual(caption_delivery_reason({'editDocument':doc},{'caption_quality':quality}),'caption_quality_receipt_invalid')
    def test_source_styles_survive_frozen_derivation_without_regrouping(self):
        doc=self.frozen()
        style={'fontHeight':.035,'centerY':.6875,'color':'#ffff88','strokeWidth':.0015,'weight':900}
        doc['captions'][0].update(stylePreset='source-style-v1',style=style)
        before=copy.deepcopy(doc)
        derived,repair=derive_caption_document(doc)
        self.assertEqual(derived['captions'],doc['captions'])
        self.assertTrue(repair['revision']['styleBoundariesFrozen'])
        self.assertEqual(repair['revision']['attempts'],[])
        self.assertEqual(doc,before)
        quality=assess_rendered_captions(doc)
        self.assertEqual(quality['repair']['captions'][0]['style'],style)
        self.assertNotEqual(quality['status'],'passed')
        invalid=copy.deepcopy(doc);invalid['captions'][0]['style']['color']='red;display:none'
        with self.assertRaises(ValueError):derive_caption_document(invalid)
        invalid=copy.deepcopy(doc);invalid['captions'][0]['anchor']['sourceStart']['num']+=1
        with self.assertRaises(ValueError):derive_caption_document(invalid)

    def test_stale_source_changed_speech_and_unknown_policy_fail(self):
        for field,value in [('sourceSha256','b'*64),('policy','unknown')]:
            doc=self.frozen();doc['captionRepair'][field]=value
            with self.assertRaises(ValueError):derive_caption_document(doc)
        doc=self.frozen();doc['captionRepair']['result']['utterances'][0]['words'][0]['text']='错'
        with self.assertRaises(ValueError):derive_caption_document(doc)


if __name__=='__main__':unittest.main()
