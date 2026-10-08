"""Bounded live contrast probe. Counterfactual text never changes source media/DB."""
import argparse
import base64
import copy
import json
import re
import time
from pathlib import Path

from content_production.caption_quality import document_digest
from content_production.execution import file_hash
from content_production.selected_semantic_review import PROMPT, SCHEMA, SAMPLING_FPS, validate
from content_production.semantic_captions import chat_completion_callback


def cases(original):
    positive = copy.deepcopy(original)
    positive.pop('frames', None)
    positive.pop('fps', None)
    positive.update(sourceFrameCount=33, sourceFps=30,
                    sampling={'requestedFps': SAMPLING_FPS, 'decodedFrameCount': 'unknown'})
    text = copy.deepcopy(positive)
    text['brief'] = '当前口播说明无泡配方，画面字幕必须与口播一致。'
    text['narration'] = {'current': [{'startMs': 30970, 'endMs': 31850, 'text': '完全没有泡沫'}],
                         'context': [{'startMs': 30970, 'endMs': 31850, 'text': '完全没有泡沫'}]}
    action = copy.deepcopy(positive)
    action['brief'] = '这一镜必须展示双手按压泵头，洗发液从泵嘴挤到掌心的动作，不得用头发冲洗镜头替代。'
    action['narration'] = {'current': [{'startMs': 30970, 'endMs': 31850, 'text': '按下泵头把洗发液挤到掌心'}],
                           'context': [{'startMs': 30970, 'endMs': 31850, 'text': '按下泵头把洗发液挤到掌心'}]}
    return [('compatible', positive, {'picture_narration': 'no_issue_observed', 'visible_text': 'no_issue_observed'}),
            ('conflicting_text', text, {'visible_text': 'issue_observed'}),
            ('missing_action', action, {'picture_narration': 'issue_observed'})]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('input', 'video', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--execute-live', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    original = json.loads(args.input.read_text())
    planned = cases(original)
    plan = {'schema': 'aios.semantic-contrast-probe.v1', 'maxCalls': 3,
            'excerptSha256': file_hash(args.video), 'promptSha256': document_digest(PROMPT),
            'scope': 'same silent real excerpt; two counterfactual narration/brief fixtures',
            'cases': [{'name': name, 'input': metadata, 'expected': expected} for name, metadata, expected in planned]}
    # Write expectations before any model response; never resume a paid batch implicitly.
    with (args.output / 'plan.json').open('x') as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
    if not args.execute_live:
        print('Prepared three cases; no provider calls')
        return
    from dotenv import dotenv_values
    config = dotenv_values(args.config)
    base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
    if base != 'https://ark.cn-beijing.volces.com/api/v3' or not config.get('ARK_API_KEY'):
        raise ValueError('configured Ark endpoint and credential required')
    if args.video.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('excerpt exceeds byte budget')
    model = 'doubao-seed-2-1-lite-260915'
    call = chat_completion_callback(base_url=base, api_key=config['ARK_API_KEY'], model=model,
                                    protocol='responses', response_schema=SCHEMA)
    video_data = 'data:video/mp4;base64,' + base64.b64encode(args.video.read_bytes()).decode()
    results = []
    for name, metadata, expected in planned:
        messages = [{'role': 'system', 'content': PROMPT}, {'role': 'user', 'content': [
            {'type': 'input_video', 'video_url': video_data, 'fps': SAMPLING_FPS},
            {'type': 'input_text', 'text': json.dumps(metadata, ensure_ascii=False)}]}]
        with (args.output / f'{name}-reserved.json').open('x') as handle:
            json.dump({'model': model, 'inputSha256': document_digest(messages), 'maxCalls': 1}, handle)
        started = time.monotonic()
        result = {'name': name, 'deliveryApproved': False}
        try:
            checks = validate(call(messages))
            actual = {check['kind']: check['verdict'] for check in checks}
            result.update(status='reviewed', checks=checks,
                          expectationMatched=all(actual[k] == v for k, v in expected.items()))
        except Exception as error:
            result.update(status='incomplete', errorType=type(error).__name__, expectationMatched=False)
            match = re.fullmatch(r'caption model HTTP ([0-9]{3})', str(error))
            if match:
                result['httpStatus'] = int(match.group(1))
        result['elapsedSeconds'] = round(time.monotonic() - started, 2)
        results.append(result)
        (args.output / 'results.json').write_text(json.dumps({'model': model, 'callsReserved': len(results),
            'results': results, 'deliveryApproved': False}, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if result['status'] == 'incomplete':
            break


if __name__ == '__main__':
    main()
