"""Loopback-only SigV4/TLS fixture; not a cloud TOS compatibility substitute."""
from datetime import datetime, timezone
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
from pathlib import Path
import ssl
import threading
from urllib.parse import parse_qsl, quote, unquote, urlsplit


def signature(secret, scope, stamp, canonical):
    date, region, service, suffix = scope.split("/")
    if service != "s3" or suffix != "aws4_request":
        raise ValueError("unexpected scope")
    key = ("AWS4" + secret).encode()
    for value in (date, region, service, suffix):
        key = hmac.new(key, value.encode(), sha256).digest()
    message = "\n".join(("AWS4-HMAC-SHA256", stamp, scope, sha256(canonical.encode()).hexdigest()))
    return hmac.new(key, message.encode(), sha256).hexdigest()


def start_store(root: Path, source: Path, cert: Path, key: Path, access: str, secret: str):
    counts = {"get": 0, "put": 0, "rejected": 0}
    objects = {"source.mp4": source}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Presigned query strings and authorization headers never enter logs.

        def authorized(self):
            url = urlsplit(self.path)
            query = dict(parse_qsl(url.query))
            if self.command == "GET":
                supplied = query.pop("X-Amz-Signature")
                credential = query["X-Amz-Credential"]
                stamp = query["X-Amz-Date"]
                signed = query["X-Amz-SignedHeaders"]
                age = (datetime.now(timezone.utc) - datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)).total_seconds()
                if age < -60 or age > int(query["X-Amz-Expires"]):
                    return False
            else:
                scheme, fields = self.headers["Authorization"].split(" ", 1)
                if scheme != "AWS4-HMAC-SHA256":
                    return False
                fields = dict(item.strip().split("=", 1) for item in fields.split(","))
                supplied, credential, signed = fields["Signature"], fields["Credential"], fields["SignedHeaders"]
                stamp = self.headers["x-amz-date"]
            identity, scope = credential.split("/", 1)
            if identity != access:
                return False
            canonical_query = "&".join(f"{quote(k,safe='-_.~')}={quote(v,safe='-_.~')}" for k,v in sorted(query.items()))
            headers = "".join(f"{name}:{self.headers[name].strip()}\n" for name in signed.split(";"))
            canonical = "\n".join((self.command, url.path, canonical_query, headers, signed, "UNSIGNED-PAYLOAD"))
            return hmac.compare_digest(signature(secret, scope, stamp, canonical), supplied)

        def allowed(self):
            try:
                valid = self.authorized()
            except (KeyError, ValueError, AttributeError, TypeError):
                valid = False
            if not valid:
                counts["rejected"] += 1
                self.send_error(403)
            return valid

        def do_GET(self):
            if not self.allowed():
                return
            name = unquote(urlsplit(self.path).path).lstrip("/")
            file = objects.get(name)
            if file is None:
                self.send_error(404)
                return
            data = file.read_bytes()
            counts["get"] += 1
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_PUT(self):
            if not self.allowed():
                return
            name = unquote(urlsplit(self.path).path).lstrip("/")
            length = int(self.headers.get("Content-Length", "0"))
            if not name.startswith("production/") or ".." in name.split("/") or not 0 < length < 100 * 1024 * 1024:
                self.send_error(400)
                return
            data = self.rfile.read(length)
            if len(data) != length:
                self.send_error(400)
                return
            file = root / f"output-{counts['put']}.mp4"
            file.write_bytes(data)
            objects[name] = file
            counts["put"] += 1
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, counts
