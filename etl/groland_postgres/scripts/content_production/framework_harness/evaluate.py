"""Source-bound observation capture and fixed-kernel evaluation. Gold stays in the scorer."""
import copy
import math
import shutil
import time
from pathlib import Path

from ..execution import file_hash, renderer_env
from ..framework_eval_report import report
from ..framework_eval_runtime import digest
from ..framework_v2 import mouth, pipeline, review, rules
from ..segment_suggestion_provider import build_proxy
from ..shot_catalog import probe
from .artifacts import code_identity, kernel_identity, prompt_for, read, snapshot, write
from .runtime import ReplayMiss

NAMES = {rules.LIVE: '实拍内容', rules.MIXED: '混剪口播', rules.STREET: '街采', rules.PROMOTION: '机制'}


def prediction(segments):
    return [[s['start_ms']/1000, s['end_ms']/1000, NAMES[s['label_key']]] for s in segments]


def capture(corpus_path, sources, scope, output, tape):
    """Use the production pipeline, retaining post-observation inputs and review media."""
    corpus = read(corpus_path)
    mouth.check()
    if not scope or len(set(scope)) != len(scope) or not set(scope) <= set(corpus['films']):
        raise ValueError('Invalid capture scope')
    files = {}
    for film in scope:
        if film in ('.', '..') or '/' in film or '\\' in film:
            raise ValueError('Unsafe film ID')
        source = (sources/corpus['films'][film]['file']).resolve()
        if not source.is_relative_to(sources.resolve()) or file_hash(source) != corpus['films'][film]['sourceSha256']:
            raise ValueError('Source identity mismatch')
        files[film] = source
    output.mkdir(parents=True, exist_ok=False)
    shutil.copy2(corpus_path, output/'corpus.json')
    manifest = dict(schema='framework-harness-capture-v1', scope=scope,
                    corpusSha256=file_hash(output/'corpus.json'), **snapshot(output))
    rows, cases = [], {}
    for film, source in files.items():
        work = output/film
        work.mkdir()
        env = renderer_env(work)
        duration = probe(source, 'ffprobe', env=env)['durationMs']
        proxy = build_proxy(source, work/'proxy.mp4', env, lambda: None)
        observations = {}
        started = time.monotonic()
        segments, summary, usage = pipeline.run(source, proxy, duration, list(NAMES), tape,
            work, env, lambda: None, [''], evidence_sink=observations.update)
        clips = [dict(path=p.name, sha256=file_hash(p)) for p in sorted(work.glob('review-*.mp4'),
                  key=lambda p: int(p.stem.split('-')[-1]))]
        if file_hash(source) != corpus['films'][film]['sourceSha256']:
            raise ValueError('Source changed during capture')
        if any('error' in r for r in summary['review']):
            raise RuntimeError('Failed review cannot become a completed baseline')
        observations.update(source=str(source), sourceSha256=file_hash(source), proxySha256=file_hash(proxy),
                            clips=clips, summary=summary)
        write(work/'observations.json', observations)
        cases[film] = file_hash(work/'observations.json')
        row = dict(film=film, pred=prediction(segments), sourceSha256=observations['sourceSha256'],
                   seconds=time.monotonic()-started, usage=usage, summary=summary)
        rows.append(row)
        write(work/'baseline.json', row)
        print(f'captured {film}: {len(clips)} review windows', flush=True)
    if manifest['code'] != code_identity():
        raise ValueError('Capture implementation changed')
    write(output/'baseline.json', rows)
    manifest.update(cases=cases, baselineSha256=file_hash(output/'baseline.json'))
    write(output/'manifest.json', manifest)  # completion marker written last
    return rows


def validate_timeline(segments, duration, labels):
    cursor = 0
    for a, b, label in segments:
        if (any(type(v) not in (int, float) or not math.isfinite(v) for v in (a, b)) or
                abs(a-cursor) > .002 or b <= a or b > duration+.002 or label not in labels):
            raise ValueError('Non-covering or invalid timeline')
        cursor = b
    if not segments or abs(cursor-duration) > .002:
        raise ValueError('Incomplete timeline')


class Evaluator:
    def __init__(self, capture_root, output, tape):
        self.root, self.output, self.tape = capture_root, output, tape
        self.manifest = read(capture_root/'manifest.json')
        if (kernel_identity(self.manifest['code']) != kernel_identity(code_identity()) or
                file_hash(capture_root/'corpus.json') != self.manifest['corpusSha256'] or
                file_hash(capture_root/'baseline.json') != self.manifest['baselineSha256']):
            raise ValueError('Frozen code/corpus/baseline differs from this experiment')
        self.corpus = read(capture_root/'corpus.json')
        self.baseline = read(capture_root/'baseline.json')
        for film in self.manifest['scope']:
            work = capture_root/film
            if file_hash(work/'observations.json') != self.manifest['cases'][film]:
                raise ValueError('Frozen observation identity mismatch')
            obs = read(work/'observations.json')
            for clip in obs['clips']:
                path = (work/clip['path']).resolve()
                if not path.is_relative_to(work.resolve()) or file_hash(path) != clip['sha256']:
                    raise ValueError('Frozen review media changed before experiment')

    def one(self, film, value):
        work = self.root/film
        if file_hash(work/'observations.json') != self.manifest['cases'][film]:
            raise ValueError('Frozen observation identity mismatch')
        obs = read(work/'observations.json')
        if obs['sourceSha256'] != self.corpus['films'][film]['sourceSha256']:
            raise ValueError('Observation source mismatch')
        duration = obs['durationMs']/1000
        wins = review.windows(obs['ruleSegments'], obs['runs'], duration)
        if len(wins) != len(obs['clips']):
            raise ValueError('Review window count changed')
        # Verify every media input before incurring any request for this film.
        for clip in obs['clips']:
            path = (work/clip['path']).resolve()
            if not path.is_relative_to(work.resolve()) or file_hash(path) != clip['sha256']:
                raise ValueError('Frozen review media changed')
        final = copy.deepcopy(obs['ruleSegments'])
        windows = []
        start, offset = time.monotonic(), len(self.tape.calls)
        for (a, b), clip in zip(wins, obs['clips']):
            response = self.tape.review(prompt_for(value, b-a), review.SCHEMA, proxy=work/clip['path'],
                                        fps=review.CLIP_FPS, thinking='disabled')
            payload = response.payload
            validate_timeline([[s['start'], s['end'], s['label']] for s in payload['segments']],
                              round(b-a, 1), set(review.NAMES))
            final = review.apply(final, obs['cuts'], a, b, payload)
            windows.append(dict(start=a, end=b, response=copy.deepcopy(payload['segments'])))
        measurements = {(a, b): v for a, b, v in obs['mouth']}
        mouth_path = self.tape.root.parent/'local-mouth'/(digest(dict(
            source=obs['sourceSha256'], model=mouth.MODEL_SHA256, code=self.manifest['code'])) + '.json')
        if mouth_path.exists():
            saved = read(mouth_path)
            if saved['sourceSha256'] != obs['sourceSha256'] or saved['model'] != mouth.MODEL_SHA256:
                raise ValueError('Mouth cache identity mismatch')
            measurements.update({(a, b): v for a, b, v in saved['values']})

        def measure(spans):
            missing = [s for s in spans if tuple(s) not in measurements]
            if missing:
                if not self.tape.live:
                    raise ReplayMiss('New mouth spans require fresh local observations')
                source = Path(obs['source'])
                if file_hash(source) != obs['sourceSha256']:
                    raise ValueError('Source changed before local mouth probe')
                mouth.check()
                values = mouth.shot_mouth(source, missing, lambda: None)
                measurements.update(zip(map(tuple, missing), values))
                write(mouth_path, dict(sourceSha256=obs['sourceSha256'], model=mouth.MODEL_SHA256,
                    values=[[a, b, v] for (a, b), v in measurements.items()]))
            return [measurements[tuple(s)] for s in spans]

        after_review = copy.deepcopy(final)
        shots = copy.deepcopy(obs['shots'])
        final = rules.finalize(final, shots, measure)
        validate_timeline(final, duration, set(NAMES))
        row = dict(film=film, pred=[[a, b, NAMES[lab]] for a, b, lab in final],
                   sourceSha256=obs['sourceSha256'], seconds=time.monotonic()-start,
                   stages=dict(beforeReview=copy.deepcopy(obs['ruleSegments']), windows=windows,
                               afterReview=after_review, afterRules=copy.deepcopy(final), shots=shots),
                   calls=copy.deepcopy(self.tape.calls[offset:]))
        write(self.output/'evaluations'/digest(value)/f'{film}.json', row)
        return row

    def score(self, rows, scope):
        # Original strict scorer retains per-film regressions, boundaries, old guards
        # and unresolved differences. GEPA's scalar alone never grants acceptance.
        result = report(self.corpus, self.baseline, rows, scope)
        # The legacy scorer infers a stage from its old `raw` proposal format.
        # Harness rows have actual stage records instead; do not display that
        # inference as evidence, including in the parallel original-gold report.
        def clear_inferred_stage(measured):
            for detail in measured['films']:
                for field in ('errors', 'exactErrors'):
                    for error in detail.get(field, []):
                        error.pop('stageHint', None)
            if 'originalEvaluation' in measured:
                clear_inferred_stage(measured['originalEvaluation'])
        clear_inferred_stage(result)
        result.update(automaticAdoption=False, unseenGeneralization='UNVERIFIED')
        return result
