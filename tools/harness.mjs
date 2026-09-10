/* ============================================================
   HEADLESS HARNESS

   The solver sweep and the physics isolation tests need
   window.__gtb, but they do NOT need React, a canvas, or a dev
   server. This bundles just the physics half of the hook and
   injects it into a blank page.

   That is the point of keeping the simulation pure: the thing
   that proves a level winnable runs without the game.
   ============================================================ */
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let cached = null;

/* Rewrite `export const NAME = <expr>;` in the physics constants before they
   are compiled. The tuning rig needs to sweep a constant across builds, and
   several constants are DERIVED from others (GRAVITY from TERMINAL_VY,
   SUBSTEPS from MAX_SPEED) - so the substitution has to happen in the source
   and let the derivations recompute, not be patched into the output. */
function overridePlugin(overrides) {
  return {
    name: 'gtb-constant-overrides',
    setup(build) {
      build.onLoad({ filter: /physics[\\/]constants\.ts$/ }, async args => {
        let src = await fs.readFile(args.path, 'utf8');
        for (const [name, value] of Object.entries(overrides)) {
          const re = new RegExp(`export const ${name}\\s*=\\s*[^;]+;`);
          if (!re.test(src)) throw new Error(`no constant named ${name} to override`);
          src = src.replace(re, `export const ${name} = ${value};`);
        }
        return { contents: src, loader: 'ts' };
      });
    },
  };
}

/** Bundle src/core/debugHook.ts's physics half into one IIFE.
    `overrides` maps a constant name to a replacement expression. */
export async function physicsBundle(overrides = null) {
  if (!overrides && cached) return cached;
  const out = await esbuild.build({
    stdin: {
      contents: `
        import { installPhysicsHook } from './src/core/debugHook';
        installPhysicsHook();
      `,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', target: 'es2020',
    plugins: overrides ? [overridePlugin(overrides)] : [],
  });
  const text = out.outputFiles[0].text;
  if (!overrides) cached = text;
  return text;
}

/** Give a Playwright page a working window.__gtb, with no server involved. */
export async function attachHarness(page, overrides = null) {
  await page.goto('about:blank');
  await page.addScriptTag({ content: await physicsBundle(overrides) });
  await page.waitForFunction(() => !!window.__gtb);
}
