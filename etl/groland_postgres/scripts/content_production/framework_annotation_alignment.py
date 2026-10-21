"""Evaluate approximate business timestamps without moving source-frame cuts.

This module is gold-only: neither the classifier nor its media pipeline imports it.
Tolerance applies to matched category transitions, never to arbitrary short errors.
"""
import math
from functools import lru_cache


def _runs(segments):
    runs = []
    for start, end, label in segments:
        if runs and runs[-1][2] == label and abs(runs[-1][1] - start) < 1e-6:
            runs[-1][1] = end
        else:
            runs.append([start, end, label])
    return runs


def _local_pairs(expected, actual, tolerance):
    """Match ordered transitions locally without crossing another content unit.

    One unrelated classification error must not invalidate the rest of a film's
    timestamp comparison. Positive overlap on both sides and an empty crossing
    corridor keep a missing/inserted short unit from masquerading as an offset.
    """
    candidates = {}
    for i, (left, right) in enumerate(zip(expected, expected[1:])):
        for j, (before, after) in enumerate(zip(actual, actual[1:])):
            if (left[2] == right[2] or (left[2], right[2]) != (before[2], after[2])
                    or abs(before[1] - after[0]) > 1e-6
                    or min(left[1], before[1]) <= max(left[0], before[0])
                    or min(right[1], after[1]) <= max(right[0], after[0])):
                continue
            cut = after[0]
            near = min(max(cut, left[1]), right[0])
            low, high = sorted((near, cut))
            if high - low > tolerance + 1e-6:
                continue
            if any(low < edge < high for runs, skip in ((expected, i), (actual, j))
                   for k, (a, b) in enumerate(zip(runs, runs[1:])) if k != skip
                   for edge in (a[1], b[0])):
                continue
            candidates[i, j] = high - low

    @lru_cache(None)
    def match(i, j):
        if i >= len(expected)-1 or j >= len(actual)-1:
            return ()
        options = [match(i+1, j), match(i, j+1)]
        if (i, j) in candidates:
            options.append(((i, j),) + match(i+1, j+1))
        return min(options, key=lambda pairs: (-len(pairs), sum(candidates[p] for p in pairs), pairs))

    return match(0, 0)


def alignment(reference, prediction, policy=None):
    tolerance = (policy or {}).get('boundaryToleranceSeconds', 0)
    if (isinstance(tolerance, bool) or not isinstance(tolerance, (int, float))
            or not math.isfinite(tolerance) or not 0 <= tolerance <= 1):
        raise ValueError('Annotation boundary tolerance must be between 0 and 1 second')
    expected, actual = _runs(reference), _runs(prediction)
    same_order = [r[2] for r in expected] == [r[2] for r in actual]
    transitions = []
    pairs = ([(i, i) for i in range(len(expected)-1)] if same_order
             else _local_pairs(expected, actual, tolerance))
    for index, predicted_index in pairs:
        left, right = expected[index:index+2]
        before, after = actual[predicted_index:predicted_index+2]
        low, high = left[1], right[0]
        # A prediction gap is missing coverage, not a shifted cut.
        continuous = abs(before[1] - after[0]) < 1e-6
        cut = after[0]
        offset = cut - min(max(cut, low), high)
        transitions.append(dict(referenceWindow=[low, high], predicted=cut,
            before=left[2], after=right[2], offsetSeconds=offset,
            withinTolerance=continuous and abs(offset) <= tolerance + 1e-6))
    return dict(policy=(policy or {}).get('id', 'exact-reference'), matching='ordered-local-v2',
                toleranceSeconds=tolerance, categoryOrderMatches=same_order,
                transitions=transitions,
                allTransitionsWithinTolerance=same_order and all(
                    t['withinTolerance'] for t in transitions))


def timing_only_difference(error, evidence):
    """Require the entire error to lie in a matching boundary displacement.

    A spurious inserted class, missing class, gap, reversed order or missing tail
    cannot be forgiven merely because its duration is less than the tolerance.
    """
    if evidence['toleranceSeconds'] <= 0:
        return False
    covered = []
    for transition in evidence['transitions']:
        if not transition['withinTolerance']:
            continue
        low, high = transition['referenceWindow']
        cut = transition['predicted']
        if cut < low:
            start, end = cut, low
            labels = transition['before'], transition['after']
        elif cut > high:
            start, end = high, cut
            labels = transition['after'], transition['before']
        else:
            continue
        if (error['expected'], error['actual']) == labels:
            covered.append((start, end))
    cursor = error['start']
    for start, end in sorted(covered):
        if end <= cursor:
            continue
        if start > cursor + 1e-6:
            break
        cursor = max(cursor, end)
    return cursor >= error['end'] - 1e-6
