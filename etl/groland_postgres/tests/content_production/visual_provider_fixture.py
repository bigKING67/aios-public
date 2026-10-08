"""Loopback video transport with deterministic findings, not a quality evaluator."""
import base64
import hashlib
import json
import ssl
import threading
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.treatment_visual_input import KINDS


def start_provider(cert, key, token, output):
    calls = []
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if self.path != '/responses' or self.headers.get('Authorization') != f'Bearer {token}':
                self.send_error(403)
                return
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size < 17 * 1024 * 1024:
                self.send_error(400)
                return
            payload = json.loads(self.rfile.read(size))
            parts = payload['input'][1]['content']
            assert parts[0]['fps'] == 2 and parts[0]['type'] == 'input_video'
            prefix = 'data:video/mp4;base64,'
            assert parts[0]['video_url'].startswith(prefix)
            video = base64.b64decode(parts[0]['video_url'][len(prefix):], validate=True)
            metadata = json.loads(parts[-1]['text'])
            details = parts[1:-1]
            evidence = metadata['captionEvidence']
            assert len(details) == len(evidence['samples'])
            for detail, sample in zip(details, evidence['samples']):
                assert detail['type'] == 'input_image' and detail['detail'] == 'high'
                image = base64.b64decode(detail['image_url'].split(',', 1)[1], validate=True)
                assert hashlib.sha256(image).hexdigest() == sample['imageSha256']
                assert image.startswith(b'\x89PNG')
            assert metadata['frames'] == 30 and metadata['protectSceneAndPackagingText'] is True
            with lock:
                if len(calls) >= 3:
                    self.send_error(429)
                    return
                index = len(calls)
                captions = metadata['expectedCaptions']
                # Known fixture sequence: no captions, restored, newline-adopted.
                assert bool(captions) == (index != 0)
                assert len(details) == (0 if index == 0 else 1)
                for sample_index, detail in enumerate(details):
                    (output / f'caption-detail-{index}-{sample_index}.png').write_bytes(base64.b64decode(detail['image_url'].split(',', 1)[1]))
                if index == 2:
                    assert '\n' in captions[0]['text']
                calls.append({'comparisonSha256': hashlib.sha256(video).hexdigest(), 'metadata': metadata})
                (output / f'visual-input-{index}.mp4').write_bytes(video)
                (output / 'visual-provider.json').write_text(json.dumps({'scope': 'loopback deterministic findings; no real model', 'calls': calls}, ensure_ascii=False, indent=2))
            answer = {'checks': [{'kind': k, 'verdict': ('uncertain' if index == 0 else
                'issue_observed' if index == 1 and k == 'caption_style' else 'no_issue_observed'),
                'startFrame': 0, 'endFrame': 30, 'observation': '受控夹具返回，用于校验链路，不代表模型质量判断'} for k in KINDS]}
            body = json.dumps({'status': 'completed', 'output': [{'type': 'message', 'content': [
                {'type': 'output_text', 'text': json.dumps(answer, ensure_ascii=False)}]}]}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, calls
