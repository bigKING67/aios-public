"""Conservative selling-point cut calibration, never automatic confirmation.

Only joint speech/shot evidence can move block edges. Confirmed frameworks and
internal linked spans stay immutable. Missing evidence is a visible review item.
"""
import math
from fractions import Fraction

from . import selling_point_boundary_media as media
from .selling_point_suggestion import MIN_SPAN_MS
from .remix_normalization import FPS

POLICY = 'selling-point-boundary-v1'
MAX_MOVE_MS = 800
SHOT_NEAR_MS = 250
MESSAGES = {
    'speech_missing': '缺少同源口播时间，需听检',
    'sentence_crossing': '切口落在口播句中',
    'shot_missing': '附近无明确镜头切换，需检查动作连续性',
    'shot_ambiguous': '附近有多个镜头切换',
    'detector_unavailable': '局部画面检测未完成',
    'speech_shot_conflict': '口播与镜头边界不一致',
    'range_conflict': '校准会越过框架或相邻卖点',
    'framework_boundary': '已确认框架边界待复核',
    'render_sentence_crossing': '按成片帧率取整后可能截断口播尾部',
}


def _groups(segments):
    groups = []
    for index, segment in enumerate(segments):
        if segment['continues_previous'] and groups and (
                segments[groups[-1][-1]]['framework_index'] == segment['framework_index']):
            groups[-1].append(index)
        else:
            groups.append([index])
    return groups


def _crossing(position, utterances):
    return [row for row in utterances or [] if row[0] < position < row[1]]


def _speech_target(position, side, utterances):
    crossing = _crossing(position, utterances)
    if not crossing:
        return position
    return min(row[0] for row in crossing) if side == 'start' else max(row[1] for row in crossing)


def _render_end(start, end, utterances):
    actual = Fraction(start) + Fraction((end - start) * FPS // 1000 * 1000, FPS)
    return {'num': actual.numerator, 'den': actual.denominator}, bool(_crossing(actual, utterances))


def _edge(position, side, duration_ms, utterances, observations):
    result = {'originalMs': position, 'finalMs': position, 'issues': []}
    if position in (0, duration_ms):
        return {**result, 'basis': 'source_edge'}
    local_speech = any(row[0] <= position + 1000 and row[1] >= position - 1000 for row in utterances or [])
    if not local_speech:
        result['issues'].append('speech_missing')
    target = _speech_target(position, side, utterances)
    if _crossing(position, utterances):
        result['issues'].append('sentence_crossing')
    cuts = observations.get(position)
    if cuts is None:
        result['issues'].append('detector_unavailable')
        return result
    nearby = [cut for cut in cuts if abs(cut - target) <= SHOT_NEAR_MS and abs(cut - position) <= MAX_MOVE_MS]
    if len(nearby) != 1:
        result['issues'].append('shot_ambiguous' if nearby else 'shot_missing')
        return result
    cut = nearby[0]
    # Inpoints round up, outpoints down; never include the neighbouring shot to
    # satisfy integer milliseconds. Keep exact PTS for review and replay.
    value = math.ceil(cut) if side == 'start' else math.floor(cut)
    result['shotMs'] = {'num': cut.numerator, 'den': cut.denominator}
    result['proposedMs'] = value
    trimmed_speech = any(max(min(position, value), row[0]) < min(max(position, value), row[1])
                         for row in utterances or []) if (
                             (side == 'start' and value > position) or (side == 'end' and value < position)) else False
    if _crossing(value, utterances) or trimmed_speech:
        result['issues'].append('speech_shot_conflict')
    if not local_speech or 'speech_shot_conflict' in result['issues']:
        return result
    result['issues'] = []
    return {**result, 'finalMs': value, 'basis': 'speech_and_shot'}


def check(segments, frames, utterances, duration_ms, observations):
    """Pure decision pass retaining every label, quote, link and original span."""
    output, groups, reviews = [dict(s) for s in segments], _groups(segments), []
    frame_issues = {}
    for frame in frames:
        edges = {side: _edge(frame[f'{side}_ms'], side, duration_ms, utterances, observations)
                 for side in ('start', 'end')}
        # Frameworks belong to a separate confirmation flow; never edit them here.
        for edge in edges.values():
            if edge['finalMs'] != edge['originalMs']:
                edge['issues'].append('framework_boundary')
                edge['finalMs'] = edge['originalMs']
        actual, crossing = _render_end(frame['start_ms'], frame['end_ms'], utterances)
        edges['end']['renderedEndMs'] = actual
        if crossing:
            edges['end']['issues'].append('render_sentence_crossing')
        if any(edge['issues'] for edge in edges.values()):
            frame_issues[frame['segment_id']] = True
        reviews.append({'frameworkSegmentId': frame['segment_id'], 'edges': edges})
    proposals = []
    for group in groups:
        first, last = segments[group[0]], segments[group[-1]]
        edges = {'start': _edge(first['start_ms'], 'start', duration_ms, utterances, observations),
                 'end': _edge(last['end_ms'], 'end', duration_ms, utterances, observations)}
        frame = frames[first['framework_index']]
        for side, item, neighbour in (
                ('start', first, segments[group[0] - 1]['end_ms'] if group[0] else 0),
                ('end', last, segments[group[-1] + 1]['start_ms'] if group[-1] + 1 < len(segments) else duration_ms)):
            edge, value = edges[side], edges[side]['finalMs']
            invalid = (value < max(frame['start_ms'], neighbour) or item['end_ms'] - value < MIN_SPAN_MS) if side == 'start' else (
                value > min(frame['end_ms'], neighbour) or value - item['start_ms'] < MIN_SPAN_MS)
            if invalid:
                edge['finalMs'] = edge['originalMs']
                edge['issues'].append('range_conflict')
        if edges['end']['finalMs'] - edges['start']['finalMs'] < MIN_SPAN_MS:
            for edge in edges.values():
                edge['finalMs'] = edge['originalMs']
                edge['issues'].append('range_conflict')
        proposals.append((group, edges))
    # Independently valid expansions can compete for the same unlabelled gap.
    for (_, left), (_, right) in zip(proposals, proposals[1:]):
        if left['end']['finalMs'] > right['start']['finalMs']:
            for edge in (left['end'], right['start']):
                edge['finalMs'] = edge['originalMs']
                edge['issues'].append('range_conflict')
    blocks = []
    for group, edges in proposals:
        output[group[0]]['start_ms'] = edges['start']['finalMs']
        output[group[-1]]['end_ms'] = edges['end']['finalMs']
        actual, crossing = _render_end(edges['start']['finalMs'], edges['end']['finalMs'], utterances)
        edges['end']['renderedEndMs'] = actual
        if crossing:
            edges['end']['issues'].append('render_sentence_crossing')
        issues = sorted({issue for edge in edges.values() for issue in edge['issues']})
        if frame_issues.get(segments[group[0]]['framework_segment_id']):
            issues.append('framework_boundary')
        audit = {'policy': POLICY, 'status': 'needs_review' if issues else 'checked',
                 'segmentIndexes': group, 'edges': edges, 'issues': issues}
        blocks.append(audit)
        for index in group:
            output[index]['boundary_review'] = {**audit,
                'originalSpanMs': [segments[index]['start_ms'], segments[index]['end_ms']],
                'originalReason': segments[index]['reason']}
            if issues:
                warning = '【切口待复核：' + '；'.join(MESSAGES[issue] for issue in dict.fromkeys(issues)) + '】'
                output[index]['reason'] = (warning + output[index]['reason'])[:500]
    return output, {'policy': POLICY, 'status': 'needs_review' if any(b['issues'] for b in blocks) or frame_issues else 'checked',
                    'speechEvidence': 'cached_utterances' if utterances else 'missing',
                    'adjustedEdges': sum(e['finalMs'] != e['originalMs'] for _, edges in proposals for e in edges.values()),
                    'reviewBlocks': sum(bool(b['issues']) for b in blocks), 'blocks': blocks, 'frameworks': reviews}


def calibrate(segments, frames, utterances, source, duration_ms, env, tick, work):
    positions = {f[key] for f in frames for key in ('start_ms', 'end_ms')}
    for group in _groups(segments):
        positions.update((segments[group[0]]['start_ms'], segments[group[-1]]['end_ms']))
    positions.difference_update((0, duration_ms))
    observations = media.observe(source, positions, duration_ms, env, tick, work)
    return check(segments, frames, utterances, duration_ms, observations)
