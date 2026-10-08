"""Bounded raw-source audit: one or two observations and one comparison, no retries.

Uses production observation/comparison contracts. This is an isolated acceptance
probe, not a production candidate-search receipt or delivery authorization.
"""
import argparse
import base64
import json
import re
import time
from pathlib import Path

from content_production.caption_quality import document_digest
from content_production.execution import file_hash
from content_production.semantic_captions import chat_completion_callback
from content_production.source_treatment_media import prepare_excerpt
from content_production.selected_text_review import (
    OBSERVE_PROMPT, OBSERVE_SCHEMA, TEXT_PROMPT, TEXT_SCHEMA,
    validate_observation, validate_comparison, text_item,
    VISION_PROMPT, VISION_SCHEMA, validate_vision,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--execute-live', action='store_true')
    parser.add_argument('--visual-review', action='store_true')
    args = parser.parse_args()
    case = json.loads(args.case.read_text())
    samples = case['samples']
    if not 1 <= len(samples) <= 2 or len({s['id'] for s in samples}) != len(samples):
        raise ValueError('one or two distinct samples required')
    call_limit = len(samples) + 1
    observation_prompt = VISION_PROMPT if args.visual_review else OBSERVE_PROMPT
    observation_schema = VISION_SCHEMA if args.visual_review else OBSERVE_SCHEMA
    for sample in samples:
        start, end = sample['startMs'], sample['endMs']
        if (type(start) is not int or type(end) is not int
                or start < 0 or not 0 < end - start <= 3000
                or (end - start) * 30 % 1000):
            raise ValueError('invalid bounded source window')
        if file_hash(Path(sample['path'])) != sample['sha256']:
            raise ValueError('source hash mismatch')
    plan = {'schema': 'aios.multi-source-text-probe.v1', 'case': case,
            'maxCalls': call_limit, 'deliveryApproved': False, 'visualReview': args.visual_review,
            'observePromptSha256': document_digest(observation_prompt),
            'textPromptSha256': document_digest(TEXT_PROMPT)}
    if not args.execute_live:
        print(json.dumps({'status': 'offline_validated', 'planSha256': document_digest(plan),
                          'providerCalls': 0}))
        return
    from dotenv import dotenv_values
    config = dotenv_values(args.config)
    base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
    if base != 'https://ark.cn-beijing.volces.com/api/v3' or not config.get('ARK_API_KEY'):
        raise ValueError('configured Ark endpoint and credential required')
    args.output.mkdir(parents=True, exist_ok=True)
    with (args.output / 'plan.json').open('x') as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
    model = 'doubao-seed-2-1-lite-260915'
    result = {'status': 'incomplete', 'callsReserved': 0, 'model': model,
              'observations': [], 'deliveryApproved': False}

    def save(name, value):
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))

    def call(stage, prompt, payload, schema):
        messages = [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': payload}]
        if result['callsReserved'] >= call_limit:
            raise ValueError('call limit reached')
        with (args.output / f'{stage}-reserved.json').open('x') as handle:
            json.dump({'inputSha256': document_digest(messages), 'maxCalls': 1, 'model': model}, handle)
        result['callsReserved'] += 1
        save('result.json', result)
        callback = chat_completion_callback(base_url=base, api_key=config['ARK_API_KEY'],
            model=model, protocol='responses', response_schema=schema)
        answer = callback(messages)
        save(f'{stage}-response.json', answer)
        return answer

    started = time.monotonic()
    try:
        items = []
        for index, sample in enumerate(samples):
            directory = args.output / f'sample-{index}'
            directory.mkdir()
            excerpt = directory / 'excerpt.mp4'
            measurement = prepare_excerpt(Path(sample['path']), {
                'source': {'sha256': sample['sha256']},
                'frames': (sample['endMs'] - sample['startMs']) * 30 // 1000,
                'sourceMap': {'sourceStart': {'num': sample['startMs'], 'den': 1000},
                              'sourceEnd': {'num': sample['endMs'], 'den': 1000}}}, excerpt, lambda: None)
            if excerpt.stat().st_size > 8 * 1024 * 1024:
                raise ValueError('excerpt exceeds byte budget')
            save(f'sample-{index}/measurement.json', measurement)
            observation_input = {'brief': sample['brief'], 'narration': sample['narration'],
                                 'scope': 'silent sampled source window; no delivery approval'}
            answer = call(f'observe-{index}', observation_prompt, [
                {'type': 'input_video', 'video_url': 'data:video/mp4;base64,'
                 + base64.b64encode(excerpt.read_bytes()).decode(), 'fps': 5},
                {'type': 'input_text', 'text': json.dumps(observation_input, ensure_ascii=False)
                 if args.visual_review else '抄录所提供采样视频里看清的叠加文字。'}], observation_schema)
            if args.visual_review:
                checks, observation = validate_vision(answer)
                result.setdefault('visualChecks', []).append({'id': sample['id'], 'checks': checks})
            else:
                observation = validate_observation(answer)
            result['observations'].append({'id': sample['id'], 'excerptSha256': file_hash(excerpt),
                                           'observation': observation})
            save('result.json', result)
            if observation['visibility'] == 'readable':
                items.append(text_item(sample['id'], observation, sample['brief'], sample['narration']))
        if items:
            payload = {'scope': 'observed text only; no full-frame coverage or timing certification', 'items': items}
            save('text-input.json', payload)
            result['checks'] = validate_comparison(call('compare', TEXT_PROMPT,
                json.dumps(payload, ensure_ascii=False), TEXT_SCHEMA), {item['id'] for item in items})
        result['status'] = 'reviewed'
    except Exception as error:
        result['errorType'] = type(error).__name__
        match = re.fullmatch(r'caption model HTTP ([0-9]{3})', str(error))
        if match:
            result['httpStatus'] = int(match.group(1))
    result['elapsedSeconds'] = round(time.monotonic() - started, 2)
    save('result.json', result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
