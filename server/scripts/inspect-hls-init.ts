/**
 * One-shot: list episodes/HLS dirs missing variant init.mp4
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { getDb, closeDb } from '../src/db/index.js';

const db = getDb();
const rows = db
  .prepare(
    `
    SELECT e.id, e.number, e.title, e.statusEncode, e.hlsPath, e.sourcePath, s.slug
    FROM episodes e
    JOIN series s ON s.id = e.seriesId
    WHERE e.statusEncode = 'ready'
       OR e.sourcePath IS NOT NULL
       OR e.hlsPath IS NOT NULL
    ORDER BY e.id
  `,
  )
  .all() as Array<{
  id: number;
  number: number;
  title: string;
  statusEncode: string;
  hlsPath: string | null;
  sourcePath: string | null;
  slug: string;
}>;

console.log('=== DB episodes (ready / sourced / hls) ===');
for (const r of rows) {
  const srcOk = r.sourcePath ? fs.existsSync(r.sourcePath) : false;
  console.log(
    JSON.stringify({
      ...r,
      sourceExists: srcOk,
    }),
  );
}

console.log('\n=== HLS folder scan ===');
const hlsRoot = config.hlsDir;
if (!fs.existsSync(hlsRoot)) {
  console.log('no hls dir');
} else {
  for (const name of fs.readdirSync(hlsRoot).sort((a, b) => Number(a) - Number(b))) {
    const dir = path.join(hlsRoot, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const hasMaster = fs.existsSync(path.join(dir, 'master.m3u8'));
    const variants = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const missing: string[] = [];
    const present: string[] = [];
    for (const v of variants) {
      const vdir = path.join(dir, v);
      const indexPath = path.join(vdir, 'index.m3u8');
      let initName = 'init.mp4';
      if (fs.existsSync(indexPath)) {
        const text = fs.readFileSync(indexPath, 'utf8');
        const m = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
        if (m) initName = m[1];
      }
      const initPath = path.join(vdir, initName);
      if (fs.existsSync(initPath)) present.push(`${v}/${initName}`);
      else missing.push(`${v}/${initName}`);
    }
    console.log(
      JSON.stringify({
        id: name,
        hasMaster,
        variants,
        present,
        missing,
        incomplete: !hasMaster || missing.length > 0 || variants.length === 0,
      }),
    );
  }
}

const jobs = db
  .prepare(`SELECT id, episodeId, status, progress, error FROM encode_jobs ORDER BY id DESC LIMIT 15`)
  .all();
console.log('\n=== recent jobs ===');
console.log(JSON.stringify(jobs, null, 2));

closeDb();
