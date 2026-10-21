"""Preserve original audio samples and exact offsets in a single comparison input."""
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_speaker_evidence as speaker
from content_production.segment_suggestion_provider import ProviderResult


def write_wave(path, data, rate=16000):
    with wave.open(str(path), 'wb') as audio:
        audio.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        audio.writeframes(data)


class SpeakerEvidenceTests(unittest.TestCase):
    def test_pair_retains_every_sample_and_measured_offsets(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            a, b=b'\x01\x02'*4800, b'\x03\x04'*11200
            write_wave(root/'A.wav',a);write_wave(root/'B.wav',b)
            offsets=speaker.join_pair([root/'A.wav',root/'B.wav'],root/'pair.wav')
            self.assertEqual(offsets,[dict(start_ms=0,end_ms=300),dict(start_ms=1300,end_ms=2000)])
            with wave.open(str(root/'pair.wav'),'rb') as audio:
                self.assertEqual((audio.getnchannels(),audio.getsampwidth(),audio.getframerate()),(1,2,16000))
                self.assertEqual(audio.readframes(audio.getnframes()),a+bytes(32000)+b)

    def test_incompatible_sample_rate_cannot_silently_change_speech_timing(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            write_wave(root/'A.wav',b'\x01\x02'*4800)
            write_wave(root/'B.wav',b'\x03\x04'*11200,8000)
            with self.assertRaisesRegex(ValueError,'16kHz'):
                speaker.join_pair([root/'A.wav',root/'B.wav'],root/'pair.wav')

    def test_request_contains_one_audio_and_receipt_binds_source_ranges(self):
        observed=dict(reference_words='A speech',target_words='B speech',match='all',
                      reference_speakers='one',target_speakers='one',evidence='matching voices')
        request=Mock(return_value=ProviderResult(observed,{'total_tokens':10},'fixture'))
        def extract(command,*args,**kwargs):
            duration=float(command[command.index('-t')+1])
            write_wave(Path(command[-1]),b'\x01\x02'*round(duration*16000))
            return 0
        item=dict(start_ms=94233,end_ms=105566,speaker_reference=dict(start_ms=90600,end_ms=93600))
        with tempfile.TemporaryDirectory() as folder,patch.object(speaker,'run_media',side_effect=extract):
            root=Path(folder)
            self.assertEqual(speaker.observe(Path('original.mp4'),item,root,{},lambda:None,request),observed)
            args, kwargs=request.call_args
            self.assertEqual(set(kwargs),{'audio','thinking','reasoning_effort'})
            self.assertEqual(kwargs['audio'],root/'pair.wav')
            self.assertIn('A=0–3.000秒',args[0]);self.assertIn('B=4.000–15.333秒',args[0])
            receipt=json.loads((root/'evidence.json').read_text())
            self.assertEqual(receipt['ranges'],[item['speaker_reference'],dict(start_ms=94233,end_ms=105566)])
            self.assertEqual(receipt['audio_ranges'],[dict(start_ms=0,end_ms=3000),dict(start_ms=4000,end_ms=15333)])
            self.assertEqual(receipt['policy'],speaker.INPUT_POLICY)


if __name__ == '__main__':
    unittest.main()
