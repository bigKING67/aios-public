import json
from pathlib import Path
import tempfile
import unittest

from content_production.framework_eval_media import MediaTape


class MediaTapeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.binary = self.root/'ffmpeg'
        self.binary.write_bytes(b'fixed binary')
        self.source = self.root/'source.mp4'
        self.source.write_bytes(b'original source')
        self.output = self.root/'first'
        self.output.mkdir()
        self.calls = []

    def command(self, path, start='1'):
        return [str(self.binary), '-ss', start, '-i', str(self.source), str(path)]

    def encode(self, command, env, tick, timeout, stderr=-3, **kwargs):
        self.calls.append(command)
        if command[-1] != '-':
            Path(command[-1]).write_bytes(b'encoded original')
        if hasattr(stderr, 'write'):
            stderr.write(b'cut log')
        return 0

    def seed(self):
        tape = MediaTape(self.output, self.encode)
        tape.run(self.command(self.output/'clip.mp4'), {}, lambda: None, 5)
        tape.save(certified=True, provenance={'test': 'actual command'})

    def test_same_recipe_reuses_exact_bytes_at_new_path(self):
        self.seed()
        second = self.root/'second'; second.mkdir()
        tape = MediaTape(second, self.encode, [self.output])
        target = second/'renamed.mp4'
        tape.run(self.command(target), {}, lambda: None, 5)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(target.read_bytes(), b'encoded original')

    def test_changed_input_command_or_binary_does_not_hit(self):
        self.seed()
        for change in ('input', 'command', 'binary'):
            second = self.root/change; second.mkdir()
            tape = MediaTape(second, self.encode, [self.output])
            if change == 'input': self.source.write_bytes(b'changed source')
            if change == 'binary': self.binary.write_bytes(b'new binary')
            tape.run(self.command(second/'clip.mp4', start='2' if change == 'command' else '1'), {}, lambda:None, 5)
            self.source.write_bytes(b'original source')
        self.assertEqual(len(self.calls), 4)

    def test_changed_certified_artifact_rejects_without_silent_fallback(self):
        self.seed()
        (self.output/'clip.mp4').write_bytes(b'tampered')
        second = self.root/'second'; second.mkdir()
        tape = MediaTape(second, self.encode, [self.output])
        with self.assertRaisesRegex(ValueError, 'changed after certification'):
            tape.run(self.command(second/'clip.mp4'), {}, lambda:None, 5)

    def test_reconstruction_is_unusable_until_explicitly_certified(self):
        old = self.root/'archive';old.mkdir();(old/'clip.mp4').write_bytes(b'historical')
        tape = MediaTape(self.output, self.encode, reconstruct_from=old)
        tape.run(self.command(self.output/'clip.mp4'), {}, lambda:None, 5)
        tape.save(certified=False, provenance={'full_reproduction': False})
        with self.assertRaisesRegex(ValueError, 'Uncertified'):
            MediaTape(self.root/'other', self.encode, [self.output])
        self.assertEqual(self.calls, [])

    def test_stderr_is_preserved_before_callers_delete_transient_logs(self):
        tape = MediaTape(self.output, self.encode)
        log = self.output/'temporary.log'
        with log.open('wb') as stream:
            tape.run(self.command('-'), {}, lambda:None, 5, stderr=stream)
        log.unlink()
        tape.save(certified=True, provenance={'test': True})
        second = self.root/'second';second.mkdir()
        replay = MediaTape(second, self.encode, [self.output])
        with (second/'new.log').open('wb') as stream:
            replay.run(self.command('-'), {}, lambda:None, 5, stderr=stream)
        self.assertEqual((second/'new.log').read_bytes(), b'cut log')
        self.assertEqual(len(self.calls), 1)

    def test_new_command_cannot_overwrite_original_through_replay_link(self):
        self.seed()
        second = self.root/'second';second.mkdir()
        tape = MediaTape(second, self.encode, [self.output])
        target = second/'clip.mp4'
        tape.run(self.command(target), {}, lambda:None, 5)
        self.assertTrue(target.is_symlink())
        tape.run(self.command(target, '2'), {}, lambda:None, 5)
        self.assertFalse(target.is_symlink())
        self.assertEqual((self.output/'clip.mp4').read_bytes(), b'encoded original')

    def test_path_escape_and_missing_reconstruction_fail(self):
        tape = MediaTape(self.output, self.encode, reconstruct_from=self.root/'missing')
        with self.assertRaisesRegex(ValueError, 'escapes'):
            tape.run(self.command(self.root/'outside.mp4'), {}, lambda:None, 5)
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            tape.run(self.command(self.output/'clip.mp4'), {}, lambda:None, 5)

    def test_failed_media_never_enters_cache(self):
        tape = MediaTape(self.output, lambda *a, **k: 1)
        self.assertEqual(tape.run(self.command(self.output/'clip.mp4'), {}, lambda:None, 5), 1)
        self.assertEqual(tape.records, {})
