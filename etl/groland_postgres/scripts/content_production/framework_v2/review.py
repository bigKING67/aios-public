"""Bounded Seed 2.1 Lite review of live_demo / mixed_voiceover windows for framework v2.

Windows are every live_demo segment and every own-footage run >= MIN_RUN_SEC the rules did not accept,
padded by PAD_SEC and merged. Each window is one Lite call (360p clip with audio, 2 fps, thinking
disabled); Lite returns live/mixed sub-intervals that are snapped to shot cuts within SNAP_SEC.
street_interview and promotion segments are never changed. The prompt states only the adjudicated
rules: a v1 clause calling introductions or selling-point talk montage contradicted them and regressed
complete reviews (research/p1-p2-results.md, P3).

Measured 2026-10-18: dev 0.890 -> 0.911, holdout 0.862 -> 0.887, ~1.9 windows and ~0.02 CNY per film.
"""
import subprocess
from concurrent.futures import ThreadPoolExecutor

from ..segment_suggestion_provider import SuggestionError
from . import rules

PROMPT_VERSION = 'v2-lite-review-v2'
MIN_RUN_SEC = 5.0
PAD_SEC = 3.0
SNAP_SEC = 1.0
CLIP_FPS = 2.0
CONCURRENCY = 4
NAMES = {'实拍内容': rules.LIVE, '混剪口播': rules.MIXED}

PROMPT = """这是一条美妆带货短视频中截取的片段（时长 {dur:.1f} 秒，时间从 0 开始计）。请把片段划分为连续、不重叠、覆盖全长的区间，每个区间标为「实拍内容」或「混剪口播」。

判定口径（业务已确认）：
1. 实拍内容：同一个人自己的测评或演示过程连续 10 秒及以上。「连续」不是指画面里一直有这个人：她自己的近景、手部或上脸特写、正在使用的产品特写、测试仪器读数、前后对比或分屏对比、为她的测评加的字幕和特效，以及换个角度或换个场景继续测评，都不打断连续。
2. 打断连续的只有与她的测评无关的外来素材：品牌官方广告或宣传片里的精修产品大片、另一个人物的镜头、带「@明星」「明星推荐」角标的明星推荐片段、网络素材。被打断后各段分别计时，不同人的时长不能相加。
3. 混剪口播：不同人物、不同来源的短素材拼接，每段连续不到 10 秒。同一个人的介绍、讲解、操作、近景、对比和效果展示可以构成同一段测评。
4. 是否声画同步、是否对着镜头说话，本身不决定标签；角标、人名、明星身份也不单独决定标签。

只输出区间，时间单位为秒，保留一位小数。reason 不超过 30 字。"""

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


def windows(segments, runs, duration):
    cands = [(a, b) for a, b, lab in segments if lab == rules.LIVE]
    cands += [(a, b) for a, b in runs if b - a >= MIN_RUN_SEC]
    merged = []
    for a, b in sorted((max(0.0, a - PAD_SEC), min(duration, b + PAD_SEC)) for a, b in cands):
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged


def apply(segments, cuts, a, b, review):
    """Overwrite live/mixed inside [a, b] with the reviewed intervals snapped to shot cuts."""
    def snap(t):
        near = min(cuts, key=lambda c: abs(c - t), default=t)
        return near if abs(near - t) <= SNAP_SEC else t
    marks = []
    for seg in review['segments']:
        s, e = a + max(0.0, seg['start']), a + min(b - a, seg['end'])
        if e > s and seg['label'] in NAMES:
            marks.append((snap(s), snap(e), NAMES[seg['label']]))
    lo, hi = segments[0][0], segments[-1][1]
    points = sorted(p for p in {p for x, y, _ in segments for p in (x, y)} | {p for x, y, _ in marks for p in (x, y)} | {a, b}
                    if lo <= p <= hi)
    out = []
    for x, y in zip(points, points[1:]):
        mid = (x + y) / 2
        lab = next((l for p, q, l in segments if p <= mid < q), segments[-1][2])
        if a <= mid < b and lab in (rules.LIVE, rules.MIXED):
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


def review(provider, source, segments, runs, cuts, duration, work, env, tick=lambda: None):
    """Returns (segments, receipts). Windows with an unparsable answer keep the rule output."""
    wins = windows(segments, runs, duration)
    clips = [clip(source, a, b, work / f'review-{k}.mp4', env) for k, (a, b) in enumerate(wins)]
    def ask(a, b, path):
        try:
            return provider.review(PROMPT.format(dur=b - a), SCHEMA, proxy=path, fps=CLIP_FPS, thinking='disabled'), None
        except SuggestionError as error:
            # A failed review keeps the rule output for this window; the job still publishes.
            return None, error

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(ask, a, b, path) for (a, b), path in zip(wins, clips)]
        results = []
        for future in futures:
            tick()
            results.append(future.result())
    receipts = []
    for (a, b), (result, error) in zip(wins, results):
        receipt = {'window': [round(a, 3), round(b, 3)]}
        if error is not None:
            receipt.update(error=error.code, usage=error.usage)
        else:
            if isinstance(result.payload, dict) and result.payload.get('segments'):
                segments = apply(segments, cuts, a, b, result.payload)
            receipt.update(responseId=result.response_id, usage=result.usage, segments=(result.payload or {}).get('segments'))
        receipts.append(receipt)
    return segments, receipts
