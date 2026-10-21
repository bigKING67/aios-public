"""Offline acceptance gate for a fixed, paired framework-video evaluation.

Scores are recomputed from segments, never trusted from a model/evaluator field.
Business annotations remain external fixtures and never enter model prompts.
"""
import math


def _timeline(segments, duration):
    timeline = [None] * duration
    previous = 0
    for span in segments:
        if not isinstance(span, (list, tuple)) or len(span) != 3:
            raise ValueError('Invalid evaluation segment')
        start, end, label = span
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
               for v in (start, end)) or start < previous or end <= start or not isinstance(label, str):
            raise ValueError('Invalid evaluation timeline')
        previous = end
        for second in range(max(0, round(start)), min(round(end), duration)):
            timeline[second] = label
    return timeline


def compare(truth, baseline, candidate, *, minimum_accuracy=.90, maximum_regression=.02):
    """Require exact film coverage and report every failure, including new regressions.

    `truth` maps film IDs to business [start, end, label] intervals; baseline and
    candidate are lists of {'film': ..., 'pred': intervals}. One fixed run each;
    duplicates/omissions fail instead of selecting a film's best attempt.
    """
    def indexed(rows):
        result = {}
        for row in rows:
            key = row['film']
            if key in result:
                raise ValueError('Duplicate film in evaluation; select a fixed run before scoring')
            result[key] = row
        if set(result) != set(truth):
            raise ValueError('Evaluation film coverage differs from the fixed reference set')
        return result
    old, new = indexed(baseline), indexed(candidate)
    result = []
    for key, reference in truth.items():
        duration = round(reference[-1][1])
        if duration <= 0:
            raise ValueError('Empty evaluation reference')
        expected = _timeline(reference, duration)
        scored = [i for i, label in enumerate(expected) if label is not None]
        if not scored:
            raise ValueError('Reference timeline has no annotated seconds')
        scores = []
        for rows in (old, new):
            actual = _timeline(rows[key]['pred'], duration)
            # Business sheets sometimes leave one-second integer endpoint gaps.
            # Do not invent labels or credit predictions in unannotated time.
            scores.append(sum(actual[i] == expected[i] for i in scored) / len(scored))
        before, after = scores
        failures = []
        if after < minimum_accuracy:
            failures.append('below_minimum')
        if after + maximum_regression < before:
            failures.append('regression')
        result.append({'film': key, 'baseline': before, 'candidate': after,
                       'delta': after - before, 'failures': failures,
                       'scoredSeconds': len(scored), 'unannotatedSeconds': duration - len(scored)})
    return {'passed': all(not row['failures'] for row in result), 'films': result,
            'baseline_mean': sum(r['baseline'] for r in result) / len(result),
            'candidate_mean': sum(r['candidate'] for r in result) / len(result)}
