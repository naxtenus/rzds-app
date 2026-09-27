/* РЗДС — приложение для телефона. Точка входа: маршруты, отрисовка,
   обработка нажатий, фоновое обновление. */

import { store } from './store.js';
import { session } from './api.js';
import { setBadge } from './push.js';
import { esc } from './util.js';
import * as today from './views/today.js';
import * as plan from './views/plan.js';
import * as tasks from './views/tasks.js';
import * as task from './views/task.js';
import * as newtask from './views/newtask.js';
import * as replies from './views/replies.js';
import * as notify from './views/notify.js';
import * as shift from './views/shift.js';
import * as login from './views/login.js';

const root = document.getElementById('app');

const OWNER = { today, plan, tasks, task, new: newtask, replies, notify, install: { render: login.renderInstall, on: login.on } };
const WORKER = { shift, task, notify, install: { render: login.renderInstall, on: login.on } };

function route() {
  const h = (location.hash || '#/').slice(2).split('?')[0];
  const [name, ...params] = h.split('/');
  const s = session.get();
  if (name === 'install') return { name, view: OWNER.install, params };
  if (!s) return { name: 'login', view: { render: login.renderLogin, on: login.on, onSubmit: login.onSubmit }, params };
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
  const toast = store.toast ? `<div class="toast${store.toast.kind === 'error' ? ' error' : ''}" role="status">${esc(store.toast.text)}</div>` : '';
  const demo = store.isDemo && session.get() ? '<div class="demo-flag">ДЕМО</div>' : '';
  root.innerHTML = r.view.render(r.params) + toast + demo;
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
  const pending = (store.data && store.data.pending) || [];
  setBadge(store.me && store.me.role === 'owner' ? pending.length : 0);
}

/* ------------------------------------------------------------ события */
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  const r = route();
  const fn = (r.view.on || {})[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== 'A') e.preventDefault();
  fn(el, e);
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
  if (fn) fn(f, e);
});

window.addEventListener('hashchange', () => {
  /* Уходя с экрана новой задачи без сохранения, черновик не храним. */
  if (!location.hash.startsWith('#/new')) store.ui.draft = null;
  if (!location.hash.startsWith('#/plan')) { store.ui.planSel = null; store.ui.planScroll = null; }
  render();
});
store.sub(render);

/* Свежие данные: при открытии, при возврате в приложение и раз в минуту,
   пока экран на виду. */
document.addEventListener('visibilitychange', () => { if (!document.hidden && session.get()) store.refresh(true); });
setInterval(() => { if (!document.hidden && session.get()) store.refresh(true); }, 60000);

/* Нажатие на уведомление, когда приложение уже открыто. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open' && e.data.url) { location.hash = e.data.url.replace(/^.*#/, '#'); store.refresh(true); }
    if (e.data && e.data.type === 'push') store.refresh(true);
  });
}

store.restore();
render();
if (session.get()) store.refresh(!!store.data);
