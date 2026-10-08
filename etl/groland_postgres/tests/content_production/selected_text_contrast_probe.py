"""Single-item text-only controls using a saved Worker observation. Defaults offline."""
import argparse
import copy
import json
import re
import time
from pathlib import Path
from content_production.caption_quality import document_digest
from content_production.execution import file_hash
from content_production.semantic_captions import chat_completion_callback
from content_production.selected_text_review import TEXT_PROMPT, TEXT_SCHEMA, text_item, validate_comparison


def prepare(source):
    receipt = json.loads((source / 'receipt.json').read_text())
    report = receipt['job']['receipt']['host_selected_semantic_review']
    original = json.loads((source / 'selected-text-input.json').read_text())
    assert len(original['items']) == 1
    item = original['items'][0]
    entry = next(e for e in report['entries'] if e['clipId'] == item['id'])
    observation = entry['visibleText']
    assert observation['visibility'] == 'readable' and observation['texts'] == item['visibleTexts']
    rebuilt = text_item(item['id'], observation, item['brief'], item['narration'])
    assert rebuilt == item
    negative_words = {'current': [{'text': '完全没有泡沫'}], 'context': [{'text': '完全没有泡沫'}]}
    promotion = copy.deepcopy(observation)
    promotion['texts'].append('买一送一')
    return [
        {'name': 'compatible', 'expected': 'compatible', 'synthetic': False, 'item': rebuilt},
        {'name': 'foam_negation', 'expected': 'conflict', 'synthetic': True,
         'item': text_item(item['id'], observation, '当前口播介绍无泡配方，字幕须与口播相容。', negative_words)},
        {'name': 'unsupported_promotion', 'expected': 'conflict', 'synthetic': True,
         'item': text_item(item['id'], promotion, item['brief'] + ' 当前商品没有买赠活动，不得宣称买一送一。', item['narration'])},
    ], original['scope']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--execute-live', action='store_true')
    args = parser.parse_args()
    cases, scope = prepare(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    plan = {'schema': 'aios.text-contrast-probe.v1', 'maxCalls': 3, 'cases': cases,
            'sourceReceiptSha256': file_hash(args.source / 'receipt.json'),
            'promptSha256': document_digest(TEXT_PROMPT), 'schemaSha256': document_digest(TEXT_SCHEMA),
            'scope': scope, 'deliveryApproved': False}
    with (args.output / 'plan.json').open('x') as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
    if not args.execute_live:
        print('Prepared three single-item controls; zero provider calls')
        return
    from dotenv import dotenv_values
    config = dotenv_values(args.config)
    base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
    if base != 'https://ark.cn-beijing.volces.com/api/v3' or not config.get('ARK_API_KEY'):
        raise ValueError('configured Ark endpoint and credential required')
    model = 'doubao-seed-2-1-lite-260915'
    callback = chat_completion_callback(base_url=base, api_key=config['ARK_API_KEY'], model=model,
                                        protocol='responses', response_schema=TEXT_SCHEMA)
    results = []
    for case in cases:
        # Match the production single-item shape; labels/expectations stay outside model input.
        payload = {'scope': scope, 'items': [case['item']]}
        messages = [{'role': 'system', 'content': TEXT_PROMPT},
                    {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
        with (args.output / (case['name'] + '-reserved.json')).open('x') as handle:
            json.dump({'maxCalls': 1, 'inputSha256': document_digest(messages), 'model': model}, handle)
        result = {'name': case['name'], 'synthetic': case['synthetic'], 'deliveryApproved': False}
        began = time.monotonic()
        try:
            answer = callback(messages)
            (args.output / (case['name'] + '-response.json')).write_text(json.dumps(answer, ensure_ascii=False, indent=2))
            checks = validate_comparison(answer, [case['item']['id']])
            result.update(status='reviewed', checks=checks, expectationMatched=checks[0]['relation'] == case['expected'])
        except Exception as error:
            result.update(status='incomplete', errorType=type(error).__name__, expectationMatched=False)
            match = re.fullmatch(r'caption model HTTP ([0-9]{3})', str(error))
            if match:
                result['httpStatus'] = int(match.group(1))
        result['elapsedSeconds'] = round(time.monotonic() - began, 2)
        results.append(result)
        (args.output / 'results.json').write_text(json.dumps({'model': model, 'callsReserved': len(results),
            'results': results, 'deliveryApproved': False}, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if result['status'] == 'incomplete':
            break


if __name__ == '__main__':
    main()
