"""Bounded CPU OCR observations. Sampled absence never proves text-free video."""
import csv
import io
from itertools import islice
import math
import os
import subprocess
from pathlib import Path

from .execution import Cancelled, file_hash
from .source_text_compatibility import assess_source_text

MAX_FRAMES = 16


def sample_frames(route):
    start, end = route['startFrame'], route['endFrame']
    return sorted({start, end - 1, *range(start, end, 15)})


def parse_tsv(raw):
    rows = list(csv.DictReader(io.StringIO(raw), delimiter='\t'))
    page = next((r for r in rows if r['level'] == '1'), None)
    if page is None:
        raise ValueError('OCR page dimensions missing')
    width, height = int(page['width']), int(page['height'])
    if width <= 0 or height <= 0:
        raise ValueError('OCR dimensions invalid')
    words = []
    for row in rows:
        text = (row.get('text') or '').strip()
        if row['level'] != '5' or not text:
            continue
        confidence = float(row['conf']) / 100
        x, y, w, h = (int(row[k]) for k in ('left', 'top', 'width', 'height'))
        if not math.isfinite(confidence) or not 0 <= confidence <= 1 or not (0 <= x < width and 0 <= y < height and w > 0 and h > 0 and x+w <= width and y+h <= height):
            raise ValueError('OCR observation invalid')
        words.append({'text': text, 'confidence': confidence,
                      'box': [x/width, y/height, w/width, h/height], 'role': 'unverified'})
        if len(words) > 1000:
            raise ValueError('OCR observation limit exceeded')
    return words


def inspect_source_text(document, media, work, tick):
    """Media hashes are checked by render_document_local before this call."""
    report = {'schema': 'aios.source-text-observations.v1', 'provider': 'tesseract',
              'languages': 'chi_sim+eng', 'status': 'pending', 'samples': [],
              'coverage': 'sampled_only', 'textFreeVerified': False,
              'erasureAuthorized': False, 'deliveryApproved': False}
    routes = [r for r in assess_source_text(document)['routes'] if r['action'] == 'inspect_source_text']
    if not routes:
        report['status'] = 'not_required'
        return report
    # Bound memory as well as subprocess work for long or highly fragmented edits.
    planned = list(islice(((r, f) for r in routes for f in sample_frames(r)), MAX_FRAMES + 1))
    truncated = len(planned) > MAX_FRAMES
    directory = Path(work) / 'source-text-ocr'
    directory.mkdir(exist_ok=False)
    try:
        version = subprocess.run(['tesseract', '--version'], capture_output=True, check=True, timeout=10)
        report['providerVersion'] = version.stdout.decode().splitlines()[0][:160]
        for route, frame in planned[:MAX_FRAMES]:
            tick()
            start = route['sourceStart']
            seconds = start['num']/start['den'] + (frame-route['startFrame'])/30
            image = directory / f'{len(report["samples"]):03d}.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(media[route['assetVersionId']]),
                            '-ss', str(seconds), '-frames:v', '1', '-vf', 'scale=720:-2', str(image)],
                           capture_output=True, check=True, timeout=45)
            tick()
            output = subprocess.run(['tesseract', str(image), 'stdout', '-l', 'chi_sim+eng', '--psm', '11', 'tsv'],
                                    capture_output=True, check=True, timeout=30)
            words = parse_tsv(output.stdout.decode('utf-8'))
            report['samples'].append({'clipId': route['clipId'], 'assetVersionId': route['assetVersionId'],
                'sourceSha256': route['sha256'], 'timelineFrame': frame, 'sourceSeconds': seconds,
                'imageSha256': file_hash(image), 'origin': 'top-left', 'words': words})
            tick()
        report['status'] = 'partial' if truncated else 'sampled'
        if truncated: report['reason'] = 'sample_limit'
    except Cancelled:
        raise
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        report.update(status='incomplete', errorType=type(error).__name__)
    return report


def inspect_if_enabled(document, media, work, tick):
    setting = os.environ.get('AIOS_SOURCE_TEXT_OCR', '0')
    if setting not in ('0', '1'):
        raise ValueError('AIOS_SOURCE_TEXT_OCR must be 0 or 1')
    if setting == '0' or 'captionOverlayPolicy' not in document:
        return None
    return inspect_source_text(document, media, work, tick)
