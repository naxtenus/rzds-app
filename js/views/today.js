/* Сегодня — главный экран владельца. Сверху то, что ждёт его решения,
   ниже — что делает каждый станок прямо сейчас. */

import { esc, icon, dayTitle, hhmm, ago, sameDay } from '../util.js';
import { tabbar, opL, refreshBtn, reloadData } from '../ui.js';
import { store } from '../store.js';
import { thumbs } from '../photo.js';

const opByCode = (d, c) => (d.ops || []).find((o) => o.code === c);

export const kindPill = (r) => ({
  problem: '<span class="pill red">Есть проблема</span>',
  late: `<span class="pill bronze">+${Math.round((r.shiftMin || 0))} мин</span>`,
  done: '<span class="pill green">Закончил</span>',
  comment: '<span class="pill gray">Комментарий</span>',
  start: '<span class="pill green">Начал</span>',
  move: '<span class="pill bronze">Просит перенос</span>',
  scrap: '<span class="pill red">Брак</span>',
  pause: '<span class="pill bronze">Пауза</span>',
  resume: '<span class="pill green">Продолжил</span>',
}[r.kind] || '');

export const decisionButtons = (r) => {
  if (r.kind === 'problem') return ['Отметить в плане', 'Не отмечать'];
  if (r.kind === 'late') return ['Принять сдвиг', 'Оставить план'];
  if (r.kind === 'done' || r.kind === 'start') return ['Принять', 'Не принимать'];
  if (r.kind === 'move') return ['Перенести', 'Не переносить'];
  if (r.kind === 'scrap') return ['Записать', 'Не записывать'];
  if (r.kind === 'pause') return ['Отметить паузу', 'Не отмечать'];
  if (r.kind === 'resume') return ['Принять', 'Не принимать'];
  return ['Прочитано', ''];
};

/* Простой станка (04.10.2026, просьба Павла): «Станок стоит» и «Снова
   работает» прямо с плитки станка. В плане это строка-простой — та же, что
   ставит пульт у станка: идущая работа встаёт на паузу и после продолжается,
   всё зависимое сдвигается. Время — момент нажатия (без связи нажатие ждёт в
   «Исходящих» и уходит со своим временем). */
const STOP_WHY = ['Поломка станка', 'Поломка инструмента', 'Обслуживание', 'Нет заготовки', 'Нет электричества или воздуха', 'Другое'];
const STOP_LONG = [{ v: '', t: 'Не знаю' }, { v: '0.5', t: '30 мин' }, { v: '1', t: '1 ч' }, { v: '2', t: '2 ч' }, { v: '4', t: '4 ч' }, { v: 'утро', t: 'До завтра' }];
const p2 = (n) => String(n).padStart(2, '0');
const localIso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const stopOf = (d, code) => (d.stops || []).find((s) => s.active && s.machine === code) || null;
export const stopFor = (from, now) => {
  const m = Math.max(0, Math.round((now - new Date(from)) / 60000)), h = Math.floor(m / 60);
  return h ? h + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '') : m + ' мин';
};
function stopForm(d) {
  const code = store.ui.stopFor;
  if (!code) return '';
  const u = store.ui.stopDraft || (store.ui.stopDraft = {});
  return `<div class="info red stopform" style="display:flex;flex-direction:column;gap:10px;align-items:stretch">
    <div class="strong" style="font-size:16px">${esc(code)} стоит — почему?</div>
    <div class="chips">${STOP_WHY.map((w) => `<button class="chip${u.why === w ? ' on' : ''}" data-act="stop-why" data-v="${esc(w)}" aria-pressed="${u.why === w}">${esc(w)}</button>`).join('')}</div>
    <input id="stop-text" class="field-in" placeholder="Что случилось (можно не писать)" value="${esc(u.text || '')}" autocomplete="off">
    <div class="small strong">Сколько примерно простоит</div>
    <div class="chips">${STOP_LONG.map((x) => `<button class="chip${(u.long || '') === x.v ? ' on' : ''}" data-act="stop-long" data-v="${x.v}">${x.t}</button>`).join('')}</div>
    <div class="btns"><button class="btn danger on" data-act="stop-send" data-res="${esc(code)}">■ Станок стоит</button>
      <button class="btn" data-act="stop-cancel">Отмена</button></div>
  </div>`;
}

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
          <div class="strong" style="font-size:15px">${esc(r.text)}</div>${thumbs(r.photos)}
          ${r.text && r.kind !== 'start' ? `<a class="link-btn to-task" style="color:inherit;opacity:.85" href="#/new?text=${encodeURIComponent(r.text + (r.who ? ' (' + r.who + ')' : ''))}${o.order ? '&order=' + encodeURIComponent(o.order) : ''}">${icon.plus(14)} Сделать задачей</a>` : ''}
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
    const st = stopOf(d, res.code);
    const stopBtn = st
      ? `<button class="btn tile-stop go" data-act="stop-go" data-res="${esc(res.code)}">▶ Снова работает</button>`
      : `<button class="btn tile-stop" data-act="stop-open" data-res="${esc(res.code)}">■ Станок стоит</button>`;
    if (st) {
      return `<div class="tile-wrap"><button class="tile problem" data-act="open-plan" data-op="${o ? esc(o.code) : ''}">
      <div class="row-between" style="align-items:center;width:100%"><span class="name">${esc(res.code)}</span><span class="dot" style="background:#C62828"></span></div>
      <div class="small strong" style="color:#B3261E">Стоит · ${esc(st.reason)}</div>
      <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${esc(st.comment || (o ? o.order + ' · на паузе' : 'простой'))}</div>
      <div class="small muted">с ${hhmm(st.start)} · ${stopFor(st.start, now)}${st.until ? ' · ждём до ' + hhmm(st.until) : ''}</div>
    </button>${stopBtn}</div>`;
    }
    const L = o ? opL(o) : { dot: '#9A9F98', text: 'Свободен', color: '#5A5F58' };
    let pct = o ? (o.pct || 0) : 0;
    if (o && o.status === 'в работе' && !o.pct) {
      pct = Math.max(0, Math.min(100, Math.round((now - new Date(o.start)) / (new Date(o.end) - new Date(o.start)) * 100)));
    }
    const sub = o ? `${esc(o.order)} · ${esc(o.op.toLowerCase())}` : (next ? `${esc(next.order)} · с ${hhmm(next.start)}` : 'Нет задания');
    const time = o ? (o.status === 'проблема' ? 'стоит с ' + hhmm(o.problemAt || o.start) : 'до ' + hhmm(o.end)) : (next ? 'простой до ' + hhmm(next.start) : '—');
    return `<div class="tile-wrap"><button class="tile${o && o.status === 'проблема' ? ' problem' : ''}" data-act="open-plan" data-op="${o ? esc(o.code) : ''}">
      <div class="row-between" style="align-items:center;width:100%"><span class="name">${esc(res.code)}</span><span class="dot" style="background:${L.dot}"></span></div>
      <div class="small strong" style="color:${L.color}">${L.text}</div>
      <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${sub}</div>
      <div class="bar" style="width:100%"><i style="width:${pct}%;background:${L.dot}"></i></div>
      <div class="small muted">${time}</div>
    </button>${stopBtn}</div>`;
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
      <div class="head-btns"><a class="icon-btn" href="#/scan" aria-label="Сканировать QR-код детали">${icon.qr(22)}</a><a class="icon-btn" href="#/search" aria-label="Поиск">${icon.search(22)}</a>${refreshBtn()}
      <a class="icon-btn" href="#/notify" aria-label="Уведомления${bells ? ', ' + bells + ' новых' : ''}">${icon.bell()}${bells ? `<span class="badge">${bells}</span>` : ''}</a></div>
    </header>
    ${statusLine()}
    ${decide}
    <section aria-label="Станки и участки" style="display:flex;flex-direction:column;gap:10px">
      <div class="row-between"><h2 class="h2">Станки и участки</h2><a class="link-btn" href="#/plan" style="font-size:14px;padding:8px 0">Весь план</a></div>
      ${stopForm(d)}
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
  'stop-open': (el) => {
    store.ui.stopFor = el.dataset.res; store.ui.stopDraft = { why: '', long: '', text: '' };
    store.emit();
    setTimeout(() => { const f = document.querySelector('.stopform'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30);
  },
  'stop-cancel': () => { store.ui.stopFor = null; store.emit(); },
  'stop-why': (el) => { const u = store.ui.stopDraft; u.text = document.querySelector('#stop-text')?.value || ''; u.why = u.why === el.dataset.v ? '' : el.dataset.v; store.emit(); },
  'stop-long': (el) => { const u = store.ui.stopDraft; u.text = document.querySelector('#stop-text')?.value || ''; u.long = el.dataset.v; store.emit(); },
  'stop-send': async (el) => {
    const u = store.ui.stopDraft || {};
    const text = (document.querySelector('#stop-text')?.value || '').trim();
    const why = u.why || (text ? 'Другое' : '');
    if (!why) { store.say('Выберите причину простоя', 'error'); return; }
    const machine = el.dataset.res, now = new Date();
    const p = { machine, on: true, reason: why, text, at: localIso(now), ms: now.getTime() };
    if (u.long === 'утро') { const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0); p.until = localIso(t); }
    else if (u.long) p.hours = Number(u.long);
    store.ui.stopFor = null;
    await store.act('downtime', p, (d) => {
      (d.stops = d.stops || []).unshift({ id: 'новый', machine, reason: why, comment: text, start: now.toISOString(), finish: '', active: true, until: p.until ? new Date(p.until).toISOString() : '' });
    }, 'Простой отмечен в плане');
  },
  'stop-go': async (el) => {
    const machine = el.dataset.res, now = new Date();
    await store.act('downtime', { machine, on: false, at: localIso(now), ms: now.getTime() }, (d) => {
      const s = (d.stops || []).find((x) => x.active && x.machine === machine);
      if (s) { s.active = false; s.finish = now.toISOString(); }
    }, 'Станок снова работает — простой закрыт');
  },
  'refresh': () => reloadData(),
  'reload-data': () => reloadData(),
};
