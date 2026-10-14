#!/usr/bin/env node
/* Composer's Key — put library.json into the private songbook on claude.ai.
   ---------------------------------------------------------------------
   The page's own Library > Load library.json does this, and for a library you
   can pick in a file dialog that is the whole job. This script is for when you
   would rather type one line, or the file is too big to hand around (13 MB of
   library.json is past what most upload paths will carry; a file input has no
   such limit, so this drives the input the page already has).

     node tools/songbook-upload.mjs [library/library.json] [--artifact <url>]

   It opens a real browser window you can see. The first run asks you to sign in
   to claude.ai; the sign-in is kept in a profile beside this repo, so later runs
   go straight through. Nothing is typed for you — you sign in yourself.

   It needs no setting up. Playwright is a dev tool, not a dependency of the
   harness, so it is never installed into this repo: the first run puts it in
   ~/.composers-key-tools and finds its own Chromium there. The repo keeps its
   promise that a checkout needs nothing but a file server.
*/
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ARTIFACT = 'https://claude.ai/artifact/4dDMySzsr1bXnqSyFZSsCt';
const PROFILE = path.join(os.homedir(), '.composers-key-songbook-profile');
const TOOLS = path.join(os.homedir(), '.composers-key-tools');

// Playwright, from wherever it already is, and otherwise installed once into a
// folder of its own. Left to itself Playwright knows where it put its browsers;
// CHROMIUM is only for pointing at a different one on purpose.
// Imported by path, Playwright arrives as a CommonJS namespace: its exports are
// under .default, not beside it.
const pw = await playwright();
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) { console.error('Playwright loaded but has no chromium. Delete ~/.composers-key-tools and try again.'); process.exit(1); }

async function playwright() {
  try { return await import('playwright'); } catch { /* not beside the repo */ }
  const req = createRequire(path.join(TOOLS, 'x.js'));
  const load = () => import(pathToFileURL(req.resolve('playwright')).href);
  try { return await load(); } catch { /* not installed yet */ }

  console.log('Installing Playwright, once, into ~/.composers-key-tools —');
  console.log('nothing goes into the repo. This takes a minute.\n');
  fs.mkdirSync(TOOLS, { recursive: true });
  try {
    execFileSync('npm', ['--prefix', TOOLS, 'install', '--no-fund', '--no-audit', 'playwright'], { stdio: 'inherit' });
    execFileSync(path.join(TOOLS, 'node_modules/.bin/playwright'), ['install', 'chromium'], { stdio: 'inherit' });
  } catch {
    console.error('\nThat install failed. Run it by hand and try again:');
    console.error(`  npm --prefix ${TOOLS} install playwright`);
    console.error(`  ${path.join(TOOLS, 'node_modules/.bin/playwright')} install chromium`);
    process.exit(1);
  }
  console.log('');
  return load();
}

const args = process.argv.slice(2);
let file = 'library/library.json', url = ARTIFACT, attach = false, port = 9222;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--artifact') url = args[++i];
  else if (args[i] === '--attach') attach = true;
  else if (args[i] === '--port') { port = Number(args[++i]); attach = true; }
  else file = args[i];
}
file = path.resolve(file);

if (!fs.existsSync(file)) {
  console.error(`No ${file}. Run tools/music-library.mjs first.`);
  process.exit(1);
}
const lib = JSON.parse(fs.readFileSync(file, 'utf8'));
const pieces = lib.pieces?.length ?? 0;
const tracks = (lib.pieces ?? []).reduce((a, p) => a + (p.tracks?.length ?? 0), 0);
const mb = (fs.statSync(file).size / 1048576).toFixed(1);
console.log(`${file}\n  ${pieces} pieces, ${tracks} tracks, ${mb} MB -> ${pieces + tracks + 1} documents`);

// Two ways in. By default a browser of our own, which means signing in to
// claude.ai once inside it. With --attach, your own Chrome and the session you
// are already signed into — but a running Chrome holds its profile locked, and
// Playwright can only reach a browser that was started listening, so Chrome has
// to be quit and reopened once with a debugging port:
//
//   killall "Google Chrome"; open -a "Google Chrome" --args --remote-debugging-port=9222
//
// Your tabs come back and you stay signed in. Nothing reads your cookies here;
// the page is simply driven where it already sits.
let browser = null, ctx, page;
if (attach) {
  console.log(`Attaching to Chrome on port ${port}…`);
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${port}`);
  } catch {
    console.error(`\nNothing is listening on port ${port}. Quit Chrome and start it again with:`);
    console.error('  killall "Google Chrome"; open -a "Google Chrome" --args --remote-debugging-port=9222');
    console.error('Then run this again with --attach. (Chrome ignores the flag if it is already running.)');
    process.exit(1);
  }
  ctx = browser.contexts()[0];
  if (!ctx) { console.error('Chrome is listening but has no window open.'); process.exit(1); }
  page = await ctx.newPage();
} else {
  ctx = await chromium.launchPersistentContext(PROFILE, {
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
    headless: false, viewport: { width: 1200, height: 900 },
  });
  page = ctx.pages()[0] ?? await ctx.newPage();
}

try {
  console.log('\nOpening the songbook…');
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // A private artifact is "page not found" to a signed-out visitor — it never
  // offers a sign-in. So if the songbook does not appear, go to claude.ai, let
  // the sign-in happen there, and come back.
  let input = await waitForInput(page, 10_000, { quiet: true });
  if (!input) {
    console.log('  Not signed in — a private page reads as "page not found" until you are.');
    console.log('  Sending you to claude.ai. Sign in; I will open the songbook when you are through.');
    await page.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' });
    await waitForSignIn(ctx, page, 10 * 60_000);
    console.log('  Signed in. Opening the songbook…');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    input = await waitForInput(page, 2 * 60_000);
  }
  if (!input) throw new Error('The songbook never appeared, even signed in. Is it the right artifact URL?');

  const frame = input.frame;
  await frame.locator('#l-file').setInputFiles(file);
  console.log(`Loading ${pieces} pieces… (${pieces + tracks + 1} documents; this takes a while)`);

  const result = await watch(frame, 30 * 60_000);
  console.log('\n' + result.message);
  if (result.ok) {
    const shown = await frame.locator('.summary, #songbook').first().innerText().catch(() => '');
    const m = shown.match(/(\d+)\s+pieces/);
    if (m) console.log(`The page now lists ${m[1]} pieces.`);
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (e) {
  // Closing the window is a thing people do; it should not read as a crash.
  if (/has been closed|Target closed|browser has been closed/i.test(e?.message ?? '')) {
    console.log('\nThe window closed before the library went in. Nothing was half-written —');
    console.log('the page takes the whole file or none of it. Run it again and leave the');
    console.log('window open; it waits as long as the sign-in takes.');
  } else {
    console.error('\n' + (e?.message ?? e));
  }
  process.exitCode = 1;
} finally {
  // Attached, the browser is yours: close only the tab this opened and let go.
  if (browser) {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});   // disconnects; it does not quit Chrome
  } else {
    await ctx.close().catch(() => {});
  }
}

// The songbook's file input, in whichever frame holds it. Signing in can take as
// long as it takes; say so once, not every second.
async function waitForInput(page, timeout, { quiet = false } = {}) {
  const start = Date.now(), until = start + timeout;
  let asked = false;
  while (Date.now() < until) {
    if (page.isClosed()) throw new Error('The window has been closed');
    for (const frame of page.frames()) {
      const el = frame.locator('#l-file');
      if (await el.count().catch(() => 0)) {
        // The Library tab holds it; make sure that tab is the one showing.
        await frame.getByRole('tab', { name: /library/i }).click().catch(() => {});
        return { frame };
      }
    }
    if (!quiet && !asked && Date.now() > start + 8000) {
      console.log('  Still waiting for the songbook to load…');
      asked = true;
    }
    await page.waitForTimeout(500);
  }
  return null;
}

// Signed in, as the browser can tell: claude.ai has set a session cookie and
// stopped showing a login page. No credentials pass through here.
async function waitForSignIn(ctx, page, timeout) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (page.isClosed()) throw new Error('The window has been closed');
    const cookies = await ctx.cookies('https://claude.ai').catch(() => []);
    const hasSession = cookies.some(c => /session/i.test(c.name) && c.value?.length > 20);
    if (hasSession && !/\/login|\/magic-link/.test(page.url())) return true;
    await page.waitForTimeout(1000);
  }
  throw new Error('No sign-in after ten minutes.');
}

// Import runs behind a progress bar and ends in a toast. The toast clears itself
// after 2.2 s, so poll for it rather than waiting on it.
async function watch(frame, timeout) {
  const until = Date.now() + timeout;
  let seenProgress = false, lastPct = -1;
  while (Date.now() < until) {
    const state = await frame.evaluate(() => {
      const bar = document.querySelector('.progress');
      const toast = document.querySelector('.toast');
      return {
        running: !!bar && !bar.hidden,
        pct: bar?.firstChild?.style?.width ?? '',
        toast: toast && !toast.hidden ? toast.textContent : '',
      };
    }).catch(() => null);
    if (!state) { await frame.page().waitForTimeout(500); continue; }

    if (state.running) {
      seenProgress = true;
      const pct = parseInt(state.pct, 10);
      if (Number.isFinite(pct) && pct !== lastPct && pct % 10 === 0) { process.stdout.write(`  ${pct}%\r`); lastPct = pct; }
    }
    if (state.toast) {
      const t = state.toast.trim();
      if (/pieces loaded/.test(t)) return { ok: !/writes failed/.test(t), message: t };
      if (/not JSON|not a library|full|Could not load/.test(t)) return { ok: false, message: t };
    }
    if (seenProgress && !state.running) {
      // Finished between polls and the toast has already cleared.
      return { ok: true, message: `${pieces} pieces loaded.` };
    }
    await frame.page().waitForTimeout(500);
  }
  return { ok: false, message: 'Gave up waiting for the load to finish.' };
}
