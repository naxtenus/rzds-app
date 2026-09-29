/* «Мои входы» — на каких телефонах открыт вход в приложение.

   Раньше отключить вход можно было только в таблице, в листе «Входы
   приложения», и только зная, какая строка чья. Теперь — здесь: телефон,
   когда вошёл, когда был последний раз, и кнопка «Отключить». Владелец
   видит входы всех, рабочий — свои. Отключённый вход перестаёт работать
   сразу. Вход, которым не пользовались 90 дней, сервер выключает сам. */

import { esc, icon, ago } from '../util.js';
import { store } from '../store.js';
import { api } from '../api.js';

const device = (ua) => {
  const u = String(ua || '');
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Macintosh/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Телефон';
  const br = /YaBrowser/.test(u) ? 'Яндекс Браузер' : /CriOS|Chrome/.test(u) ? 'Chrome' : /FxiOS|Firefox/.test(u) ? 'Firefox'
    : /Safari/.test(u) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
};
const day = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
};

function load(force) {
  const st = store.ui.sess;
  if (!force && st && (st.loading || Date.now() - (st.at || 0) < 30000)) return;
  store.ui.sess = Object.assign({}, st, { loading: true, error: '' });
  api('sessions').then((r) => { store.ui.sess = { list: r.sessions || [], at: Date.now() }; store.emit(); })
    .catch((e) => {
      if (e.code === 'auth') { store.logout(); return; }
      store.ui.sess = Object.assign({}, store.ui.sess, { loading: false, error: e.message, at: Date.now() }); store.emit();
    });
}

const row = (s) => `<div class="sess${s.active ? '' : ' off'}">
    <span class="ic">${/iPhone|Android|iPad|Телефон/.test(device(s.device)) ? icon.phone(22) : icon.today(22)}</span>
    <div style="flex:1;min-width:0">
      <div class="strong" style="font-size:15px">${esc(device(s.device))}${s.me ? ' <span class="me">· этот телефон</span>' : ''}</div>
      <div class="small muted">${s.active ? `вошёл ${day(s.since)} · был ${s.seen ? esc(ago(s.seen)) : '—'}` : 'отключён'}</div>
    </div>
    ${s.active ? `<button class="btn ghost" data-act="revoke" data-row="${s.row}" data-me="${s.me ? 1 : ''}" style="height:40px;padding:0 10px;color:#B3261E">Отключить</button>` : ''}
  </div>`;

export function render() {
  const st = store.ui.sess || {};
  const list = st.list || [];
  const owner = store.me && store.me.role === 'owner';
  const groups = [];
  list.forEach((s) => {
    const key = s.role === 'owner' ? 'Вы (владелец)' : s.name;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, items: [] });
    g.items.push(s);
  });
  return `<main class="screen no-tabs">
    <div class="topbar"><a class="link-btn" href="#/notify">${icon.back(20)} Назад</a></div>
    <h1 class="title" style="font-size:24px;margin:0">${owner ? 'Входы в приложение' : 'Мои входы'}</h1>
    <p class="small muted" style="margin:0">Потеряли телефон или отдали другому — отключите вход здесь, он перестанет работать сразу. Вход, которым не пользовались 90 дней, отключается сам.</p>
    ${st.error ? `<div class="info red">${icon.alert(20)}<span>${esc(st.error)} <button class="link-btn" data-act="sess-reload" style="padding:0 4px;color:inherit;text-decoration:underline">Повторить</button></span></div>` : ''}
    ${!st.list && !st.error ? `<div class="status-line">${icon.refresh(16).replace('<svg', '<svg class="spin"')} Загружаю…</div>` : ''}
    ${st.list && !list.length ? '<div class="empty">Входов пока нет</div>' : ''}
    ${groups.map((g) => `<section style="display:flex;flex-direction:column;gap:8px">
      ${owner ? `<h2 class="section-title">${esc(g.key)}</h2>` : ''}
      <div class="list">${g.items.map(row).join('')}</div></section>`).join('')}
  </main>`;
}

export function mount() { load(false); }

export const on = {
  'sess-reload': () => load(true),
  'revoke': async (el) => {
    const me = !!el.dataset.me;
    if (!confirm(me ? 'Отключить вход на ЭТОМ телефоне? Для входа понадобится новый код.' : 'Отключить этот вход? На том телефоне приложение попросит новый код.')) return;
    try {
      const r = await api('revoke', { row: Number(el.dataset.row) });
      if (me) { store.logout(); return; }
      store.ui.sess = { list: r.sessions || [], at: Date.now() };
      store.say('Вход отключён');
    } catch (e) {
      if (e.code === 'auth') { store.logout(); return; }
      store.say(e.message, 'error');
    }
  },
};
