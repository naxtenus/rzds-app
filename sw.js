/* Служебный работник приложения: хранит само приложение в телефоне (чтобы
   открывалось мгновенно и без связи) и принимает push-уведомления. */

const VERSION = 'rzds-0.5.0';
const SHELL = [
  './', 'index.html', 'app.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/mock.js', 'js/push.js', 'js/store.js', 'js/ui.js', 'js/util.js',
  'js/views/today.js', 'js/views/plan.js', 'js/views/tasks.js', 'js/views/task.js', 'js/views/newtask.js',
  'js/views/replies.js', 'js/views/notify.js', 'js/views/shift.js', 'js/views/login.js', 'js/views/calendar.js', 'js/views/sessions.js', 'js/outbox.js', 'js/photo.js',
  'js/views/order.js', 'js/views/search.js', 'js/views/checklists.js',
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
/* Код приложения — сначала из сети (чтобы после обновления сразу открывалась
   новая версия), а без связи или при медленной сети (дольше 2,5 с) — из
   памяти телефона. Шрифты и иконки не меняются — их сразу из памяти.
   Чужие адреса (сервер Apps Script) не трогаем: данные должны быть живыми. */
const STATIC = /\/(fonts|icons)\//;
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit && STATIC.test(url.pathname)) return hit;
    const net = fetch(e.request, { cache: 'no-cache' })
      .then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => null);
    if (!hit) return (await net) || c.match('index.html');
    const slow = new Promise((r) => setTimeout(() => r(null), 2500));
    return (await Promise.race([net, slow])) || hit;
  }));
});

/* «Дошло»: сервер ждёт подтверждения и, не дождавшись за 10 минут,
   пишет владельцу в Телеграм. Адрес сервера — из config.js (он в памяти). */
async function ack(id) {
  try {
    const r = (await caches.match('config.js', { ignoreSearch: true })) || (await fetch('config.js'));
    const m = /server:\s*'([^']+)'/.exec(await r.text());
    if (!m) return;
    await fetch(m[1], { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ a: 'ack', id }) });
  } catch (err) { /* нет связи — сервер сам разберётся */ }
}

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
    p.id ? ack(p.id) : Promise.resolve(),
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
