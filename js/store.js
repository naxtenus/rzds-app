/* Состояние приложения.

   Требование владельца — «всё должно работать мгновенно». Поэтому:
   — последний ответ сервера хранится в телефоне, и приложение открывается
     сразу с ним, а свежие данные подтягивает следом;
   — нажатие меняет экран сразу («оптимистично»), а запрос к серверу идёт
     в фоне. Если сервер отказал — изменение откатывается и видно почему. */

import { api, session, backend } from './api.js';

const CACHE = 'rzds-cache-v1';

const listeners = new Set();

export const store = {
  data: null,          // ответ сервера на load
  loading: false,
  error: '',
  syncedAt: 0,
  offline: false,
  toast: null,         // { text, kind }
  ui: {},              // состояние экранов: фильтры, раскрытые панели, черновики

  sub(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach((f) => f()); },

  get me() { return (this.data && this.data.me) || (session.get() || {}).me || null; },
  get isDemo() { return backend().isDemo; },

  restore() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      const s = session.get();
      if (c && s && c.token === (s.token || s.role)) { this.data = c.data; this.syncedAt = c.at; }
    } catch (e) {}
  },

  persist() {
    try {
      const s = session.get() || {};
      localStorage.setItem(CACHE, JSON.stringify({ token: s.token || s.role, data: this.data, at: this.syncedAt }));
    } catch (e) {}
  },

  async refresh(quiet) {
    if (this.loading) return;
    this.loading = true;
    if (!quiet) this.emit();
    try {
      this.data = await api('load');
      this.syncedAt = Date.now();
      this.offline = false;
      this.error = '';
      this.persist();
    } catch (e) {
      if (e.code === 'auth') { this.logout(); return; }
      this.offline = true;
      this.error = e.message;
    } finally {
      this.loading = false;
      this.emit();
    }
  },

  /* optimistic(data) меняет копию данных так, как сервер её изменит. */
  async act(action, payload, optimistic, okText) {
    const before = this.data;
    if (optimistic && this.data) {
      const copy = JSON.parse(JSON.stringify(this.data));
      try { optimistic(copy); this.data = copy; this.emit(); } catch (e) { this.data = before; }
    }
    try {
      const res = await api(action, payload);
      if (res && res.me) { this.data = res; this.syncedAt = Date.now(); this.persist(); }
      if (okText) this.say(okText);
      this.emit();
      return res;
    } catch (e) {
      if (e.code === 'auth') { this.logout(); return null; }
      this.data = before;
      this.say(e.message || 'Не получилось', 'error');
      this.emit();
      return null;
    }
  },

  say(text, kind = 'ok') {
    this.toast = { text, kind, id: Date.now() };
    this.emit();
    const id = this.toast.id;
    setTimeout(() => { if (this.toast && this.toast.id === id) { this.toast = null; this.emit(); } }, kind === 'error' ? 5000 : 2600);
  },

  logout() {
    session.clear();
    try { localStorage.removeItem(CACHE); } catch (e) {}
    this.data = null; this.ui = {};
    location.hash = '#/login';
    this.emit();
  },
};
