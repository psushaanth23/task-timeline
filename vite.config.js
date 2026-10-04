import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  // The /api/state + /api/assets handler, parameterised by the project root so
  // the SAME persistence API can be mounted on BOTH the dev server and the
  // `vite preview` server. Preview serves the production build the phone
  // installs, and it still has to sync against the Mac's data/state.json —
  // without this it would 404 on /api/state and the installed app couldn't sync.
  const makeStateMiddleware = (root) => {
      const dataDir = path.resolve(root, 'data');
      const stateFile = path.join(dataDir, 'state.json');
      const assetsDir = path.join(dataDir, 'assets');
      const backupsDir = path.join(dataDir, 'backups');
      const MAX_BACKUPS = 100;

      // Delete oldest backups beyond MAX_BACKUPS. Names sort lexicographically in
      // write order (rev is zero-padded, then an ISO timestamp), so a plain sort
      // is chronological.
      const pruneBackups = () => {
        let files;
        try {
          files = fs.readdirSync(backupsDir).filter((f) => f.startsWith('state-rev') && f.endsWith('.json'));
        } catch (err) {
          return;
        }
        if (files.length <= MAX_BACKUPS) return;
        files.sort();
        for (const f of files.slice(0, files.length - MAX_BACKUPS)) {
          try {
            fs.unlinkSync(path.join(backupsDir, f));
          } catch (err) {
            /* best-effort */
          }
        }
      };

      // "Would this incoming write lose data relative to what's on disk?" Used
      // only to gate a no-baseRev forced (beacon) write. Conservative: any drop
      // in task/todo/backlog count, or any task/todo flipping done→undone, counts
      // as a regression we refuse to force through blindly.
      const wouldRegress = (cur, next) => {
        const len = (x) => (Array.isArray(x) ? x.length : 0);
        if (len(next.tasks) < len(cur.tasks)) return true;
        if (len(next.todos) < len(cur.todos)) return true;
        if (len(next.backlog) < len(cur.backlog)) return true;
        const doneById = (arr) => {
          const m = new Map();
          (Array.isArray(arr) ? arr : []).forEach((t) => t && t.id != null && m.set(t.id, !!t.done));
          return m;
        };
        for (const key of ['tasks', 'todos']) {
          const before = doneById(cur[key]);
          const after = doneById(next[key]);
          for (const [id, wasDone] of before) {
            if (wasDone && after.has(id) && !after.get(id)) return true; // done -> undone
          }
        }
        return false;
      };

      return (req, res, next) => {
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

        // Read what's on disk, with its revision. `rev` is a counter the file
        // carries; clients send back the rev they based their edit on so a
        // device holding a stale snapshot can't silently overwrite newer work.
        const readState = () => {
          if (!fs.existsSync(stateFile)) return null;
          try {
            return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          } catch (err) {
            return null;
          }
        };

        if (req.method === 'GET') {
          try {
            const cur = readState();
            if (cur) {
              sendJson(200, { ...cur, rev: typeof cur.rev === 'number' ? cur.rev : 0 });
            } else {
              sendJson(200, { tasks: null, rev: 0 });
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
              const cur = readState();
              const curRev = cur && typeof cur.rev === 'number' ? cur.rev : 0;
              const baseRev = typeof parsed.baseRev === 'number' ? parsed.baseRev : null;
              // Compare-and-set: a write based on an older revision is refused
              // and the current state comes back so the client can reconcile.
              if (cur && baseRev !== null && baseRev !== curRev && !parsed.force) {
                sendJson(409, { ok: false, conflict: true, rev: curRev, state: { ...cur, rev: curRev } });
                return;
              }
              // A forced write with NO baseRev is a last-gasp beacon from a tab
              // that never learned the current rev. Historically these clobbered
              // disk unconditionally — that is exactly how a backgrounded stale
              // phone tab wiped good laptop data. Refuse a no-baseRev force that
              // would REGRESS the data (fewer tasks, or a done→undone flip);
              // there is nothing to reconcile against, so the safe move is to
              // keep what is already on disk.
              if (cur && parsed.force && baseRev === null && wouldRegress(cur, parsed)) {
                sendJson(409, { ok: false, conflict: true, rev: curRev, state: { ...cur, rev: curRev }, refusedForce: true });
                return;
              }
              const next = { ...parsed, rev: curRev + 1, savedAt: Date.now() };
              delete next.baseRev;
              delete next.force;
              fs.mkdirSync(dataDir, { recursive: true });
              // Rotating, timestamped backups of the OUTGOING good state before we
              // overwrite it — a one-deep backup rotates away in two stale writes
              // and is useless for recovery. Keep the last MAX_BACKUPS. This is the
              // safety net that lets any bad overwrite be undone from disk.
              if (cur) {
                try {
                  fs.mkdirSync(backupsDir, { recursive: true });
                  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                  const name = 'state-rev' + String(curRev).padStart(6, '0') + '-' + stamp + '.json';
                  fs.copyFileSync(stateFile, path.join(backupsDir, name));
                  // Keep state.prev.json too for backward-compat with any tooling.
                  fs.copyFileSync(stateFile, path.join(dataDir, 'state.prev.json'));
                  pruneBackups();
                } catch (err) {
                  /* backup is best-effort */
                }
              }
              const tmp = stateFile + '.tmp';
              fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
              fs.renameSync(tmp, stateFile);
              sendJson(200, { ok: true, rev: next.rev });
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
      };
  };

  return {
    name: 'on-disk-state-api',
    configureServer(server) {
      server.middlewares.use(makeStateMiddleware(server.config.root));
    },
    // Mount the identical API on the preview server so the installed production
    // PWA syncs against the same data/state.json as the dev server does.
    configurePreviewServer(server) {
      server.middlewares.use(makeStateMiddleware(server.config.root));
    },
  };
}

// HTTPS for the dev server. A service worker (the PWA) only registers in a
// secure context, and http://<LAN-IP> is NOT secure — so to install the app on
// the phone we serve over TLS. The cert is an mkcert leaf for this Mac's LAN IP;
// since the phone already trusts the mkcert root CA, it's green with no warning.
// Falls back to plain HTTP when the certs aren't present (e.g. a fresh clone),
// so nothing breaks if you haven't run mkcert here.
function devHttps() {
  const dir = path.resolve(__dirname, 'certs');
  const key = path.join(dir, 'dev-key.pem');
  const cert = path.join(dir, 'dev-cert.pem');
  try {
    if (fs.existsSync(key) && fs.existsSync(cert)) {
      return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
    }
  } catch (e) {
    /* fall through to HTTP */
  }
  return undefined;
}

export default defineConfig({
  plugins: [react(), stateApiPlugin()],
  server: {
    port: 5173,
    open: false,
    // Listen on all network interfaces (not just localhost) so other devices on
    // the same Wi-Fi can open https://<this-machine's-LAN-IP>:5173.
    host: true,
    https: devHttps(),
  },
  preview: {
    port: 4173,
    host: true,
    https: devHttps(),
  },
});
