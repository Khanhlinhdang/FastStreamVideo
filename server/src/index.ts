import { buildApp, assertProductionSecrets } from './app.js';
import { config } from './config.js';

assertProductionSecrets();

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`LiveStream API listening on http://${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
