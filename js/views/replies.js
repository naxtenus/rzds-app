/* Ответы со смены. Каждая отметка рабочего, которая меняет план, ждёт
   решения владельца — так устроен планировщик. Здесь видно, что именно
   изменится, и решение принимается одним нажатием. */

import { esc, icon, hhmm, ago } from '../util.js';
import { tabbar } from '../ui.js';
import { store } from '../store.js';
import { thumbs } from '../photo.js';
import { kindPill, decisionButtons, on as todayOn } from './today.js';

/* «Задача из сообщения»: текст со смены → черновик новой задачи к тому же заказу. */
const toTask = (r, o) => '#/new?text=' + encodeURIComponent(r.text + (r.who ? ' (' + r.who + ')' : '')) + (o.order ? '&order=' + encodeURIComponent(o.order) : '');

export function render() {
  const d = store.data || {};
  const mode = store.ui.repMode || 'wait';
  const pending = d.pending || [];
  const decided = d.decided || [];
  const op = (c) => (d.ops || []).find((o) => o.code === c) || {};

  const card = (r, open) => {
    const o = op(r.opCode);
    const [yes, no] = decisionButtons(r);
    return `<article class="card" style="display:flex;flex-direction:column;gap:10px;${open && r.kind === 'problem' ? 'border-color:var(--red-line)' : ''}">
      <div class="row-between" style="align-items:center"><span class="small muted strong">${esc(r.who)} · ${hhmm(r.at)}</span>${kindPill(r)}</div>
      <div><div class="strong" style="font-size:18px">${esc(o.order || r.opCode)}</div><div class="small muted">${esc(o.op || '')}${o.res ? ' · ' + esc(o.res) : ''}</div></div>
      ${r.text ? `<div style="padding:10px 12px;border-radius:14px;background:#F6F3EC;font-size:15px">«${esc(r.text)}»</div>` : ''}
      ${thumbs(r.photos)}
      ${r.text && r.kind !== 'start' ? `<a class="link-btn to-task" href="${toTask(r, o)}">${icon.plus(14)} Сделать задачей</a>` : ''}
      ${open ? `${r.impact ? `<div class="small" style="display:flex;gap:8px;color:var(--bronze-dd)">${icon.plan(16)}<span>${esc(r.impact)}</span></div>` : ''}
        <div class="btns">
          <button class="btn primary" data-act="decide" data-id="${esc(r.id)}" data-yes="1">${yes}</button>
          ${no ? `<button class="btn" data-act="decide" data-id="${esc(r.id)}" data-yes="0">${no}</button>` : ''}
        </div>`
      : `<div class="row-between" style="align-items:center;padding:8px 12px;border-radius:14px;background:var(--green-l)">
          <span class="small strong" style="color:var(--green-d)">${esc(r.result || 'разобрано')}${r.decidedAt ? ' · ' + ago(r.decidedAt) : ''}</span>
          ${r.kind !== 'start' ? `<button class="link-btn" data-act="undo" data-id="${esc(r.id)}" style="font-size:14px;padding:6px;color:var(--green-d);text-decoration:underline">Отменить</button>` : ''}
        </div>`}
    </article>`;
  };

  const list = mode === 'wait' ? pending : decided;
  return `<main class="screen">
    <header><h1 class="title" style="margin:0">Ответы</h1>
      <div class="sub">${pending.length ? 'Ждут вашего решения: ' + pending.length : 'Все ответы разобраны'}</div></header>
    <div class="segment" role="tablist" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <button role="tab" aria-selected="${mode === 'wait'}" class="${mode === 'wait' ? 'on' : ''}" data-act="rmode" data-m="wait">Ждут${pending.length ? ' · ' + pending.length : ''}</button>
      <button role="tab" aria-selected="${mode === 'done'}" class="${mode === 'done' ? 'on' : ''}" data-act="rmode" data-m="done">Разобранные</button>
    </div>
    ${list.map((r) => card(r, mode === 'wait')).join('') || `<div class="card empty">${mode === 'wait' ? 'Со смены ничего не ждёт решения' : 'Пока ничего'}</div>`}
  </main>${tabbar('replies', d)}`;
}

export const on = {
  'rmode': (el) => { store.ui.repMode = el.dataset.m; store.emit(); },
  'decide': todayOn.decide,
  'undo': async (el) => {
    const id = el.dataset.id;
    await store.act('undecide', { id }, (d) => {
      const i = d.decided.findIndex((r) => r.id === id);
      if (i >= 0) { const r = d.decided.splice(i, 1)[0]; delete r.result; d.pending.unshift(r); }
    }, 'Вернул в «Ждут»');
  },
};
