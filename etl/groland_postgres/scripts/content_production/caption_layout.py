"""Deterministic, word-aware wrapping for the basic-bottom-v1 subtitle preset."""
from functools import lru_cache
import re

import jieba
import jieba.posseg

# Keep model names and quantity/unit expressions intact even if the dictionary
# tokenizes them separately. Product vocabulary is supplied per task, never added
# to Jieba's global dictionary (which would leak across tenants).
_ATOMIC = re.compile(r"[A-Za-z0-9]+(?:[.%-][A-Za-z0-9]+)*(?:毫升|毫克|公斤|分钟|小时|秒|元|克|天|%|℃)?")


@lru_cache(maxsize=1)
def _tokenizer():
    return jieba.posseg.POSTokenizer(jieba.Tokenizer())


def wrap_caption(text: str, protected_terms: tuple[str, ...] = ()) -> str:
    """Wrap only at dictionary boundaries; refuse overflow instead of splitting a word.

    Nine code points per line is conservative for the locked preset, not font
    shaping. Dictionary boundaries do not guarantee correct grammatical phrasing.
    """
    if not isinstance(protected_terms, (tuple, list)) or len(protected_terms) > 200:
        raise ValueError("protected terms must be a list of at most 200 terms")
    if any(not isinstance(term, str) or not term.strip() or len(term) > 100
           or any(ord(c) < 32 for c in term) for term in protected_terms):
        raise ValueError("invalid protected term")
    if len(text) <= 9:
        return text
    if len(text) > 18:
        raise ValueError("ASR clause exceeds two-line layout; segmentation review required")
    spans = [m.span() for m in _ATOMIC.finditer(text)]
    for term in protected_terms:
        offset = 0
        while (offset := text.find(term, offset)) != -1:
            spans.append((offset, offset + len(term)))
            offset += 1
    boundaries = []
    offset = 0
    tokens = list(_tokenizer().cut(text, HMM=False))
    for index, token in enumerate(tokens):
        offset += len(token.word)
        next_flag = tokens[index + 1].flag if index + 1 < len(tokens) else ""
        # Keep adjective+noun and quantity+modifier/noun phrases together:
        # 小/雪花 and 两/大/黄金 should not become line boundaries.
        attached = (token.flag.startswith("a") and next_flag.startswith(("n", "a"))) or (
            token.flag == "m" and next_flag.startswith(("a", "n", "q")))
        if not attached and len(text) - 9 <= offset <= 9 and not any(a < offset < b for a, b in spans):
            boundaries.append(offset)
    if not boundaries:
        raise ValueError("no word-safe two-line layout; segmentation review required")
    split = min(boundaries, key=lambda i: (abs(len(text) - 2 * i), i))
    return text[:split].rstrip() + "\n" + text[split:].lstrip()
