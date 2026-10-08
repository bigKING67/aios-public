"""Review one actual replacement excerpt with the production two-stage contract.

Offline by default. Explicit live execution permits at most two calls, without retry.
This does not edit the Run, overwrite fixture receipts, or approve delivery.
"""
import argparse
import base64
import json
import re
import time
from pathlib import Path
from content_production.caption_quality import document_digest
from content_production.execution import file_hash
from content_production.source_treatment_media import prepare_excerpt
from content_production.semantic_captions import chat_completion_callback
from content_production.selected_text_review import (
    VISION_PROMPT, VISION_SCHEMA, TEXT_PROMPT, TEXT_SCHEMA,
    validate_vision, validate_comparison, text_item,
)


def prepare(source):
    metadata = json.loads((source / 'selected-semantic-input.json').read_text())
    receipt = json.loads((source / 'receipt.json').read_text())['job']['receipt']
    video = source / 'video.mp4'
    if file_hash(video) != receipt['output']['sha256']:
        raise ValueError('source video changed')
    window = metadata['window']
    report = receipt['host_selected_semantic_review']
    if not any(e['window'] == window for e in report['entries']):
        raise ValueError('review window changed')
    if not 0 < window['endFrame'] - window['startFrame'] <= 150:
        raise ValueError('window exceeds five seconds')
    return metadata, receipt, video


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--execute-live', action='store_true')
    args = parser.parse_args()
    metadata, receipt, video = prepare(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    window = metadata['window']
    plan = {'schema': 'aios.replacement-real-probe.v1', 'maxCalls': 2,
            'sourceVideoSha256': receipt['output']['sha256'], 'metadata': metadata,
            'sourceReceiptSha256': file_hash(args.source / 'receipt.json'),
            'visionPromptSha256': document_digest(VISION_PROMPT), 'textPromptSha256': document_digest(TEXT_PROMPT),
            'businessFacts': 'cached isolated test context; not a verified product fact sheet',
            'sourceJudgments': 'fixture judgments are not reused', 'deliveryApproved': False}
    with (args.output / 'plan.json').open('x') as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
    if not args.execute_live:
        print('Prepared single real excerpt review; zero provider calls')
        return
    from dotenv import dotenv_values
    config = dotenv_values(args.config)
    base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
    if base != 'https://ark.cn-beijing.volces.com/api/v3' or not config.get('ARK_API_KEY'):
        raise ValueError('configured Ark endpoint and credential required')
    excerpt = args.output / 'excerpt.mp4'
    frames = window['endFrame'] - window['startFrame']
    prepare_excerpt(video, {'source': {'sha256': receipt['output']['sha256']}, 'frames': frames,
        'sourceMap': {'sourceStart': {'num': window['startFrame'], 'den': 30},
                      'sourceEnd': {'num': window['endFrame'], 'den': 30}}}, excerpt, lambda: None)
    if excerpt.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('excerpt exceeds byte budget')
    model = 'doubao-seed-2-1-lite-260915'
    result = {'status': 'incomplete', 'model': model, 'callsReserved': 0,
              'excerptSha256': file_hash(excerpt), 'deliveryApproved': False}
    def call(stage, prompt, payload, schema):
        messages = [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': payload}]
        callback = chat_completion_callback(base_url=base, api_key=config['ARK_API_KEY'], model=model,
                                            protocol='responses', response_schema=schema)
        with (args.output / (stage + '-reserved.json')).open('x') as handle:
            json.dump({'inputSha256': document_digest(messages), 'model': model, 'maxCalls': 1}, handle)
        result['callsReserved'] += 1
        answer = callback(messages)
        (args.output / (stage + '-response.json')).write_text(json.dumps(answer, ensure_ascii=False, indent=2))
        return answer
    started = time.monotonic()
    try:
        checks, observation = validate_vision(call('vision', VISION_PROMPT, [
            {'type': 'input_video', 'video_url': 'data:video/mp4;base64,' + base64.b64encode(excerpt.read_bytes()).decode(), 'fps': 5},
            {'type': 'input_text', 'text': json.dumps(metadata, ensure_ascii=False)}], VISION_SCHEMA))
        result.update(visualChecks=checks, visibleText=observation, status='observed')
        (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        if observation['visibility'] == 'readable':
            identifier = window['clipId']
            payload = {'scope': 'observed caption text only; timing and full-frame coverage unverified',
                       'items': [text_item(identifier, observation, metadata['brief'], metadata['narration'])]}
            (args.output / 'text-input.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2))
            result['textChecks'] = validate_comparison(call('text', TEXT_PROMPT, json.dumps(payload, ensure_ascii=False), TEXT_SCHEMA), {identifier})
            result['status'] = 'reviewed'
    except Exception as error:
        result['errorType'] = type(error).__name__
        match = re.fullmatch(r'caption model HTTP ([0-9]{3})', str(error))
        if match:
            result['httpStatus'] = int(match.group(1))
    result['elapsedSeconds'] = round(time.monotonic() - started, 2)
    (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
