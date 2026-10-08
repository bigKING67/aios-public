"""Two-call evaluation: observe visible text once, then judge textual compatibility.

Default is offline planning. This does not approve delivery or modify Worker policy.
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
from content_production.selected_semantic_review import SAMPLING_FPS
from selected_semantic_contrast_probe import cases

from content_production.selected_text_review import (
    OBSERVE_PROMPT, OBSERVE_SCHEMA, TEXT_PROMPT, TEXT_SCHEMA,
    validate_observation, comparison_input, validate_comparison,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('input', 'video', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--execute-live', action='store_true')
    args = parser.parse_args()
    # The third contrast case tests picture_narration, not textual equivalence.
    # Keep it visible as deferred instead of asking a text-only judge to verify action.
    all_cases = cases(json.loads(args.input.read_text()))
    planned = all_cases[:2]
    expected = {'0': 'compatible', '1': 'conflict'}
    args.output.mkdir(parents=True, exist_ok=True)
    plan = {'schema': 'aios.split-text-probe.v2', 'maxCalls': 2, 'excerptSha256': file_hash(args.video),
            'deferredCases': [{'name': all_cases[2][0], 'requiredCheck': 'picture_narration',
                               'expectedVerdict': all_cases[2][2]['picture_narration']}],
            'observePromptSha256': document_digest(OBSERVE_PROMPT), 'textPromptSha256': document_digest(TEXT_PROMPT),
            'cases': [{'id': str(i), 'name': name, 'input': meta, 'expectedRelation': expected[str(i)]}
                      for i, (name, meta, _) in enumerate(planned)], 'deliveryApproved': False}
    with (args.output / 'plan.json').open('x') as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
    if not args.execute_live:
        print('Prepared two-stage probe; zero provider calls')
        return
    from dotenv import dotenv_values
    config = dotenv_values(args.config)
    base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
    if base != 'https://ark.cn-beijing.volces.com/api/v3' or not config.get('ARK_API_KEY'):
        raise ValueError('configured Ark endpoint and credential required')
    if args.video.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('excerpt exceeds byte budget')
    model = 'doubao-seed-2-1-lite-260915'
    result = {'model': model, 'callsReserved': 0, 'status': 'incomplete', 'deliveryApproved': False}
    def call(stage, prompt, content, schema):
        messages = [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': content}]
        callback = chat_completion_callback(base_url=base, api_key=config['ARK_API_KEY'], model=model,
                                            protocol='responses', response_schema=schema)
        with (args.output / f'{stage}-reserved.json').open('x') as handle:
            json.dump({'inputSha256': document_digest(messages), 'model': model, 'maxCalls': 1}, handle)
        result['callsReserved'] += 1
        answer = callback(messages)
        (args.output / f'{stage}-response.json').write_text(json.dumps(answer, ensure_ascii=False, indent=2))
        return answer
    started = time.monotonic()
    try:
        observation = validate_observation(call('observe', OBSERVE_PROMPT, [
            {'type': 'input_video', 'video_url': 'data:video/mp4;base64,' + base64.b64encode(args.video.read_bytes()).decode(),
             'fps': SAMPLING_FPS}], OBSERVE_SCHEMA))
        result['observation'] = observation
        payload = comparison_input(planned, observation)
        if payload is None:
            result['status'] = 'insufficient_observation'
        else:
            (args.output / 'comparison-input.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2))
            checks = validate_comparison(call('compare', TEXT_PROMPT, json.dumps(payload, ensure_ascii=False), TEXT_SCHEMA), expected)
            result.update(status='reviewed', checks=checks,
                          matchedCases=sum(row['relation'] == expected[row['id']] for row in checks))
    except Exception as error:
        result.update(errorType=type(error).__name__)
        match = re.fullmatch(r'caption model HTTP ([0-9]{3})', str(error))
        if match:
            result['httpStatus'] = int(match.group(1))
    result['elapsedSeconds'] = round(time.monotonic() - started, 2)
    (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
