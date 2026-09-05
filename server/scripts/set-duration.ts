import { getDb, closeDb } from '../src/db/index.js';
const db = getDb();
db.prepare('UPDATE episodes SET durationSec = 300 WHERE id IN (1, 5)').run();
console.log(db.prepare('SELECT id, durationSec FROM episodes WHERE id IN (1,5)').all());
closeDb();
