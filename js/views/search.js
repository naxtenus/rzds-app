/* Поиск по задачам, заказам и операциям — всё, что уже есть в телефоне,
   без запроса к серверу: ищется мгновенно и без связи. Регистр и «ё»
   не важны; несколько слов — должны найтись все. */

import { esc, icon, dueText, hhmm, startOfDay } from '../util.js';
import { store } from '../store.js';
import { opL, weightLook, personName } from '../ui.js';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

export function find(d, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return { tasks: [], orders: [], ops: [] };
  const hit = (...parts) => { const t = norm(parts.join(' ')); return words.every((w) => t.includes(w)); };
  const tasks = (d.tasks || []).filter((t) => t.state !== 'убрана' &&
    hit(t.text, t.detail, t.to, personName(d, t.to), t.order, '№' + t.n, (t.comments || []).map((c) => c.text).join(' ')));
  const orders = (d.orders || []).filter((o) => hit(o.code, o.name));
  const ops = (d.ops || []).filter((o) => hit(o.code, o.order, o.op, o.part, o.res, o.problem))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  return { tasks: tasks.slice(0, 20), orders: orders.slice(0, 10), ops: ops.slice(0, 20) };
}

export function render() {
  const d = store.data || {};
  const q = store.ui.q || '';
  const r = find(d, q);
  const none = q.trim() && !r.tasks.length && !r.orders.length && !r.ops.length;
  const dayOff = (t) => Math.round((startOfDay(new Date(t)) - startOfDay(new Date())) / 864e5);
  return `<main class="screen no-tabs">
    <div class="topbar"><a class="link-btn" href="#/today" data-act="s-back">${icon.back(20)} Назад</a></div>
    <label class="search-box">${icon.search(20)}
      <input id="q" type="search" data-bind="q" value="${esc(q)}" placeholder="Задача, заказ, операция, станок…" autocomplete="off" enterkeyhint="search" aria-label="Поиск">
    </label>
    ${!q.trim() ? '<div class="small muted" style="padding:0 4px">Ищет по задачам и переписке, заказам, операциям и станкам — прямо в телефоне, даже без связи.</div>' : ''}
    ${none ? '<div class="card empty">Ничего не нашлось</div>' : ''}
    ${r.tasks.length ? `<section style="display:flex;flex-direction:column;gap:8px"><h2 class="section-title">Задачи · ${r.tasks.length}</h2>
      <div class="list">${r.tasks.map((t) => {
        const L = weightLook[t.weight] || weightLook['обычная'];
        return `<a class="kv" href="#/task/${t.n}" style="text-decoration:none;color:inherit"><div style="flex:1;min-width:0">
          <div class="strong"${t.state === 'закрыта' ? ' style="text-decoration:line-through;color:#8C918A"' : ''}>${esc(t.text)}</div>
          <div class="small muted">№${t.n} · ${esc(t.to ? personName(d, t.to) : 'мне')} · ${esc(dueText(t.due))}</div></div>
          <span class="pill" style="background:${L.bg};color:${L.fg}">${L.label}</span></a>`;
      }).join('')}</div></section>` : ''}
    ${r.orders.length ? `<section style="display:flex;flex-direction:column;gap:8px"><h2 class="section-title">Заказы · ${r.orders.length}</h2>
      <div class="list">${r.orders.map((o) => `<a class="kv" href="#/order/${encodeURIComponent(o.code)}" style="text-decoration:none;color:inherit">
        <div style="flex:1;min-width:0"><div class="strong">${esc(o.code)}</div><div class="small muted">${esc(o.name || '')}${o.due ? ' · срок ' + esc(dueText(o.due, false)) : ''}</div></div>${icon.next(18)}</a>`).join('')}</div></section>` : ''}
    ${r.ops.length ? `<section style="display:flex;flex-direction:column;gap:8px"><h2 class="section-title">Операции · ${r.ops.length}</h2>
      <div class="list">${r.ops.map((o) => {
        const L = opL(o);
        return `<button class="kv" data-act="s-op" data-op="${esc(o.code)}" data-off="${dayOff(o.start)}" style="width:100%;border:none;background:none;text-align:left">
          <div style="flex:1;min-width:0"><div class="strong">${esc(o.order)} · ${esc(o.op)}</div>
          <div class="small muted">${esc(o.res)} · ${esc(dueText(o.start, false))} ${hhmm(o.start)}</div></div>
          <span class="small strong" style="color:${L.color}">${L.text}</span></button>`;
      }).join('')}</div></section>` : ''}
  </main>`;
}

export function mount(root) {
  const inp = root.querySelector('#q');
  if (!inp) return;
  if (document.activeElement !== inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  inp.oninput = () => { store.ui.q = inp.value; store.emit(); };
}

export const on = {
  's-back': (el, e) => { if (history.length > 1) { e.preventDefault(); history.back(); } },
  's-op': (el) => {
    store.ui.planView = 'day';
    store.ui.planDay = Number(el.dataset.off) || 0;
    store.ui.planSel = el.dataset.op;
    store.ui.planScroll = null;
    location.hash = '#/plan';
  },
};
