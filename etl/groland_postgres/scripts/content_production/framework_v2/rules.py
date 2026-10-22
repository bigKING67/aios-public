"""Framework v2 rule engine: framework segments from per-shot facts and person chains.

Business rules (adjudicated 2026-10-14..17; see CONTENT_PRODUCTION_CONTRACTS.md):
- live_demo: one person's own review runs >= 10s. Their close-ups, product use, other angles and scene
  changes keep it continuous; brand ad shots, another person, borrowed celebrity clips, street
  interviews and promo pages interrupt it. Two people never add up. Introductions belong to the review.
- street_interview: street interviews.
- promotion: a standalone promo block. Price text at the tail of a person's own review stays in it.
- mixed_voiceover: everything else.

Parameters are frozen at the research version selected on 2026-10-18 (task 10-18-framework-split-v2,
research/p1-p2-results.md); change them only with a full 55-film rerun.

`finalize` runs after the bounded Lite review (2026-10-19, research/p4-results.md):
- A faceless brand-ad shot whose background matches neither neighbour (an AI or brand insert, not the
  presenter's own close-up) splits a reviewed live_demo; pieces under LIVE_MIN_SEC become mixed.
- live_demo made only of studio/brand-ad styled shots and shorter than LONG_TAKE_SEC is a brand clip.
- Endorsement (business answer 2026-10-19, Feishu doc VP9EdhfH5ot4JmxhV5Tc3JK7nng): a live_demo shorter than
  LONG_TAKE_SEC whose shots mostly carry a short "XX同款 / XX推荐 / XX爱用 / @XX" caption is endorsement
  footage, i.e. mixed. Long own reviews that keep a standing "@明星XX" watermark stay live (5 corpus films).
- Silent short footage (same answers): a live_demo shorter than SILENT_LIVE_MAX_SEC whose person barely moves
  their mouth (duration-weighted mouth spread < MOUTH_QUIET) is a dubbed clip, i.e. mixed. Longer silent
  product use with the presenter's own voice-over (eyelash or make-up demos) stays live.
  Runs after every split, so a long reviewed live_demo cut into short pieces is checked piece by piece.
- Person changes (2026-10-20): the Lite review sometimes joins several presenters into one live_demo. A reviewed
  live_demo is split wherever the person chain changes between face shots of at least PERSON_SHOT_MIN_SEC;
  pieces under LIVE_MIN_SEC become mixed (two people never add up).
- Street interviews: the 4B tags only some interview shots (interviewee close-ups read as selfie_ugc), so mixed
  footage between two street-tagged shots at most STREET_GAP_SEC apart is part of the interview.
- Mid-film promotion (2026-10-20): consecutive shots with explicit offer copy (at most MID_PROMO_GAP_SHOTS shot
  without a cue in between), lasting MID_PROMO_MIN_SEC with at least MID_PROMO_MIN_CUES offer lines, are a
  promotion block wherever they sit; only mixed footage is relabelled.
- The closing promotion block starts at the first explicit offer or call to action near the end (the
  pitch that follows belongs to it) and never at a standing "activity terms" disclaimer. A single offer line
  with no further cue within LONE_CUE_GAP_SEC is a passing mention (business 2026-10-22: the stretch is not
  about the offer), so a review's closing "现在下单立减70" does not turn the montage after it into promotion.
"""
import re
from collections import Counter
from difflib import SequenceMatcher

MIXED, LIVE, STREET, PROMOTION = 'mixed_voiceover', 'live_demo', 'street_interview', 'promotion'

LIVE_MIN_SEC = 10.0
# A single take or a person's total screen time this long is the presenter's own footage; borrowed
# celebrity clips run up to ~14s in the corpus, so 15-20s thresholds regress.
LONG_TAKE_SEC = 30.0
# 38/40 labelled promotion blocks close the film (median 15s, max 27s).
TAIL_WINDOW_SEC = 40.0
TAIL_OFFER_SHARE = 0.5
# The closing call to action may sit up to three shots before the end (product shots can follow it).
TAIL_CUE_SHOTS = 3
# A lone offer line ("现在下单立减70" closing a review) is a passing mention. Replayed on 55 films, 6-15s give the same
# result; 蜜粉-011/016 have 15.6s/21.3s of selling-point montage between the mention and the real offer.
LONE_CUE_GAP_SEC = 10.0
# Text or a name tag on more than this share of shots is a watermark, filing number or disclaimer.
STATIC_SHARE = 0.4
SHORT_SEGMENT_SEC = 1.5
# Background histogram similarity to the closer neighbour below which an ad shot is an outside insert
# (inserts measure 0.00-0.03, the presenter's own close-ups 0.25-0.89).
INSERT_BG_SIM = 0.1
# Explicit offers and calls to action, by word sense ("对冲黄气" is not "抓紧冲"); disclaimers such as
# "具体活动以直播间活动为准" mention the live room without offering anything.
PROMO_CUE_RE = re.compile(r'\d+\s*(元|块)|[¥￥]|\d+\s*折|[一二三四五六七八九两]折|到手|福利|限时|下单|链接|秒杀|券|库存'
                          r'|抢(购|到)|(抓紧|赶紧|快)冲|冲(鸭|啊|呀)|(快来|进|来)[直道]播间|拍[一两二三四五1-9](?=[发送到件盒支])|赠|送你')
# Short on-screen tag naming an endorser; subtitle lines ("我也是看痞幼推荐买的") are excluded by ENDORSE_SPEECH_RE.
ENDORSE_TAG_RE = re.compile(r'同款|推荐|爱用|^[@＠]')
ENDORSE_SPEECH_RE = re.compile(r'[我你给买是的]')
ENDORSE_TAG_MAX_CHARS = 14
ENDORSE_SHOT_SHARE = 0.5
# Mouth spread (framework_v2.mouth) of dubbed clips measures 0.002-0.015, on-camera speech 0.03-0.09; 0.02 and
# 0.025 give the same 55-film result, 0.03 starts to mislabel own reviews.
SILENT_LIVE_MAX_SEC = 15.0
# Face shots this long carry a reliable chain; shorter ones split true reviews on chain noise.
PERSON_SHOT_MIN_SEC = 2.0
STREET_GAP_SEC = 10.0
MID_PROMO_MIN_SEC = 6.0
MID_PROMO_MIN_CUES = 3
MID_PROMO_GAP_SHOTS = 1
MOUTH_QUIET = 0.025
PROMO_DISCLAIMER_RE = re.compile(r'以.{0,8}为准|具体活动|仅供参考|广告创意|因人而异')
OFFER_RE = re.compile(r'\d+\s*(元|块|w|W)|[¥￥]|到手|赠|送你|下单|链接|直播间|优惠|券|折|秒杀|福利|活动|囤|限时|划算|入手|不买|恢复|一盒|一支|拍[一两三]')


def shot_kind(facts):
    if facts is None:
        return 'unknown'
    if facts['style'] == 'street_interview':
        return 'street'
    if facts['style'] == 'promo_graphic':
        return 'promo'
    if facts['celebrity_tag']:
        return 'borrowed'
    if facts['style'] == 'studio_ad' and facts['subject'] not in ('person', 'multi_person'):
        # Polished faceless footage is brand material; face shots are judged by person chains,
        # since polish alone does not make a presenter an ad.
        return 'ad'
    if facts['subject'] in ('person', 'closeup', 'product') and facts['style'] in ('selfie_ugc', 'other', 'studio_ad'):
        return 'own'
    return 'other'


def own_runs(shots):
    """(first, last) shot indexes of each run of one person's own footage. A run needs at least one
    face to know whose review it is; faceless own shots inside or at its edges belong to it."""
    runs, cur = [], None
    for idx, s in enumerate(shots):
        if s['kind'] != 'own':
            cur = None
            continue
        chain = s.get('chain')
        if cur is None or (chain is not None and cur['chain'] is not None and chain != cur['chain']):
            cur = {'chain': chain, 'members': [idx]}
            runs.append(cur)
        else:
            cur['members'].append(idx)
            if cur['chain'] is None:
                cur['chain'] = chain
    return [(r['members'][0], r['members'][-1]) for r in runs
            if any(shots[i].get('chain') is not None for i in r['members'])]


def _classify(shots):
    static = Counter(t for s in shots for t in set(s.get('ocr', ())))
    limit = STATIC_SHARE * len(shots)
    watermark_tag = sum(bool(s['facts'] and s['facts']['celebrity_tag']) for s in shots) > limit
    screen_time = Counter()
    for s in shots:
        if s.get('chain') is not None:
            screen_time[s['chain']] += s['end'] - s['start']
    for s in shots:
        facts = s['facts']
        if facts and (watermark_tag or screen_time.get(s.get('chain'), 0) >= LONG_TAKE_SEC):
            facts = {**facts, 'celebrity_tag': False}
        s['kind'] = shot_kind(facts)
        if s['kind'] in ('borrowed', 'ad', 'other') and s.get('chain') is not None and s['end'] - s['start'] >= LONG_TAKE_SEC:
            s['kind'] = 'own'
        text = ' '.join(t for t in s.get('ocr', ()) if static[t] <= limit)
        s['offer'] = bool(OFFER_RE.search(text)) or bool((s['facts'] or {}).get('offer_text')) or s['kind'] == 'promo'


def _segments(shots, labels, duration):
    segs = []
    for s, lab in zip(shots, labels):
        if segs and segs[-1][2] == lab:
            segs[-1][1] = s['end']
        else:
            # Sub-frame flashes were dropped as shots; keep the timeline contiguous.
            segs.append([segs[-1][1] if segs else s['start'], s['end'], lab])
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for k, (a, b, _) in enumerate(segs):
            if b - a >= SHORT_SEGMENT_SEC:
                continue
            left = segs[k - 1] if k > 0 else None
            right = segs[k + 1] if k + 1 < len(segs) else None
            target = max((x for x in (left, right) if x), key=lambda x: x[1] - x[0])
            if target is left:
                left[1] = b
            else:
                right[0] = a
            segs.pop(k)
            merged = []
            for seg in segs:
                if merged and merged[-1][2] == seg[2]:
                    merged[-1][1] = seg[1]
                else:
                    merged.append(seg)
            segs[:] = merged
            changed = True
            break
    if segs:
        segs[0][0], segs[-1][1] = 0.0, duration
    return [[round(a, 3), round(b, 3), lab] for a, b, lab in segs]


def segment(shots, duration):
    """shots: [{start, end, facts, chain, ocr}] in time order (seconds).

    Returns (segments, runs): segments as [[start, end, label_key], ...] covering [0, duration], and
    runs as [(start, end)] of every own-footage run, the review candidates.
    """
    if not shots:
        return [[0.0, round(duration, 3), MIXED]], []
    _classify(shots)
    labels = [MIXED] * len(shots)
    for i, s in enumerate(shots):
        if s['kind'] == 'street':
            labels[i] = STREET
        elif s['kind'] == 'promo':
            labels[i] = PROMOTION
    runs = []
    for first, last in own_runs(shots):
        runs.append((shots[first]['start'], shots[last]['end']))
        if shots[last]['end'] - shots[first]['start'] < LIVE_MIN_SEC:
            continue
        for i in range(first, last + 1):
            labels[i] = LIVE
        j = last + 1
        while j < len(shots) and labels[j] == PROMOTION and shots[j]['facts'] \
                and shots[j]['facts']['subject'] in ('person', 'closeup') \
                and shots[j].get('chain') in (None, shots[last].get('chain')):
            labels[j] = LIVE
            j += 1
    tail_start = max(duration - TAIL_WINDOW_SEC, duration / 2)
    for k, s in enumerate(shots):
        if s['end'] <= tail_start or not s['offer'] or labels[k] in (STREET, LIVE):
            continue
        offered = sum(r['end'] - r['start'] for r in shots[k:] if r['offer'])
        if offered >= TAIL_OFFER_SHARE * (duration - s['start']) and all(lab not in (STREET, LIVE) for lab in labels[k + 1:]):
            for j in range(k, len(shots)):
                labels[j] = PROMOTION
            break
    return _segments(shots, labels, duration), runs


def _merge(segments):
    out = []
    for a, b, lab in segments:
        if b <= a:
            continue
        if out and out[-1][2] == lab:
            out[-1][1] = b
        else:
            out.append([a, b, lab])
    return out


def _standing_text(shots):
    """Captions on more than STATIC_SHARE of the shots (watermarks, filing numbers, activity disclaimers)."""
    counts = Counter(text for s in shots for text in set(s.get('ocr', ())))
    return {text for text, n in counts.items() if n > STATIC_SHARE * len(shots) and len(text) >= 6}


def _is_standing(text, standing):
    # OCR often returns fragments or near-copies of a standing line ("体福利", "具体福利优以直播间链接为准").
    return any(text in line or (len(text) >= 6 and SequenceMatcher(None, text, line).ratio() >= 0.8) for line in standing)


def _promo_cue(shot, standing=frozenset()):
    return any(PROMO_CUE_RE.search(t) and not PROMO_DISCLAIMER_RE.search(t) and not _is_standing(t, standing)
               for t in shot.get('ocr', ()))


def _split_inserts(segments, shots):
    """shots carry `kind` (from segment) and `bg_near`, the background similarity to the closer neighbour."""
    out = []
    for a, b, lab in segments:
        inserts = [(s['start'], s['end']) for s in shots
                   if lab == LIVE and s.get('kind') == 'ad' and s.get('bg_near') is not None
                   and s['bg_near'] < INSERT_BG_SIM and s['start'] >= a - 0.05 and s['end'] <= b + 0.05]
        if not inserts:
            out.append([a, b, lab])
            continue
        pos = a
        for x, y in inserts:
            if x > pos:
                out.append([pos, x, LIVE if x - pos >= LIVE_MIN_SEC else MIXED])
            out.append([max(pos, x), y, MIXED])
            pos = y
        if pos < b:
            out.append([pos, b, LIVE if b - pos >= LIVE_MIN_SEC else MIXED])
    return _merge(out)


def _endorsed(shot):
    return any(ENDORSE_TAG_RE.search(text) and len(text) <= ENDORSE_TAG_MAX_CHARS and not ENDORSE_SPEECH_RE.search(text)
               for text in shot.get('ocr', ()))


def _endorsement(segments, shots):
    out = []
    for a, b, lab in segments:
        if lab == LIVE and b - a < LONG_TAKE_SEC:
            inside = [s for s in shots if s['start'] >= a - 0.5 and s['end'] <= b + 0.5]
            if inside and sum(map(_endorsed, inside)) >= ENDORSE_SHOT_SHARE * len(inside):
                lab = MIXED
        out.append([a, b, lab])
    return _merge(out)


def _split_person_changes(segments, shots):
    out = []
    for a, b, lab in segments:
        cuts, previous = [], None
        if lab == LIVE:
            for s in shots:
                if not (s['start'] >= a - 0.05 and s['end'] <= b + 0.05):
                    continue
                if s.get('chain') is None or s['end'] - s['start'] < PERSON_SHOT_MIN_SEC:
                    continue
                if previous is not None and s['chain'] != previous:
                    cuts.append(s['start'])
                previous = s['chain']
        if not cuts:
            out.append([a, b, lab])
            continue
        points = [a] + cuts + [b]
        for x, y in zip(points, points[1:]):
            out.append([x, y, LIVE if y - x >= LIVE_MIN_SEC else MIXED])
    return _merge(out)


def _mid_promotion(segments, shots):
    standing = _standing_text(shots)
    strong = [_promo_cue(s, standing) for s in shots]
    cue = [c or (s['facts'] or {}).get('style') == 'promo_graphic' for c, s in zip(strong, shots)]
    blocks, i = [], 0
    while i < len(shots):
        if not cue[i]:
            i += 1
            continue
        last, k, gap = i, i, 0
        while k + 1 < len(shots):
            if cue[k + 1]:
                k, last, gap = k + 1, k + 1, 0
            elif gap < MID_PROMO_GAP_SHOTS:
                k, gap = k + 1, gap + 1
            else:
                break
        a, b = shots[i]['start'], shots[last]['end']
        if b - a >= MID_PROMO_MIN_SEC and sum(strong[i:last + 1]) >= MID_PROMO_MIN_CUES:
            blocks.append((a, b))
        i = last + 1
    out = []
    for a, b, lab in segments:
        points = sorted({a, b} | {p for block in blocks for p in block if a < p < b})
        for x, y in zip(points, points[1:]):
            middle = (x + y) / 2
            inside = any(b0 <= middle < b1 for b0, b1 in blocks)
            out.append([x, y, PROMOTION if inside and lab == MIXED else lab])
    return _merge(out)


def _fill_street(segments, shots):
    tagged = [s for s in shots if (s['facts'] or {}).get('style') == 'street_interview']
    gaps = [(x['end'], y['start']) for x, y in zip(tagged, tagged[1:]) if y['start'] - x['end'] <= STREET_GAP_SEC]
    out = []
    for a, b, lab in segments:
        points = sorted({a, b} | {p for gap in gaps for p in gap if a < p < b})
        for x, y in zip(points, points[1:]):
            middle = (x + y) / 2
            inside = any(g0 <= middle < g1 for g0, g1 in gaps)
            out.append([x, y, STREET if inside and lab in (MIXED, STREET) else lab])
    return _merge(out)


def _silent_short_live(segments, shots, measure=None):
    """shots carry `mouth` (framework_v2.mouth.shot_mouth, None without a usable face). Without it, `measure`
    (spans -> values) is called once for the shots of the short live segments only, so the CPU-bound probe
    runs on a few shots instead of the whole film."""
    if measure is not None:
        short = [(a, b) for a, b, lab in segments if lab == LIVE and b - a < SILENT_LIVE_MAX_SEC]
        todo = [s for s in shots if 'mouth' not in s and any(s['start'] >= a - 0.5 and s['end'] <= b + 0.5 for a, b in short)]
        if todo:
            for s, value in zip(todo, measure([(s['start'], s['end']) for s in todo])):
                s['mouth'] = value
    out = []
    for a, b, lab in segments:
        if lab == LIVE and b - a < SILENT_LIVE_MAX_SEC:
            measured = [(s['end'] - s['start'], s['mouth']) for s in shots
                        if s['start'] >= a - 0.5 and s['end'] <= b + 0.5 and s.get('mouth') is not None]
            weight = sum(d for d, _ in measured)
            if weight and sum(d * m for d, m in measured) / weight < MOUTH_QUIET:
                lab = MIXED
        out.append([a, b, lab])
    return _merge(out)


def _studio_live(segments, shots):
    out = []
    for a, b, lab in segments:
        if lab == LIVE and b - a < LONG_TAKE_SEC:
            inside = [s for s in shots if s['start'] >= a - 0.5 and s['end'] <= b + 0.5]
            if inside and all((s['facts'] or {}).get('style') == 'studio_ad' for s in inside):
                lab = MIXED
        out.append([a, b, lab])
    return _merge(out)


def _block_start(tail, standing):
    """Start of the closing offer block: the first cue that is followed by another cue within LONE_CUE_GAP_SEC,
    or the last cue. An earlier cue left alone is a passing mention, not a promotion."""
    cues = [s for s in tail if _promo_cue(s, standing)]
    for cue, following in zip(cues, cues[1:] + [None]):
        if following is None or following['start'] - cue['end'] <= LONE_CUE_GAP_SEC:
            return cue['start']


def _tail_promotion(segments, shots):
    duration = segments[-1][1]
    lo = max(duration - TAIL_WINDOW_SEC, duration / 2)
    tail = [s for s in shots if s['end'] > lo]
    standing = _standing_text(shots)
    if not tail or not any(_promo_cue(s, standing) for s in tail[-TAIL_CUE_SHOTS:]):
        return segments
    start = _block_start(tail, standing)
    # After skipped mentions the evidence search starts at the block, or the mention would still keep the
    # montage before it from shrinking out of an existing promotion block.
    skipped = start != next(s for s in tail if _promo_cue(s, standing))['start']
    # An existing promotion block only shrinks where nothing before `evidence` looks like an offer.
    evidence = next((s['start'] for s in tail if (not skipped or s['start'] >= start)
                     and (_promo_cue(s, standing) or (s['facts'] or {}).get('offer_text')
                          or (s['facts'] or {}).get('style') == 'promo_graphic')), start)
    marks = sorted({start, evidence})
    out = []
    for a, b, lab in segments:
        points = [a] + [m for m in marks if a < m < b] + [b]
        for x, y in zip(points, points[1:]):
            new = lab
            if x >= start and lab not in (STREET, LIVE):
                new = PROMOTION
            elif lo <= x < evidence and lab == PROMOTION:
                new = MIXED
            out.append([x, y, new])
    return _merge(out)


def finalize(segments, shots, measure_mouth=None):
    """Structural checks on the reviewed timeline (or the rule timeline when the review failed).
    measure_mouth: optional spans -> mouth values callable for shots that do not carry `mouth`."""
    live = _endorsement(_studio_live(_split_inserts([list(s) for s in segments], shots), shots), shots)
    timeline = _fill_street(_split_person_changes(_tail_promotion(live, shots), shots), shots)
    # Last, so the short pieces left by the person-change split are checked too (蜜粉-006, 2026-10-20).
    return _silent_short_live(_mid_promotion(timeline, shots), shots, measure_mouth)
