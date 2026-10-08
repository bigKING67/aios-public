import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.caption_review_revision import propose_review_revision
from content_production.caption_execution import derive_caption_document
from content_production.caption_quality import document_digest
from edit_document_fixture import fixture
import test_caption_execution as execution_fixture


class ReviewRevisionTests(unittest.TestCase):
    def setup_case(self):
        doc=execution_fixture.CaptionExecutionTests().frozen()
        effective,_=derive_caption_document(doc)
        review={'schema':'aios.caption-semantic-review.v1','documentSha256':document_digest(doc),
            'effectiveDocumentSha256':document_digest(effective),'reviews':[
                {'captionId':c['id'],'issues':[]} for c in effective['captions']]}
        target=effective['captions'][0]
        review['reviews'][0]['issues']=[{'kind':'sentence_fragment','quote':target['text'],'reason':'fixture finding'}]
        _,bindings,media=fixture();bindings['voice-version']['durationMs']=12000
        return doc,review,bindings,media,target
    def test_line_only_candidate_preserves_other_cues_and_source(self):
        doc,review,b,m,t=self.setup_case();before=copy.deepcopy(doc)
        result=propose_review_revision(doc,review,b,m,model='fixture',call_model=lambda _: {'captions':[
            {'captionId':t['id'],'lines':['就是','这款']}]})
        effective,_=derive_caption_document(doc)
        self.assertEqual(doc,before)
        self.assertEqual(result['document']['captions'][1:],effective['captions'][1:])
        self.assertEqual(result['document']['captions'][0]['anchor'],t['anchor'])
        self.assertEqual(result['document']['revision'],doc['revision']+1)
        self.assertFalse(result['deliveryApproved'])
    def test_stale_review_and_term_only_never_call_model(self):
        doc,r,b,m,t=self.setup_case();call=MagicMock();r['documentSha256']='stale'
        with self.assertRaisesRegex(ValueError,'stale'):propose_review_revision(doc,r,b,m,call_model=call,model='fixture')
        r['documentSha256']=document_digest(doc);r['reviews'][0]['issues'][0]['kind']='uncertain_term'
        with self.assertRaisesRegex(ValueError,'semantic targets'):propose_review_revision(doc,r,b,m,call_model=call,model='fixture')
        call.assert_not_called()
    def test_rewrite_missing_or_wrong_target_is_rejected(self):
        doc,r,b,m,t=self.setup_case()
        for captions in ([],[{'captionId':t['id'],'lines':['改写']}],[{'captionId':'wrong','lines':['就是这款']} ]):
            with self.assertRaises(ValueError):
                propose_review_revision(doc,r,b,m,model='fixture',call_model=lambda _: {'captions':captions})

    def explicit_case(self):
        doc, _, b, m, _ = self.setup_case()
        doc = derive_caption_document(doc)[0]
        style = {'fontHeight': .035, 'centerY': .72, 'color': '#ffffff', 'strokeWidth': .0015, 'weight': 700}
        for cue in doc['captions']:
            cue.update(stylePreset='source-style-v1', style=style.copy())
        from content_production.caption_review import review_captions
        entries = [{'captionId': c['id'], 'issues': []} for c in doc['captions']]
        entries[0]['issues'] = [{'kind': 'sentence_fragment', 'quote': doc['captions'][0]['text'], 'reason': 'fixture'}]
        review = review_captions(doc, model='fixture', call_model=lambda _: {'reviews': entries})
        return doc, review, b, m

    def test_explicit_frozen_captions_need_no_invented_asr(self):
        doc, review, b, m = self.explicit_case()
        before = copy.deepcopy(doc)
        result = propose_review_revision(doc, review, b, m, model='fixture', call_model=lambda _: {
            'captions': [{'captionId': doc['captions'][0]['id'], 'lines': ['就是', '这款']}]})
        self.assertEqual(result['grounding'], 'frozen-source-captions-v1')
        candidate = copy.deepcopy(result['document'])
        candidate['captions'][0]['text'] = before['captions'][0]['text']
        candidate['revision'] = before['revision']
        self.assertEqual(candidate, before)
        self.assertEqual(doc, before)

    def test_explicit_rewrite_empty_embedded_newline_or_overflow_rejected(self):
        doc, review, b, m = self.explicit_case()
        for lines in [['改写'], ['', '就是这款'], ['就是\n这款'], ['就是', '这', '款'], ['就是这款', 1]]:
            with self.subTest(lines=lines), self.assertRaises(ValueError):
                propose_review_revision(doc, review, b, m, model='fixture', call_model=lambda _: {
                    'captions': [{'captionId': doc['captions'][0]['id'], 'lines': lines}]})

    def test_no_asr_and_no_explicit_style_never_calls_model(self):
        doc, review, b, m = self.explicit_case()
        doc['captions'][0].pop('style')
        call = MagicMock()
        with self.assertRaises(ValueError):
            propose_review_revision(doc, review, b, m, model='fixture', call_model=call)
        call.assert_not_called()


if __name__=='__main__':unittest.main()
