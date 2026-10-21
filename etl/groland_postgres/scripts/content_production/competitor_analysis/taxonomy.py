"""Published label dictionary for competitor cards.

Selling points and endorsements reuse the keys of the AI studio selling-point preset
(migrations 035/042/043/045) so competitor coverage can be compared with our own films.
Changing any list means a new TAXONOMY_VERSION; statistics never mix versions.
"""

TAXONOMY_VERSION = 'competitor-taxonomy-v3'

# Persuasion roles (v2 design §4.1). `other` = seen clearly but not covered; `unknown` = not enough evidence.
ROLES = {
    'attention': '引起注意',
    'problem': '激活问题',
    'choice': '提出选择',
    'claim': '表达主张',
    'explain': '解释原因',
    'proof': '展示证据',
    'objection': '解除顾虑',
    'credibility': '建立可信度',
    'offer': '说明优惠',
    'action': '促成行动',
    'other': '其他',
    'unknown': '无法判断',
}

HOOK_MECHANISMS = {
    'problem_named': '问题点名（直接说出困扰或人群）',
    'scene_pain': '场景困扰（展示出油、卡粉、脱妆等现场）',
    'result_first': '结果先看（先给成妆或对比效果）',
    'contrast': '反差对比（前后、半脸、新旧）',
    'knowledge': '知识纠错（指出常见误区）',
    'suspense': '悬念或提问',
    'endorsement': '名人或达人出场',
    'hot_product_test': '热门产品开箱或实测（“最近很火的…买回来了”）',
    'persona_story': '人物身份或生活自述（年龄、习惯、经历）',
    'bold_statement': '态度宣言或夸张定位',
    'scene_drama': '情境剧（化妆间、求婚现场等剧情）',
    'offer': '优惠或价格先行',
    'other': '其他',
}

CONTENT_FORMS = {
    'talking_head': '真人口播',
    'on_face_demo': '上脸演示',
    'product_closeup': '产品特写',
    'makeup_result': '妆效展示',
    'live_clip': '直播切片',
    'graphic': '图形或字卡说明',
    'scenario': '情境表演',
    'street_interview': '街采',
    'celebrity_clip': '明星或达人片段',
    'brand_ad': '品牌精修广告镜头',
}

SELLING_POINTS = {
    'long_wear': '持妆（含控油、不脱妆、不暗沉）',
    'no_caking': '不卡粉（服帖、不卡纹、不斑驳）',
    'moisturizing': '滋润保湿（不拔干、不起皮）',
    'skincare': '养肤护肤（成分、护肤级）',
    'soft_focus': '柔焦妆效（磨皮、伪素颜、通透、自然）',
    'lightweight': '轻薄（无粉感、不厚重）',
    'powder_texture': '粉质细腻',
    'portable': '便携与补妆便利',
    'easy_use': '免手法、新手易用、快速上妆',
    'coverage': '遮瑕力',
    'multi_effect': '多效合一（如隔离+遮瑕+定妆）',
    'upgrade': '新品升级或版本对比',
    'value': '价格、规格或性价比',
    'other': '其他',
}

EVIDENCE_FORMS = {
    'verbal_only': '只有口头或字幕宣称',
    'powder_show': '粉末展示',
    'hand_swatch': '手背或手臂展示',
    'on_face': '上脸展示',
    'side_by_side': '同场或半脸对比',
    'time_record': '带时间记录的过程',
    'instrument': '仪器或测试读数',
    'user_testimony': '用户自述或评价截图',
    'external_material': '外部资料或报告画面',
}

TRUST_CUES = {
    'celebrity_endorsement': '明星背书',
    'kol_endorsement': 'KOL 背书',
    'expert_endorsement': '其他背书（化妆师、专家）',
    'authority_visual': '权威视觉线索（白大褂、实验室）',
    'user_word_of_mouth': '普通用户口碑',
    'sales_data': '销量、排名或热度暗示（陈列、“风很大”）',
    'unfiltered_claim': '原相机、无美颜无滤镜等实测声明',
    'bystander_reaction': '旁人现场反应（化妆师、路人主动想买）',
    'brand_story': '品牌态度或故事',
    'award_or_institution': '奖项或机构',
    'test_report': '检测报告',
    'other': '其他',
}

CTA = {
    'keep_watching': '继续观看',
    'view_product': '查看商品',
    'enter_live': '进直播间',
    'choose_variant': '选择色号或规格',
    'buy_now': '下单',
    'engage': '互动（评论、关注）',
    'unknown': '未知',
}

PRODUCT_CATEGORIES = {
    'loose_powder': '散粉',
    'pressed_powder': '粉饼',
    'cushion': '气垫',
    'cream_foundation': '粉膏、素颜霜',
    'liquid_foundation': '粉底液',
    'concealer': '遮瑕',
    'base_other': '其他底妆（隔离、妆前、定妆喷雾、高光）',
    'non_base': '非底妆（眼妆、唇妆等）',
    'unknown': '看不出',
}

# Sound (v3): judged only from what is actually heard; lyrics of a song are music, not voice-over.
VOICE_FORMS = {
    'on_camera': '真人出镜口播（声画同步）',
    'voiceover': '画外人声配音或旁白',
    'ai_voice': 'AI 或机器合成配音',
    'dialogue': '多人对话或采访问答',
    'none': '无人声（只有音乐或环境声）',
}

TONES = {
    'urgent_sell': '急促叫卖、催单',
    'chatty': '亲切聊天、闺蜜感',
    'expert': '专业讲解',
    'exclaim': '夸张惊叹',
    'calm': '平静叙述',
    'emotional': '感性、讲故事',
    'none': '无人声',
}

MUSIC = {
    'upbeat': '动感、节奏强',
    'soft': '舒缓、抒情',
    'pop_song': '流行歌曲片段（有歌词）',
    'dramatic': '紧张、悬疑、反转',
    'none': '无配乐',
    'unclear': '听不清是否有配乐',
}

SFX = {
    'ding': '提示音（叮、咚）',
    'whoosh': '转场音效（嗖、刷）',
    'beat_hit': '卡点重音、鼓点强调',
    'variety': '综艺音效（笑声、惊叹音）',
    'cash': '促销音效（收银、金币）',
}

HOOK_AUDIO_CUES = {
    'exclaim_open': '开口惊叹或喊话',
    'question_open': '开口提问',
    'music_hit': '音乐卡点或重拍起势',
    'sfx_alert': '提示音或音效抓耳',
    'song_hook': '流行歌曲片段起头',
    'silence_contrast': '静音、停顿造成的反差',
    'none': '开头没有明显的声音线索',
}

SCENE_SOURCES = ('shown', 'stated', 'inferred')
AUDIENCE_BASES = ('stated', 'inferred')
ASSESSMENTS = ('assessable', 'partial', 'unassessable')
MODALITIES = ('speech', 'onscreen_text', 'visual', 'audio', 'metadata')


def describe(mapping):
    return '；'.join(f'{key}={name}' for key, name in mapping.items())
