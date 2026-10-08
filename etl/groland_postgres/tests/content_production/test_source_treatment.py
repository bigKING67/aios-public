import copy
import fcntl
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason
from content_production.execution import Cancelled, file_hash
from content_production.reference_edit import build_reference_edit
from content_production.source_treatment import advance_treatment, treatment_request

REGIONS = [{'top_left_x': .1, 'top_left_y': .65, 'bottom_right_x': .9, 'bottom_right_y': .8}]


class Provider:
    def __init__(self, video):
        self.video, self.submits, self.queries, self.downloads = video, 0, 0, 0
        self.status = 'completed'
        self.submit_error = self.query_error = self.download_error = False

    def submit(self, path, parameters, check):
        check()
        self.submits += 1
        if self.submit_error:
            raise TimeoutError('fixture lost response')
        return 'fixture-task'

    def query(self, task):
        self.queries += 1
        if self.query_error:
            raise TimeoutError('fixture GET failure')
        return {'status': self.status, 'video_url': 'https://fixture.invalid/signed?secret=do-not-persist'}

    def download(self, result, target, check):
        check()
        self.downloads += 1
        if self.download_error:
            target.write_bytes(b'partial')
            raise TimeoutError('fixture partial download')
        shutil.copyfile(self.video, target)


class SourceTreatmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = tempfile.TemporaryDirectory(prefix='treatment-assets-')
        cls.files = {}
        for name, color, seconds in (('main', 'red', 6), ('alternate', 'green', 2), ('output', 'blue', 2), ('short', 'blue', 1)):
            path = Path(cls.assets.name) / (name + '.mp4')
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                            f'color={color}:s=160x288:r=30:d={seconds}', '-f', 'lavfi', '-i',
                            f'sine=frequency=330:duration={seconds}', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                            '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', str(path)],
                           check=True, capture_output=True, timeout=30)
            cls.files[name] = path

    @classmethod
    def tearDownClass(cls):
        cls.assets.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='treatment-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        sources = {name: {'assetVersionId': name, 'sha256': file_hash(self.files[name]), 'frames': frames}
                   for name, frames in (('main', 180), ('alternate', 60))}
        self.document = build_reference_edit('fixture', 1, sources['main'],
            [{'startFrame': 60, 'endFrame': 120, 'asset': sources['alternate']}],
            {'width': 160, 'height': 288, 'fps': {'num': 30, 'den': 1}})
        self.document['captionOverlayPolicy'] = 'preserve-source-picture-v1'
        self.document['captions'] = [{'id': 'original-style', 'text': '保留字幕', 'stylePreset': 'source-style-v1',
            'style': {'fontHeight': .03, 'centerY': .8, 'color': '#FFFFFF', 'strokeWidth': .002, 'weight': 700},
            'anchor': {'kind': 'source', 'clipId': 'clip3', 'assetVersionId': 'main',
                       'sourceStart': {'num': 0, 'den': 1}, 'sourceEnd': {'num': 2, 'den': 1}}}]
        self.bindings = {name: {'sha256': asset['sha256'], 'durationMs': asset['frames'] * 1000 // 30}
                         for name, asset in sources.items()}
        self.media = {name: str(self.files[name]) for name in sources}
        self.provider = Provider(self.files['output'])

    def advance(self, provider=True, check=lambda: None):
        return advance_treatment(self.root, self.document, self.bindings, self.media, 'clip1', REGIONS,
                                 provider=self.provider if provider else None, check=check)

    def test_real_excerpt_inspection_refill_and_delivery_stays_blocked(self):
        before = copy.deepcopy(self.document)
        prepared = self.advance(False)
        self.assertEqual(prepared['stage'], 'prepared')
        self.assertEqual(prepared['input']['frames'], 60)
        self.assertEqual(self.provider.submits, 0)
        self.assertEqual(self.advance()['stage'], 'submitted')
        ready = self.advance()
        self.assertEqual(ready['stage'], 'candidate_ready')
        self.assertFalse(ready['deliveryApproved'])
        work = Path(ready['workDir'])
        candidate = json.loads((work / 'candidate.json').read_text())
        self.assertEqual(candidate['revision'], 2)
        self.assertEqual(candidate['captions'], before['captions'])
        self.assertEqual(candidate['clips'][0], before['clips'][0])
        self.assertEqual(candidate['clips'][2:], before['clips'][2:])
        self.assertEqual(candidate['clips'][1]['timeline'], {'startFrame': 60, 'endFrame': 120})
        self.assertEqual(candidate['clips'][1]['sourceMap'][0]['sourceStart'], {'num': 0, 'den': 30})
        self.assertEqual(self.document, before)
        self.assertEqual(ready['sourceTextRouting']['inspectionFrames'], 60)
        quality = assess_rendered_captions(candidate)
        self.assertEqual(caption_delivery_reason({'editDocument': candidate}, {'caption_quality': quality}),
                         'caption_quality_pending')
        self.assertEqual(self.advance(), ready)
        self.assertEqual((self.provider.submits, self.provider.queries, self.provider.downloads), (1, 1, 1))
        self.assertNotIn('secret=do-not-persist', ''.join(p.read_text() for p in work.glob('*.json')))

    def test_lost_post_response_and_crash_marker_never_resubmit(self):
        self.provider.submit_error = True
        with self.assertRaises(TimeoutError):
            self.advance()
        self.provider.submit_error = False
        state = self.advance()
        self.assertEqual(state['stage'], 'submission_unknown')
        self.assertEqual(self.provider.submits, 1)
        path = Path(state['workDir']) / 'state.json'
        saved = json.loads(path.read_text()); saved['stage'] = 'submitting'
        path.write_text(json.dumps(saved))
        self.assertEqual(self.advance()['stage'], 'submitting')
        self.assertEqual(self.provider.submits, 1)

    def test_query_and_partial_download_resume_only_existing_task(self):
        self.advance()
        self.provider.query_error = True
        with self.assertRaises(TimeoutError): self.advance()
        self.provider.query_error = False
        self.provider.status = 'running'
        self.assertEqual(self.advance()['stage'], 'submitted')
        self.provider.status = 'completed'
        self.provider.download_error = True
        with self.assertRaises(TimeoutError): self.advance()
        self.provider.download_error = False
        self.assertEqual(self.advance()['stage'], 'candidate_ready')
        self.assertEqual(self.provider.submits, 1)

    def test_wrong_frames_rejected_without_stretch_or_retry(self):
        self.provider.video = self.files['short']
        self.advance()
        with self.assertRaisesRegex(ValueError, 'frame count'): self.advance()
        state = self.advance()
        self.assertEqual(state['stage'], 'technical_rejected')
        self.assertFalse((Path(state['workDir']) / 'candidate.json').exists())
        self.assertEqual((self.provider.submits, self.provider.queries), (1, 1))

    def test_unchanged_media_and_failed_provider_do_not_make_candidate(self):
        submitted = self.advance()
        self.provider.video = Path(submitted['workDir']) / 'input.mp4'
        with self.assertRaisesRegex(ValueError, 'unchanged input'): self.advance()
        self.assertEqual(self.advance()['stage'], 'technical_rejected')

    def test_provider_terminal_failure_not_resubmitted(self):
        self.advance()
        self.provider.status = 'failed'
        self.assertEqual(self.advance()['stage'], 'provider_failed')
        self.assertEqual(self.advance()['stage'], 'provider_failed')
        self.assertEqual((self.provider.submits, self.provider.queries), (1, 1))

    def test_cancellation_before_upload_and_before_refill(self):
        self.advance(False)
        calls = 0
        def stopped():
            nonlocal calls
            calls += 1
            if calls == 2: raise Cancelled('fixture stopped')
        with self.assertRaises(Cancelled): self.advance(check=stopped)
        self.assertEqual(self.provider.submits, 0)
        self.advance()
        original_download = self.provider.download
        cancelled = False
        def download(*args):
            nonlocal cancelled
            original_download(*args)
            cancelled = True
        self.provider.download = download
        def check():
            if cancelled: raise Cancelled('fixture stopped')
        with self.assertRaises(Cancelled): self.advance(check=check)
        work = next(self.root.glob('source-text-*'))
        self.assertFalse((work / 'candidate.json').exists())
        self.assertEqual(self.provider.submits, 1)

    def test_changed_source_excerpt_result_and_concurrent_owner_rejected(self):
        prepared = self.advance(False)
        work = Path(prepared['workDir'])
        with (work / '.lock').open('r') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError): self.advance()
        self.media['alternate'] = str(self.files['main'])
        with self.assertRaisesRegex(ValueError, 'source changed'): self.advance()
        self.media['alternate'] = str(self.files['alternate'])
        self.advance(); self.advance()
        (work / 'output.mp4').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'after technical inspection'): self.advance()
        (work / 'input.mp4').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'excerpt changed'): self.advance()

    def test_preserved_original_and_unusable_masks_rejected_before_io(self):
        for clip in ('clip0', 'clip2', 'clip3', 'unknown'):
            with self.subTest(clip=clip), self.assertRaises(ValueError):
                treatment_request(self.document, self.bindings, self.media, clip, REGIONS)
        for region in ([], [{}], [{**REGIONS[0], 'top_left_y': .1}],
                       [{**REGIONS[0], 'top_left_x': True}], [{**REGIONS[0], 'bottom_right_x': float('nan')}],
                       [{**REGIONS[0], 'top_left_x': .95}]):
            with self.subTest(region=region), self.assertRaises(ValueError):
                treatment_request(self.document, self.bindings, self.media, 'clip1', region)
        request = treatment_request(self.document, self.bindings, self.media, 'clip1',
                                    [{**REGIONS[0], 'top_left_y': .1}], 'Text')
        self.assertEqual(request['parameters']['mode'], 'Text')
        self.document['captionRepair'] = {'status': 'unfrozen'}
        with self.assertRaisesRegex(ValueError, 'freeze the caption repair'):
            treatment_request(self.document, self.bindings, self.media, 'clip1', REGIONS)


if __name__ == '__main__':
    unittest.main()
