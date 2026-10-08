"""AI 切段打标 contract: preset-driven prompt, strict response schema and pure post-processing.

Labels always come from the stored preset version (ads.content_segment_presets);
nothing here hardcodes a taxonomy. Model output is observation evidence: the
post-processor only normalizes time bounds and never invents labels.
"""
import math
import os

PROMPT_V1 = 'segment-suggest-v1'
PROMPT_V2 = 'segment-suggest-v2'
PROMPT_V3 = 'segment-suggest-v3'
PROMPT_V4 = 'segment-suggest-v4'
PROMPT_V5 = 'segment-suggest-v5'
PROMPT_VERSIONS = (PROMPT_V1, PROMPT_V2, PROMPT_V3, PROMPT_V4, PROMPT_V5)
PERSON_FIELD_VERSIONS = (PROMPT_V4, PROMPT_V5)
# v3 (= v2 + the multi-person endorsement rule) was the default from 2026-09-30
# (5 films x 3 runs: v2 91.1% -> v3 94.7%, 98.5% with the framework v2 preset
# minimums). v4 (= v3 + person continuity) is the default since 2026-10-01: equal
# on doubao-seed-2.1-lite (98.5%), and on 2.0-lite it keeps the clip that v3 got
# wrong at 98.6% instead of 66.7%. v1-v3 stay selectable via env for A/B comparison.
DEFAULT_PROMPT_VERSION = PROMPT_V4
PROMPT_VERSION_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION'
SCHEMA_NAME = 'content_segment_suggestions'
MAX_SEGMENTS = 200
MAX_REASON_CHARS = 200
DEFAULT_MIN_SEGMENT_MS = 1000
# Same-label neighbours separated by at most this gap are one segment.
MERGE_GAP_MS = 250


def preset_labels(labels):
    """Validates stored preset labels: unique non-empty key/name/definition strings."""
    if not isinstance(labels, list) or not 1 <= len(labels) <= 50:
        raise ValueError('Preset must define 1–50 labels')
    seen, result = set(), []
    for label in labels:
        if not isinstance(label, dict):
            raise ValueError('Invalid preset label')
        key, name, definition = (label.get(field) for field in ('key', 'name', 'definition'))
        if not all(isinstance(value, str) and value.strip() for value in (key, name)) or not isinstance(definition, str):
            raise ValueError('Invalid preset label')
        if key in seen:
            raise ValueError('Duplicate preset label key')
        seen.add(key)
        entry = {'key': key, 'name': name.strip(), 'definition': definition.strip()}
        if label.get('minDurationSec') is not None:
            minimum = _number(label['minDurationSec'])
            if minimum is None or not 0 < minimum <= 3600:
                raise ValueError('Invalid preset label minDurationSec')
            entry['minDurationMs'] = round(minimum * 1000)
        result.append(entry)
    return result


def label_minimums(labels):
    """`{key: minDurationMs}` for labels whose preset sets a minimum span."""
    return {label['key']: label['minDurationMs'] for label in labels if label.get('minDurationMs')}


def job_labels(labels, request_settings):
    """Candidate labels of one job in preset order.

    `request_settings.labelKeys` is written by the API (non-empty, unique, known
    keys). Jobs created before label subsets existed have no key and use every
    preset label. A malformed or unknown subset raises ValueError instead of
    silently widening the candidates.
    """
    settings = request_settings if isinstance(request_settings, dict) else {}
    if 'labelKeys' not in settings:
        return list(labels)
    requested = settings['labelKeys']
    if (not isinstance(requested, list) or not requested
            or not all(isinstance(key, str) for key in requested) or len(set(requested)) != len(requested)):
        raise ValueError('Invalid job label subset')
    known = {label['key'] for label in labels}
    if not set(requested) <= known:
        raise ValueError('Job label subset is not part of the preset')
    return [label for label in labels if label['key'] in set(requested)]


def prompt_version_from_env():
    value = (os.getenv(PROMPT_VERSION_ENV) or '').strip() or DEFAULT_PROMPT_VERSION
    if value not in PROMPT_VERSIONS:
        raise ValueError(f'{PROMPT_VERSION_ENV} must be one of {", ".join(PROMPT_VERSIONS)}')
    return value


def _definitions(labels):
    return '\n'.join(
        f"- {label['key']}（{label['name']}）：{label['definition'] or '无补充定义，按名称判断。'}" for label in labels)


_OUTPUT_RULES = 'start_sec/end_sec 为相对视频开头的秒数；confidence 为 0 到 1 之间你对该段标签的把握；reason 用 30 字以内说明画面或声音依据。'

# Structural guidance only: it never names a preset label, so any preset (or label
# subset) can use it; each rule applies only when a candidate label carries that meaning.
_V2_GUIDANCE = """判别指引（与具体类别名称无关；只有候选类别中存在对应含义的类别时才适用）：
1. 先判断剪辑节奏和声音结构：镜头频繁切换、画面来自多个不同来源、同时有一段连贯的旁白或口播贯穿，通常属于多源混剪类内容。
2. 同一人物在同一场景中长时间连续拍摄、声画同步（口型与声音一致），通常属于连续实拍类内容。
3. 快切旁白段中短暂插入的特写、上妆或使用镜头、明星或达人推荐镜头、产品镜头，应归入其所在的混剪段，不要单独切出；只有画面转为长时间连续、声画同步的拍摄时才开始新段。
4. 段落边界优先放在节奏或声音结构发生变化的位置（例如快切转为长镜头、旁白转为同期声）。
5. 不属于任何候选类别的内容可以省略，不要为了覆盖全片而硬归类；无法判断的内容也不要编造标签。"""

# v3: in the 2026-09-30 evaluation v2 split stitched celebrity/KOL endorsement
# clips (lip-synced talking heads with name or "同款/推荐" badges) out as
# continuous live footage. Still label-agnostic.
_V3_EXTRA = """
6. 判断"连续实拍"看的是同一人物、同一场景持续多久，而不是声画是否同步：不同人物（明星、达人、素人）轮流出镜、每人只出现十几秒以内、画面常带人物名字或"同款""推荐"等角标时，即使各自对着镜头说话、声画同步，也属于多来源拼接的混剪内容，应并入所在的混剪段；只有同一人物在同一场景中持续较长时间（通常半分钟以上）连续演示讲解，才算连续实拍。"""

# v4: on 2026-10-01 v3 labelled three ~10-20 s clips of different celebrities as
# live footage in a row; same-label merging made them one 45 s span that passed
# the preset minimum. v4 asks for an explicit person-continuity observation so
# post-processing applies label minimums per continuous person (`same_person`).
_V4_EXTRA = """
7. 主要出镜人物一旦更换，必须在换人处切开新段，即使标签相同；同一人物连续出镜时，可以按步骤或场景切成多段，也可以不切。
8. same_person_as_previous：本段的主要出镜人物与上一段是否为同一个人。第一段、或本段或上一段没有明确的主要人物（只有产品、字卡、多人轮换）时填 false。"""

# v5: adds the timed voice-over transcript (segment_transcript) as advisory input.
_V5_EXTRA = """
9. 口播字幕只作辅助：说话方式改变（旁白转为出镜人物自己讲，或反过来）、说话人更换、口播主题明显转变时，往往是段落边界；字幕时间可能有几百毫秒偏差，边界位置以画面和声音为准，没有口播的段落按画面判断。"""


def build_prompt(preset_name, labels, version=DEFAULT_PROMPT_VERSION, shot_hint=None, transcript=None):
    """Prompt for one job. Labels and definitions always come from the preset.

    v1 is kept byte-identical for A/B comparison and never takes a shot hint.
    v2 adds label-agnostic structural guidance, allows omitting non-candidate
    content, and embeds the optional local shot-cut statistics.
    v3 appends the multi-person endorsement rule to v2 and is otherwise identical.
    v4 appends the person-split rule and the `same_person_as_previous` field to v3.
    v5 is v4 plus the timed voice-over transcript (`transcript`, from segment_transcript).
    """
    if version == PROMPT_V1:
        if shot_hint is not None:
            raise ValueError('segment-suggest-v1 does not take shot statistics')
        return f"""你是短视频广告内容结构分析师。这是一条完整视频（含声音），由若干内容段按时间顺序拼接而成。
请结合画面和声音，把整条视频按时间顺序切分为连续、不重叠、尽量覆盖全片的内容段，并用「{preset_name}」分类体系给每段打一个标签。同一标签可以在片中出现多次。
标签（label_key 只能取以下 key 之一）：
{_definitions(labels)}
要求：{_OUTPUT_RULES}无法判断的内容不要编造标签，可以省略该时间段。"""
    if version not in (PROMPT_V2, PROMPT_V3, PROMPT_V4, PROMPT_V5):
        raise ValueError('Unknown segment suggestion prompt version')
    if transcript is not None and version != PROMPT_V5:
        raise ValueError(f'{version} does not take a transcript')
    guidance = (_V2_GUIDANCE + (_V3_EXTRA if version in (PROMPT_V3, PROMPT_V4, PROMPT_V5) else '')
                + (_V4_EXTRA if version in PERSON_FIELD_VERSIONS else '') + (_V5_EXTRA if version == PROMPT_V5 else ''))
    if shot_hint:
        shots = f"""{shot_hint}
以上统计由本地画面检测得到，只作剪辑节奏参考，可能漏检或误检；与画面和声音不一致时以画面和声音为准。"""
    else:
        shots = '本次没有镜头切换统计，请只依据画面和声音判断剪辑节奏。'
    if version == PROMPT_V5:
        shots += ('\n口播字幕（语音识别，[分:秒-分:秒] 文本）：\n' + transcript if transcript
                  else '\n本次没有口播字幕，请直接依据声音判断口播内容。')
    return f"""你是短视频广告内容结构分析师。这是一条完整视频（含声音），由若干内容段按时间顺序拼接而成。
请结合画面、声音和剪辑节奏，按时间顺序把视频切分为连续、不重叠的内容段，并用「{preset_name}」分类体系给每段打一个标签。同一标签可以在片中出现多次。
标签（label_key 只能取以下 key 之一）：
{_definitions(labels)}
{shots}
{guidance}
要求：{_OUTPUT_RULES}"""


def response_schema(labels, version=None):
    """Strict schema; v4 and v5 add the required `same_person_as_previous` observation."""
    required = ['start_sec', 'end_sec', 'label_key', 'confidence', 'reason']
    properties = {
        'start_sec': {'type': 'number'}, 'end_sec': {'type': 'number'},
        'label_key': {'type': 'string', 'enum': [label['key'] for label in labels]},
        'confidence': {'type': 'number'}, 'reason': {'type': 'string'},
    }
    if version in PERSON_FIELD_VERSIONS:
        required.append('same_person_as_previous')
        properties['same_person_as_previous'] = {'type': 'boolean'}
    return {
        'type': 'object', 'additionalProperties': False, 'required': ['segments'],
        'properties': {'segments': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False, 'required': required, 'properties': properties,
        }}},
    }


# Observed on doubao-seed-2.1-lite (2026-09-30, 1 of 6 production calls): sensible
# boundaries but every segment tagged with one label, which merging then collapses
# into a single whole-film segment. Such output is retried once by the worker.
DEGENERATE_MIN_SEGMENTS = 3
DEGENERATE_MIN_DURATION_MS = 60_000


def degenerate_label(payload, label_keys, duration_ms):
    """The single label of a degenerate answer (>=3 segments, one label, >=2 candidates, >=60s), else None."""
    if len(label_keys) < 2 or duration_ms < DEGENERATE_MIN_DURATION_MS:
        return None
    items = payload.get('segments') if isinstance(payload, dict) else None
    if not isinstance(items, list) or len(items) < DEGENERATE_MIN_SEGMENTS:
        return None
    keys = {item.get('label_key') for item in items if isinstance(item, dict)}
    return next(iter(keys)) if len(keys) == 1 and next(iter(keys)) in label_keys else None


SNAP_MAX_GAP_MS = 500


def snap_points(segments):
    """(index, boundary ms) for neighbours that touch or leave a gap of at most SNAP_MAX_GAP_MS.

    The model often answers `end 37.39 / next start 37.40`; such a sliver is one boundary.
    """
    points = []
    for index, (left, right) in enumerate(zip(segments, segments[1:])):
        gap = right['start_ms'] - left['end_ms']
        if 0 <= gap <= SNAP_MAX_GAP_MS:
            points.append((index, (left['end_ms'] + right['start_ms']) // 2))
    return points


def snap_boundaries(segments, cuts_by_boundary, min_segment_ms):
    """Moves each boundary from `snap_points` onto the strongest scene change found around it.

    The model sees 2 fps, so its boundaries land 0.1-0.4 s after the real shot change and
    the previous segment ends with frames of the next one (2026-09-30 remix check).
    `cuts_by_boundary` maps boundary ms -> [(cut ms, score)]; a snapped boundary also closes
    the sliver gap. A boundary keeps its position when it has no candidate or when moving
    would leave either side shorter than `min_segment_ms`. Returns (segments, shifts in ms).
    """
    snapped = [dict(segment) for segment in segments]
    shifts = []
    for index, boundary in snap_points(snapped):
        left, right = snapped[index], snapped[index + 1]
        candidates = [(cut, score) for cut, score in cuts_by_boundary.get(boundary) or []
                      if cut - left['start_ms'] >= min_segment_ms and right['end_ms'] - cut >= min_segment_ms]
        if not candidates:
            continue
        cut = max(candidates, key=lambda item: (item[1], -abs(item[0] - boundary)))[0]
        if (left['end_ms'], right['start_ms']) != (cut, cut):
            shifts.append(cut - boundary)
            left['end_ms'] = right['start_ms'] = cut
    return snapped, shifts


CONFIRMED_DUPLICATE_IOU = 0.8


def interval_iou(a_start, a_end, b_start, b_end):
    overlap = min(a_end, b_end) - max(a_start, b_start)
    if overlap <= 0:
        return 0.0
    return overlap / (max(a_end, b_end) - min(a_start, b_start))


def drop_confirmed_duplicates(segments, confirmed, threshold=CONFIRMED_DUPLICATE_IOU):
    """Skips suggestions that repeat a confirmed segment (same label, IoU >= threshold).

    Re-analysing an annotated original otherwise queues near-identical copies of
    work a person already confirmed. Returns (kept, skipped_count).
    """
    kept = [segment for segment in segments if not any(
        segment['label_key'] == c['label_key']
        and interval_iou(segment['start_ms'], segment['end_ms'], c['start_ms'], c['end_ms']) >= threshold
        for c in confirmed)]
    return kept, len(segments) - len(kept)


def inherited_product(asset_product, confirmed):
    """The original's product, else the single product its confirmed segments agree on."""
    if asset_product:
        return asset_product
    products = {c['product_name'] for c in confirmed if c.get('product_name')}
    return products.pop() if len(products) == 1 else None


def merge_usage(first, second):
    """Sums numeric usage fields (nested one level) so a retried job records both calls."""
    merged = dict(first or {})
    for key, value in (second or {}).items():
        if isinstance(value, dict):
            merged[key] = merge_usage(merged.get(key) if isinstance(merged.get(key), dict) else {}, value)
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            current = merged.get(key)
            merged[key] = (current if isinstance(current, (int, float)) and not isinstance(current, bool) else 0) + value
        else:
            merged.setdefault(key, value)
    return merged


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value)


def _merge(segments, merged_counter, person_split_labels=()):
    """Merges touching same-label spans; for `person_split_labels` a reported person change stays a boundary."""
    result = []
    for segment in segments:
        previous = result[-1] if result else None
        person_change = segment['label_key'] in person_split_labels and segment.get('same_person') is False
        if (previous and not person_change and previous['label_key'] == segment['label_key']
                and segment['start_ms'] - previous['end_ms'] <= MERGE_GAP_MS):
            previous['end_ms'] = max(previous['end_ms'], segment['end_ms'])
            confidences = [c for c in (previous['confidence'], segment['confidence']) if c is not None]
            # Conservative: a merged span is only as certain as its weakest part.
            previous['confidence'] = min(confidences) if confidences else None
            reasons = [r for r in (previous['reason'], segment['reason']) if r]
            previous['reason'] = '；'.join(dict.fromkeys(reasons))[:MAX_REASON_CHARS]
            merged_counter[0] += 1
        else:
            result.append(dict(segment))
    return result


def _absorb_short(segments, label_min_ms, counter):
    """Relabels a span shorter than its label's preset minimum to an adjacent label.

    Both touching neighbours sharing a label win; otherwise the longer touching
    neighbour; a span with no touching neighbour is kept as the model said.
    """
    result = [dict(segment) for segment in segments]
    for index, segment in enumerate(result):
        minimum = label_min_ms.get(segment['label_key'])
        if not minimum or segment['end_ms'] - segment['start_ms'] >= minimum:
            continue
        neighbours = [n for n in (result[index - 1] if index else None, result[index + 1] if index + 1 < len(result) else None)
                      if n and abs((segment['start_ms'] - n['end_ms']) if n['end_ms'] <= segment['start_ms'] else (n['start_ms'] - segment['end_ms'])) <= MERGE_GAP_MS]
        if not neighbours:
            continue
        if len(neighbours) == 2 and neighbours[0]['label_key'] == neighbours[1]['label_key']:
            target = neighbours[0]['label_key']
        else:
            target = max(neighbours, key=lambda n: n['end_ms'] - n['start_ms'])['label_key']
        if target == segment['label_key']:
            continue
        segment['label_key'] = target
        segment['reason'] = f"{segment['reason']}（短于该类最短时长，并入相邻段）"[:MAX_REASON_CHARS]
        counter[0] += 1
    return result


def postprocess(payload, duration_ms, label_keys, min_segment_ms=DEFAULT_MIN_SEGMENT_MS, label_min_ms=None):
    """Normalizes model segments into non-overlapping source-relative millisecond intervals.

    Order: drop unknown labels / invalid numbers -> clamp to [0, duration] -> sort ->
    trim overlaps (later start = earlier end) -> merge touching same-label spans ->
    drop spans shorter than min_segment_ms -> merge again -> relabel spans shorter
    than their label's preset minimum (`label_min_ms`) to a touching neighbour ->
    merge again. Returns (segments, stats).

    When the model reports `same_person_as_previous` (v4), the merges before the
    minimum check keep a person change as a boundary for labels with a minimum, so
    the minimum applies per continuous person instead of per run of the label.
    Without the field the behaviour is unchanged.
    """
    if not isinstance(duration_ms, int) or duration_ms <= 0:
        raise ValueError('Source duration must be a positive integer')
    items = payload.get('segments') if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError('Response has no segments array')
    dropped = {'unknown_label': 0, 'invalid_range': 0, 'overlap_consumed': 0, 'too_short': 0, 'over_limit': 0}
    unknown_labels = []
    candidates = []
    for item in items:
        if not isinstance(item, dict):
            dropped['invalid_range'] += 1
            continue
        label = item.get('label_key')
        if not isinstance(label, str) or label not in label_keys:
            dropped['unknown_label'] += 1
            if isinstance(label, str) and label not in unknown_labels and len(unknown_labels) < 10:
                unknown_labels.append(label[:64])
            continue
        start, end = _number(item.get('start_sec')), _number(item.get('end_sec'))
        if start is None or end is None:
            dropped['invalid_range'] += 1
            continue
        start_ms = min(max(round(start * 1000), 0), duration_ms)
        end_ms = min(max(round(end * 1000), 0), duration_ms)
        if end_ms <= start_ms:
            dropped['invalid_range'] += 1
            continue
        confidence = _number(item.get('confidence'))
        reason = item.get('reason')
        same_person = item.get('same_person_as_previous')
        candidates.append({
            'start_ms': start_ms, 'end_ms': end_ms, 'label_key': label,
            'confidence': None if confidence is None else min(max(confidence, 0.0), 1.0),
            'reason': reason.strip()[:MAX_REASON_CHARS] if isinstance(reason, str) else '',
            'same_person': same_person if isinstance(same_person, bool) else None,
        })
    candidates.sort(key=lambda s: (s['start_ms'], s['end_ms']))
    trimmed = []
    for segment in candidates:
        if trimmed and segment['start_ms'] < trimmed[-1]['end_ms']:
            segment = {**segment, 'start_ms': trimmed[-1]['end_ms']}
            if segment['end_ms'] <= segment['start_ms']:
                dropped['overlap_consumed'] += 1
                continue
        trimmed.append(segment)
    merged = [0]
    split = frozenset(label_min_ms or ())
    person_splits = sum(1 for s in trimmed if s['label_key'] in split and s['same_person'] is False)
    kept = _merge(trimmed, merged, split)
    long_enough = [s for s in kept if s['end_ms'] - s['start_ms'] >= min_segment_ms]
    dropped['too_short'] = len(kept) - len(long_enough)
    result = _merge(long_enough, merged, split)
    absorbed = [0]
    if label_min_ms:
        result = _merge(_absorb_short(result, label_min_ms, absorbed), merged)
    for segment in result:
        segment.pop('same_person', None)
    if len(result) > MAX_SEGMENTS:
        dropped['over_limit'] = len(result) - MAX_SEGMENTS
        result = result[:MAX_SEGMENTS]
    stats = {'received': len(items), 'kept': len(result), 'merged': merged[0],
             'dropped': dropped, 'unknownLabels': unknown_labels,
             'minSegmentMs': min_segment_ms, 'durationMs': duration_ms}
    if label_min_ms:
        stats['absorbedShort'] = absorbed[0]
        stats['personSplits'] = person_splits
        stats['labelMinMs'] = dict(label_min_ms)
    return result, stats
