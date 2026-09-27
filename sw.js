/* Служебный работник приложения: хранит само приложение в телефоне (чтобы
   открывалось мгновенно и без связи) и принимает push-уведомления. */

const VERSION = 'rzds-0.1.0';
const SHELL = [
  './', 'index.html', 'app.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/mock.js', 'js/push.js', 'js/store.js', 'js/ui.js', 'js/util.js',
  'js/views/today.js', 'js/views/plan.js', 'js/views/tasks.js', 'js/views/task.js', 'js/views/newtask.js',
  'js/views/replies.js', 'js/views/notify.js', 'js/views/shift.js', 'js/views/login.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'fonts/onest-cyrillic-400-normal.woff2', 'fonts/onest-cyrillic-500-normal.woff2',
  'fonts/onest-cyrillic-600-normal.woff2', 'fonts/onest-cyrillic-700-normal.woff2',
  'fonts/onest-latin-400-normal.woff2', 'fonts/onest-latin-600-normal.woff2', 'fonts/onest-latin-700-normal.woff2',
  'fonts/unbounded-cyrillic-600-normal.woff2', 'fonts/unbounded-latin-600-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Своё — из памяти телефона, с тихим обновлением в фоне. Чужие адреса
   (сервер Apps Script) не трогаем: данные должны быть живыми. */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || c.match('index.html');
  }));
});

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { body: e.data && e.data.text() }; }
  const title = p.title || 'РЗДС';
  const opts = {
    body: p.body || 'Новое событие в цеху',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: p.tag || undefined,
    renotify: !!p.tag,
    requireInteraction: p.kind === 'problem',
    data: { url: p.url || '#/' },
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    typeof p.badge === 'number' && self.navigator && self.navigator.setAppBadge
      ? self.navigator.setAppBadge(p.badge).catch(() => {}) : Promise.resolve(),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push' }))),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '#/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs[0];
    if (c) { c.postMessage({ type: 'open', url }); return c.focus(); }
    return self.clients.openWindow(self.registration.scope + url.replace(/^\.?\/?/, ''));
  }));
});
