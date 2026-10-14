// Where the songbook keeps things: your library, your labels, your motifs.
//
// The same page runs in two places, and keeps its data differently in each:
//
//   - On claude.ai, as a private Artifact (tools/songbook-artifact.html): the
//     artifact's own database. Labels and motifs live with the page, on every
//     device, and a Claude session can read them (ArtifactData) to put a motif
//     into a room. The library is uploaded into it once from library.json.
//   - Served from this repo (songbook.html): this browser's localStorage for
//     labels and motifs, and library/library.json fetched from beside the page,
//     which is where tools/music-library.mjs writes it. On GitHub Pages there is
//     no library (it is git-ignored, on purpose) and the writer still works.
//
// Database layout (collections):
//   pieces/<id>        a piece without its notes: title, album, key, tracks' names
//   notes/<id>~<n>     track n of piece <id>, with its clips and arrangement
//   labels/<id>        what you said about a piece: status, tags, notes, key
//   motifs/<id>        a motif from the writer
//   meta/library       when the library was last uploaded

const LOCAL = { labels: 'ck-songbook-labels-v1', motifs: 'ck-songbook-motifs-v1' };

export async function openStore() {
  const db = await artifactDb();
  return db ? dbStore(db) : localStore();
}

async function artifactDb() {
  try {
    if (!window.claude?.use) return null;
    return await Promise.race([window.claude.use('db'), new Promise(r => setTimeout(() => r(null), 10000))]);
  } catch { return null; }
}

// ---- in this browser ---------------------------------------------------------

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function localStore() {
  let library = null;
  return {
    kind: 'local',
    where: 'saved in this browser',
    async library() {
      if (library) return library;
      try {
        const res = await fetch('library/library.json', { cache: 'no-store' });
        if (res.ok) library = await res.json();
      } catch { /* no library beside the page: fine */ }
      return library;
    },
    async importLibrary(lib) { library = lib; return { pieces: lib.pieces.length, kept: 'for this visit' }; },
    async pieceTracks(id) { return (await this.library())?.pieces.find(p => p.id === id)?.tracks ?? []; },
    async labels() { return readLocal(LOCAL.labels); },
    async setLabel(id, label) {
      const all = readLocal(LOCAL.labels);
      all[id] = { ...label, updated: new Date().toISOString() };
      return writeLocal(LOCAL.labels, all);
    },
    async motifs() { return Object.values(readLocal(LOCAL.motifs)).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')); },
    async saveMotif(m) {
      const all = readLocal(LOCAL.motifs);
      all[m.id] = { ...m, updated: new Date().toISOString() };
      return writeLocal(LOCAL.motifs, all);
    },
    async deleteMotif(id) {
      const all = readLocal(LOCAL.motifs);
      delete all[id];
      return writeLocal(LOCAL.motifs, all);
    },
  };
}

// ---- in the artifact's database ------------------------------------------------

function dbStore(db) {
  let cache = null;
  const snap = d => d.exists ? d.data() : null;
  return {
    kind: 'db',
    where: 'saved to this private page',
    async library() {
      if (cache) return cache;
      const [pieces, meta] = await Promise.all([db.collection('pieces').limit(1000).get(), db.doc('meta/library').get()]);
      if (pieces.empty) return null;
      cache = { ...(snap(meta) ?? {}), pieces: pieces.docs.map(d => d.data()) };
      return cache;
    },
    // One document per piece, one per track (a track's notes can be large; a
    // document holds 256 KB). Written a few at a time, never all at once.
    async importLibrary(lib, onProgress = () => {}) {
      const jobs = [];
      for (const p of lib.pieces) {
        const { tracks, ...head } = p;
        head.trackNames = (tracks ?? []).map(t => ({ name: t.name, type: t.type, drums: t.drums, clips: t.clips.length, notes: t.arrangement?.notes.length ?? 0 }));
        jobs.push(() => db.doc(`pieces/${p.id}`).set(head));
        (tracks ?? []).forEach((t, i) => jobs.push(() => db.doc(`notes/${p.id}~${i}`).set(fitTrack(t))));
      }
      jobs.push(() => db.doc('meta/library').set({ made: lib.made, roots: lib.roots, count: lib.pieces.length, uploaded: new Date().toISOString() }));
      let done = 0, failed = 0;
      const run = async () => {
        while (jobs.length) {
          const job = jobs.shift();
          try { await job(); } catch (e) {
            if (e?.code === 'quota_exceeded') throw e;
            failed++;
          }
          onProgress(++done, done + jobs.length);
        }
      };
      await Promise.all([run(), run(), run()]);
      cache = null;
      return { pieces: lib.pieces.length, failed, kept: 'on this page' };
    },
    async pieceTracks(id) {
      const head = (await this.library())?.pieces.find(p => p.id === id);
      const n = head?.trackNames?.length ?? 0;
      const docs = await Promise.all(Array.from({ length: n }, (_, i) => db.doc(`notes/${id}~${i}`).get()));
      return docs.map(snap).filter(Boolean);
    },
    async labels() {
      const q = await db.collection('labels').limit(1000).get();
      return Object.fromEntries(q.docs.map(d => [d.id, d.data()]));
    },
    async setLabel(id, label) {
      await db.doc(`labels/${id}`).set({ ...label, updated: new Date().toISOString() });
      return true;
    },
    async motifs() {
      const q = await db.collection('motifs').limit(1000).get();
      return q.docs.map(d => d.data()).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    },
    async saveMotif(m) {
      await db.doc(`motifs/${m.id}`).set({ ...m, updated: new Date().toISOString() });
      return true;
    },
    async deleteMotif(id) { await db.doc(`motifs/${id}`).delete(); return true; },
  };
}

// A track too big for one document keeps its arrangement and drops clips from
// the end until it fits, and says so.
function fitTrack(t) {
  const size = o => new Blob([JSON.stringify(o)]).size;
  let out = { ...t };
  if (size(out) < 240_000) return out;
  out = { ...t, clips: [...t.clips], trimmed: true };
  while (out.clips.length && size(out) >= 240_000) out.clips.pop();
  if (size(out) >= 240_000 && out.arrangement) {
    const a = out.arrangement;
    out.arrangement = { ...a, notes: a.notes.slice(0, Math.floor(a.notes.length * 240_000 / size(out)) - 50) };
  }
  return out;
}
