import { getDb, migrate, closeDb } from './index.js';
import { seed } from './seed-data.js';
import { config } from '../config.js';
import fs from 'node:fs';

fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.hlsDir, { recursive: true });

const db = getDb();
migrate(db);
seed(db);
closeDb();
