"""Offline calibration runner for competitor card A.

Each run writes to a new directory: per-film request settings, raw response, card, host issues,
structure and cost. Receipts are never overwritten; paid calls are bounded by --max-calls.

  PYTHONPATH=etl/groland_postgres/scripts etl/groland_postgres/.venv/bin/python \
    -m content_production.competitor_analysis.offline run --sources DIR --output DIR \
    --films 竞品-001,竞品-002 --env-file .env.content-assets.local --max-calls 2
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import contract
from . import taxonomy as tx

MODEL = 'doubao-seed-2-1-lite-260915'
# Seed-2.1-lite online list price, yuan per million tokens (2026-10-13); batch inference is half.
PRICE = {'text_in': 0.8, 'audio_in': 12.0, 'out': 2.7}
AUDIO = ['-c:a', 'aac', '-b:a', '48k', '-ac', '1']
NO_AUDIO = ['-an']
PROXY_VIDEO = ['-vf', 'scale=-2:360', '-r', '15', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast']
HOOK_VIDEO = ['-t', '5', '-vf', 'scale=-2:540', '-r', '15', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast']


def load_env(path):
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type',
                          '-of', 'json', str(path)], capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    audio = any(s.get('codec_type') == 'audio' for s in data.get('streams', []))
    return float(data['format']['duration']), 'available' if audio else 'absent'


def ffmpeg(source, args, target):
    if not target.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), *args, str(target)], check=True)
    return target


def cost(usage):
    details = usage.get('input_tokens_details') or {}
    audio = details.get('audio_tokens') or 0
    text = (usage.get('input_tokens') or 0) - audio
    online = (text * PRICE['text_in'] + audio * PRICE['audio_in'] + (usage.get('output_tokens') or 0) * PRICE['out']) / 1e6
    return {'online_yuan': round(online, 5), 'batch_yuan': round(online / 2, 5), 'audio_tokens_reported': bool(details)}


def analyze(film, source, work, settings, client):
    duration, audio = probe(source)
    context = {'video_id': film, 'duration_sec': round(duration, 2), 'audio': audio, 'hook_clip': settings['hook_clip'],
               'brand': None}
    transcript_only = settings.get('transcripts') and audio == 'available'
    if transcript_only:
        transcript = json.loads((Path(settings['transcripts']) / f'{film}.json').read_text())
        context.update(audio='transcript_only', transcript=transcript['utterances'],
                       hook_audio=bool(settings.get('hook_audio')))
    suffix = '.noaudio' if transcript_only else ''
    audio_args = NO_AUDIO if transcript_only else AUDIO
    proxy = ffmpeg(source, PROXY_VIDEO + audio_args, work / f'{film}{suffix}.proxy.mp4')
    content = [{'type': 'input_video', 'video_url': 'data:video/mp4;base64,' + base64.b64encode(proxy.read_bytes()).decode(),
                'fps': settings['fps']}]
    if settings['hook_clip']:
        hook_audio = settings.get('hook_audio') or not transcript_only
        clip = ffmpeg(source, HOOK_VIDEO + (AUDIO if hook_audio else NO_AUDIO),
                      work / f"{film}{'' if hook_audio else suffix}.hook.mp4")
        content.append({'type': 'input_video', 'fps': settings['hook_fps'],
                        'video_url': 'data:video/mp4;base64,' + base64.b64encode(clip.read_bytes()).decode()})
    prompt = contract.build_prompt(context)
    content.append({'type': 'input_text', 'text': prompt})
    request = {'model': MODEL, 'input': [{'role': 'user', 'content': content}], 'max_output_tokens': settings['max_output'],
               'thinking': {'type': settings['thinking']}, 'temperature': 0.1, 'store': False,
               **({'service_tier': settings['service_tier']} if settings.get('service_tier') else {}),
               'text': {'format': {'type': 'json_schema', 'name': 'competitor_card_a', 'strict': True,
                                   'schema': contract.response_schema()}}}
    manifest = {'source_sha256': sha256(source), 'proxy_sha256': sha256(proxy),
                'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest()}
    started = time.time()
    record = {'film': film, 'context': context, 'input_manifest': manifest, 'settings': settings,
              'prompt_version': contract.PROMPT_VERSION, 'taxonomy_version': tx.TAXONOMY_VERSION, 'model': MODEL}
    from marketing_content_assets.ark_responses import extract_output_text
    import requests
    attempts = []
    while True:
        attempt_started = time.time()
        try:
            response = client._post(request)
            break
        except Exception as error:  # keep only the type, HTTP status and platform code; text may echo request data
            import re
            message = str(error)
            status = re.search(r'HTTP (\d{3})', message)
            code = re.search(r'"code"\s*:\s*"([A-Za-z.]+)"', message)
            attempts.append({'type': type(error).__name__, 'http': status and status.group(1), 'code': code and code.group(1)})
            connect_failure = isinstance(error, (requests.exceptions.SSLError, requests.exceptions.ConnectionError))
            # Rejected before processing (rate limit / overload) or a fast TLS failure: not billed, retry with backoff.
            retryable = (connect_failure and time.time() - attempt_started <= 10) or (status and status.group(1) in ('429', '503'))
            if not retryable or len(attempts) >= 4:
                record.update(status='provider_error', error=attempts, seconds=round(time.time() - started, 1))
                return record
            time.sleep(5 * 2 ** (len(attempts) - 1))
    record['connect_retries'] = attempts
    usage = response.get('usage') if isinstance(response.get('usage'), dict) else {}
    record.update(response_id=str(response.get('id') or ''), usage=usage, cost=cost(usage),
                  service_tier=response.get('service_tier'),
                  seconds=round(time.time() - started, 1), provider_status=response.get('status'))
    try:
        payload = json.loads(extract_output_text(response))
        card = contract.from_provider(payload)
    except Exception:
        record['status'] = 'invalid_response'
        return record
    record.update(status='ok', card=card, issues=[list(i) for i in contract.validate(card, context)],
                  structure=contract.normalize(card, context['duration_sec']))
    return record


def run(args):
    if args.env_file:
        load_env(args.env_file)
    from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
    from dataclasses import replace
    client = ArkResponsesClient(replace(ArkResponsesConfig.from_env(), timeout_seconds=600))
    sources, output = Path(args.sources), Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    work = Path(args.work or output / 'media')
    work.mkdir(parents=True, exist_ok=True)
    films = [f.strip() for f in args.films.split(',') if f.strip()]
    if len(films) > args.max_calls:
        sys.exit(f'{len(films)} films exceed --max-calls {args.max_calls}')
    settings = {'fps': args.fps, 'hook_clip': not args.no_hook_clip, 'hook_fps': args.hook_fps,
                'thinking': args.thinking, 'max_output': args.max_output, 'transcripts': args.transcripts,
                'hook_audio': args.hook_audio, 'service_tier': args.service_tier}
    (output / 'run.json').write_text(json.dumps({'settings': settings, 'films': films, 'model': MODEL,
                                                 'prompt_version': contract.PROMPT_VERSION,
                                                 'taxonomy_version': tx.TAXONOMY_VERSION}, ensure_ascii=False, indent=1))

    def one(film):
        record = analyze(film, sources / f'{film}.mp4', work, settings, client)
        (output / f'{film}.json').write_text(json.dumps(record, ensure_ascii=False, indent=1))
        errors = sum(1 for i in record.get('issues', []) if i[0] == 'error')
        print(f"{film} {record['status']} {record.get('seconds')}s ¥{record.get('cost', {}).get('online_yuan')} errors={errors}",
              flush=True)
        return record

    with ThreadPoolExecutor(args.concurrency) as pool:
        records = list(pool.map(one, films))
    total = sum(r.get('cost', {}).get('online_yuan', 0) for r in records)
    print(f'done {sum(r["status"] == "ok" for r in records)}/{len(records)} ok, online ¥{total:.3f} (batch ¥{total / 2:.3f})')


def transcribe(args):
    """Seed ASR reference transcripts, cached per source SHA-256 (evaluation only)."""
    if args.env_file:
        load_env(args.env_file)
    import uuid
    import wave
    from marketing_content_assets.seed_asr import SeedAsrClient
    from ..segment_transcript import audio_command, compact
    client = SeedAsrClient(os.getenv('DOUBAO_ASR_API_KEY', ''))
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    films = [f.strip() for f in args.films.split(',') if f.strip()]
    if len(films) > args.max_calls:
        sys.exit(f'{len(films)} films exceed --max-calls {args.max_calls}')

    def one(film):
        source = Path(args.sources) / f'{film}.mp4'
        digest = sha256(source)
        target = cache / f'{film}.json'
        if target.exists() and json.loads(target.read_text()).get('source_sha256') == digest:
            return f'{film} cached'
        audio = cache / f'{film}.wav'
        subprocess.run(audio_command(source, audio), check=True)
        with wave.open(str(audio), 'rb') as stream:
            audio_ms = round(stream.getnframes() * 1000 / stream.getframerate())
        try:
            result = client.transcribe(audio, str(uuid.uuid4()), audio_ms)
        except Exception as error:  # the client never resubmits; report and move on
            return f'{film} failed {type(error).__name__}'
        finally:
            audio.unlink()
        target.write_text(json.dumps({'source_sha256': digest, 'provider': 'seed_asr', 'audio_ms': audio_ms,
                                      'utterances': compact(result.segments)}, ensure_ascii=False, indent=1))
        return f'{film} ok'

    with ThreadPoolExecutor(args.concurrency) as pool:
        for line in pool.map(one, films):
            print(line, flush=True)


def evaluate(args):
    """Program checks over one run directory; writes evaluation.json and prints a summary."""
    from . import evaluation
    run_dir = Path(args.run)
    corpus = json.loads(Path(args.corpus).read_text())['films'] if args.corpus else {}
    rows, totals = [], {'films': 0, 'errors': 0, 'warnings': 0, 'quotes': 0, 'quote_ok': 0, 'mistimed': 0,
                        'not_heard': 0, 'online_yuan': 0.0, 'output_tokens': 0, 'duration_sec': 0.0}
    for path in sorted(run_dir.glob('*.json')):
        if path.name in ('run.json', 'evaluation.json', 'stats.json'):
            continue
        record = json.loads(path.read_text())
        if record.get('status') != 'ok':
            rows.append({'film': record['film'], 'status': record.get('status')})
            continue
        film, card = record['film'], record['card']
        transcript = Path(args.transcripts) / f'{film}.json'
        utterances = json.loads(transcript.read_text())['utterances'] if transcript.exists() else None
        quotes = evaluation.check_quotes(card, utterances) if utterances else []
        hook_end = min(contract.HOOK_WINDOW_SEC, record['context']['duration_sec'])
        hook = evaluation.hook_speech_check(card, utterances, hook_end) if utterances else None
        reference = corpus.get(film, {}).get('segments') or []
        row = {'film': film, 'status': 'ok', 'seconds': record['seconds'], 'online_yuan': record['cost']['online_yuan'],
               'output_tokens': record['usage'].get('output_tokens'), 'issues': record['issues'],
               'quotes': quotes, 'hook_speech': hook, 'offer_misses': evaluation.offer_vs_framework(card, reference),
               'path': record['structure']['path'], 'claims': len(card['claims']), 'evidence': len(card['evidence'])}
        rows.append(row)
        totals['films'] += 1
        totals['errors'] += sum(1 for i in record['issues'] if i[0] == 'error')
        totals['warnings'] += sum(1 for i in record['issues'] if i[0] == 'warning')
        totals['quotes'] += len(quotes)
        for key in ('ok', 'mistimed', 'not_heard'):
            totals['quote_ok' if key == 'ok' else key] += sum(1 for q in quotes if q['status'] == key)
        totals['online_yuan'] += row['online_yuan']
        totals['output_tokens'] += row['output_tokens'] or 0
        totals['duration_sec'] += record['context']['duration_sec']
    if totals['duration_sec']:
        totals['online_yuan_per_150s'] = round(totals['online_yuan'] / totals['duration_sec'] * 150, 4)
    (run_dir / 'evaluation.json').write_text(json.dumps({'totals': totals, 'films': rows}, ensure_ascii=False, indent=1))
    print(json.dumps(totals, ensure_ascii=False))
    for row in rows:
        if row['status'] != 'ok':
            print(row['film'], row['status'])
            continue
        bad = [q for q in row['quotes'] if q['status'] != 'ok']
        print(f"{row['film']} errors={sum(i[0] == 'error' for i in row['issues'])} quotes={len(row['quotes'])} "
              f"bad={[(q['id'], q['status'], q['local']) for q in bad]} hook={row['hook_speech']} "
              f"offer_misses={row['offer_misses']} out={row['output_tokens']}")


def load_records(run_dirs):
    records = []
    for run_dir in run_dirs:
        for path in sorted(Path(run_dir).glob('*.json')):
            if path.name in ('run.json', 'evaluation.json', 'stats.json'):
                continue
            record = json.loads(path.read_text())
            if isinstance(record, dict) and record.get('status') == 'ok' and 'card' in record:
                records.append(record)
    return records


def stats(args):
    from . import stats as statistics
    records = load_records(args.run)
    result = statistics.by_cohort(records)
    Path(args.output or Path(args.run[0]) / 'stats.json').write_text(json.dumps(result, ensure_ascii=False, indent=1))
    for cohort, group in result.items():
        print(f"== {cohort} ({group['films']} films) role_time={group['role_time']['share']}")
        for row in group['stats']:
            if row['numerator'] >= args.min_count:
                print(f"  {row['dimension']:20s} {row['label']:28s} {row['numerator']}/{row['denominator']}"
                      f" family {row['family_numerator']}/{row['family_denominator']}"
                      f" partial={row['partial_count']} unassessable={row['unassessable_count']} blocked={row['blocked_count']}")


def report(args):
    """Contract B over locked statistics of one or more run directories."""
    if args.env_file:
        load_env(args.env_file)
    from . import report as batch_report
    from . import stats as statistics
    from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig, extract_output_text
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    records, ours = load_records(args.run), load_records(args.ours or [])
    comp_rows, ours_rows = statistics.compute(records, 'comp'), statistics.compute(ours, 'ours')
    cohorts = {'comp': comp_rows, 'ours': ours_rows}
    batch = {'scope': args.scope, 'selection': args.selection,
             'stats': batch_report.select_stats(comp_rows, ours_rows),
             'films': [batch_report.film_digest(r) for r in records],
             'ours_films': [batch_report.ours_digest(r) for r in ours]}
    prompt = batch_report.build_prompt(batch)
    request = {'model': MODEL, 'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': prompt}]}],
               'max_output_tokens': 16000, 'thinking': {'type': args.thinking}, 'temperature': 0.2, 'store': False,
               'text': {'format': {'type': 'json_schema', 'name': 'competitor_report_b', 'strict': True,
                                   'schema': batch_report.response_schema()}}}
    (output / 'batch.json').write_text(json.dumps({'cohorts': cohorts, 'batch': batch}, ensure_ascii=False, indent=1))
    started = time.time()
    response = ArkResponsesClient(ArkResponsesConfig.from_env())._post(request)
    usage = response.get('usage') or {}
    text = ''
    try:
        text = extract_output_text(response)
        result = json.loads(text)
    except Exception:
        (output / 'report.json').write_text(json.dumps({'status': response.get('status'), 'usage': usage,
                                                        'cost': cost(usage), 'text': text}, ensure_ascii=False, indent=1))
        sys.exit(f"invalid report response: status={response.get('status')} usage={usage}")
    issues = batch_report.validate(result, batch)
    (output / 'report.json').write_text(json.dumps({
        'prompt_version': batch_report.PROMPT_VERSION, 'model': MODEL, 'usage': usage, 'cost': cost(usage),
        'seconds': round(time.time() - started, 1), 'issues': [list(i) for i in issues], 'report': result},
        ensure_ascii=False, indent=1))
    print(f"report {len(result['insights'])} insights, {len(result['diagnoses'])} diagnoses, "
          f"errors={sum(i[0] == 'error' for i in issues)} ¥{cost(usage)['online_yuan']} {round(time.time() - started)}s")
    for issue in issues:
        print(' ', issue)


def main(argv=None):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('run')
    p.add_argument('--sources', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--work')
    p.add_argument('--films', required=True)
    p.add_argument('--env-file')
    p.add_argument('--max-calls', type=int, required=True)
    p.add_argument('--concurrency', type=int, default=4)
    p.add_argument('--fps', type=float, default=1.0)
    p.add_argument('--hook-fps', type=float, default=5.0)
    p.add_argument('--no-hook-clip', action='store_true')
    p.add_argument('--thinking', choices=('disabled', 'enabled'), default='disabled')
    p.add_argument('--max-output', type=int, default=12000)
    p.add_argument('--transcripts', help='replace the audio track with these utterance files (FILM.json)')
    p.add_argument('--service-tier', choices=('default', 'flex'), help='flex = offline tier at half price')
    p.add_argument('--hook-audio', action='store_true', help='with --transcripts, keep audio on the 0-5 s hook clip')
    t = sub.add_parser('transcribe')
    t.add_argument('--sources', required=True)
    t.add_argument('--cache', required=True)
    t.add_argument('--films', required=True)
    t.add_argument('--env-file')
    t.add_argument('--max-calls', type=int, required=True)
    t.add_argument('--concurrency', type=int, default=4)
    e = sub.add_parser('evaluate')
    e.add_argument('--run', required=True)
    e.add_argument('--transcripts', required=True)
    e.add_argument('--corpus')
    st = sub.add_parser('stats')
    st.add_argument('--run', required=True, action='append')
    st.add_argument('--output')
    st.add_argument('--min-count', type=int, default=2)
    rp = sub.add_parser('report')
    rp.add_argument('--run', required=True, action='append')
    rp.add_argument('--ours', action='append')
    rp.add_argument('--output', required=True)
    rp.add_argument('--env-file')
    rp.add_argument('--scope', required=True)
    rp.add_argument('--selection', required=True)
    rp.add_argument('--thinking', choices=('disabled', 'enabled'), default='enabled')
    args = parser.parse_args(argv)
    {'run': run, 'transcribe': transcribe, 'evaluate': evaluate, 'stats': stats, 'report': report}[args.command](args)


if __name__ == '__main__':
    main()
