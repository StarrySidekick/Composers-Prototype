#!/usr/bin/env node
/* Composer's Key — the files the private songbook page needs.
   ---------------------------------------------------------------------
   The songbook on claude.ai (tools/songbook-artifact.html) is published as an
   Artifact with its modules beside it. This follows every import from
   src/music/songbook/main.js and prints the `files` map for the Artifact tool:
   each published path is the repo path, so the page's imports resolve the same
   way they do here. Plus the stylesheet and the two scores the library reads.

   Not the recorded instruments: artifacts do not serve .m4a, so on claude.ai the
   engine plays its synth voices (and the SNES chip) in their place.

     node tools/songbook-files.mjs > /tmp/files.json
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const seen = new Set();
function follow(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    follow(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
  for (const m of src.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    follow(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
}
follow('src/music/songbook/main.js');
const extra = ['src/music/songbook/songbook.css', 'rooms/world.json', 'rooms/wood.json'];
const files = Object.fromEntries([...seen, ...extra].sort().map(p => [p, p]));
console.log(JSON.stringify(files));
