import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_caption_review_revision as fixtures
from content_production.caption_candidate_render import render_candidate
from content_production.caption_review_revision import propose_review_revision
from content_production.caption_review import review_captions
from content_production.caption_quality import document_digest
from content_production.caption_execution import derive_caption_document


class CandidateRenderTests(unittest.TestCase):
    def case(self):
        doc, _, bindings, media, _ = fixtures.ReviewRevisionTests().setup_case()
        sources = []
        for i, asset in enumerate(doc['assets']):
            old = asset['assetVersionId']; ident = f'asset-{i}'
            version = f'{ident}-{asset["sha256"][:16]}'
            doc = json.loads(json.dumps(doc).replace(old, version))
            bindings[version] = bindings.pop(old)
            media[version] = media.pop(old)
            sources.append({'assetId': ident, 'sha256': asset['sha256'], 'durationMs': bindings[version]['durationMs']})
        effective, _ = derive_caption_document(doc)
        entries = [{'captionId': c['id'], 'issues': []} for c in effective['captions']]
        entries[0]['issues'] = [{'kind': 'sentence_fragment', 'quote': effective['captions'][0]['text'], 'reason': 'fixture'}]
        review = review_captions(doc, model='fixture', call_model=lambda _: {'reviews': entries})
        candidate = propose_review_revision(doc, review, bindings, media, model='fixture', call_model=lambda _: {
            'captions': [{'captionId': entries[0]['captionId'], 'lines': ['就是', '这款']}]})
        rereview = review_captions(candidate['document'], model='fixture', call_model=lambda _: {
            'reviews': [{'captionId': c['id'], 'issues': []} for c in candidate['document']['captions']]})
        result = {'review': review, 'candidate': candidate, 'candidateReview': rereview, 'candidateRendered': False}
        snapshot = {'title': 'fixture', 'assets': sources, 'editDocument': doc}
        by_id = {s['assetId']: media[f'{s["assetId"]}-{s["sha256"][:16]}'] for s in sources}
        return snapshot, by_id, result

    def test_independent_render_and_no_overwrite(self):
        snapshot, media, result = self.case(); before = copy.deepcopy(snapshot)
        with tempfile.TemporaryDirectory() as folder, patch('content_production.caption_candidate_render.render_snapshot_document') as render:
            render.return_value = (Path(folder)/'candidate.mp4', {'edit_document': {'sha256': result['candidate']['documentSha256']}})
            _, receipt = render_candidate(Path(folder), snapshot, media, Path(folder), result, lambda: None)
            self.assertEqual(snapshot, before)
            self.assertEqual(receipt['status'], 'inspection_pending')
            self.assertFalse(receipt['deliveryApproved'])
            self.assertEqual(render.call_args.args[3], Path(folder)/'caption-candidate')
            with self.assertRaises(FileExistsError):
                render_candidate(Path(folder), snapshot, media, Path(folder), result, lambda: None)
            self.assertEqual(render.call_count, 1)

    def test_stale_tampered_and_semantic_findings_do_not_render(self):
        for mode in ('stale', 'tampered', 'semantic', 'missing'):
            snapshot, media, result = self.case()
            if mode == 'stale': result['candidateReview']['documentSha256'] = 'stale'
            if mode == 'tampered':
                result['candidate']['document']['title'] = 'tampered'
                digest = document_digest(result['candidate']['document'])
                result['candidate']['documentSha256'] = digest
                result['candidateReview'].update(documentSha256=digest, effectiveDocumentSha256=digest)
            if mode == 'semantic':
                result['candidateReview']['reviews'][0]['issues'] = [{'kind': 'sentence_fragment', 'quote': '就是', 'reason': 'still broken'}]
            if mode == 'missing': del result['candidateReview']
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as folder, patch('content_production.caption_candidate_render.render_snapshot_document') as render:
                if mode in ('stale', 'tampered'):
                    with self.assertRaises(ValueError):
                        render_candidate(Path(folder), snapshot, media, Path(folder), result, lambda: None)
                else:
                    self.assertIsNone(render_candidate(Path(folder), snapshot, media, Path(folder), result, lambda: None))
                render.assert_not_called()


if __name__ == '__main__': unittest.main()
