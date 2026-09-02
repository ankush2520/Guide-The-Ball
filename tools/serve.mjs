/**
 * Zero-dependency static server for local play.
 *   npm run dev            -> http://localhost:5173
 *   npm run dev -- 8080    -> pick a different port
 *
 * The game is a single self-contained index.html, so this only exists for
 * convenience (and because some browser APIs behave better over http://
 * than file://). Nothing here ships to the portals.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);

  // never serve outside the project directory
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'          // always serve your latest edit
    }).end(data);
  });
});

// If the port is taken (often a server left over from a previous run),
// roll forward to the next free one instead of crashing.
// Announced only once, on the port we actually bound - a per-attempt
// callback would leave a stale listener and print the port that failed.
server.once('listening', () => {
  console.log(`\n  Guide the Ball  ->  http://localhost:${server.address().port}` +
              `\n  (Ctrl+C to stop)\n`);
});

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    if (attemptsLeft <= 0) {
      console.error(`\n  Ports ${PORT}-${port} are all in use.` +
                    `\n  Free one with:  lsof -ti :${PORT} | xargs kill\n`);
      process.exit(1);
    }
    console.log(`  Port ${port} in use, trying ${port + 1}...`);
    listen(port + 1, attemptsLeft - 1);
  });
  server.listen(port);
}
listen(PORT, 10);
