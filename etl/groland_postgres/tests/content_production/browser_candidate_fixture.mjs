// Local-only frontend harness for the opt-in Rust browser handshake.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (!process.argv[2]) throw new Error('Usage: node browser_candidate_fixture.mjs <isolated-output-directory>');
const output = path.resolve(process.argv[2]);
const ready = JSON.parse(fs.readFileSync(path.join(output, 'browser-ready.json'), 'utf8'));
const handoff = JSON.parse(fs.readFileSync(ready.handoffPath, 'utf8'));
const target = new URL(handoff.url);
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Loopback fixture required');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const requests = [];
process.env.VITE_API_GATEWAY_PREFIX = '/api';
const server = await createServer({
  configFile: path.join(root, 'apps/web-vite/vite.config.ts'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [{ name: 'isolated-caption-browser', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      try {
        if (req.headers.host !== '127.0.0.1:5173') { res.statusCode = 403; res.end('Loopback host required'); return; }
        const url = new URL(req.url, 'http://127.0.0.1:5173');
        if (url.pathname === '/__caption_fixture') {
          const html = await vite.transformIndexHtml(url.pathname, `<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIOS 字幕真实接口验收</title></head><body><div id="root"></div><script type="module" src="/@fs/${here}/browser_candidate_fixture.tsx"></script></body></html>`);
          res.setHeader('Content-Type', 'text/html'); res.end(html); return;
        }
        if (url.pathname === '/__caption_bootstrap') {
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(handoff.run)); return;
        }
        if (url.pathname === '/__caption_media') {
          // Bytes were downloaded and SHA-verified through the real signed URL by Rust.
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', fs.statSync(path.join(output, 'caption-candidate-video.mp4')).size);
          fs.createReadStream(path.join(output, 'caption-candidate-video.mp4')).pipe(res); return;
        }
        const apiPath = url.pathname.replace(/^\/api(?=\/)/, '/v1');
        if (!apiPath.startsWith('/v1/')) return next();
        const suffix = apiPath.slice(target.pathname.length);
        const allowed = apiPath.startsWith(target.pathname) && (
          (req.method === 'GET' && ['', '/result'].includes(suffix)) ||
          (req.method === 'POST' && ['/plan-revisions', '/adopt-plan'].includes(suffix)));
        if (!allowed || (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:5173')) {
          res.statusCode = 403; res.end('Fixture route only'); return;
        }
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Body limit'); chunks.push(chunk); }
        const response = await fetch(`${target.origin}${apiPath}`, { method: req.method,
          headers: { Authorization: `Bearer ${handoff.token}`, 'Content-Type': 'application/json' },
          body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
        const body = await response.json();
        if (body.captionCandidate) body.captionCandidate.playbackUrl = '/__caption_media';
        requests.push({ method: req.method, suffix, status: response.status, projectRevision: body.run?.projectRevision });
        fs.writeFileSync(path.join(output, 'browser-api.json'), JSON.stringify(requests, null, 2));
        res.statusCode = response.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body));
      } catch { res.statusCode = 500; res.end('Isolated browser fixture failed'); }
    });
  } }],
});
await server.listen();
console.log('Local fixture ready: http://127.0.0.1:5173/__caption_fixture');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
