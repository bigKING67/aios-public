"""AI 卖点打标 (类型 2): prompt, strict schema and post-processing for selling-point presets.

A selling-point job runs only on an asset whose framework segments are confirmed: the model
marks selling-point spans inside its 混剪口播 segments, each with `continues_previous` (cannot be
cut from the previous span of the same framework segment). 实拍、街采、机制、KOC are whole 类型 1
units and are not split. Output stays a suggestion for human review.
Prototype and first draft: 框架识别测试/selling_point_draft.py (10 蜜粉 films, 2026-10-13).
"""
import math

PROMPT_VERSION = 'selling-point-v7'
DIMENSION = 'selling_point'
# The only framework label whose segments carry selling points (framework presets v1 and v2).
POINT_FRAMEWORK_LABEL = 'mixed_voiceover'
MIN_SPAN_MS = 1000
# Spans may start slightly before / end slightly after their framework segment.
CLAMP_TOLERANCE_MS = 500

# Clarify the active preset's labels without changing stored annotations or
# introducing labels that were not selected for this request.
LABEL_EVIDENCE = {
    'moisturizing': '滋润保湿强调本产品即时滋润、保湿、不干、不拔干、不起皮等效果，需有直接口播或对应演示。成分后引出的即时保湿效果归此类；水光、反光、光泽、软糯、冰凉、清透或不假白本身不等于保湿；仅成分名、精油/精华产品名或购买号召不单独构成依据。',
    'skincare': '养肤护肤强调本产品长期养出更好皮肤状态的效果，或成分与长期皮肤养护作用的明确关联；不强求字面出现具体天数，但须有养护皮肤的含义。按成分后引出的效果是长期还是即时判断。仅报成分名、精油/精华产品名、修补底妆、即时不拔干或妆面好看不单独等于养肤。',
    'star_endorsement': '仅明星背书：需有可核对的明星身份及其与本产品推荐、使用或同款的明确关系。口播或画面姓名/身份/同款标识可作依据，不能只凭长相猜身份，也不借其他片段角标。KOL/达人及化妆师/专家应分别归相应类别。',
    'kol_endorsement': '仅 KOL/达人背书：需有可核对的达人身份及其对本产品推荐、使用或同款关系，不凭出镜或粉丝语气推断。普通路人、消费者口碑、泛泛好评、多人说产品名均不算。',
    'expert_endorsement': '其他背书仅包括化妆师和专家，需有可核对的身份及其对本产品推荐、使用或专业评价的明确关系。机构、奖项、普通消费者不归入；不与明星或 KOL 混为一个标签。',
    # Keep the historical key so existing annotations and frozen plans retain their identity.
    'no_caking': '妆效：需有本产品妆面表现的直接口播或对应演示。不卡粉、不卡纹、不斑驳、不结块、服帖、自然、清透、不假白、无粉感、扒脸等描述都可归入妆效，不要求同时出现“不卡粉”。仅喜欢用、购买号召或使用前/其他产品的问题，不单独构成本产品妆效依据。',
    'long_wear': '需有本产品持妆、不脱妆、不暗沉、持续控油、控油时长或带时间信息的妆效保持依据。仅即时吸油演示不算持妆；只说“控油”而没有持续含义也不足以单独认定。仅描述容易出油脱妆的人群并号召试试，不单独证明产品持妆；即时水光或通透不等于长时间保持。',
}


def voiceover_frames(frames):
    """The confirmed framework segments selling points are split in, in the given order."""
    return [frame for frame in frames if frame['label_key'] == POINT_FRAMEWORK_LABEL]


def _clock(ms):
    seconds = int(round(ms / 1000))
    return f'{seconds // 60}:{seconds % 60:02d}'


def _transcript_hint(utterances):
    """Keep complete cached utterances and their millisecond bounds within a prompt budget."""
    lines, used = [], 0
    for start, end, text in utterances or []:
        line = f'[{start / 1000:.3f}–{end / 1000:.3f} 秒] {text}'
        if used + len(line) + 1 > 6000:
            break
        lines.append(line)
        used += len(line) + 1
    if not lines:
        return ''
    return ('\n\n同一原片的已有口播转写（仅作时间与上下文参考，可能有误识别或省略，画面依据仍须看视频）：\n'
            + '\n'.join(lines)
            + '\n切点优先采用完整口播单元首尾的时间，保留毫秒精度，不从词或半句话中间切。'
              '转写可能跨越镜头或人物，不能仅因处在同一转写单元就合并不同人物或跨框架片段。')


def build_prompt(frames, labels, utterances=None):
    """`frames`: confirmed 混剪口播 segments [{start_ms, end_ms, label_name}] in time order."""
    points = '\n'.join(f"- {label['key']}（{label['name']}）：{label.get('definition', '')}" for label in labels)
    evidence = '\n'.join(f"- {label['key']}：{LABEL_EVIDENCE[label['key']]}" for label in labels
                         if label['key'] in LABEL_EVIDENCE)
    framework = '\n'.join(
        f"- 第 {index} 段 {f['start_ms'] / 1000:.3f}–{f['end_ms'] / 1000:.3f} 秒"
        f"（{_clock(f['start_ms'])}–{_clock(f['end_ms'])}）：{f['label_name']}"
        for index, f in enumerate(frames))
    return f"""你在给美妆信息流视频标注卖点片段，用于按卖点替换画面的混剪。视频已经人工分好框架段，卖点只在混剪口播段里拆，下面只列出这些段（实拍、街采、机制等其他段整段使用，不在其中标卖点）：
{framework}

卖点只能从下面这些里选：
{points}

以上已选标签的证据边界（通用描述较宽时按这里判断）：
{evidence}

要求：
1. 只在上面的框架段时间范围内标注；每个卖点片段必须完整落在一个框架段内（framework_index 填该段序号）。
2. 一个卖点片段是连续一段正在讲或展示卖点的画面，起止尽量落在镜头切换或口播句子的边界上。一句话同时表达多个有依据的卖点时，将全部卖点放入同一片段的 label_keys 数组，不分优先级；保留完整句子，不复制相同时间区间。不同物理片段之间不重叠。
3. 没有讲这些卖点的时间不要标（例如开场钩子、产品介绍、价格福利），不必铺满全片。
4. continues_previous：当前片段和同一框架段里上一个已标注卖点之间不能切开时填 true——同一个镜头连续拍下来、一句口播跨过了两个卖点、或同一个人在同一场景里连续做一个动作；两个标注之间即使有未标卖点的讲解或动作，也不能仅凭这段空白认定可以切开。逐镜核对这两个标注之间的人物、场景和动作；同属一个框架、同属街采、台词接近都不代表连续，同一街采换了独立受访者应填 false。中间是硬切（换镜头、换场景、换人）时填 false。框架段里的第一个卖点片段填 false；不能从转写推断画面没有硬切。
5. 功效判断必须有本产品的正向依据。使用前、未定妆或其他产品造成的出油、浮粉、卡粉、脱妆，只是在描述问题，不能单独标成持妆、妆效或滋润保湿；不能只凭出现了相关词就贴标签。例如“今天还没有定妆，已经出油浮粉”不构成本产品持妆的证据。
6. 对比演示先讲问题、后展示本产品改善时，可以保留完整演示过程，但必须在同一片段中有明确的改善依据，并在 quote/reason 中说明；不要为绕过上一条而拆断连续口播或动作。没有正向依据就不标，不为凑齐卖点补标。
7. 每个片段自身必须包含每一个所选标签的完整依据，不借前后片段的功效来补当前片段。quote 填本片段里真正支撑这些标签的原话；仅有视觉依据时描述可见证据及位置，不能编造口播。reason 逐项说明依据如何对应每个标签，以及与上一个已标注片段之间实际看到了什么连续或换人/换镜头证据。例如“这款精华养肤，上脸还不拔干”在完整一句内同时收录 skincare 和 moisturizing；只有“不拔干”则不能补标 skincare。不为了凑多个标签拆出缺少依据的半句话。
8. 时间用秒，最多保留三位小数。{_transcript_hint(utterances)}"""


def response_schema(label_keys):
    return {
        'type': 'object', 'additionalProperties': False, 'required': ['segments'],
        'properties': {'segments': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False,
            'required': ['framework_index', 'start_sec', 'end_sec', 'label_keys', 'continues_previous', 'quote', 'reason'],
            'properties': {
                'framework_index': {'type': 'integer'},
                'start_sec': {'type': 'number'}, 'end_sec': {'type': 'number'},
                'label_keys': {'type': 'array', 'minItems': 1, 'maxItems': len(label_keys),
                               'items': {'type': 'string', 'enum': list(label_keys)}},
                'continues_previous': {'type': 'boolean'},
                'quote': {'type': 'string'}, 'reason': {'type': 'string'},
            }}}},
    }


def _check_retained_continuity(items, retained, frame_count):
    """A filtered span must not detach its successor or truncate its predecessor.

    Independent bad spans may still be dropped. A partially retained continuous
    chain makes the response invalid; do not invent a replacement link or cut.
    """
    ordered, unplaced_frames, linked_frames = [], set(), set()
    for position, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        index = item.get('framework_index')
        if type(index) is not int or not 0 <= index < frame_count:
            continue
        if item.get('continues_previous'):
            linked_frames.add(index)
        try:
            start, end = float(item['start_sec']), float(item['end_sec'])
            if not math.isfinite(start) or not math.isfinite(end):
                raise ValueError('non-finite time')
        except (KeyError, TypeError, ValueError, OverflowError):
            unplaced_frames.add(index)
            continue
        ordered.append((index, start, end, position, item))
    ordered.sort(key=lambda span: span[:4])
    previous = None
    for index, _, _, position, item in ordered:
        if index in unplaced_frames & linked_frames and position in retained:
            raise ValueError('continuous selling-point predecessor cannot be located')
        if item.get('continues_previous'):
            if previous and previous[0] == index and ((position in retained) != (previous[1] in retained)):
                raise ValueError('continuous selling-point chain lost a filtered span')
        previous = (index, position)


def postprocess(payload, frames, label_keys):
    """Clamp spans into their declared framework segment, drop unknown labels, short and
    overlapping spans, and force `continues_previous=False` on the first span of a segment.
    Reject partially filtered continuous chains. Returns (segments, stats) in the
    worker's segment shape plus framework and quote fields."""
    items = payload.get('segments') if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError('segments must be a list')
    dropped = {'unknown_label': 0, 'bad_framework': 0, 'too_short': 0, 'overlap': 0}
    spans = []
    for position, item in enumerate(items):
        # Accept old single-label fixtures/replays; v6 live schema requires label_keys.
        keys = item.get('label_keys', [item.get('label_key')]) if isinstance(item, dict) else None
        if (not isinstance(keys, list) or not keys or len(keys) > len(label_keys)
                or any(not isinstance(key, str) or key not in label_keys for key in keys)
                or len(set(keys)) != len(keys)):
            dropped['unknown_label'] += 1
            continue
        index = item.get('framework_index')
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(frames):
            dropped['bad_framework'] += 1
            continue
        frame = frames[index]
        try:
            start = round(float(item['start_sec']) * 1000)
            end = round(float(item['end_sec']) * 1000)
        except (TypeError, ValueError):
            dropped['bad_framework'] += 1
            continue
        if start < frame['start_ms'] - CLAMP_TOLERANCE_MS or end > frame['end_ms'] + CLAMP_TOLERANCE_MS:
            dropped['bad_framework'] += 1
            continue
        start, end = max(start, frame['start_ms']), min(end, frame['end_ms'])
        if end - start < MIN_SPAN_MS:
            dropped['too_short'] += 1
            continue
        spans.append((start, end, index, {**item, 'label_keys': sorted(keys)}, position))
    spans.sort(key=lambda span: (span[0], span[1]))
    kept, retained = [], set()
    for start, end, index, item, position in spans:
        if kept and start < kept[-1]['end_ms']:
            dropped['overlap'] += 1
            continue
        first = not kept or kept[-1]['framework_index'] != index
        retained.add(position)
        kept.append({'start_ms': start, 'end_ms': end, 'label_key': item['label_keys'][0],
                     'label_keys': item['label_keys'], 'framework_index': index,
                     'framework_segment_id': frames[index]['segment_id'],
                     'continues_previous': bool(item.get('continues_previous')) and not first,
                     'confidence': None, 'reason': str(item.get('reason') or '')[:500],
                     'quote': str(item.get('quote') or '')[:500]})
    _check_retained_continuity(items, retained, len(frames))
    return kept, {'received': len(items), 'kept': len(kept), 'dropped': dropped,
                  'continuousCount': sum(1 for segment in kept if segment['continues_previous'])}
