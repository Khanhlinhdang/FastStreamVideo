/**
 * Force an encode job to failed for AUD-002 retry testing.
 * Usage: npx tsx server/scripts/aud002-force-fail.ts <jobId> <episodeId>
 */
import { closeDb, getDb, migrate } from '../src/db/index.js';

const jobId = Number(process.argv[2]);
const episodeId = Number(process.argv[3]);
if (!jobId || !episodeId) {
  console.error('Usage: aud002-force-fail.ts <jobId> <episodeId>');
  process.exit(2);
}

migrate();
const db = getDb();
db.prepare(
  `UPDATE encode_jobs SET status = 'failed', error = 'AUD-002 forced fail', progress = 0, finishedAt = datetime('now') WHERE id = ?`,
).run(jobId);
db.prepare(`UPDATE episodes SET statusEncode = 'failed' WHERE id = ?`).run(episodeId);
console.log(JSON.stringify(db.prepare(`SELECT id, status, error FROM encode_jobs WHERE id = ?`).get(jobId)));
closeDb();
