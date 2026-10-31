"""Bounded Seed 2.1 Lite review of live_demo / mixed_voiceover windows for framework v2.

Windows come from the rule's live_demo segments (2026-10-26, research/p6-stability-20261025.md): one shorter than
rules.LONG_TAKE_SEC is reviewed whole; a longer one only at its head and tail (EDGE_SEC inside it), where Lite
may move the start or the end but not split the middle. Every window carries CONTEXT_SEC outside it and
overlapping windows merge into a whole window, so short gaps between live segments are reviewed too. Each
window is one Lite call (360p clip with audio, 2 fps, thinking disabled); the answer is snapped to shot cuts
within SNAP_SEC. A head or tail answer without any live interval keeps the rule output; these windows change
only live_demo and mixed_voiceover. One more call reviews the closing CLOSING_SEC with all four labels and is
applied last, since street interviews and the closing promotion block sit at the end of the film and the 4B
facts miss mall interviews and price-drop openers. The prompts state only the adjudicated rules: a v1 clause
calling introductions or selling-point talk montage contradicted them and regressed complete reviews.

Measured 2026-10-26 on the same 55-film local evidence, two rounds each: whole-window review (v2) all
0.9499 / 0.9454, holdout 0.9188 / 0.9280, 19.6k input tokens per film; edge review all 0.9463 / 0.9507, holdout
0.9364 / 0.9327, 12.3k input tokens (about 0.01 CNY) per film, and fewer films that change between rounds;
edge plus closing review all 0.9622 / 0.9620, holdout 0.9563 / 0.9633, 20.0k input tokens (about 0.016 CNY).
Online v4 on the same films measured all 0.9548 / 0.9647 and holdout 0.9265 / 0.9459 at about 47k tokens.
"""
import subprocess
from concurrent.futures import ThreadPoolExecutor

from ..segment_suggestion_provider import SuggestionError
from . import rules

PROMPT_VERSION = 'v3-lite-edge-closing-review'
MIN_RUN_SEC = 5.0
PAD_SEC = 3.0
SNAP_SEC = 1.0
EDGE_SEC = 25.0
CONTEXT_SEC = 8.0
CLOSING_SEC = 45.0
CLIP_FPS = 2.0
CONCURRENCY = 4
NAMES = {'实拍内容': rules.LIVE, '混剪口播': rules.MIXED}
CLOSING_NAMES = {**NAMES, '街采': rules.STREET, '机制': rules.PROMOTION}

PROMPT = """这是一条美妆带货短视频中截取的片段（时长 {dur:.1f} 秒，时间从 0 开始计）。请把片段划分为连续、不重叠、覆盖全长的区间，每个区间标为「实拍内容」或「混剪口播」。

判定口径（业务已确认）：
1. 实拍内容：同一个人自己的测评或演示过程连续 10 秒及以上。「连续」不是指画面里一直有这个人：她自己的近景、手部或上脸特写、正在使用的产品特写、测试仪器读数、前后对比或分屏对比、为她的测评加的字幕和特效，以及换个角度或换个场景继续测评，都不打断连续。
2. 打断连续的只有与她的测评无关的外来素材：品牌官方广告或宣传片里的精修产品大片、另一个人物的镜头、带「@明星」「明星推荐」角标的明星推荐片段、网络素材。被打断后各段分别计时，不同人的时长不能相加。
3. 混剪口播：不同人物、不同来源的短素材拼接，每段连续不到 10 秒。同一个人的介绍、讲解、操作、近景、对比和效果展示可以构成同一段测评。
4. 是否声画同步、是否对着镜头说话，本身不决定标签；角标、人名、明星身份也不单独决定标签。

只输出区间，时间单位为秒，保留一位小数。reason 不超过 30 字。"""

EDGE_NOTE = '''
5. 这个片段截自一段更长的视频，{side}的测评可能在片段之外继续，片段外的部分也计入连续时长；只需判断片段内哪些是测评、哪些不是。'''

SCHEMA = {
    'type': 'object',
    'properties': {
        'segments': {'type': 'array', 'minItems': 1, 'maxItems': 12, 'items': {
            'type': 'object',
            'properties': {'start': {'type': 'number'}, 'end': {'type': 'number'},
                           'label': {'type': 'string', 'enum': ['实拍内容', '混剪口播']},
                           'reason': {'type': 'string'}},
            'required': ['start', 'end', 'label', 'reason'], 'additionalProperties': False}},
    },
    'required': ['segments'], 'additionalProperties': False,
}


CLOSING_PROMPT = """这是一条美妆带货短视频的最后 {dur:.1f} 秒（时间从 0 开始计，前面还有内容）。请把片段划分为连续、不重叠、覆盖全长的区间，每个区间标为「实拍内容」「混剪口播」「街采」或「机制」。

判定口径（业务已确认）：
1. 实拍内容：同一个人自己的测评或演示过程连续 10 秒及以上。她自己的近景、手部或上脸特写、正在使用的产品特写、前后对比、为她的测评加的字幕特效，以及换角度或换场景继续测评，都不打断连续。片段开头的测评可能从片段之前就已开始，片段外的部分也计入连续时长。
2. 混剪口播：不同人物、不同来源的短素材拼接，每段连续不到 10 秒；多位明星、达人、素人轮流出镜推荐也属于混剪口播。打断实拍连续的只有品牌官方精修广告、另一个人物、明星推荐片段和网络素材。
3. 街采：户外或商场等公共场所对多位路人或受访者提问，受访者轮流对镜头回答，常见手持话筒、多人轮换。
4. 机制：以促销福利信息为主（产品阵列、赠品、买赠、价格、活动字卡、庆祝动效），交代购买利益点。从第一个明确的优惠、降价或下单号召开始，之后接着的推销都属于机制；常驻的「以直播间活动为准」类免责字幕不算优惠，一句之后 10 秒内没有其他优惠的顺带提及也不算。
5. 是否声画同步、是否对着镜头说话、角标和明星身份本身都不单独决定标签。

只输出区间，时间单位为秒，保留一位小数。reason 不超过 30 字。"""

CLOSING_SCHEMA = {**SCHEMA, 'properties': {'segments': {**SCHEMA['properties']['segments'], 'items': {
    **SCHEMA['properties']['segments']['items'], 'properties': {
        **SCHEMA['properties']['segments']['items']['properties'],
        'label': {'type': 'string', 'enum': list(CLOSING_NAMES)}}}}}}


def windows(segments, runs, duration):
    """v2 whole-window layout, kept for the frozen review captures of framework_harness.evaluate."""
    cands = [(a, b) for a, b, lab in segments if lab == rules.LIVE]
    cands += [(a, b) for a, b in runs if b - a >= MIN_RUN_SEC]
    merged = []
    for a, b in sorted((max(0.0, a - PAD_SEC), min(duration, b + PAD_SEC)) for a, b in cands):
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged


def edge_windows(segments, duration):
    """[[start, end, kind]] with kind whole / head / tail; overlapping windows merge into a whole window."""
    raw = []
    for a, b, label in segments:
        if label != rules.LIVE:
            continue
        if b - a < rules.LONG_TAKE_SEC:
            raw.append([a - CONTEXT_SEC, b + CONTEXT_SEC, 'whole'])
        else:
            raw += [[a - CONTEXT_SEC, a + EDGE_SEC, 'head'], [b - EDGE_SEC, b + CONTEXT_SEC, 'tail']]
    merged = []
    for a, b, kind in sorted([max(0.0, a), min(duration, b), k] for a, b, k in raw):
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
            merged[-1][2] = 'whole'
        else:
            merged.append([a, b, kind])
    return merged


def edge_answer(kind, a, b, answer):
    """A head window keeps only where the review starts (mixed before it, live after); a tail window only
    where it ends. None (keep the rules) when a head or tail answer has no live interval."""
    if kind == 'whole':
        return answer
    live = [s for s in answer['segments'] if s['label'] == '实拍内容' and s['end'] > s['start']]
    if not live:
        return None
    if kind == 'head':
        t = max(0.0, live[0]['start'])
        parts = [(0.0, t, '混剪口播'), (t, b - a, '实拍内容')]
    else:
        t = min(b - a, live[-1]['end'])
        parts = [(0.0, t, '实拍内容'), (t, b - a, '混剪口播')]
    return {'segments': [{'start': x, 'end': y, 'label': label} for x, y, label in parts if y > x]}


def prompt(duration, kind):
    text = PROMPT.format(dur=duration)
    if kind == 'whole':
        return text
    note = EDGE_NOTE.format(side='结尾处' if kind == 'head' else '开头处')
    return text.replace('\n\n只输出区间', note + '\n\n只输出区间')


def apply(segments, cuts, a, b, review, names=NAMES):
    """Overwrite live/mixed inside [a, b] with the reviewed intervals snapped to shot cuts; with CLOSING_NAMES
    every label inside [a, b] is overwritten."""
    def snap(t):
        near = min(cuts, key=lambda c: abs(c - t), default=t)
        return near if abs(near - t) <= SNAP_SEC else t
    marks = []
    for seg in review['segments']:
        s, e = a + max(0.0, seg['start']), a + min(b - a, seg['end'])
        if e > s and seg['label'] in names:
            marks.append((snap(s), snap(e), names[seg['label']]))
    lo, hi = segments[0][0], segments[-1][1]
    points = sorted(p for p in {p for x, y, _ in segments for p in (x, y)} | {p for x, y, _ in marks for p in (x, y)} | {a, b}
                    if lo <= p <= hi)
    out = []
    for x, y in zip(points, points[1:]):
        mid = (x + y) / 2
        lab = next((l for p, q, l in segments if p <= mid < q), segments[-1][2])
        if a <= mid < b and (names is CLOSING_NAMES or lab in (rules.LIVE, rules.MIXED)):
            lab = next((l for p, q, l in marks if p <= mid < q), lab)
        if out and out[-1][2] == lab:
            out[-1][1] = y
        else:
            out.append([x, y, lab])
    return [[round(x, 3), round(y, 3), lab] for x, y, lab in out]


def clip(source, a, b, path, env):
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', str(source),
                    '-vf', 'scale=-2:360', '-r', '15', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast',
                    '-c:a', 'aac', '-b:a', '48k', '-ac', '1', str(path)], check=True, env=env, timeout=300)
    return path


def review(provider, source, segments, runs, cuts, duration, work, env, tick=lambda: None, *, timings=None):
    """Returns (segments, receipts). Windows with an unparsable answer keep the rule output. The closing window
    is last, so its answer is applied after the live-segment windows.
    `runs` is unused since the edge layout (v3); the signature stays for the pipeline and harness."""
    from ..stage_timings import StageTimings
    timings = timings or StageTimings()
    wins = edge_windows(segments, duration) + [[max(0.0, duration - CLOSING_SEC), duration, 'closing']]
    clips = [timings.call('framework_review_clips', clip, source, a, b, work / f'review-{k}.mp4', env)
             for k, (a, b, _) in enumerate(wins)]

    def ask(a, b, kind, path):
        if kind == 'closing':
            text, schema = CLOSING_PROMPT.format(dur=b - a), CLOSING_SCHEMA
        else:
            text, schema = prompt(b - a, kind), SCHEMA
        try:
            return timings.call('framework_review_cloud', provider.review, text, schema,
                                proxy=path, fps=CLIP_FPS, thinking='disabled'), None
        except SuggestionError as error:
            # A failed review keeps the rule output for this window; the job still publishes.
            return None, error

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(ask, a, b, kind, path) for (a, b, kind), path in zip(wins, clips)]
        results = []
        for future in futures:
            tick()
            results.append(future.result())
    receipts = []
    for (a, b, kind), (result, error) in zip(wins, results):
        receipt = {'window': [round(a, 3), round(b, 3)], 'kind': kind}
        if error is not None:
            receipt.update(error=error.code, usage=error.usage)
        else:
            payload = result.payload if isinstance(result.payload, dict) else {}
            if kind == 'closing' and payload.get('segments'):
                segments = apply(segments, cuts, a, b, payload, CLOSING_NAMES)
            elif payload.get('segments') and (answer := edge_answer(kind, a, b, payload)):
                segments = apply(segments, cuts, a, b, answer)
            receipt.update(responseId=result.response_id, usage=result.usage, segments=payload.get('segments'))
        receipts.append(receipt)
    return segments, receipts
