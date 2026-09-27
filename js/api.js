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
      throw new Error(e.name === 'AbortError' ? 'Сервер не ответил за 25 секунд' : 'Нет связи с сервером');
    } finally { clearTimeout(timer); }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Сервер ответил непонятно (' + res.status + ')'); }
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

export const api = (action, payload) => backend().call(action, payload, session.get() || {});
