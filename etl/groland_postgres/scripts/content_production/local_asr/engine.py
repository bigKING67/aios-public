"""FunASR engine: fsmn-vad segments (<=15 s), paraformer-zh per segment, ct-punc, sentence split.

Times come from the VAD segment plus paraformer's per-token timestamps inside that segment, so an
error cannot accumulate across the film (the combined pipeline's `sentence_timestamp` drifted up to
~11 s on films with digits or English). Runs in its own venv (funasr + CPU torch); see service.py.
"""
import re
import wave

SAMPLE_RATE = 16000
MAX_SEGMENT_MS = 15000
SENTENCE_END = set('。！？!?；;')
CLAUSE_END = set('，,、')
# Seed ASR utterances run about 2-4 s; long comma chains are cut once a clause reaches this length.
MIN_CLAUSE_MS = 3000
MODELS = {'vad': 'fsmn-vad', 'asr': 'paraformer-zh', 'punc': 'ct-punc'}


def read_wav(path):
    import numpy as np
    with wave.open(str(path)) as stream:
        if stream.getframerate() != SAMPLE_RATE or stream.getnchannels() != 1 or stream.getsampwidth() != 2:
            raise ValueError('expected 16 kHz mono 16-bit PCM')
        frames = stream.readframes(stream.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768


def split_sentences(punctuated, tokens, stamps, offset_ms):
    """Map a punctuated text back onto timed tokens and cut at sentence-ending punctuation.

    tokens: paraformer tokens (characters or English words); stamps: [[start_ms, end_ms]] per token,
    relative to the segment. Returns [[start_ms, end_ms, text]] relative to the film."""
    sentences, current, first, last, pointer = [], [], None, None, 0
    normalized = [t.lower() for t in tokens]
    i = 0
    while i < len(punctuated):
        ch = punctuated[i]
        if pointer < len(tokens) and punctuated[i:i + len(tokens[pointer])].lower() == normalized[pointer]:
            token = punctuated[i:i + len(tokens[pointer])]
            if pointer < len(stamps):
                first = stamps[pointer][0] if first is None else first
                last = stamps[pointer][1]
            current.append(token)
            i += len(token)
            pointer += 1
            continue
        current.append(ch)
        i += 1
        long_clause = ch in CLAUSE_END and first is not None and last - first >= MIN_CLAUSE_MS
        if (ch in SENTENCE_END or long_clause) and first is not None:
            sentences.append([offset_ms + first, offset_ms + last, ''.join(current).strip()])
            current, first, last = [], None, None
    if first is not None and ''.join(current).strip():
        sentences.append([offset_ms + first, offset_ms + last, ''.join(current).strip()])
    return sentences


class Engine:
    def __init__(self, threads=4):
        import torch
        from funasr import AutoModel
        torch.set_num_threads(threads)
        kw = dict(device='cpu', ncpu=threads, disable_update=True, disable_pbar=True, log_level='ERROR')
        self.vad = AutoModel(model=MODELS['vad'], max_single_segment_time=MAX_SEGMENT_MS, **kw)
        self.asr = AutoModel(model=MODELS['asr'], **kw)
        self.punc = AutoModel(model=MODELS['punc'], **kw)

    def transcribe(self, path, hotword=''):
        """[[start_ms, end_ms, text]] sentences for a 16 kHz mono WAV; [] when nothing is spoken."""
        audio = read_wav(path)
        segments = self.vad.generate(input=audio)[0]['value']
        if not segments:
            return []
        pieces = [audio[int(b * SAMPLE_RATE / 1000):int(e * SAMPLE_RATE / 1000)] for b, e in segments]
        results = self.asr.generate(input=pieces, batch_size=16, hotword=hotword)
        sentences = []
        for (begin, end), item in zip(segments, results):
            raw = item.get('text', '')
            tokens = raw.split()
            stamps = item.get('timestamp') or []
            text = raw.replace(' ', '')
            if not text:
                continue
            punctuated = self.punc.generate(input=text)[0]['text']
            if len(stamps) != len(tokens):  # no usable token times: keep the VAD segment as one unit
                sentences.append([int(begin), int(end), punctuated])
                continue
            sentences.extend(split_sentences(punctuated, tokens, stamps, int(begin)))
        return [[int(a), int(b), re.sub(r'\s+', '', t)] for a, b, t in sentences if t]
