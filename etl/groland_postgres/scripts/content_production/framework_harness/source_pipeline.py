"""Explicit native-frame input for isolated v2 runs; never enabled by a worker.

The plan contains observations, not labels or cached model answers. An unresolved
physical boundary stops before decoding or inference. Each new capture must run
the downstream observers again; historical shot rows are not inputs here.
"""
from bisect import bisect_right
import copy
from fractions import Fraction
import hashlib
import math
from pathlib import Path

from ..execution import file_hash
from ..framework_eval_runtime import digest
from ..framework_v2 import frames as frames_module, shots
from . import source_sampling as sampling
from . import transition_sampling as transitions

VERSION = 'source-pts-pipeline-v2'


class UnresolvedSampling(ValueError):
    pass


def plan(observation, proxy_cuts, duration_ms, boundary_reviews=None):
    """Preserve proxy boundaries; only source-reviewed internal cuts may extend them."""
    if (type(duration_ms) is not int or duration_ms <= 0 or
            any(type(c) not in (int, float) or not math.isfinite(c) or
                not 0 < c < duration_ms/1000 for c in proxy_cuts) or
            any(b <= a for a, b in zip(proxy_cuts, proxy_cuts[1:]))):
        raise ValueError('Invalid whole-film cut plan')
    table = observation['table']
    end = sampling.source_time(table, len(table['pts']))
    if abs(end-Fraction(duration_ms, 1000)) > Fraction(2, 1000):
        raise ValueError('Video PTS duration differs from pipeline duration')
    boundaries = [sampling.boundary(table, observation['sceneFrames'], c, True) for c in proxy_cuts]
    boundaries = transitions.apply_reviews(observation, proxy_cuts, boundaries, boundary_reviews)
    for row in boundaries:
        row['anchor'] = sampling.time_anchor(table, row['frame'])
    problems = [dict(index=i, reason=r['status']) for i, r in enumerate(boundaries)
                if r['status'] not in ('aligned', 'reviewed_transition', 'reviewed_observation_division')]
    spans, span_problems = _spans(table, boundaries)
    internal_candidates = {n for span in spans for n in observation['sceneFrames']
                           if span['safeStartFrame'] < n < span['safeEndFrameExclusive']}
    internal_reviews = []
    if (boundary_reviews or {}).get('internalEntries'):
        if problems or span_problems:
            raise ValueError('Internal review requires resolved outer boundaries and stable spans')
        boundaries, internal_reviews = transitions.apply_internal_reviews(
            observation, boundaries, internal_candidates, boundary_reviews)
        spans, span_problems = _spans(table, boundaries)
    problems.extend(span_problems)
    static_ready = not problems
    non_cuts = {r['frame'] for r in internal_reviews if r['kind'] == 'non_cut_scene_response'}
    for i, span in enumerate(spans):
        # A scene response is a review signal, not automatic proof of a hard cut.
        internal = [n for n in observation['sceneFrames']
                    if span['safeStartFrame'] < n < span['safeEndFrameExclusive'] and n not in non_cuts]
        span['internalSceneFrames'] = internal
        if internal:
            problems.append(dict(shot=i, reason='internal_scene_candidates_require_review', frames=internal))
    identity = dict(version=VERSION, observationSha256=digest(observation),
                    proxyCuts=proxy_cuts, durationMs=duration_ms, boundaryReviewsSha256=digest(boundary_reviews),
                    code={p.name: file_hash(p) for p in
                          (Path(__file__), Path(sampling.__file__), Path(transitions.__file__),
                           Path(frames_module.__file__))})
    return dict(**identity, planSha256=digest(identity), sourceSha256=observation['sourceSha256'],
                boundaries=boundaries, spans=spans, problems=problems, internalReviews=internal_reviews,
                staticSamplingReady=static_ready, ready=not problems)


def _spans(table, boundaries):
    indices = [0, *[r['frame'] for r in boundaries], len(table['pts'])]
    problems = []
    spans = []
    exclusions = [r['excludeFrames'] for r in boundaries if 'excludeFrames' in r]
    for i, (a, b) in enumerate(zip(indices, indices[1:])):
        seconds = [float(sampling.source_time(table, n)) for n in (a, b)]
        if a >= b:
            problems.append(dict(shot=i, reason='collapsed_or_reordered'))
        elif seconds[1]-seconds[0] <= shots.MIN_SHOT_SEC:
            # Production spans drops these intervals. Research must not silently lose coverage.
            problems.append(dict(shot=i, reason='short_interval_requires_policy_review'))
        before = boundaries[i-1].get('excludeFrames') if i else None
        after = boundaries[i].get('excludeFrames') if i < len(boundaries) else None
        safe_a = max(a, before[1]) if before else a
        safe_b = min(b, after[0]) if after else b
        guarded = safe_a != a or safe_b != b
        if guarded and safe_b-safe_a < 3:
            problems.append(dict(shot=i, reason='insufficient_stable_frames_requires_review'))
        if any(max(safe_a, left) < min(safe_b, right) for left, right in exclusions):
            problems.append(dict(shot=i, reason='transition_overlaps_another_observation_span'))
        spans.append(dict(startFrame=a, endFrameExclusive=b, seconds=seconds,
            anchors=[sampling.time_anchor(table, n) for n in (a, b)],
            safeStartFrame=safe_a, safeEndFrameExclusive=safe_b, guarded=guarded,
            safeAnchors=[sampling.time_anchor(table, n) for n in (safe_a, safe_b)]))
    return spans, problems


class NativeFrames(frames_module.Frames):
    """One forward decode, indexed by the source frame active at requested PTS.

    Widths and requested times remain those of the real persons/facts/pairs/OCR
    stages. Reviewed transition-adjacent spans map normalized request positions
    to safe frame ordinals, retaining temporal order without duplicating an edge
    frame for every observation. All other spans use the active native PTS.
    """
    def __init__(self, source, requests, table, tick, safe_spans=()):
        self.table = table
        self.times = [float(sampling.source_time(table, i)) for i in range(len(table['pts']))]
        self.safe_spans = safe_spans
        self.span_starts = [s['seconds'][0] for s in safe_spans]
        super().__init__(source, requests, tick)
        self.receipts = []
        for time, width in sorted(set((float(t), w) for t, w in requests)):
            index = self.index(time)
            frame = self.get(time, width)
            if frame is None:
                raise ValueError('A requested native frame could not be decoded')
            shot, span = self._span(time)
            original = bisect_right(self.times, time)-1
            self.receipts.append(dict(requestedSeconds=time, width=width, sourceFrame=index,
                sourcePts=table['pts'][index], timeBase=table['timeBase'],
                anchor=sampling.time_anchor(table, index), requestedSourceFrame=original,
                moved=index != original, shot=shot,
                selectionPolicy='safe_frame_quantile' if span and span['guarded'] else 'active_native_pts',
                shape=list(frame.shape), bgrSha256=hashlib.sha256(frame.tobytes()).hexdigest()))

    def _span(self, time):
        if not getattr(self, 'safe_spans', ()):
            return None, None
        index = bisect_right(self.span_starts, time)-1
        return index, self.safe_spans[index]

    def index(self, time):
        time = float(time)
        if not math.isfinite(time) or time < 0:
            raise ValueError('Invalid native sample time')
        if time >= float(sampling.source_time(self.table, len(self.table['pts']))):
            raise ValueError('Native sample is outside the source video')
        # Use the same float representation as pipeline span metadata at an exact
        # source boundary; converting a repeating decimal back to Fraction can
        # accidentally choose the preceding frame. Stored anchors stay integer PTS.
        _, span = self._span(time)
        if span and span['guarded']:
            a, b = span['seconds']
            start, end = span['safeStartFrame'], span['safeEndFrameExclusive']
            position = (time-a)/(b-a)
            return start + min(end-start-1, int(position*(end-start)))
        return bisect_right(self.times, time)-1


class NativeSampling:
    def __init__(self, observation, proxy_cuts, duration_ms, boundary_reviews=None):
        self.observation = copy.deepcopy(observation)
        self.plan = plan(self.observation, list(proxy_cuts), duration_ms, boundary_reviews)
        self.receipt = None

    def layout(self, source, proxy_cuts, duration_ms):
        if (list(proxy_cuts) != self.plan['proxyCuts'] or duration_ms != self.plan['durationMs'] or
                file_hash(source) != self.plan['sourceSha256']):
            raise ValueError('Source/proxy/duration differs from the native plan')
        if not self.plan['ready']:
            raise UnresolvedSampling('Whole-film native boundaries still require review')
        return ([r['seconds'] for r in self.plan['boundaries']],
                [tuple(s['seconds']) for s in self.plan['spans']])

    def decode(self, source, requests, tick):
        self.layout(source, self.plan['proxyCuts'], self.plan['durationMs'])
        frames = NativeFrames(source, requests, self.observation['table'], tick, self.plan['spans'])
        if file_hash(source) != self.plan['sourceSha256']:
            raise ValueError('Source changed during native decode')
        self.receipt = dict(version=VERSION, planSha256=self.plan['planSha256'],
                            sourceSha256=self.plan['sourceSha256'], samples=frames.receipts)
        self.receipt['inputSha256'] = digest(self.receipt)
        return frames

