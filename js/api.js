/* Связь с сервером.

   Сервер — тот же проект Apps Script, что и планировщик. Запросы идут
   простым POST с телом text/plain: так браузер не делает предварительный
   запрос OPTIONS, на который Apps Script ответить не умеет.

   Пока адрес сервера не вписан в config.js, приложение работает на
   демо-данных (mock.js). */

import { CONFIG } from '../config.js';
import { demo } from './mock.js';

const SKEY = 'rzds-session';

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } },
  set(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} },
  clear() { try { localStorage.removeItem(SKEY); } catch (e) {} },
};

const live = {
  isDemo: false,
  async call(action, payload = {}, s = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    let res;
    try {
      res = await fetch(CONFIG.server, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ a: action, s: s.token || '' }, payload)),
        signal: ctrl.signal,
        redirect: 'follow',
      });
    } catch (e) {
      /* net — связи нет или ответ потерялся: такое нажатие можно отложить
         и отправить ещё раз (сервер узнает повтор по cid). */
      const err = new Error(e.name === 'AbortError' ? 'Сервер не ответил за 25 секунд' : 'Нет связи с сервером');
      err.net = true;
      throw err;
    } finally { clearTimeout(timer); }
    let data;
    try { data = await res.json(); } catch (e) {
      /* Google иногда отвечает страницей «сервис недоступен» — это тоже
         «попробовать позже», а не отказ по существу. */
      const err = new Error('Сервер ответил непонятно (' + res.status + ')');
      err.net = true;
      throw err;
    }
    if (data && data.error) {
      const err = new Error(data.error);
      err.code = data.code || '';
      throw err;
    }
    return data;
  },
};

export const hasServer = () => !!CONFIG.server;

/* Демо включается явно — кнопкой на экране входа — или само, пока сервера нет. */
export const backend = () => {
  const s = session.get();
  if (s && s.demo) return demo;
  return hasServer() ? live : demo;
};

/* Номер телефона для предела попыток входа: у каждого телефона свой
   счётчик, и чужие ошибки не запирают вход остальным. */
export const deviceId = () => {
  try {
    let d = localStorage.getItem('rzds-dev');
    if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('rzds-dev', d); }
    return d;
  } catch (e) { return ''; }
};

/* Сколько запросов, начатых человеком, сейчас в пути — для кружка вверху
   экрана (04.10). Фоновые (обновление раз в минуту, рассылка, «дошло»,
   миниатюры фото) не считаются — иначе кружок мигал бы сам по себе. */
const QUIET = new Set(['load', 'flush', 'ack', 'photo', 'ping']);
export const net = { busy: 0 };
const busyEvt = () => { try { window.dispatchEvent(new Event('rzds-busy')); } catch (e) {} };

export const api = (action, payload) => {
  const p = backend().call(action,
    action === 'login' ? Object.assign({ dev: deviceId() }, payload) : payload, session.get() || {});
  if (QUIET.has(action)) return p;
  net.busy++; busyEvt();
  const done = () => { net.busy--; busyEvt(); };
  p.then(done, done);
  return p;
};

/* Разослать уведомления, которые сервер поставил в очередь, — отдельным
   запросом, не задерживая ответ на нажатие. Ждать его незачем. */
export const flush = () => { api('flush').catch(() => {}); };
