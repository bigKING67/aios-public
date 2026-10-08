"""Model-observed visible text; never an erasure mask or text-free certificate."""
import math

ROLES = ('dialogue_subtitle', 'promotion', 'packaging', 'brand_mark', 'other', 'unknown')
PROMPT = '''video_understanding.visible_text 必须输出 {"coverage":"partial或unknown","observations":[]}。
只根据视频实际可见文字记录，最多32项；字段为 start_ms、end_ms、text、role、box、confidence。
时间为当前输入视频相对毫秒；box必须是对象{left,top,right,bottom}，左上原点、0到1归一化；right/bottom是右下坐标，不是宽高。禁止四元素数组，无法定位时null。
role仅允许dialogue_subtitle/promotion/packaging/brand_mark/other/unknown。
区分画面台词字幕、活动文案和包装实体文字；不得仅凭高度判定角色，不得照抄口播猜画面文字。
看不清就留空或unknown，不补全品牌、价格、成分；覆盖不足用partial，无法观察用unknown。
时间和框是模型观察估计，不是逐帧精确擦除区域；不提供擦除授权或合格结论。'''


def schema():
    return {'type': 'object', 'additionalProperties': False, 'required': ['coverage', 'observations'],
            'properties': {'coverage': {'type':'string','enum':['partial','unknown']},
             'observations': {'type':'array','maxItems':32,'items':{
              'type':'object','additionalProperties':False,
              'required':['start_ms','end_ms','text','role','box','confidence'],
              'properties': {'start_ms':{'type':'integer','minimum':0},'end_ms':{'type':'integer','minimum':1},
               'text':{'type':'string','minLength':1,'maxLength':300},'role':{'type':'string','enum':list(ROLES)},
               'box':{'anyOf':[{'type':'null'},{'type':'object','additionalProperties':False,'required':['left','top','right','bottom'],'properties':{k:{'type':'number','minimum':0,'maximum':1} for k in ('left','top','right','bottom')}}]},
               'confidence':{'type':'number','minimum':0,'maximum':1}}}}}}


def validate(value):
    if not isinstance(value, dict) or set(value) != {'coverage','observations'}:
        raise ValueError('invalid visible text object')
    if value['coverage'] not in ('partial','unknown') or not isinstance(value['observations'],list) or len(value['observations']) > 32:
        raise ValueError('invalid visible text coverage')
    def number(n):
        return type(n) in (int,float) and math.isfinite(n) and 0 <= n <= 1
    for item in value['observations']:
        if not isinstance(item,dict) or set(item) != {'start_ms','end_ms','text','role','box','confidence'}:
            raise ValueError('invalid visible text observation')
        if type(item['start_ms']) is not int or type(item['end_ms']) is not int or not 0 <= item['start_ms'] < item['end_ms']:
            raise ValueError('invalid visible text time')
        if not isinstance(item['text'],str) or not item['text'].strip() or len(item['text']) > 300 or item['role'] not in ROLES or not number(item['confidence']):
            raise ValueError('invalid visible text content')
        box = item['box']
        if box is not None and (not isinstance(box,list) or len(box)!=4 or not all(number(v) for v in box) or box[2]<=0 or box[3]<=0 or box[0]+box[2]>1 or box[1]+box[3]>1):
            raise ValueError('invalid visible text box')
    return value


def prompt_version(base):
    suffix = ':visible-text:v2'
    return base if base.endswith(suffix) else base + suffix


def normalize_provider(value):
    """Convert explicitly named provider corners to the stored xywh contract.

    No inference for arrays: a provider array might be xyxy or xywh.
    Cached canonical arrays use validate(), not this ingress adapter.
    """
    import copy
    result = copy.deepcopy(value)
    if not isinstance(result,dict) or not isinstance(result.get('observations'),list):
        raise ValueError('invalid visible text object')
    for item in result['observations']:
        if not isinstance(item,dict) or 'box' not in item:
            raise ValueError('invalid visible text observation')
        box = item['box']
        if box is None:
            continue
        if not isinstance(box,dict) or set(box) != {'left','top','right','bottom'}:
            raise ValueError('invalid visible text box: named corners required')
        if any(type(v) not in (int,float) or not math.isfinite(v) or not 0 <= v <= 1 for v in box.values()):
            raise ValueError('invalid visible text box')
        left,top,right,bottom = (box[k] for k in ('left','top','right','bottom'))
        if left >= right or top >= bottom:
            raise ValueError('invalid visible text box')
        item['box'] = [left,top,right-left,bottom-top]
    return validate(result)
