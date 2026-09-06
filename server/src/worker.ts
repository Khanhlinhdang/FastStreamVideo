/**
 * Optional out-of-process encode worker.
 * API: ENCODE_IN_PROCESS=0 (does not pump ffmpeg)
 * Worker: npm run worker -w server
 */
import { config } from './config.js';
import { getDb, migrate } from './db/index.js';
import { encodeQueue, pollQueuedJobs } from './services/encodeQueue.js';

migrate(getDb());
console.log(`[worker] started (sqlite=${config.databasePath})`);

encodeQueue.resumePending();
setInterval(() => {
  pollQueuedJobs();
}, 5_000);
