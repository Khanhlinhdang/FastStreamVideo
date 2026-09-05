import fs from 'node:fs';

const API = 'http://127.0.0.1:4000';
const login = await (
  await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@livestream.local', password: 'admin123' }),
  })
).json();
const token = login.accessToken as string;
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const ep = await (
  await fetch(`${API}/api/admin/episodes`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      seriesId: 11,
      number: 9100 + Math.floor(Math.random() * 80),
      title: 'c2',
      qualityLabel: '1080p',
    }),
  })
).json();
console.log('ep', ep);
const init = await (
  await fetch(`${API}/api/admin/episodes/${ep.id}/upload/init`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ filename: 'c.mp4' }),
  })
).json();
console.log('init', init);
const buf = fs.readFileSync('media/uploads/test-video-upload.mp4');
const mid = Math.floor(buf.length / 2);
const r0 = await fetch(`${API}/api/admin/episodes/${ep.id}/upload/${init.uploadId}/0`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
  body: buf.subarray(0, mid),
});
console.log('p0', r0.status, await r0.text());
const r1 = await fetch(`${API}/api/admin/episodes/${ep.id}/upload/${init.uploadId}/1`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
  body: buf.subarray(mid),
});
console.log('p1', r1.status, await r1.text());
const done = await (
  await fetch(`${API}/api/admin/episodes/${ep.id}/upload/${init.uploadId}/complete`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  })
).json();
console.log(done);
console.log(done.jobId ? 'AUD-012 PASS' : 'AUD-012 FAIL');
