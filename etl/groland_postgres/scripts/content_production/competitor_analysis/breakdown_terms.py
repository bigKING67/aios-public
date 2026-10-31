"""Shared terms of the 爆款拆解 blocks: scene and pain normalisation, brand and endorser names.

Used by the per-film text extraction (enrichment.py, to reject a bare filming location) and by the
statistics (stats.breakdown, to count a scene, a brand or an endorser once however it is written).
Tables are maintained here in code; a back-office alias editor is outside P1.
"""
import re

# 场景卖点: only the four effect labels of our selling-point preset. Endorsement is not a scene's
# answer to a pain (it has its own block); a competitor-only point is `other` with its own words.
SCENE_POINTS = {'moisturizing': '滋润保湿', 'skincare': '养肤护肤', 'no_caking': '妆效', 'long_wear': '持妆'}
OTHER_POINT = 'other'
ENDORSER_ROLES = {'celebrity': '明星', 'kol': 'KOL达人', 'expert': '化妆师或专家'}
# The card's trust cue each role must agree with.
ROLE_CUES = {'celebrity': 'celebrity_endorsement', 'kol': 'kol_endorsement', 'expert': 'expert_endorsement'}

# Words that only say where a film was shot. A scene made of nothing else is a location, not a scene.
PLACE_WORDS = ('居家', '在家', '家里', '家中', '室内', '室外', '户外', '露天', '直播间', '化妆台', '梳妆台',
               '镜前', '镜子前', '棚拍', '摄影棚', '卧室', '浴室', '卫生间', '化妆间', '店里', '专柜', '柜台')
FILLER_WORDS = ('日常', '场景', '环境', '画面', '化妆', '上妆', '定妆', '底妆', '妆容', '自然光', '灯光', '选购',
                '使用', '展示', '拍摄', '测评', '实测', '演示', '的', '时', '中', '里', '下', '前', '旁', '边')
_PLACE_RE = re.compile('|'.join(sorted(PLACE_WORDS + FILLER_WORDS, key=len, reverse=True)))
_PUNCT_RE = re.compile(r'[\s　,，、。.!！?？:：;；"“”\'‘’()（）\[\]【】<>《》·\-—~～/|]+')
_SCENE_SUFFIX_RE = re.compile(r'(的?场景|的时候|时候|时)$')
# A leading 日常 adds nothing to a scene (日常长时间带妆 is 长时间带妆).
_SCENE_PREFIX_RE = re.compile(r'^日常')

# Suggested scene phrases (also given to the extraction prompt) and the spellings folded into them.
SCENE_SYNONYMS = {
    '通勤': ('上班路上', '上班通勤', '挤地铁', '坐地铁', '上班'),
    '早上赶时间': ('早上来不及', '着急出门', '赶时间出门', '快速出门', '早起赶时间', '早起赶时间出门', '早八',
                 '早上出门', '赶时间'),
    '约会': ('约会前', '去约会'),
    '熬夜后': ('熬夜', '通宵后', '熬夜第二天'),
    '运动出汗': ('运动', '健身', '出汗', '运动后'),
    '拍照上镜': ('拍照', '上镜', '出片', '镜头下'),
    '外出补妆': ('补妆', '随时补妆', '出门补妆', '外出'),
    '长时间带妆': ('全天带妆', '全天外出', '长时间外出', '一整天', '整天带妆', '长时间'),
    '夏季': ('夏天', '夏日', '炎热天气', '高温天', '夏季出油'),
    '秋冬': ('秋冬季', '秋冬季节', '秋冬干燥', '秋冬干燥季节', '秋冬季化妆', '换季', '干燥季节',
           '秋季', '秋天', '冬季', '冬天', '干冷天气'),
}
_SYNONYM_OF = {alias: canonical for canonical, aliases in SCENE_SYNONYMS.items() for alias in aliases}
SUGGESTED_SCENES = tuple(SCENE_SYNONYMS)

# Brand spellings that the card's free text writes differently and token folding does not join.
BRAND_ALIASES = {}
# Endorser spellings (nickname, account, ASR or caption variants) of one person.
ENDORSER_ALIASES = {'金婧': '金靖'}
# A description of someone (化妆课的老师, 一位博主) is not a name.
_DESCRIPTION_RE = re.compile(r'的|^(某|一位|多位|这位|那位|几位)|^(老师|化妆师|博主|达人|主播|网红|明星|演员|专家|医生|姐妹|闺蜜|朋友|素人|路人)$')
_ENDORSER_TRIM_RE = re.compile(r'^[@＠]+|(同款|推荐|爱用|亲测|分享|种草|代言)+$')


def compact(text):
    """Text without spaces and punctuation, for comparing spellings."""
    return _PUNCT_RE.sub('', text or '')


def is_location_only(scene):
    """True when a scene names only where the film was shot (居家 / 直播间 / 户外…)."""
    text = compact(scene)
    return bool(text) and not _PLACE_RE.sub('', text)


def normalize_scene(scene):
    """The scene's counting key: punctuation and a trailing 场景 / 时 dropped, synonyms folded."""
    text = _SCENE_PREFIX_RE.sub('', _SCENE_SUFFIX_RE.sub('', compact(scene))) or compact(scene)
    return _SYNONYM_OF.get(text, text)


def brand_key(brand):
    """(key, display) of a card's brand, or None when it has none.

    `蒂洛薇（Dirovo）` and `Dirovo（蒂洛薇）` share a key: the parts inside and outside brackets
    are compared as a set, case-insensitively. The display is the spelling as first written."""
    if not isinstance(brand, str) or not brand.strip():
        return None
    display = brand.strip()
    parts = [p.lower() for p in re.split(r'[()（）\[\]【】/／]+', display) if compact(p)]
    key = '|'.join(sorted(compact(p) for p in parts)) or compact(display).lower()
    key = BRAND_ALIASES.get(key, key)
    return key, display


def endorser_key(name):
    """(key, display) of an endorser name, or None when it is empty after trimming @ and 同款 / 推荐."""
    if not isinstance(name, str):
        return None
    display = _ENDORSER_TRIM_RE.sub('', compact(name))
    if not display or _DESCRIPTION_RE.search(display):
        return None
    key = ENDORSER_ALIASES.get(display.lower(), display.lower())
    return key, display
