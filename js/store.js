/* Состояние приложения.

   Требование владельца — «всё должно работать мгновенно». Поэтому:
   — последний ответ сервера хранится в телефоне, и приложение открывается
     сразу с ним, а свежие данные подтягивает следом;
   — нажатие меняет экран сразу («оптимистично»), а запрос к серверу идёт
     в фоне. Если сервер отказал — изменение откатывается и видно почему. */

import { api, session, backend, flush } from './api.js';
import { outbox, QUEUEABLE, newCid, describe } from './outbox.js';

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

  /* Ответ сервера: свежие данные + просьба разослать уведомления. */
  took(res) {
    if (res && res.flush) flush();
    if (res && res.me) { this.data = res; this.syncedAt = Date.now(); this.offline = false; this.error = ''; this.persist(); }
  },

  async refresh(quiet) {
    if (this.loading) return;
    /* Пока в «Исходящих» что-то лежит, свежие данные с сервера стёрли бы
       с экрана то, что человек уже нажал. Сначала — отправить. */
    if (outbox.size) { await this.sendOutbox(); if (outbox.size) return; }
    this.loading = true;
    if (!quiet) this.emit();
    try {
      this.took(await api('load'));
    } catch (e) {
      if (e.code === 'auth') { this.logout(); return; }
      this.offline = true;
      this.error = e.message;
    } finally {
      this.loading = false;
      this.emit();
    }
  },

  /* optimistic(data) меняет копию данных так, как сервер её изменит.
     Нет связи — нажатие не откатывается, а ложится в «Исходящие». */
  async act(action, payload, optimistic, okText) {
    const before = this.data;
    if (optimistic && this.data) {
      const copy = JSON.parse(JSON.stringify(this.data));
      try { optimistic(copy); this.data = copy; this.emit(); } catch (e) { this.data = before; }
    }
    const canQueue = QUEUEABLE.has(action) && !this.isDemo;
    const body = canQueue ? Object.assign({}, payload, { cid: newCid() }) : payload;
    const toOutbox = (why, behind) => {
      outbox.add({ cid: body.cid, action, payload: body, label: describe(action, body), at: Date.now(), tries: 0, err: why || '' });
      if (this.data) (this.data.tasks || []).forEach((t) => { if (t.saving) t.queued = true; });
      if (!behind) this.offline = true;
      this.persist();
      this.say(behind ? 'Сохранил — уйдёт следом за неотправленным' : 'Нет связи — сохранил в телефоне, отправлю сам', 'queued');
      this.retrySoon();
      return { queued: true };
    };
    /* Уже что-то ждёт — это нажатие встаёт за ним: порядок важен. */
    if (canQueue && outbox.size) { const r = toOutbox('', true); this.sendOutbox(); return r; }
    this.inflight = (this.inflight || 0) + 1;
    try {
      const res = await api(action, body);
      this.took(res);
      if (okText) this.say(okText);
      else if (this.toast && this.toast.kind === 'wait') this.toast = null;
      this.emit();
      return res;
    } catch (e) {
      if (e.code === 'auth') { this.logout(); return null; }
      if (e.net && canQueue) return toOutbox(e.message);
      this.data = before;
      this.say(e.message || 'Не получилось', 'error');
      this.emit();
      return null;
    } finally {
      this.inflight--;
    }
  },

  /* Отправить «Исходящие» по порядку. Сеть снова пропала — стоп до
     следующего раза; сервер отказал по существу — убрать и сказать. */
  sending: false,
  async sendOutbox() {
    if (this.sending || !outbox.size) return;
    this.sending = true;
    this.emit();
    let sent = 0;
    try {
      for (;;) {
        const x = outbox.list()[0];
        if (!x) break;
        try {
          const res = await api(x.action, x.payload);
          outbox.remove(x.cid);
          sent++;
          if (res && res.flush) flush();
          if (!outbox.size) this.took(res);
          if (x.action === 'taskSave' && res && res.created != null) this.ui.flash = res.created;
        } catch (e) {
          if (e.code === 'auth') { this.logout(); return; }
          if (e.net) { x.tries = (x.tries || 0) + 1; x.err = e.message; outbox.update(x); this.offline = true; break; }
          outbox.remove(x.cid);
          this.say('Не отправилось: ' + x.label + ' — ' + e.message, 'error');
        }
      }
    } finally {
      this.sending = false;
      if (sent && !outbox.size) { this.say(sent === 1 ? 'Отправлено из «Исходящих» ✓' : 'Отправлено из «Исходящих»: ' + sent + ' ✓'); this.ui.outboxOpen = false; }
      if (outbox.size) this.retrySoon();
      this.persist();
      this.emit();
    }
  },
  retrySoon() {
    clearTimeout(this._retry);
    this._retry = setTimeout(() => { if (outbox.size && !document.hidden) this.sendOutbox(); else if (outbox.size) this.retrySoon(); }, 20000);
  },
  get outboxSize() { return outbox.size; },

  say(text, kind = 'ok') {
    this.toast = { text, kind, id: Date.now() };
    this.emit();
    const id = this.toast.id;
    if (kind === 'wait') return;   // «сохраняю…» висит, пока его не сменит ответ
    if (kind === 'queued') kind = 'wait-long';
    setTimeout(() => { if (this.toast && this.toast.id === id) { this.toast = null; this.emit(); } }, kind === 'error' || kind === 'wait-long' ? 5000 : 2600);
  },

  logout() {
    session.clear();
    outbox.clear();
    try { localStorage.removeItem(CACHE); } catch (e) {}
    this.data = null; this.ui = {};
    location.hash = '#/login';
    this.emit();
  },
};
