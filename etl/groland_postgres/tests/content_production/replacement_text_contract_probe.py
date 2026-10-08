"""One real text call using a request exported by the production Rust adapter."""
import argparse
import json
import re
import time
from pathlib import Path
from content_production.caption_quality import document_digest
from content_production.semantic_captions import chat_completion_callback


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--execute-live', action='store_true')
    args = parser.parse_args()
    source = json.loads(args.request.read_text())
    if source['inputSha256'] != document_digest({'system': source['systemPrompt'], 'user': source['userPrompt']}):
        raise ValueError('exported contract digest mismatch')
    if source['maxCalls'] != 1 or source['deliveryApproved'] is not False:
        raise ValueError('invalid one-call scope')
    if not args.execute_live:
        print('Verified exported contract; zero provider calls')
        return
    from dotenv import dotenv_values
    config = dotenv_values(args.config)
    base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
    if base != 'https://ark.cn-beijing.volces.com/api/v3' or not config.get('ARK_API_KEY'):
        raise ValueError('configured Ark endpoint and credential required')
    schema = {'type': 'object', 'additionalProperties': False, 'required': ['checks'], 'properties': {
        'checks': {'type': 'array', 'minItems': 1, 'maxItems': 1, 'items': {'type': 'object',
            'additionalProperties': False, 'required': ['clipId', 'verdict', 'reason'], 'properties': {
                'clipId': {'type': 'string'}, 'verdict': {'type': 'string', 'enum': ['compatible', 'conflict', 'uncertain']},
                'reason': {'type': 'string', 'minLength': 1, 'maxLength': 500}}}}}}
    model = 'doubao-seed-2-1-lite-260915'
    output = args.request.parent
    with (output / 'call-reserved.json').open('x') as handle:
        json.dump({'maxCalls': 1, 'model': model, 'inputSha256': source['inputSha256']}, handle)
    callback = chat_completion_callback(base_url=base, api_key=config['ARK_API_KEY'], model=model,
                                        protocol='responses', response_schema=schema)
    started = time.monotonic()
    result = {'model': model, 'callsReserved': 1, 'deliveryApproved': False, 'status': 'incomplete',
              'transport': 'Ark Responses probe; production Rust messages and host validator'}
    try:
        answer = callback([{'role': 'system', 'content': source['systemPrompt']},
                           {'role': 'user', 'content': source['userPrompt']}])
        (output / 'response.json').write_text(json.dumps(answer, ensure_ascii=False, indent=2))
        result.update(status='response_received', answer=answer)
    except Exception as error:
        result['errorType'] = type(error).__name__
        match = re.fullmatch(r'caption model HTTP ([0-9]{3})', str(error))
        if match:
            result['httpStatus'] = int(match.group(1))
    result['elapsedSeconds'] = round(time.monotonic() - started, 2)
    (output / 'provider-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
