"""Reuse only source/version-bound completed parts of an earlier competitor analysis."""
import copy
import math
from dataclasses import dataclass

from .. import segment_transcript, selling_point_screen
from ..execution import Cancelled
from ..segment_suggestion_contract import merge_usage
from ..segment_suggestion_provider import build_proxy
from . import contract, offline, selling_recovery, structure, taxonomy

AUTO_REPAIR_REQUESTER = 'compass-auto-repair'


@dataclass
class Reuse:
    row: dict
    core: bool
    framework: bool
    recorded: dict


def plan(row, presets, duration_sec):
    if not row or (row['model_id'], row['prompt_version'], row['taxonomy_version']) != (
            offline.MODEL, contract.PROMPT_VERSION, taxonomy.TAXONOMY_VERSION):
        return None
    card = row.get('card') or {}
    errors = row.get('host_errors') or []
    if (not isinstance(card, dict) or not isinstance(errors, list)
            or any(not isinstance(e, dict) or not all(isinstance(e.get(k), str)
                   for k in ('severity', 'path', 'message')) for e in errors)):
        return None
    core = not any(e.get('severity') == 'error' and not e.get('path', '').startswith('framework.')
                   for e in errors)
    core = core and all(key in card for key in ('evidence', 'segments', 'hook', 'product', 'claims'))
    fw, recorded, usable = card.get('framework') or {}, {}, False
    if isinstance(fw, dict) and presets and presets[0]:
        version, labels, point_version, _ = presets[0]
        try:
            recorded = structure.versions(version, point_version)
            usable = (fw.get('status') == 'ok' and fw.get('pipeline') == recorded['pipeline']
                      and (fw.get('presets') or {}).get('framework') == version)
            keys = {label['key'] for label in labels}
            end = 0
            for segment in fw.get('segments') or []:
                start, stop = segment['startMs'], segment['endMs']
                usable = usable and (type(start) in (int, float) and type(stop) in (int, float)
                                     and math.isfinite(start) and math.isfinite(stop)
                                     and end <= start < stop <= duration_sec * 1000 + 500
                                     and segment['labelKey'] in keys)
                end = stop
            usable = usable and bool(fw.get('segments'))
        except (AttributeError, KeyError, TypeError, ValueError, ImportError):
            usable = False
    return Reuse(row, bool(core), bool(usable), recorded) if core or usable else None


def valid_transcript(rows, duration_sec):
    if not isinstance(rows, list):
        return False
    return all(isinstance(row, (list, tuple)) and len(row) == 3
               and all(type(t) in (int, float) and math.isfinite(t) for t in row[:2])
               and 0 <= row[0] < row[1] <= duration_sec * 1000 + 500
               and isinstance(row[2], str) for row in rows)


def card_record(reuse, duration_sec):
    row = reuse.row
    return {'status': 'ok', 'card': {k: copy.deepcopy(v) for k, v in row['card'].items()
                                    if k not in {'framework', 'structure', 'labels'}},
            'context': {'duration_sec': duration_sec}, 'structure': row['card'].get('structure'),
            'issues': [(e['severity'], e['path'], e['message']) for e in row.get('host_errors') or []
                       if not e['path'].startswith('framework.')],
            'input_manifest': {'source_sha256': row['source_sha256'], 'reusedCardAnalysisId': row['analysis_id'],
                               'baseManifestHash': row['input_manifest_hash']},
            'model': row['model_id'], 'prompt_version': row['prompt_version'],
            'taxonomy_version': row['taxonomy_version'], 'usage': {}, 'cost': {'online_yuan': 0.0}}


def rebuild_structure(reuse, presets, source, duration_sec, work, tick, provider_factory, timings,
                      *, allow_retry=True):
    fw = copy.deepcopy(reuse.row['card']['framework'])
    old_points_version = (fw.get('presets') or {}).get('sellingPoint')
    recorded = {**reuse.recorded, 'reusedFromAnalysisId': reuse.row['analysis_id']}
    flagged = any(e.get('severity') == 'error' and e.get('path') == 'framework.sellingPoints'
                  for e in reuse.row.get('host_errors') or [])
    if not valid_transcript(fw.get('transcript'), duration_sec):
        fw['transcriptError'] = 'stored_transcript_invalid'
    if (not any(k.endswith('Error') for k in fw)
            and not flagged and old_points_version == recorded['presets']['sellingPoint']):
        # Reusing an old completed output does not mean the new prompt generated it.
        recorded['sellingPointPrompt'] = fw.get('sellingPointPrompt')
        fw.update(recorded)
        fw.update(costYuan=0.0, usage={})
        return fw, recorded
    fw.update(recorded)
    fw.update(costYuan=0.0, usage={})  # Costs describe this attempt; the old attempt remains intact.
    _, framework_labels, _, point_labels = presets[0]
    fw['labels'] = {'framework': {label['key']: label['name'] for label in framework_labels},
                    'sellingPoint': {label['key']: label['name'] for label in point_labels}}
    fw['labelOrder'] = {'framework': [label['key'] for label in framework_labels],
                        'sellingPoint': [label['key'] for label in point_labels]}
    segments = [{'start_ms': s['startMs'], 'end_ms': s['endMs'], 'label_key': s['labelKey']} for s in fw['segments']]
    frames = structure._frames(segments, {label['key']: label['name'] for label in framework_labels})
    env, usage, provider = structure.renderer_env(work), {}, None
    prior_error = fw.pop('sellingPointError', '')
    prior_recovery = fw.pop('sellingPointRecovery', {})
    known_candidates = (str(prior_error).startswith('filtered_all')
                        or any((attempt.get('postprocess') or {}).get('received', 0) > 0
                               for attempt in prior_recovery.get('attempts', [])))
    fw['sellingPoints'] = []
    try:
        tick()
        if 'transcriptError' in fw:
            asr_work = work / 'asr'
            asr_work.mkdir(exist_ok=True)
            try:
                fw['transcript'], _ = timings.call('asr_local', segment_transcript.transcribe_local,
                                                   source, int(duration_sec * 1000), env, tick, asr_work)
                fw.pop('transcriptError')
            except Cancelled:
                raise
            except Exception as exc:
                fw['transcriptError'] = f'{type(exc).__name__}: {str(exc)[:120]}'
                return fw, recorded
        screen = (fw.get('sellingPointInput') or {}).get('screenLines')
        if screen is None:
            proxy = timings.call('structure_proxy', build_proxy, source, work / 'selling-proxy.mp4', env, tick)
            screen, _ = timings.call('selling_screen_fallback', selling_point_screen.screen_lines,
                                      source, proxy, frames, int(duration_sec * 1000), tick)
        provider = provider_factory()
        outcome = selling_recovery.generate(frames, point_labels, fw.get('transcript') or [], screen,
                                            provider, timings, tick, allow_retry=allow_retry,
                                            known_candidates=known_candidates, previous_error=prior_error)
        if outcome.metadata['sellingPointRecovery'].get('feedback'):
            recorded['sellingPointFeedback'] = outcome.metadata['sellingPointRecovery']['feedback']
        usage = outcome.usage
        fw.update(outcome.metadata)
        fw['sellingPoints'] = [{'startMs': p['start_ms'], 'endMs': p['end_ms'], 'labelKeys': p['label_keys'],
                                'segmentIndex': p['segment_index'], 'quote': structure.clean_quote(p['quote'])}
                               for p in outcome.points]
    except Cancelled as exc:
        usage = merge_usage(usage, getattr(exc, 'billed_usage', None))
        fw['sellingPointError'] = 'cancelled: worker 停止，卖点尚未补全'
    except Exception as exc:  # Keep reusable parts and surface the failed component.
        usage = merge_usage(usage, getattr(exc, 'usage', None))
        fw['sellingPointError'] = f'{type(exc).__name__}: {str(exc)[:120]}'
    finally:
        if provider is not None and getattr(provider, 'close', None):
            provider.close()
        fw['usage'], fw['costYuan'] = usage, offline.cost(usage)['online_yuan']
    return fw, recorded
