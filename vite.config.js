import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Supported image types <-> file extensions for the asset endpoint.
const TYPE_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};
const EXT_TO_TYPE = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

// Dev-server plugin: on-disk JSON state persistence.
// Backs the app state with a file at <repoRoot>/data/state.json.
//
// API contract:
//   GET  /api/state -> 200 { ...savedState } if file exists, else 200 { "tasks": null }
//   PUT  /api/state -> body is JSON; written pretty-printed to data/state.json -> 200 { "ok": true }
//   POST /api/state -> same as PUT
//   On error -> 400 (bad JSON) / 500 (write failure) with { "ok": false, "error": "..." }
// Only intercepts /api/state; everything else falls through to next().
function stateApiPlugin() {
  return {
    name: 'on-disk-state-api',
    configureServer(server) {
      const dataDir = path.resolve(server.config.root, 'data');
      const stateFile = path.join(dataDir, 'state.json');
      const assetsDir = path.join(dataDir, 'assets');

      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];

        const sendJson = (status, obj) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };

        // --- Image asset store: bytes live on disk under data/assets/, keyed by
        // a content hash; only the short /api/assets/<hash>.<ext> URL is ever
        // stored in state.json (keeps state small + scalable). ---
        if (url === '/api/assets' && req.method === 'POST') {
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            try {
              const buf = Buffer.concat(chunks);
              if (!buf.length) {
                sendJson(400, { ok: false, error: 'Empty body' });
                return;
              }
              const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
              const ext = TYPE_TO_EXT[ct];
              if (!ext) {
                sendJson(415, { ok: false, error: 'Unsupported content-type: ' + ct });
                return;
              }
              // 32 hex chars of sha256 → dedupes identical bytes, no collisions
              // in practice, and safe as a filename.
              const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
              const name = hash + '.' + ext;
              fs.mkdirSync(assetsDir, { recursive: true });
              const dest = path.join(assetsDir, name);
              if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
              sendJson(200, { url: '/api/assets/' + name });
            } catch (err) {
              sendJson(500, { ok: false, error: String(err && err.message ? err.message : err) });
            }
          });
          req.on('error', (err) => {
            sendJson(500, { ok: false, error: String(err && err.message ? err.message : err) });
          });
          return;
        }

        if (url.startsWith('/api/assets/') && req.method === 'GET') {
          const name = url.slice('/api/assets/'.length);
          // Only ever serve the exact hash.ext pattern we generate — this alone
          // rejects "..", slashes and any path traversal.
          if (!/^[a-f0-9]{16,64}\.[a-z0-9]+$/.test(name)) {
            sendJson(400, { ok: false, error: 'Bad asset name' });
            return;
          }
          const file = path.join(assetsDir, name);
          // Defense in depth: ensure the resolved path stays inside assetsDir.
          if (file !== path.join(assetsDir, path.basename(file)) || !file.startsWith(assetsDir + path.sep)) {
            sendJson(400, { ok: false, error: 'Bad asset path' });
            return;
          }
          if (!fs.existsSync(file)) {
            sendJson(404, { ok: false, error: 'Not found' });
            return;
          }
          const ext = name.split('.').pop();
          res.statusCode = 200;
          res.setHeader('Content-Type', EXT_TO_TYPE[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.end(fs.readFileSync(file));
          return;
        }

        if (url !== '/api/state') {
          next();
          return;
        }

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(stateFile)) {
              const raw = fs.readFileSync(stateFile, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
            } else {
              sendJson(200, { tasks: null });
            }
          } catch (err) {
            sendJson(500, { ok: false, error: String(err && err.message ? err.message : err) });
          }
          return;
        }

        if (req.method === 'PUT' || req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(body);
            } catch (err) {
              sendJson(400, { ok: false, error: 'Invalid JSON: ' + String(err && err.message ? err.message : err) });
              return;
            }
            try {
              fs.mkdirSync(dataDir, { recursive: true });
              fs.writeFileSync(stateFile, JSON.stringify(parsed, null, 2), 'utf8');
              sendJson(200, { ok: true });
            } catch (err) {
              sendJson(500, { ok: false, error: String(err && err.message ? err.message : err) });
            }
          });
          req.on('error', (err) => {
            sendJson(500, { ok: false, error: String(err && err.message ? err.message : err) });
          });
          return;
        }

        // Unsupported method on /api/state.
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Allow', 'GET, PUT, POST');
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), stateApiPlugin()],
  server: {
    port: 5173,
    open: false,
  },
});
