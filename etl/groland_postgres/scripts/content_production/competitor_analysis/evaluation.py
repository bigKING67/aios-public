"""Program checks for card A that need no human labels.

Speech quotes are compared with a Seed ASR reference transcript (evaluation only, never model input).
Framework labels from the business corpus give a reference for where the film changes register.
"""
import difflib
import re
import unicodedata

QUOTE_PASS = 0.8
WINDOW_PAD_SEC = 1.5
_DROP = re.compile(r'[\W_]+', re.UNICODE)
# Numbers are written either way ("11:38" vs "十一点三十八", "2.0" vs "二减零"); compare without them.
_NUMERALS = re.compile(r'[0-9零〇一二两三四五六七八九十百千万点减]+')


def _norm(text):
    return _NUMERALS.sub('', _DROP.sub('', unicodedata.normalize('NFKC', text or '').lower()))


def quote_coverage(quote, reference):
    """Share of quote characters found, in order, in the reference text."""
    quote, reference = _norm(quote), _norm(reference)
    if not quote:
        return None
    blocks = difflib.SequenceMatcher(None, quote, reference, autojunk=False).get_matching_blocks()
    return sum(block.size for block in blocks) / len(quote)


def window_text(utterances, start_sec, end_sec):
    lo, hi = (start_sec - WINDOW_PAD_SEC) * 1000, (end_sec + WINDOW_PAD_SEC) * 1000
    return ''.join(text for start, end, text in utterances if end >= lo and start <= hi)


def check_quotes(card, utterances):
    """Per speech evidence: coverage inside its own time window and anywhere in the film."""
    whole = ''.join(text for _, _, text in utterances)
    rows = []
    for item in card['evidence']:
        if item['modality'] != 'speech':
            continue
        time = item['time']
        start = time['start_sec']
        end = time['end_sec'] if time['kind'] == 'interval' else start
        local = quote_coverage(item['content'], window_text(utterances, start, end)) if start is not None else None
        anywhere = quote_coverage(item['content'], whole)
        if anywhere is None:
            continue
        status = ('ok' if (local or 0) >= QUOTE_PASS else
                  'mistimed' if anywhere >= QUOTE_PASS else 'not_heard')
        rows.append({'id': item['id'], 'start_sec': start, 'end_sec': end, 'local': round(local or 0, 3),
                     'anywhere': round(anywhere, 3), 'status': status, 'quote': item['content'][:60]})
    return rows


def hook_speech_check(card, utterances, hook_end):
    """Did the card's hook speech actually occur before hook_end? Returns (status, coverage)."""
    speech = card['hook']['speech']
    reference = ''.join(text for start, _, text in utterances if start < (hook_end - 0.3) * 1000)
    if not speech:
        return ('missed_speech' if len(_norm(reference)) >= 4 else 'ok_none'), None
    reference = ''.join(text for start, _, text in utterances if start < (hook_end + 0.3) * 1000)
    coverage = quote_coverage(speech, reference)
    return ('ok' if coverage >= QUOTE_PASS else 'outside_window'), round(coverage, 3)


def offer_vs_framework(card, framework_segments):
    """Promotion blocks labelled 机制 by the business should carry an `offer` role or offer text."""
    findings = []
    for start, end, label in framework_segments:
        if label != '机制':
            continue
        roles = {s['primary_role'] for s in card['segments'] if s['start_sec'] < end and s['end_sec'] > start}
        roles |= {r for s in card['segments'] if s['start_sec'] < end and s['end_sec'] > start for r in s['secondary_roles']}
        if not roles & {'offer', 'action'}:
            findings.append({'interval': [start, end], 'roles': sorted(roles)})
    return findings
