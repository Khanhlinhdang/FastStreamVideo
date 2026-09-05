/** Quick SCL-004 check: ENCODE_IN_PROCESS=0 → health.encoder=remote */
process.env.ENCODE_IN_PROCESS = '0';

async function main() {
  const { buildApp } = await import('../src/app.js');
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const j = await fetch(`http://127.0.0.1:${addr.port}/api/health`).then((r) => r.json());
  console.log(JSON.stringify(j));
  await app.close();
  if (j.encoder !== 'remote') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
