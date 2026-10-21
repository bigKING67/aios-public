"""Opt-in framework classification from explicit visual observations (v13)."""
import math


GUIDANCE = """
判定顺序（优先于旧预设时长描述）：
先观察素材来源，再判断连续测评，最后打标签。时长长、声画同步不代表实拍。
先确定完整内容单元，再划分片段。一个主讲人的完整测评可以用旁白解说、快速剪辑、跨场景展示自己的测试过程；剪辑快、画面多、口型不同步都不等于多来源混剪。必须看到无关来源证据才能打断测评，不能把她自己的产品测试和效果特写当成外来素材。
每段必须返回 visual_kind：borrowed_endorsement（借用明星/达人推荐素材，有推荐角标或来源依据）、single_presenter（一个主讲人的独立测评）、montage（多来源拼接）、other（街采/机制等）。不能只因出现人名或演员身份就断定借用。
借用的明星/达人推荐素材，无论连续多久，都属于混剪，优先于连续时长规则。
每段另填 endorsement_marker：逐字抄录画面中明确的明星/达人推荐来源角标（如「某某推荐」「@明星某某」），没有则填空字符串。检查画面四周持续存在的竖排角标，换场景、开始上脸演示、画面变为单人都不会使推荐来源失效。只写「演员」身份或普通姓名不算推荐来源角标，不填。该字段是画面观察，不随你选择的标签改变；即使你选了single_presenter也必须如实抄录推荐角标。
多人短推荐/效果展示串接是montage：例如两位女生各约8–12秒轮流推荐，不因为其中一段略超过10秒就把它拆成独立实拍。超过10秒只是独立测评的必要条件，不是把混剪里的短素材升级成实拍的充分条件。先看该段是否构成独立测评过程，还是多人推荐拼接中的一个短引语/效果镜头；不要仅凭一个人讲话和时长作判断。
对 single_presenter，continuous_start_sec/continuous_end_sec 填该段中同一个人最长一次未被外来素材打断的测评区间，必须在本段范围内。自己的特写、对比、测试读数不打断；另一人、官方广告、网络素材打断。不同人、被打断前后、重复出现的同一人均不得累计。其他 visual_kind 两个时间均填 null。
识别人物连续性时，不要因为戴上发箍、妆前妆后、发型、滤镜或光线变化、从室内转到室外就判断换人。一个主讲人自己的上脸特写、产品粉质/取量、成分表、测试仪器、水油测试、前后对比、不同场景持妆/补妆展示都属于同一测评过程，整体保留为实拍段，不按每个镜头分别重新计算10秒。只有明确换成另一个人或插入无关来源才打断。
single_presenter 的两个连续时间必须是数字，即使你将它标为混剪或它不足10秒也不能填null。例如一个人从20到28秒：visual_kind=single_presenter，continuous_start_sec=20，continuous_end_sec=28，label_key=mixed_voiceover。无法确定连续测评区间时不要填single_presenter；按实际的多来源拼接填montage。换人或插入外来素材必须先切段，不得用一个合格子区间替整段证明实拍。
独立测评只有连续严格超过10秒才可算实拍，恰好10秒不算。先确认人物/来源边界再算时长；不得把下一个人的第一秒计入上一人，不按整数秒截图的张数计时。片尾同样适用。
机制须以促销、价格、赠品、下单引导作为该段主要内容；推荐或测评里的零星优惠措辞、静态广告角标不单独切机制。长实拍只标演员身份而非借用推荐时仍可成立。
独立测评主讲人在同一完整测评结尾介绍规格、价格或随附赠品，仍属于这个测评段；不要因为出现数字价格/产品阵列就切机制。切机制需要叙事转为独立促销板块（例如换主播/直播间促销或独立福利字卡）。
只返回观察到的证据，不要用最终标签反推来源或补造连续时间。
"""


def schema_fields():
    return {
        'visual_kind': {'type': 'string', 'enum': ['borrowed_endorsement', 'single_presenter', 'montage', 'other']},
        'endorsement_marker': {'type': 'string'},
        'continuous_start_sec': {'type': ['number', 'null']},
        'continuous_end_sec': {'type': ['number', 'null']},
    }


def classify(payload, label_keys, duration_ms):
    """Validate observations before merging; never infer evidence from free text."""
    if not {'mixed_voiceover', 'live_demo'} <= set(label_keys):
        raise ValueError('v13 requires framework mixed_voiceover and live_demo labels')
    items = payload.get('segments') if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError('Response has no segments array')
    result, corrected, previous_end, units = [], 0, 0, []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Invalid framework observation')
        kind = item.get('visual_kind')
        if kind not in schema_fields()['visual_kind']['enum']:
            raise ValueError('Missing framework visual observation')
        if item.get('label_key') not in label_keys:
            raise ValueError('Unknown framework label')
        marker = item.get('endorsement_marker')
        if not isinstance(marker, str):
            raise ValueError('Missing endorsement marker observation')
        start, end = item.get('start_sec'), item.get('end_sec')
        a, b = item.get('continuous_start_sec'), item.get('continuous_end_sec')
        def number(x):
            return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
        if not number(start) or not number(end) or not 0 <= start < end:
            raise ValueError('Invalid framework time range')
        if start < previous_end or start * 1000 >= duration_ms:
            raise ValueError('Overlapping or out-of-source framework interval')
        previous_end = end
        if not isinstance(item.get('same_person_as_previous'), bool):
            raise ValueError('Missing framework person continuity')
        if item['label_key'] == 'live_demo' and kind == 'single_presenter' and not marker.strip():
            if not number(a) or not number(b) or not start <= a < b <= end:
                raise ValueError('Invalid continuous presenter interval')
        # The prompt permits step/scene splits inside the SAME presenter unit.
        # Join only touching, fully witnessed live claims before measuring it.
        # Different people, missing coverage and borrowed inserts never qualify.
        full = (item['label_key'] == 'live_demo' and kind == 'single_presenter'
                and not marker.strip() and a == start and b == end)
        prior = units[-1] if units else None
        if (full and prior and item['same_person_as_previous']
                and prior['label_key'] == 'live_demo' and prior['visual_kind'] == 'single_presenter'
                and not prior['endorsement_marker'].strip()
                and prior['continuous_start_sec'] == prior['start_sec']
                and prior['continuous_end_sec'] == prior['end_sec'] == start):
            units[-1] = {**prior, 'end_sec': end, 'continuous_end_sec': end,
                         'reason': (str(prior.get('reason', '')) + '；' + str(item.get('reason', '')))[:200]}
        else:
            units.append(dict(item))
    for item in units:
        kind, marker = item['visual_kind'], item['endorsement_marker']
        start, end = item['start_sec'], item['end_sec']
        a, b = item.get('continuous_start_sec'), item.get('continuous_end_sec')
        label = item['label_key']
        # Evidence gates live-demo claims only. A persistent overlay cannot
        # erase interviews/sales chapters, and unused duration observations
        # cannot promote a contextual montage decision.
        if label == 'live_demo':
            if kind in ('borrowed_endorsement', 'montage') or marker.strip():
                label = 'mixed_voiceover'
            elif kind == 'single_presenter':
                if not number(a) or not number(b) or not start <= a < b <= end:
                    raise ValueError('Invalid continuous presenter interval')
                if min(b, duration_ms / 1000) - a <= 10:
                    label = 'mixed_voiceover'
            else:
                raise ValueError('Live demo requires presenter evidence')
        corrected += label != item['label_key']
        result.append({**item, 'label_key': label})
    return {'segments': result}, corrected
