"""Bounded loopback Responses fixture; never contacts a paid provider."""
import json
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def start_provider(cert, key, token):
    calls = []
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if self.path != '/responses' or self.headers.get('Authorization') != f'Bearer {token}':
                self.send_error(403)
                return
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                self.send_error(400)
                return
            payload = json.loads(self.rfile.read(length))
            data = json.loads(payload['input'][1]['content'])
            with lock:
                if len(calls) >= 8:
                    self.send_error(429)
                    return
                calls.append('revision' if 'targets' in data else 'review')
            if 'targets' in data:
                answer = {'captions': [{'captionId': c['captionId'], 'lines':
                    ['保留', '原有字幕'] if c['text'] == '保留原有字幕' else ['完整', '字幕']} for c in data['targets']]}
            else:
                answer = {'reviews': [{'captionId': c['id'], 'issues': [
                    {'kind': 'sentence_fragment', 'quote': c['text'], 'reason': 'isolated fixture requests a line-only candidate'}
                ] if c['text'] in ('完整字幕', '保留原有字幕') else []} for c in data['captions']]}
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
