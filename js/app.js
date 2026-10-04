/* РЗДС — приложение для телефона. Точка входа: маршруты, отрисовка,
   обработка нажатий, фоновое обновление. */

import { store } from './store.js';
import { session, net } from './api.js';
import { setBadge } from './push.js';
import { esc } from './util.js';
import * as ob from './outbox.js';
import * as today from './views/today.js';
import * as plan from './views/plan.js';
import * as tasks from './views/tasks.js';
import * as task from './views/task.js';
import * as newtask from './views/newtask.js';
import * as replies from './views/replies.js';
import * as notify from './views/notify.js';
import * as shift from './views/shift.js';
import * as login from './views/login.js';
import * as sessions from './views/sessions.js';
import * as order from './views/order.js';
import * as search from './views/search.js';
import * as checklists from './views/checklists.js';
import * as qr from './views/qr.js';
import { viewer } from './photo.js';

const root = document.getElementById('app');

/* Кружок вверху: запрос к серверу в пути (04.10, просьба Павла — «чтобы было
   видно, что запрос выполняется»). Живёт вне #app, чтобы перерисовка
   экрана его не дёргала. */
const spin = document.createElement('div');
spin.className = 'net-spin'; spin.setAttribute('role', 'status'); spin.setAttribute('aria-label', 'Связь с сервером…');
spin.innerHTML = '<i></i>'; spin.hidden = true;
document.body.appendChild(spin);
function updateSpin() { spin.hidden = !(net.busy > 0 || store.loud || store.sending); }
window.addEventListener('rzds-busy', updateSpin);

const OWNER = { today, plan, tasks, task, new: newtask, replies, notify, sessions, order, search, checklists, route: qr.route, scan: qr.scan, op: qr.op, install: { render: login.renderInstall, on: login.on } };
const WORKER = { shift, task, notify, sessions, order, scan: qr.scan, op: qr.op, install: { render: login.renderInstall, on: login.on } };

function route() {
  const h = (location.hash || '#/').slice(2).split('?')[0];
  const [name, ...params] = h.split('/');
  const s = session.get();
  if (name === 'install') return { name, view: OWNER.install, params };
  if (!s) return { name: 'login', view: { render: login.renderLogin, on: login.on, onSubmit: login.onSubmit, mount: login.mountLogin }, params };
  const role = (s.me && s.me.role) || s.role;
  const table = role === 'worker' ? WORKER : OWNER;
  const home = role === 'worker' ? 'shift' : 'today';
  const view = table[name] || table[home];
  return { name: table[name] ? name : home, view, params };
}

let lastRoute = '';

function render() {
  const r = route();
  const key = r.name + '/' + r.params.join('/');
  /* Сохраняем набранный текст и фокус: фоновое обновление не должно
     стирать недописанный комментарий. */
  const a = document.activeElement;
  const keep = a && root.contains(a) && (a.id || a.dataset.bind)
    ? { id: a.id, bind: a.dataset.bind, value: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
  const typed = {};
  root.querySelectorAll('#cmt, #shift-text').forEach((el) => { if (el.value) typed[el.id] = el.value; });

  root.classList.toggle('still', key === lastRoute);
  const toast = store.toast ? `<div class="toast ${store.toast.kind}" role="status">${store.toast.kind === 'wait' ? '<i class="spinner" aria-hidden="true"></i>' : ''}${esc(store.toast.text)}</div>` : '';
  const demo = store.isDemo && session.get() ? '<div class="demo-flag">ДЕМО</div>' : '';
  const waiting = session.get() ? store.outboxSize : 0;
  const outbox = waiting ? ob.chip(waiting, store.sending) + (store.ui.outboxOpen ? ob.sheet(ob.outbox.list(), store.sending, (ob.outbox.list()[0] || {}).err) : '') : '';
  root.classList.toggle('has-ob', !!waiting);
  const photo = store.ui.photoOpen ? viewer(store.ui.photoOpen) : '';
  root.innerHTML = r.view.render(r.params) + outbox + photo + toast + demo;
  if (key !== lastRoute) window.scrollTo(0, 0);
  lastRoute = key;

  Object.keys(typed).forEach((id) => { const el = root.querySelector('#' + id); if (el) el.value = typed[id]; });
  if (keep) {
    const el = keep.id ? root.querySelector('#' + CSS.escape(keep.id)) : root.querySelector(`[data-bind="${keep.bind}"]`);
    if (el) {
      if (keep.value != null && !keep.bind) el.value = keep.value;
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(keep.s, keep.e); } catch (e) {}
    }
  }
  if (r.view.mount) r.view.mount(root, r.params);
  applyBusy();
  updateSpin();
  if (reloadWanted && !reloadTimer) reloadTimer = setTimeout(() => { reloadTimer = 0; if (reloadWanted) reloadIfIdle(); }, 1500);
  const pending = (store.data && store.data.pending) || [];
  setBadge(store.me && store.me.role === 'owner' ? pending.length : 0);
}

/* ------------------------------------------------------------ события */
/* Кнопка, чьё действие идёт к серверу, сразу получает крутилку и перестаёт
   нажиматься — пока сервер не ответит. Жалоба 29.09: пять секунд ничего не
   видно, и хочется нажать ещё раз (а второе нажатие — это вторая задача).
   Экран за это время может перерисоваться, поэтому помним не саму кнопку,
   а её «адрес»: действие + данные, и после каждой отрисовки отмечаем заново. */
/* Нажатия, общие для всех экранов: «Исходящие». */
const GLOBAL = {
  'ob-open': () => { store.ui.outboxOpen = true; store.emit(); },
  'ob-close': () => { store.ui.outboxOpen = false; store.emit(); },
  'ob-send': () => store.sendOutbox(),
  'ph-open': (el) => { store.ui.photoOpen = el.dataset.id; store.emit(); },
  'ph-close': () => { store.ui.photoOpen = null; store.emit(); },
  'ob-drop': (el) => {
    ob.outbox.remove(el.dataset.cid);
    if (!ob.outbox.size) { store.ui.outboxOpen = false; store.refresh(true); }
    store.say('Убрал из «Исходящих»');
  },
};

const busy = new Set();
const keyOf = (el) => el.dataset.act + '|' + Object.keys(el.dataset).filter((k) => k !== 'act').sort()
  .map((k) => k + '=' + el.dataset[k]).join('&');
function applyBusy() {
  if (!busy.size) return;
  root.querySelectorAll('[data-act]').forEach((el) => {
    if (busy.has(keyOf(el))) { el.classList.add('busy'); el.setAttribute('aria-busy', 'true'); }
  });
}
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  const r = route();
  const fn = GLOBAL[el.dataset.act] || (r.view.on || {})[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== 'A') e.preventDefault();
  if (el.classList.contains('busy')) return;
  const out = fn(el, e);
  if (out && typeof out.then === 'function') {
    const k = keyOf(el);
    busy.add(k); el.classList.add('busy');
    out.catch(() => {}).finally(() => { busy.delete(k); render(); });
  }
});
root.addEventListener('input', (e) => {
  const b = e.target.dataset && e.target.dataset.bind;
  if (b && store.ui.draft && b in store.ui.draft) store.ui.draft[b] = e.target.value;
});
root.addEventListener('change', (e) => {
  const name = e.target.dataset && e.target.dataset.actChange;
  if (!name) return;
  const fn = (route().view.onChange || {})[name];
  if (fn) fn(e.target, e);
});
root.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = (route().view.onSubmit || {})[f.dataset.form];
  if (!fn) return;
  const btn = f.querySelector('[type="submit"]');
  if (btn && btn.classList.contains('busy')) return;
  const out = fn(f, e);
  if (btn && out && typeof out.then === 'function') {
    btn.classList.add('busy'); btn.disabled = true;
    out.catch(() => {}).finally(() => { btn.classList.remove('busy'); btn.disabled = false; });
  }
});

window.addEventListener('hashchange', () => {
  /* Уходя с экрана новой задачи без сохранения, черновик не храним. */
  if (!location.hash.startsWith('#/new')) store.ui.draft = null;
  if (!location.hash.startsWith('#/plan')) { store.ui.planSel = null; store.ui.planScroll = null; }
  if (!location.hash.startsWith('#/scan')) { store.ui.scanMsg = ''; store.ui.scanErr = false; }
  render();
  if (reloadWanted) reloadIfIdle();
});
store.sub(render);

/* Свежие данные: при открытии, при возврате в приложение и раз в минуту,
   пока экран на виду. */
document.addEventListener('visibilitychange', () => { if (!document.hidden && session.get()) store.refresh(true); });
setInterval(() => { if (!document.hidden && session.get()) store.refresh(true); }, 60000);
/* Сеть вернулась — сразу отправить то, что ждёт. */
/* Таймер на карточке операции («в работе 1 ч 25 мин») — раз в полминуты. */
setInterval(() => { if (!document.hidden && session.get() && /^#\/(shift|today)?$|^$/.test(location.hash) && !document.activeElement?.matches('textarea,input')) render(); }, 30000);
window.addEventListener('online', () => { if (session.get()) store.refresh(true); });

/* Новая версия приложения. Код лежит в телефоне и открывается сразу, без
   сети; телефон сам проверяет, не вышло ли обновление, и скачивает его в
   фоне. Как скачал — перезапускаемся, но только когда человек ничего не
   набирает и не заполняет: иначе — при следующем сворачивании. */
let reloadWanted = false, reloadTimer = 0;
const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
function reloadIfIdle() {
  const a = document.activeElement;
  const typing = a && a.matches && a.matches('input,textarea') && a.value;
  const busyForm = location.hash.startsWith('#/new') || location.hash.startsWith('#/scan') || store.ui.shiftForm || store.ui.moveCal || store.sending || store.inflight;
  if (!busyForm && (document.hidden || !typing)) { reloadWanted = false; location.reload(); }
}
let lastCheck = Date.now();
document.addEventListener('visibilitychange', () => {
  if (reloadWanted) { reloadIfIdle(); return; }
  if (!document.hidden && Date.now() - lastCheck > 60000 && navigator.serviceWorker) {
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  }
});

/* Нажатие на уведомление, когда приложение уже открыто. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;         // первая установка — перезапуск не нужен
    reloadWanted = true;
    reloadIfIdle();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open' && e.data.url) { location.hash = e.data.url.replace(/^.*#/, '#'); store.refresh(true); }
    if (e.data && e.data.type === 'push') store.refresh(true);
  });
}

store.restore();
render();
if (session.get()) store.refresh(!!store.data);
