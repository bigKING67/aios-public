"""Conservative Chinese inverse text normalization for local ASR transcripts.

FunASR (paraformer) writes numbers as characters ("立减六十", "二点零"). Only unambiguous number
forms are rewritten; a lone numeral character is never touched because it is usually part of a word
("三资堂", "一下", "拍一发二", "第一步"), and "千万" / "十分" / "万一" stay words.

- 百分之三十 -> 30%
- 二点零 -> 2.0 (fraction digits must be plain numerals, so "一点都" and "十一点十六分" are not decimals)
- multi-character numbers with a place unit: 九十九 -> 99, 五十七 -> 57, 一百二十 -> 120, 十一 -> 11
"""
import re

ITN_VERSION = 'aios-itn-zh-v1'

DIGITS = {'零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
UNITS = {'十': 10, '百': 100, '千': 1000}
MYRIAD = {'万': 10_000, '亿': 100_000_000}
NUMERAL = '零〇一二两三四五六七八九十百千万亿'
PLAIN = '零〇一二三四五六七八九'

_PERCENT = re.compile(f'百分之([{NUMERAL}]+(?:点[{PLAIN}]+)?)')
_DECIMAL = re.compile(f'([{NUMERAL}]+)点([{PLAIN}]+)(?![{NUMERAL}])')
_INTEGER = re.compile(f'[{NUMERAL}]{{2,}}')


def to_int(text):
    """Value of a numeral string with place units, or None when it is not a well-formed number."""
    if not text or text[0] in '百千万亿' or any(ch not in NUMERAL for ch in text):
        return None
    if not any(ch in UNITS or ch in MYRIAD for ch in text):
        return None
    total, section, digit = 0, 0, None
    last_unit = None  # place value of the last unit inside the current section
    last_place = None  # place value of the unit right before a trailing digit
    after_zero = False
    for ch in text:
        if ch in DIGITS:
            if digit:
                return None  # two non-zero digits in a row ("九十九一") are not one number
            after_zero = after_zero or DIGITS[ch] == 0
            digit = DIGITS[ch]
        elif ch in UNITS:
            unit = UNITS[ch]
            if last_unit is not None and unit >= last_unit:
                return None
            section += (1 if digit is None else digit) * unit
            digit, last_unit, last_place, after_zero = None, unit, unit, False
        else:  # 万 / 亿
            section += digit or 0
            if section == 0:
                return None
            total += section * MYRIAD[ch]
            section, digit, last_unit, last_place, after_zero = 0, None, None, MYRIAD[ch], False
    if digit and last_place and not after_zero:
        # Colloquial omitted unit: 二百五 = 250, 一万二 = 12000, 十一 = 11.
        return total + section + digit * last_place // 10
    return total + section + (digit or 0)


def _plain_digits(text):
    return ''.join(str(DIGITS[ch]) for ch in text)


def _number(text):
    """Integer for a place-unit numeral, digit string for a single plain numeral, else None."""
    value = to_int(text)
    if value is not None:
        return str(value)
    if len(text) == 1 and text in DIGITS:
        return str(DIGITS[text])
    return None


def _decimal(match):
    whole = _number(match.group(1))
    return f'{whole}.{_plain_digits(match.group(2))}' if whole is not None else match.group(0)


def _percent(match):
    body = match.group(1)
    if '点' in body:
        whole, fraction = body.split('点', 1)
        whole = _number(whole)
        value = f'{whole}.{_plain_digits(fraction)}' if whole is not None else None
    else:
        value = _number(body)
    return f'{value}%' if value is not None else match.group(0)


def _integer(match):
    """Longest well-formed prefix of the run; the rest (e.g. "一" in "九十九一支") stays text."""
    run = match.group(0)
    for end in range(len(run), 1, -1):
        value = to_int(run[:end])
        if value is not None:
            return str(value) + run[end:]
    return run


def normalize(text):
    if not text:
        return text
    text = _PERCENT.sub(_percent, text)
    text = _DECIMAL.sub(_decimal, text)
    return _INTEGER.sub(_integer, text)
