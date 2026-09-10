/* ============================================================
   The whole suite, in one command.

   Two kinds of test, and they need different things:

   - parity, mechanics and engines run HEADLESS against the
     bundled physics (tools/harness.mjs): no build, no server.
   - play + smoke drive the real app, so they need a production
     build being served. This boots `vite preview` for them and
     shuts it down afterwards.
   ============================================================ */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
const URL = `http://localhost:${PORT}/`;

const run = (cmd, args, env = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`))));
});

const waitFor = async (url, ms = 20000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`server never came up at ${url}`);
};

let server = null;
try {
  /* ---- server-free: the simulator itself ---- */
  await run('node', ['tests/parity.test.mjs']);
  await run('node', ['tests/mechanics.mjs']);
  await run('node', ['tests/engines.test.mjs']);

  /* ---- the real app ---- */
  console.log('\nbuilding for the UI tests…');
  await run('npx', ['vite', 'build', '--logLevel', 'warn']);
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT)],
                 { cwd: root, stdio: 'ignore', detached: true });
  await waitFor(URL);

  await run('node', ['tests/play.test.mjs'], { GTB_URL: URL });
  await run('node', ['tests/smoke.test.mjs'], { GTB_URL: URL });

  console.log('\nALL SUITES PASSED\n');
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`);
  process.exitCode = 1;
} finally {
  if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } }
}
