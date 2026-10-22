"""Reviewed transition exclusions; no automatic inference from scene-score peaks.

These source-bound reviews qualify observation ranges, not business labels. A
transition retains its provisional timeline marker and excludes reviewed mixed
frames from static observations. Original media is never altered.
"""
from fractions import Fraction
from pathlib import Path

from ..execution import file_hash
from ..framework_eval_runtime import digest
from .artifacts import read
from .source_sampling import source_time, time_anchor

VERSION = 'source-boundary-review-v1'


def load_reviews(path):
    """Verify the local consecutive-frame evidence referenced by a review file."""
    path = Path(path)
    reviews = read(path)
    for entry in reviews['entries'] + reviews.get('internalEntries', []):
        image = (path.parent/entry['evidence']['image']).resolve()
        if (not image.is_relative_to(path.parent.resolve()) or
                file_hash(image) != entry['evidence']['imageSha256']):
            raise ValueError('Boundary review image changed or escaped its evidence directory')
    return reviews


def apply_reviews(observation, proxy_cuts, boundaries, reviews):
    if reviews is None:
        return boundaries
    table = observation['table']
    if (reviews.get('version') != VERSION or reviews.get('sourceSha256') != observation['sourceSha256'] or
            reviews.get('tableSha256') != digest(table) or not reviews.get('reviewer')):
        raise ValueError('Boundary reviews do not bind this source clock')
    seen = set()
    for entry in reviews['entries']:
        i = entry['index']
        if (type(i) is not int or not 0 <= i < len(boundaries) or i in seen or
                entry['requestedSeconds'] != proxy_cuts[i] or not entry.get('reason')):
            raise ValueError('Boundary review refers to a different or duplicate candidate')
        seen.add(i)
        left, right = entry['evidence']['sourceFrameRange']
        if (any(type(n) is not int for n in (left, right)) or not 0 <= left < right <= len(table['pts']) or
                not left <= boundaries[i]['frame'] < right):
            raise ValueError('Review evidence does not cover the candidate')
        kind = entry['kind']
        row = boundaries[i]
        if kind == 'transition':
            start, end = entry['excludeFrames']
            if (any(type(n) is not int for n in (start, end)) or not left < start < end < right or
                    max(source_time(table, start)-Fraction(str(proxy_cuts[i])),
                        Fraction(str(proxy_cuts[i]))-source_time(table, end)) > Fraction(1, 5)):
                raise ValueError('Transition lacks surrounding evidence or is unrelated to the candidate')
            row.update(status='reviewed_transition', kind=kind, excludeFrames=[start, end],
                exclusionAnchors=[time_anchor(table, n) for n in (start, end)],
                anchorMeaning='provisional_timeline_marker_not_a_hard_cut')
        elif kind == 'observation_division':
            if entry.get('excludeFrames') is not None:
                raise ValueError('An observation division cannot conceal excluded media')
            row.update(status='reviewed_observation_division', kind=kind,
                       anchorMeaning='observation_division_not_a_proven_physical_cut')
        else:
            raise ValueError('Unsupported reviewed boundary kind')
        row['reviewSha256'] = digest(entry)
    return boundaries


def apply_internal_reviews(observation, boundaries, candidates, reviews):
    """Only reviewed, source-observed internal candidates can extend the layout."""
    table = observation['table']
    annotations = []
    seen = set()
    for entry in (reviews or {}).get('internalEntries', []):
        frame = entry['frame']
        left, right = entry['evidence']['sourceFrameRange']
        if (type(frame) is not int or frame not in candidates or frame in seen or
                any(type(n) is not int for n in (left, right)) or
                not 0 <= left < frame < right <= len(table['pts']) or not entry.get('reason')):
            raise ValueError('Internal review lacks a distinct observed candidate and surrounding evidence')
        seen.add(frame)
        kind = entry['kind']
        if kind not in ('hard_cut', 'non_cut_scene_response'):
            raise ValueError('Unsupported internal scene review')
        anchor = time_anchor(table, frame)
        annotation = dict(frame=frame, kind=kind, anchor=anchor, reviewSha256=digest(entry))
        annotations.append(annotation)
        if kind == 'hard_cut':
            boundaries.append(dict(**annotation, requestedSeconds=None, status='reviewed_hard_cut',
                pts=anchor['pts'], timeBase=anchor['timeBase'], seconds=float(source_time(table, frame)),
                shiftSeconds=0, candidateFrames=[frame], anchorMeaning='reviewed_source_scene_change'))
    return sorted(boundaries, key=lambda row: row['frame']), annotations
