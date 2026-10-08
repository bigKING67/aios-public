import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
import test_caption_execution as execution_fixture
from content_production.caption_execution import derive_caption_document
from content_production.caption_review import review_captions, validate_reviews, SCHEMA
from content_production.caption_quality import assess_rendered_captions,caption_delivery_reason
from content_production.semantic_captions import chat_completion_callback


class CaptionReviewTests(unittest.TestCase):
    def setUp(self):
        self.doc=execution_fixture.CaptionExecutionTests().frozen()
        self.cues=derive_caption_document(self.doc)[0]['captions']
        self.answer={'reviews':[{'captionId':c['id'],'issues':[]} for c in self.cues]}
    def test_reviews_effective_captions_and_does_not_approve_delivery(self):
        callback=MagicMock(return_value=self.answer);before=copy.deepcopy(self.doc)
        review=review_captions(self.doc,call_model=callback,model='reviewer')
        self.assertEqual(review['status'],'no_issues_reported')
        self.assertEqual(review['nextAction'],'await_quality_evidence')
        self.assertFalse(review['termsVerified']);self.assertFalse(review['deliveryApproved'])
        self.assertIn('白金洗发水',callback.call_args.args[0][1]['content'])
        self.assertEqual(self.doc,before)
        receipt={'caption_quality':assess_rendered_captions(self.doc),'caption_semantic_review':review}
        self.assertEqual(caption_delivery_reason({'editDocument':self.doc},receipt),'caption_quality_pending')
    def test_incomplete_duplicate_and_fabricated_evidence_rejected(self):
        for kind in ('missing','duplicate','quote','kind'):
            answer=copy.deepcopy(self.answer)
            if kind=='missing':answer['reviews'].pop()
            elif kind=='duplicate':answer['reviews'][1]['captionId']=answer['reviews'][0]['captionId']
            else:answer['reviews'][0]['issues']=[{'kind':'passed' if kind=='kind' else 'sentence_fragment','quote':'虚构','reason':'检查'}]
            with self.subTest(kind=kind),self.assertRaises(ValueError):
                review_captions(self.doc,call_model=lambda _:answer,model='reviewer')
    def test_issue_and_transport_failure_are_not_silently_passed(self):
        self.answer['reviews'][1]['issues']=[{'kind':'uncertain_term','quote':'GlowandYou','reason':'商品名称需要核验'}]
        result=review_captions(self.doc,call_model=lambda _:self.answer,model='reviewer')
        self.assertEqual(result['issueCount'],1);self.assertEqual(result['status'],'issues_found')
        self.assertEqual(result['semanticIssueCount'],0)
        self.assertEqual(result['termIssueCount'],1)
        self.assertEqual(result['nextAction'],'verify_product_terms')
        self.assertEqual(result['termFindings'][0]['quote'],'GlowandYou')
        callback=MagicMock(side_effect=TimeoutError())
        with self.assertRaises(TimeoutError):review_captions(self.doc,call_model=callback,model='reviewer')
        callback.assert_called_once()
    def test_review_schema_uses_existing_bounded_transport(self):
        import json
        response=MagicMock(status_code=200);response.__enter__.return_value=response
        response.iter_content.return_value=[json.dumps({'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(self.answer)}]}]}).encode()]
        call=chat_completion_callback(base_url='https://fixture.invalid/v3',api_key='fixture',model='reviewer',protocol='responses',response_schema=SCHEMA)
        with patch('requests.post',return_value=response) as post:
            self.assertEqual(call([]),self.answer)
            self.assertEqual(post.call_args.kwargs['json']['text']['format']['schema'],SCHEMA)
            self.assertFalse(post.call_args.kwargs['allow_redirects'])

    def test_negation_split_requires_actual_boundary(self):
        issue={'reviews':[{'captionId':'a','issues':[{'kind':'negation_split',
            'quote':'它可不是普通的洗发水','reason':'不与是被拆开'}]}]}
        with self.assertRaisesRegex(ValueError,'matching display boundary'):
            validate_reviews(issue,[{'id':'a','text':'它可不是\n普通的洗发水'}])
        self.assertEqual(validate_reviews(issue,[{'id':'a','text':'它可不\n是普通的洗发水'}]),issue['reviews'])

    def test_existing_receipt_prevents_duplicate_cli_call(self):
        import json,tempfile
        from content_production.caption_review import main
        with tempfile.TemporaryDirectory() as directory:
            doc=Path(directory)/'doc.json';doc.write_text(json.dumps(self.doc))
            out=Path(directory)/'review.json';out.write_text('{"status":"started"}')
            with patch.object(sys,'argv',['review','--document',str(doc),'--output',str(out)]), \
                 patch('content_production.caption_review.review_configured') as call:
                with self.assertRaises(FileExistsError):main()
                call.assert_not_called()

    def test_multiline_quote_and_unsupported_finding_are_separate(self):
        answer=copy.deepcopy(self.answer)
        answer['reviews'][1]['issues']=[
            {'kind':'uncertain_term','quote':'GlowandYou\n白金洗发水','reason':'名称待核验'},
            {'kind':'negation_split','quote':'GlowandYou','reason':'模型误报'}]
        review=review_captions(self.doc,call_model=lambda _:answer,model='reviewer')
        self.assertEqual(review['status'],'partial')
        self.assertEqual(review['rejectedIssueCount'],1)
        self.assertEqual(review['termIssueCount'],1)
        self.assertEqual(review['nextAction'],'verify_product_terms')
        self.assertFalse(review['deliveryApproved'])
        answer['reviews'][1]['issues'][0]['quote']='Glow\nandYou白金洗发水'
        with self.assertRaisesRegex(ValueError,'quote not found'):
            review_captions(self.doc,call_model=lambda _:answer,model='reviewer')


if __name__=='__main__':unittest.main()
