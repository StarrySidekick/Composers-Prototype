/* A contact sheet of every placeholder (and proposal) at 3x, for LOOKING at.
   The art loop in .claude/skills/composers-key-art starts and ends here.
   Usage (serve on :8080):  node tools/art-sheet.mjs out.png [key-prefix]
*/
import { chromium } from 'playwright';
const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const only = process.argv[3] ?? '';
const b = await chromium.launch({ executablePath: EXEC }); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await p.goto(BASE); await p.waitForTimeout(1200);
const data = await p.evaluate(async (only) => {
  const { placeholderKeys, drawPlaceholder, proposalKeys, drawProposal } = await import('./src/art/placeholders.js');
  const keys = [...placeholderKeys(), ...proposalKeys().map(k=>'P:'+k)].filter(k => !only || k.replace('P:','').startsWith(only)); const Z = 3, C = 10, S = 51*Z + 14;
  const cv = document.createElement('canvas'); cv.width = C*S; cv.height = Math.ceil(keys.length/C)*(S+12);
  const c = cv.getContext('2d'); c.fillStyle='#000'; c.fillRect(0,0,cv.width,cv.height); c.imageSmoothingEnabled=false;
  keys.forEach((k,i)=>{ const x=(i%C)*S+7, y=Math.floor(i/C)*(S+12)+4; const t=k.startsWith('P:')?drawProposal(k.slice(2)):drawPlaceholder(k);
    c.strokeStyle='#222'; c.strokeRect(x-0.5,y-0.5,51*Z+1,51*Z+1); c.drawImage(t,x,y,51*Z,51*Z);
    c.fillStyle='#888'; c.font='11px monospace'; c.fillText(k,x,y+51*Z+11); });
  return cv.toDataURL();
}, only);
const fs = await import('fs'); fs.writeFileSync(process.argv[2], Buffer.from(data.split(',')[1],'base64'));
await b.close();
