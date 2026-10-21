"""Loopback-only SigV4/TLS fixture; not a cloud TOS compatibility substitute."""
from datetime import datetime, timezone
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
from pathlib import Path
import ssl
import threading
import uuid
import xml.etree.ElementTree as ET
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


def start_store(root: Path, source: Path, cert: Path, key: Path, access: str, secret: str, extra_sources: dict | None = None):
    counts = {"get": 0, "put": 0, "rejected": 0}
    objects = {"source.mp4": source, **(extra_sources or {})}
    uploads = {}
    count_lock = threading.Lock()
    def record(event):
        with count_lock:
            counts[event] += 1
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Presigned query strings and authorization headers never enter logs.

        def authorized(self):
            url = urlsplit(self.path)
            query = dict(parse_qsl(url.query, keep_blank_values=True))
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
                record("rejected")
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
            record("get")
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
            query = dict(parse_qsl(urlsplit(self.path).query))
            if "uploadId" in query:
                try:
                    number = int(query.get("partNumber", "0"))
                except ValueError:
                    number = 0
                etag = '"' + sha256(data).hexdigest() + '"'
                with count_lock:
                    upload = uploads.get(query["uploadId"])
                    valid = (upload is not None and upload["name"] == name and 1 <= number <= 10000
                             and sum(len(v[0]) for n, v in upload["parts"].items() if n != number) + length <= 1024 ** 3)
                    if valid:
                        upload["parts"][number] = (data, etag)
                if not valid:
                    self.send_error(400)
                    return
                self.send_response(200)
                self.send_header("ETag", etag)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            file = root / f"output-{uuid.uuid4().hex}.mp4"
            file.write_bytes(data)
            objects[name] = file
            record("put")
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self):
            if not self.allowed():
                return
            url = urlsplit(self.path)
            name = unquote(url.path).lstrip("/")
            query = dict(parse_qsl(url.query, keep_blank_values=True))
            if not name.startswith("production/") or ".." in name.split("/"):
                self.send_error(400)
                return
            if query == {"uploads": ""}:
                upload_id = uuid.uuid4().hex
                with count_lock:
                    uploads[upload_id] = {"name": name, "parts": {}}
                self.xml(f"<InitiateMultipartUploadResult><UploadId>{upload_id}</UploadId></InitiateMultipartUploadResult>")
                return
            length = int(self.headers.get("Content-Length", "0"))
            if set(query) != {"uploadId"} or not 0 < length <= 65536:
                self.send_error(400)
                return
            try:
                body = ET.fromstring(self.rfile.read(length))
                requested = [(int(p.findtext("PartNumber")), p.findtext("ETag")) for p in body.findall("Part")]
            except (ET.ParseError, TypeError, ValueError):
                self.send_error(400)
                return
            with count_lock:
                upload = uploads.get(query["uploadId"])
                valid = (upload is not None and upload["name"] == name and bool(requested)
                         and [n for n, _ in requested] == list(range(1, len(upload["parts"]) + 1))
                         and set(upload["parts"]) == set(range(1, len(upload["parts"]) + 1))
                         and all(upload["parts"][n][1] == tag for n, tag in requested))
                if valid:
                    uploads.pop(query["uploadId"])
            if not valid:
                self.send_error(400)
                return
            file = root / f"output-{uuid.uuid4().hex}.mp4"
            with file.open("xb") as stream:
                for number, _ in requested:
                    stream.write(upload["parts"][number][0])
            objects[name] = file
            record("put")
            self.xml("<CompleteMultipartUploadResult/>")

        def do_DELETE(self):
            if not self.allowed():
                return
            url = urlsplit(self.path)
            query = dict(parse_qsl(url.query))
            with count_lock:
                upload = uploads.get(query.get("uploadId"))
                if upload and upload["name"] == unquote(url.path).lstrip("/"):
                    uploads.pop(query["uploadId"])
            self.send_response(204)
            self.end_headers()

        def xml(self, content):
            data = content.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/xml")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
    class FixtureServer(ThreadingHTTPServer):
        # Concurrent uploads each open several TLS part connections.
        request_queue_size = 64

    server = FixtureServer(("127.0.0.1", 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, counts
