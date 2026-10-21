"""AI 切段打标 contract: preset-driven prompt, strict response schema and pure post-processing.

Labels come from the stored preset version (ads.content_segment_presets).
Legacy processing is taxonomy-independent. Opt-in v13 additionally checks the
framework's live-demo evidence; it never outputs a label outside the candidates.
"""
import math
import os

PROMPT_V1 = 'segment-suggest-v1'
PROMPT_V2 = 'segment-suggest-v2'
PROMPT_V3 = 'segment-suggest-v3'
PROMPT_V4 = 'segment-suggest-v4'
PROMPT_V5 = 'segment-suggest-v5'
# v6 (2026-10-13), v7-v11 (2026-10-14) were evaluation-only experiments; their names are not reused.
PROMPT_V12 = 'segment-suggest-v12'
PROMPT_V13 = 'segment-suggest-v13'
PROMPT_V15 = 'segment-suggest-v15'
PROMPT_V16 = 'segment-suggest-v16'
# v17 preserves the visual proposal and adds a separate audio/editorial gate.
PROMPT_V17 = 'segment-suggest-v17'
PROMPT_VERSIONS = (PROMPT_V1, PROMPT_V2, PROMPT_V3, PROMPT_V4, PROMPT_V5, PROMPT_V12, PROMPT_V13, PROMPT_V15, PROMPT_V16, PROMPT_V17)
PERSON_FIELD_VERSIONS = (PROMPT_V4, PROMPT_V5, PROMPT_V12, PROMPT_V13, PROMPT_V15, PROMPT_V16, PROMPT_V17)
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
        if label.get('absorbInto') is not None:
            targets = label['absorbInto']
            if not isinstance(targets, list) or not targets or not all(isinstance(t, str) and t.strip() for t in targets):
                raise ValueError('Invalid preset label absorbInto')
            targets = [t.strip() for t in targets]
            # Only meaningful with a minimum span, and never pointing at itself.
            if len(set(targets)) != len(targets) or 'minDurationMs' not in entry or entry['key'] in targets:
                raise ValueError('Invalid preset label absorbInto')
            entry['absorbInto'] = targets
        if label.get('absorbBetweenMaxSec') is not None:
            bridge = _number(label['absorbBetweenMaxSec'])
            if bridge is None or not 0 < bridge <= 3600:
                raise ValueError('Invalid preset label absorbBetweenMaxSec')
            entry['absorbBetweenMaxMs'] = round(bridge * 1000)
        result.append(entry)
    if any(t not in seen for entry in result for t in entry.get('absorbInto', ())):
        raise ValueError('Preset label absorbInto must reference preset label keys')
    return result


def label_minimums(labels):
    """`{key: minDurationMs}` for labels whose preset sets a minimum span."""
    return {label['key']: label['minDurationMs'] for label in labels if label.get('minDurationMs')}


def label_absorb_targets(labels):
    """`{key: frozenset(target keys)}`: labels a too-short span of `key` may be relabeled to.

    `labels` is the job's label set: targets outside it are dropped, and a label left
    without targets falls back to the unrestricted rule instead of never absorbing.
    """
    keys = {label['key'] for label in labels}
    result = {}
    for label in labels:
        targets = frozenset(label.get('absorbInto') or ()) & keys
        if targets:
            result[label['key']] = targets
    return result


def label_bridges(labels):
    """`{key: maxMs}`: a span this short between two touching `key` spans becomes `key`."""
    return {label['key']: label['absorbBetweenMaxMs'] for label in labels if label.get('absorbBetweenMaxMs')}


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

# v12 (2026-10-14, business rule from 车淑 & 森森 plus the owner's clarification): live
# footage is one person's footage running continuously for 10 seconds or more, where
# "continuous" means not interrupted by material unrelated to that person's own test.
# Everything that belongs to the test keeps it continuous (close-ups, device readings,
# before/after split screens, captions and effects, other angles and scenes: 竞品-016,
# 021); an inserted brand ad shot, another person, an "@明星" endorsement clip or stock
# footage breaks it (蜜粉-018 inserts a polished ad shot, 蜜粉-017 another woman,
# 竞品-006 a celebrity clip). Same as v4 except rules 6 and 9. Evaluation-only v10 read
# "continuous" as never leaving the frame (lost 蜜粉-017/018); v11 also counted the
# person's own effects and comparisons as interruptions (lost 竞品-016/021).
_V12_RULE6 = """
6. 实拍与混剪的判定标准是"同一个人的拍摄素材是否连续 10 秒及以上"。"连续"不是指画面里一直有这个人，而是指这个人的测评或演示过程没有被与她无关的外来素材打断（哪些算打断见第 9 条）。同一个人的素材连续满 10 秒，这一段单独算实拍；不同人、不同来源的素材剪在一起，每段连续不到 10 秒，合起来算混剪。是否声画同步、是否对着镜头说话，都不改变这个标准。"""
_V12_EXTRA = """
9. 属于这个人测评或演示过程的画面都不打断连续：她自己的近景、手部或上脸特写、正在使用的产品特写、测试仪器读数、前后对比或分屏对比图、为她的测评加的字幕、贴纸和特效包装，以及换个角度或换个场景继续测评。只有插入与她的测评无关的外来素材才算打断：品牌官方广告或宣传片里的精修产品大片（例如带成分图标的产品展示镜头）、另一个人物的镜头、带「@明星××」「明星××推荐」角标的明星推荐片段、网络素材。明星推荐片段本身就是借用的外来素材，按混剪处理；只标注「演员」身份的出镜主讲人不算明星推荐片段。"""


def build_prompt(preset_name, labels, version=DEFAULT_PROMPT_VERSION, shot_hint=None, transcript=None):
    """Prompt for one job. Labels and definitions always come from the preset.

    v1 is kept byte-identical for A/B comparison and never takes a shot hint.
    v2 adds label-agnostic structural guidance, allows omitting non-candidate
    content, and embeds the optional local shot-cut statistics.
    v3 appends the multi-person endorsement rule to v2 and is otherwise identical.
    v4 appends the person-split rule and the `same_person_as_previous` field to v3.
    v5 is v4 plus the timed voice-over transcript (`transcript`, from segment_transcript).
    v12 is v4 with rule 6 replaced by the 10-second continuity rule, plus rule 9 on what breaks continuity.
    v13 adds structured framework observations and executable live-demo guards.
    v15 uses that proposal contract plus source-bound visual verification in the worker.
    """
    if version == PROMPT_V1:
        if shot_hint is not None:
            raise ValueError('segment-suggest-v1 does not take shot statistics')
        return f"""你是短视频广告内容结构分析师。这是一条完整视频（含声音），由若干内容段按时间顺序拼接而成。
请结合画面和声音，把整条视频按时间顺序切分为连续、不重叠、尽量覆盖全片的内容段，并用「{preset_name}」分类体系给每段打一个标签。同一标签可以在片中出现多次。
标签（label_key 只能取以下 key 之一）：
{_definitions(labels)}
要求：{_OUTPUT_RULES}无法判断的内容不要编造标签，可以省略该时间段。"""
    if version not in PROMPT_VERSIONS:
        raise ValueError('Unknown segment suggestion prompt version')
    if transcript is not None and version != PROMPT_V5:
        raise ValueError(f'{version} does not take a transcript')
    if version in (PROMPT_V13, PROMPT_V15, PROMPT_V16, PROMPT_V17) and not {'mixed_voiceover', 'live_demo'} <= {label['key'] for label in labels}:
        raise ValueError('v13 requires framework labels')
    guidance = (_V2_GUIDANCE + (_V3_EXTRA if version in (PROMPT_V3, PROMPT_V4, PROMPT_V5) else '')
                + (_V12_RULE6 if version == PROMPT_V12 else '')
                + (_V4_EXTRA if version in PERSON_FIELD_VERSIONS else '') + (_V5_EXTRA if version == PROMPT_V5 else '')
                + (_V12_EXTRA if version == PROMPT_V12 else ''))
    if version in (PROMPT_V13, PROMPT_V15):
        from .framework_segment_evidence import GUIDANCE
        # v2's same-scene/lip-sync/fast-cut heuristics conflict with the
        # source-continuity policy; do not concatenate both rule systems.
        guidance = GUIDANCE + _V4_EXTRA
    if version in (PROMPT_V16, PROMPT_V17):
        # Stored legacy definitions still mention 30s or celebrity provenance.
        # Do not feed mutually conflicting definitions to the new candidate.
        current_definitions = {
            'live_demo': '同一完整演示或测评连续约10秒；完整独立演示允许约1秒时间容差。介绍、操作、近景、对比及效果可构成同一测评。不同人各自独立实拍保留换人边界。',
            'mixed_voiceover': '不同人物、独立广告、其他来源的短素材拼接；被插断的片段不累计时长。角标和明星身份不决定标签。',
        }
        labels = [{**label, 'definition': current_definitions.get(label['key'], label['definition'])} for label in labels]
        guidance = '''当前业务规则优先于旧预设文字：
实拍与混剪依据完整测评/演示素材是否连续约10秒。角标、人名、明星身份、推荐来源文字不决定标签，不因明星出镜改成混剪。
先确认独立演示和独立素材插入边界，再计算各自时长。不同人各自独立演示必须拆段，即使都算实拍；不能把两人的独立演示拼起来凑10秒。
完整独立演示约10秒可允许1秒时间标注容差；被独立素材插断的短片段不适用容差，不能累计前后时间。
本人皮肤近景、自己的手部操作、妆前妆后、自己的跨场景持妆测试属于完整测评。不能把这些步骤切短后分别要求10秒。
产品介绍、手部验证性质、接着上脸展示效果有具体操作流程衔接时，可以属于同一完整测评；不能仅因衣服、环境或出镜角色改变就拆掉这种测评。两个主讲人各自从头展示皮肤、各自上脸并展示效果仍是独立演示。
独立精修产品/成分广告、包装摆拍、无关影视/片场素材打断连续；前后返回同一个人不等于没有被打断。
机制是独立促销板块，街采是采访。本人完整测评的价格收尾不单独切机制。
''' + _V4_EXTRA
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
    """Strict schema with versioned person/source/continuity observations."""
    required = ['start_sec', 'end_sec', 'label_key', 'confidence', 'reason']
    properties = {
        'start_sec': {'type': 'number'}, 'end_sec': {'type': 'number'},
        'label_key': {'type': 'string', 'enum': [label['key'] for label in labels]},
        'confidence': {'type': 'number'}, 'reason': {'type': 'string'},
    }
    if version in PERSON_FIELD_VERSIONS:
        required.append('same_person_as_previous')
        properties['same_person_as_previous'] = {'type': 'boolean'}
    if version in (PROMPT_V13, PROMPT_V15):
        from .framework_segment_evidence import schema_fields
        fields = schema_fields()
        required.extend(fields)
        properties.update(fields)
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


def snap_boundaries(segments, cuts_by_boundary, min_segment_ms, *, prefer_nearest=False):
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
        cut = (min(candidates, key=lambda item: (abs(item[0]-boundary),-item[1])) if prefer_nearest
               else max(candidates, key=lambda item: (item[1], -abs(item[0] - boundary))))[0]
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
        set(segment.get('label_keys', [segment['label_key']])) == set(c.get('label_keys', [c['label_key']]))
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


def finalize_framework_segments(segments):
    """Recheck strict duration AFTER source-boundary snapping (opt-in v13).

    Snapping can turn a model's 10.2 seconds into 9.9. Preserve separate live
    people; only adjacent mixed spans may merge after a duration correction.
    """
    corrected, items = 0, []
    for segment in segments:
        item = {**segment, 'same_person': False}
        if item['label_key'] == 'live_demo' and item['end_ms'] - item['start_ms'] <= 10000:
            item['label_key'] = 'mixed_voiceover'
            item['reason'] = (item['reason'] + '；原片校准后未严格超过10秒')[:MAX_REASON_CHARS]
            corrected += 1
        items.append(item)
    merged = _merge(items, [0], {'live_demo'})
    for item in merged:
        item.pop('same_person', None)
    return merged, corrected


def _absorb_short(segments, label_min_ms, counter, absorb_into=None):
    """Relabels a span shorter than its label's preset minimum to an adjacent label.

    Both touching neighbours sharing a label win; otherwise the longer touching
    neighbour; a span with no touching neighbour, or the span that ends the film,
    is kept as the model said (2026-10-14: 竞品 films often close on a real 10-25s
    demo after the montage; the minimum exists to drop invented spans inside it). When
    the preset restricts targets (`absorb_into`), only neighbours with a target
    label or the span's own label count, so a short span next to anything else
    keeps its label.
    """
    absorb_into = absorb_into or {}
    result = [dict(segment) for segment in segments]
    for index, segment in enumerate(result):
        minimum = label_min_ms.get(segment['label_key'])
        if not minimum or segment['end_ms'] - segment['start_ms'] >= minimum or index == len(result) - 1:
            continue
        neighbours = [n for n in (result[index - 1] if index else None, result[index + 1] if index + 1 < len(result) else None)
                      if n and abs((segment['start_ms'] - n['end_ms']) if n['end_ms'] <= segment['start_ms'] else (n['start_ms'] - segment['end_ms'])) <= MERGE_GAP_MS]
        allowed = absorb_into.get(segment['label_key'])
        if allowed is not None:
            neighbours = [n for n in neighbours if n['label_key'] in allowed or n['label_key'] == segment['label_key']]
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


def _bridge(segments, bridge_ms, counter, merged_counter, person_split_labels=()):
    """Relabels a span between two touching spans of a bridging label to that label.

    Applies when the span is no longer than the label's `absorbBetweenMaxMs`; repeats
    on the merged result until nothing changes.
    """
    result = [dict(segment) for segment in segments]
    changed = True
    while changed:
        changed = False
        for index in range(1, len(result) - 1):
            before, segment, after = result[index - 1], result[index], result[index + 1]
            label = before['label_key']
            limit = bridge_ms.get(label)
            if (limit and after['label_key'] == label != segment['label_key']
                    and segment['end_ms'] - segment['start_ms'] <= limit
                    and segment['start_ms'] - before['end_ms'] <= MERGE_GAP_MS
                    and after['start_ms'] - segment['end_ms'] <= MERGE_GAP_MS):
                segment['label_key'] = label
                segment['reason'] = f"{segment['reason']}（夹在同类段之间，并入两侧）"[:MAX_REASON_CHARS]
                counter[0] += 1
                result = _merge(result, merged_counter, person_split_labels)
                changed = True
                break
    return result


def postprocess(payload, duration_ms, label_keys, min_segment_ms=DEFAULT_MIN_SEGMENT_MS, label_min_ms=None,
                absorb_into=None, bridge_ms=None, *, version=None):
    """Normalizes model segments into non-overlapping source-relative millisecond intervals.

    Order: drop unknown labels / invalid numbers -> clamp to [0, duration] -> sort ->
    trim overlaps (later start = earlier end) -> merge touching same-label spans ->
    drop spans shorter than min_segment_ms -> merge again -> relabel spans shorter
    than their label's preset minimum (`label_min_ms`) to a touching neighbour ->
    merge again -> relabel short spans between two touching spans of a label with
    `absorbBetweenMaxSec` (`bridge_ms`) to that label -> merge. `absorb_into`
    restricts which neighbours a too-short span may be relabeled to. Returns
    (segments, stats).

    When the model reports `same_person_as_previous` (v4), every merge keeps a
    person change as a boundary for labels with a minimum: the minimum applies per
    continuous person, and touching spans of different people stay separate
    segments (prompt rule 7; business-confirmed on 竞品 2026-10-14). Without the
    field the behaviour is unchanged.

    v13 first gates live-demo claims using source/marker/continuous-interval
    observations. It bypasses the legacy live-demo minimum, but preserves person
    boundaries. Other labels are not changed by the evidence gate.
    """
    if not isinstance(duration_ms, int) or isinstance(duration_ms, bool) or duration_ms <= 0:
        raise ValueError('Source duration must be a positive integer')
    evidence_corrections = None
    if version in (PROMPT_V13, PROMPT_V15):
        from .framework_segment_evidence import classify
        payload, evidence_corrections = classify(payload, label_keys, duration_ms)
        # Evidence already classifies the strict duration boundary. Keep person
        # splitting enabled without applying the legacy 30-second absorption.
        label_min_ms = {**(label_min_ms or {}), 'live_demo': 1}
    if version in (PROMPT_V16, PROMPT_V17):
        # The source-bound observer has measured continuity and the narrowly
        # scoped ~1s tolerance. Never reapply v13's caption/strict-time gate.
        label_min_ms = {**(label_min_ms or {}), 'live_demo': 1}
        # Even a subsecond independently observed insert interrupts continuity.
        # Dropping it would leave a coverage hole or rejoin the surrounding face.
        min_segment_ms = 1
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
        result = _merge(_absorb_short(result, label_min_ms, absorbed, absorb_into), merged, split)
    bridged = [0]
    if bridge_ms:
        result = _bridge(result, bridge_ms, bridged, merged, split)
    for segment in result:
        segment.pop('same_person', None)
    if len(result) > MAX_SEGMENTS:
        dropped['over_limit'] = len(result) - MAX_SEGMENTS
        result = result[:MAX_SEGMENTS]
    stats = {'received': len(items), 'kept': len(result), 'merged': merged[0],
             'dropped': dropped, 'unknownLabels': unknown_labels,
             'minSegmentMs': min_segment_ms, 'durationMs': duration_ms}
    if evidence_corrections is not None:
        stats['evidenceCorrections'] = evidence_corrections
        stats['classificationPolicy'] = version
    if bridge_ms:
        stats['bridged'] = bridged[0]
        stats['labelBridgeMs'] = dict(bridge_ms)
    if absorb_into:
        stats['labelAbsorbInto'] = {key: sorted(targets) for key, targets in absorb_into.items()}
    if label_min_ms:
        stats['absorbedShort'] = absorbed[0]
        stats['personSplits'] = person_splits
        stats['labelMinMs'] = dict(label_min_ms)
    return result, stats
