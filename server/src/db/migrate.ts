import { getDb, migrate } from './index.js';

migrate();
console.log('Migration complete.');
getDb().close();
