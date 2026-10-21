"""Local VLM calls for framework v2 (OpenAI-compatible endpoint; the GPU node serves qwen3.5-4b on vLLM).

Two bounded tasks, prompts frozen at the 2026-10-18 research version:
- shot facts: three 384px frames per shot, one vote at temperature 0 (1 vote matched 3-vote accuracy);
- gray-zone person pairs: middle frames of two adjacent face shots, 512px.

FRAMEWORK_V2_VLM_BASE_URL / FRAMEWORK_V2_VLM_API_KEY / FRAMEWORK_V2_VLM_MODEL configure the endpoint.
Requests bypass HTTP proxy environment variables: the endpoint is a private Tailscale/localhost address.
"""
import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor

import cv2
import requests

FACTS_PROMPT_VERSION = 'shot-facts-v1'
PAIR_PROMPT_VERSION = 'pair-verify-v1'
FACT_WIDTH = 384
PAIR_WIDTH = 512
FACT_QUALITY = 85
PAIR_QUALITY = 88
SAMPLE_POSITIONS = (0.2, 0.5, 0.8)
CONCURRENCY_ENV = 'FRAMEWORK_V2_VLM_CONCURRENCY'

FACTS_PROMPT = """这是美妆带货短视频里的同一个镜头（按时间顺序的 3 帧）。只描述画面中看得见的事实，不要推测视频整体结构。

字段说明：
- subject：画面主体。person=有人物露脸出镜；closeup=手部、局部皮肤、上脸特写、产品使用特写（脸不完整）；product=只有产品或包装；graphic=以文字、图表、价格页、动画为主；multi_person=两人及以上同时出镜；other=其他。
- people_count：露脸人物数量。
- talking_to_camera：画面人物是否正对镜头说话。
- style：拍摄风格。selfie_ugc=个人随手拍/自拍/家里或车里等生活场景的测评；studio_ad=品牌棚拍、精修产品大片、成分或功效动画等官方广告质感；street_interview=户外或商场等公共场所拿话筒采访路人；promo_graphic=促销活动、价格、赠品、机制说明页面；other=以上都不是。
- celebrity_tag：画面上是否有“@某某”“明星同款”“某某推荐”等明星或达人身份角标。
- offer_text：画面上是否有价格、优惠、赠品、下单等促销文字。
- using_product：人物是否正在使用或展示产品。
- note：不超过 20 字的中文说明。"""

FACTS_SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {
            "type": "string",
            "enum": [
                "person",
                "closeup",
                "product",
                "graphic",
                "multi_person",
                "other"
            ]
        },
        "people_count": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9
        },
        "talking_to_camera": {
            "type": "boolean"
        },
        "style": {
            "type": "string",
            "enum": [
                "selfie_ugc",
                "studio_ad",
                "street_interview",
                "promo_graphic",
                "other"
            ]
        },
        "celebrity_tag": {
            "type": "boolean"
        },
        "offer_text": {
            "type": "boolean"
        },
        "using_product": {
            "type": "boolean"
        },
        "note": {
            "type": "string",
            "maxLength": 40
        }
    },
    "required": [
        "subject",
        "people_count",
        "talking_to_camera",
        "style",
        "celebrity_tag",
        "offer_text",
        "using_product",
        "note"
    ],
    "additionalProperties": False
}

PAIR_PROMPT = """两张图来自同一条美妆带货短视频里相邻的两个镜头（第 1 张在前）。
判断：
- same_person：两张图里的主要人物是否是同一个人（yes/no/uncertain）。只看长相、发型、衣着等身份特征，不要因为同一款产品或相似妆容就判断为同一人。
- same_session：是否属于同一次拍摄（同一人在同一或相邻场景连续拍摄，换角度、近景、换个房间继续也算 yes；不同时间、不同人的素材拼接算 no）。
- reason：不超过 20 字。"""

PAIR_SCHEMA = {
    "type": "object",
    "properties": {
        "same_person": {
            "type": "string",
            "enum": [
                "yes",
                "no",
                "uncertain"
            ]
        },
        "same_session": {
            "type": "string",
            "enum": [
                "yes",
                "no",
                "uncertain"
            ]
        },
        "reason": {
            "type": "string",
            "maxLength": 40
        }
    },
    "required": [
        "same_person",
        "same_session",
        "reason"
    ],
    "additionalProperties": False
}


class LocalVlm:
    def __init__(self):
        self.base_url = os.environ.get('FRAMEWORK_V2_VLM_BASE_URL', '').rstrip('/')
        self.model = os.environ.get('FRAMEWORK_V2_VLM_MODEL', 'qwen3.5-4b')
        key = os.environ.get('FRAMEWORK_V2_VLM_API_KEY', '')
        if not self.base_url or not key:
            raise RuntimeError('FRAMEWORK_V2_VLM_BASE_URL and FRAMEWORK_V2_VLM_API_KEY are required')
        self.concurrency = int(os.environ.get(CONCURRENCY_ENV, '8'))
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.headers['Authorization'] = f'Bearer {key}'
        self.usage = {'requests': 0, 'promptTokens': 0, 'completionTokens': 0}

    def _call(self, images, prompt, schema, name, max_tokens):
        content = [{'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{img}'}} for img in images]
        content.append({'type': 'text', 'text': prompt})
        body = {'model': self.model, 'messages': [{'role': 'user', 'content': content}], 'max_tokens': max_tokens,
                'temperature': 0, 'seed': 0, 'chat_template_kwargs': {'enable_thinking': False},
                'response_format': {'type': 'json_schema', 'json_schema': {'name': name, 'schema': schema}}}
        response = self.session.post(f'{self.base_url}/chat/completions', json=body, timeout=180)
        response.raise_for_status()
        data = response.json()
        usage = data.get('usage') or {}
        self.usage['requests'] += 1
        self.usage['promptTokens'] += usage.get('prompt_tokens', 0)
        self.usage['completionTokens'] += usage.get('completion_tokens', 0)
        try:
            return json.loads(data['choices'][0]['message']['content'])
        except (KeyError, json.JSONDecodeError):
            return None

    def shot_facts(self, frames, spans, tick=lambda: None):
        """One structured fact record (or None) per shot; frames holds fact_requests(spans)."""
        images = []
        for a, b in spans:
            tick()
            images.append([_jpeg(frames.get(t, FACT_WIDTH), FACT_QUALITY) for t in fact_times(a, b)])
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(self._call, [f for f in imgs if f], FACTS_PROMPT, FACTS_SCHEMA, 'shot_facts', 300)
                       for imgs in images]
            out = []
            for future in futures:
                tick()
                out.append(future.result())
        return out

    def same_person(self, frames, pairs, starts, ends, tick=lambda: None):
        """[(i, j, verdict)] for gray-zone pairs; verdict None on an unparsable answer.
        frames holds pair_requests(starts, ends)."""
        jobs = [(i, j, [_jpeg(frames.get((starts[k] + ends[k]) / 2, PAIR_WIDTH), PAIR_QUALITY) for k in (i, j)])
                for i, j, _ in pairs]
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [(i, j, pool.submit(self._call, imgs, PAIR_PROMPT, PAIR_SCHEMA, 'pair', 120)) for i, j, imgs in jobs]
            out = []
            for i, j, future in futures:
                tick()
                out.append((i, j, future.result()))
        return out


def fact_times(a, b):
    return [a + (b - a) * pos for pos in SAMPLE_POSITIONS]


def fact_requests(spans):
    return [(t, FACT_WIDTH) for a, b in spans for t in fact_times(a, b)]


def pair_requests(starts, ends):
    """Every shot midpoint: gray pairs are only known after person features, which share this decode."""
    return [((s + e) / 2, PAIR_WIDTH) for s, e in zip(starts, ends)]


def _jpeg(img, quality):
    if img is None:
        return None
    ok, jpg = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(jpg.tobytes()).decode() if ok else None
