/* Сегодня — главный экран владельца. Сверху то, что ждёт его решения,
   ниже — что делает каждый станок прямо сейчас. */

import { esc, icon, dayTitle, hhmm, ago, sameDay } from '../util.js';
import { tabbar, opL } from '../ui.js';
import { store } from '../store.js';

const opByCode = (d, c) => (d.ops || []).find((o) => o.code === c);

export const kindPill = (r) => ({
  problem: '<span class="pill red">Есть проблема</span>',
  late: `<span class="pill bronze">+${Math.round((r.shiftMin || 0))} мин</span>`,
  done: '<span class="pill green">Закончил</span>',
  comment: '<span class="pill gray">Комментарий</span>',
  start: '<span class="pill green">Начал</span>',
  move: '<span class="pill bronze">Просит перенос</span>',
  scrap: '<span class="pill red">Брак</span>',
}[r.kind] || '');

export const decisionButtons = (r) => {
  if (r.kind === 'problem') return ['Отметить в плане', 'Не отмечать'];
  if (r.kind === 'late') return ['Принять сдвиг', 'Оставить план'];
  if (r.kind === 'done' || r.kind === 'start') return ['Принять', 'Не принимать'];
  if (r.kind === 'move') return ['Перенести', 'Не переносить'];
  if (r.kind === 'scrap') return ['Записать', 'Не записывать'];
  return ['Прочитано', ''];
};

export function machineNow(d, res, now) {
  const ops = (d.ops || []).filter((o) => o.res === res.code &&
    (sameDay(o.start, now) || (new Date(o.start) <= now && new Date(o.end) >= now)));
  const cur = ops.find((o) => o.status === 'проблема' || o.status === 'в работе')
    || ops.find((o) => new Date(o.start) <= now && new Date(o.end) > now);
  const next = (d.ops || []).filter((o) => o.res === res.code && new Date(o.start) > now && o.status === 'план')
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  return { cur, next };
}

export function render() {
  const d = store.data || {};
  const now = new Date();
  const pending = d.pending || [];
  const bells = pending.length + (d.tasks || []).filter((t) => t.state === 'открыта' && !t.to && t.due && new Date(t.due) < now).length;

  const decide = pending.length ? `
    <section class="decide" aria-label="Ждут вашего решения">
      <div class="row-between" style="align-items:center">
        <h2 class="h2">Ждут вашего решения</h2><span class="count">${pending.length}</span>
      </div>
      ${pending.slice(0, 3).map((r) => {
        const o = opByCode(d, r.opCode) || {};
        const [yes, no] = decisionButtons(r);
        return `<div class="item">
          <div class="row-between" style="align-items:center">
            <span class="small muted strong">${esc(o.res || '')} · ${esc(o.order || r.opCode)} · ${hhmm(r.at)}</span>${kindPill(r)}
          </div>
          <div class="strong" style="font-size:15px">${esc(r.text)}</div>
          <div class="btns">
            <button class="btn primary" data-act="decide" data-id="${esc(r.id)}" data-yes="1">${yes}</button>
            ${no ? `<button class="btn" data-act="decide" data-id="${esc(r.id)}" data-yes="0">${no}</button>` : ''}
          </div>
        </div>`;
      }).join('')}
      ${pending.length > 3 ? `<a class="btn" href="#/replies" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.5)">Ещё ${pending.length - 3} — открыть все</a>` : ''}
    </section>` : `
    <section class="decide empty">${icon.check(20)} Решений не ждёт ничего</section>`;

  const tiles = (d.resources || []).map((res) => {
    const { cur, next } = machineNow(d, res, now);
    const o = cur || null;
    const L = o ? opL(o) : { dot: '#9A9F98', text: 'Свободен', color: '#5A5F58' };
    let pct = o ? (o.pct || 0) : 0;
    if (o && o.status === 'в работе' && !o.pct) {
      pct = Math.max(0, Math.min(100, Math.round((now - new Date(o.start)) / (new Date(o.end) - new Date(o.start)) * 100)));
    }
    const sub = o ? `${esc(o.order)} · ${esc(o.op.toLowerCase())}` : (next ? `${esc(next.order)} · с ${hhmm(next.start)}` : 'Нет задания');
    const time = o ? (o.status === 'проблема' ? 'стоит с ' + hhmm(o.problemAt || o.start) : 'до ' + hhmm(o.end)) : (next ? 'простой до ' + hhmm(next.start) : '—');
    return `<button class="tile${o && o.status === 'проблема' ? ' problem' : ''}" data-act="open-plan" data-op="${o ? esc(o.code) : ''}">
      <div class="row-between" style="align-items:center;width:100%"><span class="name">${esc(res.code)}</span><span class="dot" style="background:${L.dot}"></span></div>
      <div class="small strong" style="color:${L.color}">${L.text}</div>
      <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${sub}</div>
      <div class="bar" style="width:100%"><i style="width:${pct}%;background:${L.dot}"></i></div>
      <div class="small muted">${time}</div>
    </button>`;
  }).join('');

  const mine = (d.tasks || []).filter((t) => !t.to && t.state === 'открыта' && t.due &&
    (sameDay(t.due, now) || new Date(t.due) < now));

  return `<main class="screen">
    <header class="head">
      <div>
        <div class="eyebrow">РЗДС · План производства</div>
        <h1 class="title">Сегодня</h1>
        <div class="sub">${dayTitle(now)}</div>
      </div>
      <a class="icon-btn" href="#/notify" aria-label="Уведомления${bells ? ', ' + bells + ' новых' : ''}">${icon.bell()}${bells ? `<span class="badge">${bells}</span>` : ''}</a>
    </header>
    ${statusLine()}
    ${decide}
    <section aria-label="Станки и участки" style="display:flex;flex-direction:column;gap:10px">
      <div class="row-between"><h2 class="h2">Станки и участки</h2><a class="link-btn" href="#/plan" style="font-size:14px;padding:8px 0">Весь план</a></div>
      <div class="tiles">${tiles || '<div class="empty">Станки ещё не заведены</div>'}</div>
    </section>
    ${mine.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <div class="row-between"><h2 class="h2">Мои задачи на сегодня</h2><a class="link-btn" href="#/tasks" style="font-size:14px;padding:8px 0">Все</a></div>
      <div class="list">${mine.slice(0, 4).map((t) => `<a class="task" href="#/task/${t.n}" style="text-decoration:none;color:inherit;padding-left:14px">
        <div class="body"><div class="text">${esc(t.text)}</div></div>
        ${icon.next(18)}</a>`).join('')}</div>
    </section>` : ''}
  </main>${tabbar('today', d)}`;
}

export function statusLine() {
  if (store.offline) {
    return `<div class="status-line" role="status">${icon.alert(16)} Нет связи — показаны данные на ${store.syncedAt ? hhmm(store.syncedAt) : '—'}
      <button class="link-btn" data-act="refresh" style="font-size:13px;padding:4px">Повторить</button></div>`;
  }
  if (store.loading && !store.data) return `<div class="status-line">${icon.refresh(16).replace('<svg', '<svg class="spin"')} Загружаю…</div>`;
  return '';
}

export const on = {
  'decide': async (el) => {
    const id = el.dataset.id, yes = el.dataset.yes === '1';
    await store.act('decide', { id, yes }, (d) => {
      const i = d.pending.findIndex((r) => r.id === id);
      if (i >= 0) { const r = d.pending.splice(i, 1)[0]; r.result = yes ? 'принято' : 'план оставлен'; (d.decided = d.decided || []).unshift(r); }
    }, yes ? 'Принято, план пересчитан' : 'План оставлен как был');
  },
  'open-plan': (el) => {
    store.ui.planSel = el.dataset.op || null;
    location.hash = '#/plan';
  },
  'refresh': () => store.refresh(),
};
