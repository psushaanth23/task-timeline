import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

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

      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/api/state') {
          next();
          return;
        }

        const sendJson = (status, obj) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };

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
