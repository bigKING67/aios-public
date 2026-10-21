"""Local ASR HTTP service for the GPU node (CPU only, 127.0.0.1).

  POST /transcribe {"path": "/abs/audio.wav", "hotword": "品牌 品类"} -> {"utterances": [[start_ms, end_ms, text]], ...}
  GET  /health -> {"ready": true, "models": {...}, "processes": N}

Engines (models stay loaded) live in a process pool so concurrent worker slots share them. Only
WAV files under LOCAL_ASR_ALLOWED_ROOT are read. Run inside the funasr venv:

  LOCAL_ASR_ALLOWED_ROOT=/path/to/work python -m content_production.local_asr.service --port 8200
"""
import argparse
import json
import multiprocessing
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import engine

_ENGINE = None
MAX_BODY_BYTES = 64 * 1024


def _init(threads):
    global _ENGINE
    _ENGINE = engine.Engine(threads)


def _loaded():
    return _ENGINE is not None


def _transcribe(path, hotword):
    started = time.time()
    return _ENGINE.transcribe(path, hotword), round(time.time() - started, 2)


def allowed(path, root):
    """True when `path` is an existing .wav file inside `root` (symlinks resolved)."""
    try:
        resolved = Path(path).resolve(strict=True)
    except (OSError, RuntimeError):
        return False
    return resolved.suffix == '.wav' and resolved.is_file() and Path(root).resolve() in resolved.parents


def make_handler(pool, root, processes):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != '/health':
                return self._send(404, {'error': 'not_found'})
            self._send(200, {'ready': True, 'models': engine.MODELS, 'processes': processes,
                             'maxSegmentMs': engine.MAX_SEGMENT_MS})

        def do_POST(self):
            if self.path != '/transcribe':
                return self._send(404, {'error': 'not_found'})
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= MAX_BODY_BYTES:
                return self._send(400, {'error': 'bad_request'})
            try:
                request = json.loads(self.rfile.read(length))
                path, hotword = request['path'], str(request.get('hotword') or '')[:2000]
            except (ValueError, KeyError, TypeError):
                return self._send(400, {'error': 'bad_request'})
            if not allowed(path, root):
                return self._send(403, {'error': 'path_not_allowed'})
            try:
                utterances, seconds = pool.apply(_transcribe, (path, hotword))
            except Exception as error:  # noqa: BLE001 - report the type only; audio content stays local
                return self._send(500, {'error': 'transcribe_failed', 'type': type(error).__name__})
            self._send(200, {'utterances': utterances, 'seconds': seconds, 'models': engine.MODELS})

        def log_message(self, fmt, *args):  # one line per request, no request bodies
            print(f'{self.address_string()} {fmt % args}', flush=True)

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8200)
    parser.add_argument('--processes', type=int, default=int(os.getenv('LOCAL_ASR_PROCESSES', '3')))
    parser.add_argument('--threads', type=int, default=int(os.getenv('LOCAL_ASR_THREADS', '4')))
    args = parser.parse_args(argv)
    root = os.environ['LOCAL_ASR_ALLOWED_ROOT']
    if args.host not in ('127.0.0.1', 'localhost'):
        raise SystemExit('local ASR only listens on localhost')
    pool = multiprocessing.get_context('spawn').Pool(args.processes, initializer=_init, initargs=(args.threads,))
    # A model that fails to load makes Pool respawn workers forever; fail start-up instead of hanging.
    if not pool.apply_async(_loaded).get(timeout=600):
        raise SystemExit('local ASR models failed to load')
    server = ThreadingHTTPServer((args.host, args.port), make_handler(pool, root, args.processes))
    print(f'local ASR ready on {args.host}:{args.port} processes={args.processes} threads={args.threads}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
