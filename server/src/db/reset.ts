import fs from 'node:fs';
import { config } from '../config.js';
import { closeDb, getDb, migrate } from './index.js';
import { seed } from './seed-data.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.hlsDir, { recursive: true });

const db = getDb();
migrate(db);
seed(db);
console.log('Database reset + seed complete.');
closeDb();
