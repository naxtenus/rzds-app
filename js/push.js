/* Push-уведомления.

   На айфоне они работают только у приложения, открытого с экрана «Домой»
   (iOS 16.4 и новее), и разрешение можно спросить только в ответ на
   нажатие кнопки. Поэтому здесь нет ничего «само при запуске»: только по
   кнопке «Включить уведомления». */

import { api, backend } from './api.js';

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const pushState = () => {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'need-install' : 'unsupported';
  return Notification.permission; // default | granted | denied
};

const b64uToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone()
    ? 'Сначала добавьте приложение на экран «Домой» и откройте его оттуда'
    : 'Этот браузер не умеет push-уведомления');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Уведомления запрещены. Включить: Настройки → Уведомления → РЗДС');
  const reg = await navigator.serviceWorker.ready;
  if (backend().isDemo) {
    /* В демо сервера нет — показываем пробное уведомление прямо с телефона. */
    await reg.showNotification('РЗДС: уведомления включены', {
      body: 'Так будут приходить проблемы со станков, ответы смены и задачи.',
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'rzds-test',
      data: { url: '#/today' },
    });
    return true;
  }
  const { key } = await api('pushKey');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  }
  await api('pushSubscribe', { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 160) });
  try { localStorage.setItem(PKEY, JSON.stringify({ ep: sub.endpoint, at: Date.now() })); } catch (e) {}
  return true;
}

/* Подписка телефона — серверу, сама, при каждом открытии (раз в сутки или
   если адрес подписки сменился). 15.10.2026: на сервере лежала подписка от
   29.09, Apple её принимала, а до телефона не доходило — телефон со временем
   получает новую подписку, а приложение сообщало её серверу только по кнопке
   «Включить уведомления», которой после разрешения уже не видно. */
const PKEY = 'rzds-push-sent';
export async function syncPush(force) {
  try {
    if (!pushSupported() || Notification.permission !== 'granted' || backend().isDemo) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await api('pushKey');
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
    }
    let last = null;
    try { last = JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) {}
    if (!force && last && last.ep === sub.endpoint && Date.now() - last.at < 864e5) return false;
    await api('pushSubscribe', { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 160) });
    try { localStorage.setItem(PKEY, JSON.stringify({ ep: sub.endpoint, at: Date.now() })); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

export async function testPush() {
  if (backend().isDemo) return enablePush();
  return api('pushTest');
}

export function setBadge(n) {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
  } catch (e) {}
}
