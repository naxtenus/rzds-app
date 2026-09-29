/* Чек-листы перед «Начал» — по станку. Владелец пишет пункты здесь (или
   в листе «Чек-листы»), рабочий перед «Начал» отмечает каждый. «Все
   станки» — пункты, которые спрашиваются везде (например, «очки надеты»). */

import { esc, icon } from '../util.js';
import { store } from '../store.js';

const ALL = 'все';

export function render() {
  const d = store.data || {};
  const c = d.checklists || {};
  const res = [{ code: ALL, name: 'Все станки' }].concat(d.resources || []);
  const sel = store.ui.clRes || ALL;
  if (!store.ui.clDraft || store.ui.clDraft.res !== sel) store.ui.clDraft = { res: sel, items: (c[sel] || []).slice() };
  const dr = store.ui.clDraft;
  const dirty = JSON.stringify(dr.items) !== JSON.stringify(c[sel] || []);
  return `<main class="screen with-cta">
    <div class="topbar"><a class="link-btn" href="#/notify">${icon.back(20)} Назад</a></div>
    <h1 class="title" style="font-size:24px;margin:0">Чек-листы перед «Начал»</h1>
    <p class="small muted" style="margin:0">Рабочий не сможет нажать «Начал», пока не отметит все пункты своего станка. В «Факт» ляжет, сколько отмечено.</p>
    <div class="chips">${res.map((r) => `<button class="chip${r.code === sel ? ' on' : ''}" data-act="cl-res" data-v="${esc(r.code)}" aria-pressed="${r.code === sel}">
      ${esc(r.code === ALL ? r.name : r.code)}${(c[r.code] || []).length ? ` · ${(c[r.code] || []).length}` : ''}</button>`).join('')}</div>
    <div class="list">${dr.items.map((t, i) => `<div class="kv"><span class="small muted strong" style="width:18px">${i + 1}</span>
      <span class="v" style="flex:1">${esc(t)}</span>
      <button class="icon-btn" data-act="cl-del" data-i="${i}" aria-label="Убрать пункт" style="width:36px;height:36px">${icon.close(16)}</button></div>`).join('')
      || '<div class="empty" style="padding:14px">Пунктов нет — «Начал» нажимается сразу.</div>'}</div>
    <div class="input-row">
      <label class="sr" for="cl-new">Новый пункт</label>
      <input id="cl-new" type="text" placeholder="Например: проверить вылет фрезы" enterkeyhint="done" autocomplete="off">
      <button class="icon-btn green" data-act="cl-add" aria-label="Добавить">${icon.plus(18)}</button>
    </div>
  </main>
  <div class="cta"><div class="in">
    <button class="btn primary" data-act="cl-save" style="flex:1" ${dirty ? '' : 'disabled'}>${dirty ? 'Сохранить чек-лист' : 'Сохранено'}</button>
  </div></div>`;
}

export function mount(root) {
  const inp = root.querySelector('#cl-new');
  if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); on['cl-add'](); } };
}

export const on = {
  'cl-res': (el) => { store.ui.clRes = el.dataset.v; store.ui.clDraft = null; store.emit(); },
  'cl-add': () => {
    const inp = document.querySelector('#cl-new');
    const t = (inp && inp.value || '').trim();
    if (!t) { inp && inp.focus(); return; }
    store.ui.clDraft.items.push(t);
    store.emit();
    setTimeout(() => document.querySelector('#cl-new')?.focus(), 30);
  },
  'cl-del': (el) => { store.ui.clDraft.items.splice(Number(el.dataset.i), 1); store.emit(); },
  'cl-save': () => {
    const dr = store.ui.clDraft;
    const items = dr.items.slice();
    return store.act('checklistSave', { res: dr.res, items }, (d) => {
      d.checklists = d.checklists || {};
      if (items.length) d.checklists[dr.res] = items; else delete d.checklists[dr.res];
    }, 'Чек-лист сохранён');
  },
};
