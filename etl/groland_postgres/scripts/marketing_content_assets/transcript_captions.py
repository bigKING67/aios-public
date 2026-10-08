"""Subtitle preparation with bounded optional revisions on the existing ASR job."""
import os
from content_production.semantic_captions import plan_semantic_captions, chat_completion_callback


def prepare(result, job, duration_ms, *, call_model=None, model=None, repair_calls=0, output_mode="text", revision_calls=0):
    if result.provider != 'seed_asr':
        raise ValueError('captions require Seed ASR word timing')
    if output_mode not in ('text','boundaries') or (output_mode == 'boundaries' and repair_calls):
        raise ValueError('invalid caption mode or boundary repair budget')
    if type(revision_calls) is not int or not 0 <= revision_calls <= 2:
        raise ValueError('revision budget must be 0..2')
    model = model or os.environ['AIOS_CAPTION_MODEL']
    call_model = call_model or chat_completion_callback(
        base_url=os.environ['AIOS_CAPTION_BASE_URL'], api_key=os.environ['AIOS_CAPTION_API_KEY'],
        model=model, protocol='responses', output_mode=output_mode)
    asset_id, digest = str(job['asset_id']), job['raw_sha256']
    from content_production.indexed_captions import plan_indexed_captions
    planner = plan_indexed_captions if output_mode == 'boundaries' else plan_semantic_captions
    options = {} if output_mode == 'boundaries' else {'repair_calls': repair_calls}
    plan = planner(result.raw_response['wordTiming'], call_model=call_model,
        model=model, clip_id='narration', asset_version_id=f'{asset_id}-{digest[:16]}',
        source_start_ms=0, source_end_ms=duration_ms, **options)
    if revision_calls:
        from content_production.caption_revision import revise_captions
        plan = revise_captions(result.raw_response['wordTiming'], plan, call_model=call_model,
            model=model, clip_id='narration', asset_version_id=f'{asset_id}-{digest[:16]}',
            source_start_ms=0, source_end_ms=duration_ms, max_calls=revision_calls, output_mode=output_mode)
    cues = [{'id': c['id'], 'text': c['text'], 'startMs': c['anchor']['sourceStart']['num'],
             'endMs': c['anchor']['sourceEnd']['num']} for c in plan['captions']]
    return {'schema': 'aios.transcript-captions.v1',
            'document': {'assetId': asset_id, 'sourceSha256': digest, 'cues': cues},
            'provenance': plan['provenance'], 'revision': plan.get('revision'), 'warnings': plan['warnings'], 'termsVerified': False}
