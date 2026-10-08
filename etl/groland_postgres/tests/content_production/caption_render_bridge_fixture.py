"""Actual renderer/queue/reconciliation; synthetic media and local object storage."""
import hashlib
from contextlib import nullcontext
import json
import os
from pathlib import Path
import shutil
from types import SimpleNamespace
from unittest.mock import patch

import psycopg2
from psycopg2.extras import RealDictCursor
from content_production import worker, selected_semantic_review as semantic


def main():
    payload = json.loads(os.environ['AIOS_CAPTION_BRIDGE_FIXTURE'])
    output = Path(os.environ['AIOS_CAPTION_BRIDGE_OUTPUT'])
    output.mkdir(parents=True, exist_ok=True)
    selected_text = payload.get("selectedText", "随便一揉泡沫贼绵密")
    uploads = []
    semantic_calls = []
    semantic_mode = os.environ.get('AIOS_TEST_SELECTED_SEMANTIC', '')
    test_semantics = semantic_mode in ('true', 'live', 'replay') and 'sources' in payload
    live_semantics = test_semantics and semantic_mode == 'live'
    replay = None
    if test_semantics and semantic_mode == 'replay':
        replay_root = Path(os.environ['AIOS_TEST_SELECTED_SEMANTIC_REPLAY'])
        replay = json.loads((replay_root / 'receipt.json').read_text())['job']['receipt']['host_selected_semantic_review']['entries'][0]
    conflict_fixture = test_semantics and not live_semantics and os.environ.get('AIOS_TEST_SELECTED_TEXT_CONFLICT') == 'true'
    picture_conflict_fixture = semantic_mode == 'true' and os.environ.get('AIOS_TEST_SELECTED_PICTURE_CONFLICT') == 'true'
    live_env = {}
    if live_semantics:
        from dotenv import dotenv_values
        config = dotenv_values(os.environ['AIOS_TEST_SELECTED_SEMANTIC_LIVE_CONFIG'])
        base = config.get('ARK_RESPONSES_BASE_URL', '').removesuffix('/responses')
        assert base == 'https://ark.cn-beijing.volces.com/api/v3'
        assert config.get('ARK_API_KEY')
        live_env = {'AIOS_VISUAL_REVIEW_BASE_URL': base, 'AIOS_VISUAL_REVIEW_API_KEY': config['ARK_API_KEY'],
                    'AIOS_VISUAL_REVIEW_MODEL': 'doubao-seed-2-1-lite-260915'}
    real_factory = semantic.chat_completion_callback
    def model_factory(**options):
        live_call = real_factory(**options) if live_semantics else None
        def model(messages):
            if isinstance(messages[1]['content'], str):
                metadata = json.loads(messages[1]['content'])
                assert len(metadata['items']) == 1
                item = metadata['items'][0]
                assert item['visibleTexts'] == [selected_text]
                semantic_calls.append(metadata)
                if replay is not None:
                    previous = json.loads((replay_root / 'selected-text-input.json').read_text())['items'][0]
                    assert {k: v for k, v in item.items() if k != 'id'} == {k: v for k, v in previous.items() if k != 'id'}
                    return {'checks': [{**replay['textReview']['checks'][0], 'id': item['id']}]}
                if live_call:
                    with (output / 'live-text-call-reserved.json').open('x') as handle:
                        json.dump({'maxCalls': 1, 'model': options['model'],
                                   'inputSha256': semantic.document_digest(messages)}, handle)
                    return live_call(messages)
                return {'checks': [{'id': item['id'], 'relation': 'conflict' if conflict_fixture else 'compatible' if picture_conflict_fixture else 'uncertain',
                                    'reason': 'isolated conflict fixture' if conflict_fixture else 'isolated fixture, not quality evidence'}]}
            assert messages[1]['content'][0]['fps'] == 5
            metadata = json.loads(messages[1]['content'][1]['text'])
            assert metadata['window']['startFrame'] == 927
            assert metadata['window']['endFrame'] == 960
            assert metadata['narration']['current'][0]['text'] == '泡沫贼绵密'
            semantic_calls.append(metadata)
            if replay is not None:
                import base64
                data = messages[1]['content'][0]['video_url'].split(',', 1)[1]
                assert hashlib.sha256(base64.b64decode(data)).hexdigest() == replay['excerptSha256']
                return {'checks': replay['checks'], 'visibleText': replay['visibleText']}
            if live_call:
                # Exclusive local guard survives database teardown and blocks accidental reruns.
                with (output / 'live-call-reserved.json').open('x') as handle:
                    json.dump({'maxCalls': 1, 'model': options['model'],
                               'inputSha256': semantic.document_digest(messages)}, handle)
                return live_call(messages)
            return {'checks': [{'kind': kind, 'verdict': ('issue_observed' if kind == 'picture_narration' else 'no_issue_observed') if picture_conflict_fixture else 'uncertain', 'observation': 'isolated picture conflict fixture; quality not approved'}
                               for kind in ('picture_narration', 'visible_artifacts')],
                    'visibleText': {'visibility': 'readable', 'texts': [selected_text]}}
        return model


    def download(storage, key, target, expected, tick):
        tick()
        if 'sources' in payload:
            source = Path(payload['sources'][key])
        else:
            assert key in ('bridge.mp4', 'voice.mp4')
            source = Path(payload['voice' if key == 'voice.mp4' else 'media'])
        assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
        shutil.copyfile(source, target)
        tick()

    def upload(key, video, content_type):
        assert content_type == 'video/mp4'
        uploads.append(key)
        shutil.copyfile(video, output / 'video.mp4')

    connect = lambda: psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL'])
    storage = SimpleNamespace(config=SimpleNamespace(bucket='fixture'), upload_file=upload)
    env = {'CONTENT_PRODUCTION_ENABLED': 'true', 'CONTENT_PRODUCTION_RUNS_ENABLED': 'true',
           'AIOS_VISUAL_REVIEW_MAX_CALLS': '2' if test_semantics else '0', 'CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES': '1', 'AIOS_CAPTION_CANDIDATE_RENDER_ENABLED': 'false'}
    env.update(live_env)
    persistent = os.environ.get('AIOS_TEST_MEDIA_DAEMON') == 'true' and 'sources' in payload
    root = output
    real_process = worker.process_one
    daemon = {'pid': os.getpid(), 'completedJobs': [], 'idlePolls': 0}

    def record(result):
        assert len(uploads) == 1
        if test_semantics:
            assert len(semantic_calls) == 2
            (output / 'selected-semantic-input.json').write_text(json.dumps(semantic_calls[0], ensure_ascii=False, indent=2))
            (output / 'selected-text-input.json').write_text(json.dumps(semantic_calls[1], ensure_ascii=False, indent=2))
        with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute('SELECT status,receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=%s', (result['jobId'],))
            job = dict(cursor.fetchone())
            assert job['status'] == 'completed' and job['output_object_key'] == uploads[0]
            assert job['receipt']['host_run_id'] == payload['runId']
            assert job['receipt']['host_inspection']['status'] == 'passed'
            if test_semantics:
                report = job['receipt']['host_selected_semantic_review']
                assert report['schema'] == 'aios.selected-semantic-review.v2'
                assert report['callsReserved'] == 2 and report['entries'][0]['status'] == 'reviewed', report
                assert len(job['receipt']['host_visual_calls']) == 2
                entry = report['entries'][0]
                assert entry['textReview']['status'] == 'reviewed'
                assert entry['inputSha256'] in job['receipt']['host_visual_calls']
                assert entry['textReview']['inputSha256'] in job['receipt']['host_visual_calls']
                assert report['deliveryApproved'] is False
                follow_up = report['followUp']
                assert follow_up['execution'] == 'not_started' and follow_up['deliveryApproved'] is False
                if conflict_fixture:
                    assert follow_up['status'] == 'revision_proposed'
                    proposals = [p for p in follow_up['proposals'] if p['category'] == 'visible_text']
                    assert len(proposals) == 1 and proposals[0]['action'] == 'reselect_source'
                    assert proposals[0]['target']['startFrame'] == 927 and proposals[0]['target']['endFrame'] == 960
            cursor.execute('SELECT status,stage,waiting_reason FROM ads.content_production_runs WHERE run_id=%s', (payload['runId'],))
            run = dict(cursor.fetchone())
            assert run == {'status': 'waiting', 'stage': 'inspection', 'waiting_reason': 'caption_quality_pending'}, run
        evidence = {'result': result, 'run': run, 'job': job, 'uploads': len(uploads),
                    'semanticProvider': 'live' if live_semantics else ('saved_response_replay' if replay is not None else ('fixture' if test_semantics else 'disabled')),
                    'semanticConflictFixture': conflict_fixture,
                    'secondConsumption': 'observed_in_daemon_state' if persistent else 'idle', 'media': 'cached_real_footage' if 'sources' in payload else 'synthetic', 'storage': 'local_fixture',
                    'deliveryApproved': False}
        receipt = output / 'receipt.json'
        pending = receipt.with_suffix('.tmp')
        pending.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
        pending.replace(receipt)
        print(json.dumps(result))

    def consume(module, workspace):
        nonlocal output, selected_text
        result = real_process(module, workspace)
        if result['status'] == 'completed':
            assert len(daemon['completedJobs']) < 2, 'unexpected third render'
            record(result)
            daemon['completedJobs'].append(result['jobId'])
            uploads.clear()
            semantic_calls.clear()
            output = root / 'replacement-render'
            output.mkdir(parents=True, exist_ok=True)
            selected_text = '再加上很多护肤级的成分'
        elif result['status'] == 'idle':
            daemon['idlePolls'] += 1
        else:
            raise AssertionError(result)
        target = root / 'daemon-state.json'
        pending = target.with_suffix('.tmp')
        pending.write_text(json.dumps(daemon, indent=2))
        pending.replace(target)
        return result

    with patch.dict(os.environ, env), patch.object(worker, 'connect_pg', connect), \
         patch.object(worker, 'TosStorageConfig'), patch.object(worker, 'TosStorageClient', return_value=storage), \
         patch.object(worker, 'download', download), \
         (patch.object(semantic, 'chat_completion_callback', model_factory) if test_semantics else nullcontext()):
        module = Path(os.environ['CREATIVE_CRAFT_PRODUCTION_DIR'])
        if persistent:
            assert not live_semantics, 'daemon fixture must not call a paid model'
            with patch.dict(os.environ, {'CONTENT_PRODUCTION_WORK_DIR': payload['work']}), \
                 patch.object(worker, 'process_one', consume):
                worker.main()
        else:
            result = worker.process_one(module, Path(payload['work']))
            assert result['status'] == 'completed', result
            assert worker.process_one(module, Path(payload['work'])) == {'status': 'idle'}
            record(result)



if __name__ == '__main__':
    main()
