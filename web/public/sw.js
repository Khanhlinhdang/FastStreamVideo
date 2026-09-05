/* LiveStream PWA shell — cache app shell only; never HLS segments */
const SHELL = 'livestream-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache media / HLS
  if (
    url.pathname.startsWith('/media') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.m4s') ||
    url.pathname.endsWith('.mp4')
  ) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html')),
    );
  }
});
