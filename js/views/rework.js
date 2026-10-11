/* Доработки за поставщиков (11.10.2026, просьба Павла): «счётчик для начала
   и окончания операции доработки за сторонними поставщиками… считать время
   и вписывать в отчёт за неделю, с правкой постфактум… вписывать вручную,
   без включения счётчика».

   Решено с Павлом: считаем НАШУ работу по браку поставщика; план от неё не
   двигается — это учёт времени; в приложении счётчик только у владельца.

   На «Сегодня» — блок: идущие доработки с «■ Закончить», «⚒ Начать
   доработку», итог недели. Экран #/rework — все записи за две недели,
   ручной ввод и правка. Сервер — Код.gs (gas/Rework.gs, Прил_доработка_),
   действие 'rework': op = start | stop | save | drop. Время нажатия — ms
   телефона; без связи нажатие ждёт в «Исходящих». */

import { esc, icon, hhmm, dayShort, sameDay } from '../util.js';
import { store } from '../store.js';

const p2 = (n) => String(n).padStart(2, '0');
const localIso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const rwLong = (m) => { m = Math.max(0, Math.round(m || 0)); const h = Math.floor(m / 60);
  return h ? h + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '') : m + ' мин'; };
const minOf = (x) => (x.running && x.startMs ? Math.max(0, Math.round((Date.now() - x.startMs) / 60000)) : (x.min || 0));
const mondayMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };

/* Черновик формы: то, что набрано в полях, переносим в него перед каждой
   перерисовкой (нажатие на кнопку-выбор перерисовывает экран). */
const F = () => store.ui.rw;
function keepTyped() {
  const f = F(); if (!f) return;
  const v = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
  [['what', 'rw-what'], ['qty', 'rw-qty'], ['start', 'rw-start'], ['fin', 'rw-fin'],
    ['h', 'rw-h'], ['m', 'rw-m'], ['comment', 'rw-com']].forEach(([k, id]) => { const x = v(id); if (x !== undefined) f[k] = x; });
  /* Поставщик: набранный руками главнее выбранной кнопки; пустое поле
     выбранное не стирает. */
  const sup = v('rw-sup');
  if (sup && sup.trim()) f.sup = sup.trim();
}

function chips(k, list, cur) {
  return `<div class="chips">${list.map((x) => `<button class="chip${x.v === cur ? ' on' : ''}" data-act="rw-chip" data-k="${k}" data-v="${esc(x.v)}" aria-pressed="${x.v === cur}">${esc(x.t)}</button>`).join('')}</div>`;
}
function form(d) {
  const f = F();
  if (!f) return '';
  const r = d.rework || {};
  const sups = (r.suppliers || []).slice(0, 8);
  const title = f.mode === 'start' ? 'Начать доработку за поставщика' : f.mode === 'manual' ? 'Записать доработку вручную'
    : 'Доработка №' + f.n + (f.running ? ' — идёт' : '');
  const where = [{ v: '', t: '—' }].concat((d.resources || []).map((x) => ({ v: x.code, t: x.code })));
  const orders = [{ v: '', t: 'без заказа' }].concat((d.orders || []).map((x) => ({ v: x.code, t: x.code })));
  const now = localIso(new Date());
  return `<div class="info bronze rwform" style="display:flex;flex-direction:column;gap:10px;align-items:stretch">
    <div class="strong" style="font-size:16px">${esc(title)}</div>
    ${f.mode === 'start' ? '<div class="small">Счётчик пойдёт с этой минуты. План от доработки не сдвигается — это учёт нашего времени по чужому браку.</div>' : ''}
    <div class="small strong">Поставщик — чей брак</div>
    ${sups.length ? chips('sup', sups.map((x) => ({ v: x, t: x })), f.sup) : ''}
    <input id="rw-sup" class="field-in" placeholder="${sups.length ? 'или новый поставщик' : 'поставщик'}" value="${esc(sups.includes(f.sup) ? '' : f.sup || '')}" autocomplete="off">
    <div class="small strong">Где</div>${chips('where', where, f.where || '')}
    <div class="small strong">Заказ</div>${chips('order', orders, f.order || '')}
    <input id="rw-what" class="field-in" placeholder="Что дорабатываем (можно не писать)" value="${esc(f.what || '')}" autocomplete="off">
    <input id="rw-qty" class="field-in" type="number" inputmode="numeric" min="0" placeholder="Штук (можно потом)" value="${esc(f.qty || '')}">
    ${f.mode === 'start' ? '' : `
    <div class="small strong">Начало</div>
    <input id="rw-start" class="field-in" type="datetime-local" max="${now}" value="${esc(f.start || '')}">
    ${f.running ? '' : `<div class="small strong">Конец — или сколько длилось</div>
    <input id="rw-fin" class="field-in" type="datetime-local" max="${now}" value="${esc(f.fin || '')}">
    <div class="rw-dur"><input id="rw-h" class="field-in" type="number" inputmode="numeric" min="0" placeholder="ч" value="${esc(f.h || '')}"> ч
      <input id="rw-m" class="field-in" type="number" inputmode="numeric" min="0" max="59" placeholder="мин" value="${esc(f.m || '')}"> мин</div>`}
    <input id="rw-com" class="field-in" placeholder="Комментарий" value="${esc(f.comment || '')}" autocomplete="off">`}
    <div class="btns"><button class="btn primary" data-act="rw-save">${f.mode === 'start' ? '▶ Начать' : 'Записать'}</button>
      <button class="btn" data-act="rw-cancel">Отмена</button></div>
    ${f.mode === 'edit' ? `<div class="btns">${f.running ? `<button class="btn" data-act="rw-stop" data-n="${esc(f.n)}">■ Закончить сейчас</button>` : ''}
      <button class="btn danger" data-act="rw-drop" data-n="${esc(f.n)}">Убрать запись</button></div>` : ''}
  </div>`;
}

function runningCard(x) {
  return `<div class="card rw-run">
    <div class="row-between" style="align-items:center"><span class="small strong rw-k">Доработка · ${esc(x.supplier)}</span><span class="pill bronze">идёт</span></div>
    ${x.what ? `<div class="strong" style="font-size:16px">${esc(x.what)}</div>` : ''}
    <div class="small muted">${x.where ? esc(x.where) + ' · ' : ''}${x.order ? 'заказ ' + esc(x.order) + ' · ' : ''}с ${hhmm(new Date(x.startMs))} · <b>${rwLong(minOf(x))}</b></div>
    <button class="btn" data-act="rw-stop" data-n="${esc(x.n)}">■ Закончить доработку</button>
  </div>`;
}

/* Блок на «Сегодня». Нет данных о доработках (старый сервер) — блока нет. */
export function reworkSection(d) {
  const r = d.rework;
  if (!r) return '';
  const run = r.running || [];
  const week = (r.recent || []).concat(run).filter((x) => x.startMs >= mondayMs());
  const min = week.reduce((s, x) => s + minOf(x), 0);
  return `<section aria-label="Доработки за поставщиков" style="display:flex;flex-direction:column;gap:10px">
    <div class="row-between"><h2 class="h2">Доработки за поставщиков</h2><a class="link-btn" href="#/rework" style="font-size:14px;padding:8px 0">Все</a></div>
    ${store.ui.rw && store.ui.rwHere === 'today' ? form(d) : ''}
    ${run.map(runningCard).join('')}
    ${store.ui.rw && store.ui.rwHere === 'today' ? '' : `<button class="btn" data-act="rw-open" data-mode="start" data-here="today">⚒ Начать доработку</button>`}
    <div class="small muted" style="margin:0 4px">${week.length ? `За эту неделю: ${week.length} · <b>${rwLong(min)}</b>` : 'На этой неделе доработок не было'}</div>
  </section>`;
}

/* Экран всех доработок: две недели, по дням. */
export function render() {
  const d = store.data || {};
  const r = d.rework || { running: [], recent: [], suppliers: [] };
  const all = (r.running || []).concat(r.recent || []).sort((a, b) => b.startMs - a.startMs);
  const days = [];
  all.forEach((x) => {
    const day = new Date(x.startMs);
    let g = days.find((y) => sameDay(y.day, day));
    if (!g) { g = { day, list: [] }; days.push(g); }
    g.list.push(x);
  });
  const here = store.ui.rw && store.ui.rwHere === 'list';
  const sum = {};
  all.filter((x) => x.startMs >= mondayMs()).forEach((x) => { sum[x.supplier] = (sum[x.supplier] || 0) + minOf(x); });
  return `<main class="screen">
    <div class="topbar"><a class="link-btn" href="#/today">${icon.back(20)} Назад</a></div>
    <h1 class="title" style="font-size:24px;margin:0">Доработки за поставщиков</h1>
    <p class="small muted" style="margin:0">Наша работа по чужому браку. План от неё не двигается; время — в недельный отчёт и во вкладку «Доработки» плана.</p>
    ${here ? form(d) : `<div class="btns"><button class="btn primary" data-act="rw-open" data-mode="start" data-here="list">⚒ Начать</button>
      <button class="btn" data-act="rw-open" data-mode="manual" data-here="list">${icon.plus(16)} Записать вручную</button></div>`}
    ${Object.keys(sum).length ? `<div class="card" style="display:flex;flex-direction:column;gap:6px"><div class="small strong">Эта неделя по поставщикам</div>
      ${Object.keys(sum).sort((a, b) => sum[b] - sum[a]).map((k) => `<div class="row-between"><span>${esc(k)}</span><b>${rwLong(sum[k])}</b></div>`).join('')}</div>` : ''}
    ${days.length ? days.map((g) => `<h2 class="section-title">${esc(dayShort(g.day))}</h2>
      <div class="list">${g.list.map((x) => `<button class="kv rw-row" data-act="rw-edit" data-n="${esc(x.n)}" style="width:100%;text-align:left;background:none;border:0">
        <div style="flex:1;min-width:0"><div class="strong">${esc(x.supplier)}${x.what ? ' · ' + esc(x.what) : ''}</div>
        <div class="small muted">${hhmm(new Date(x.startMs))}–${x.running ? 'идёт' : hhmm(new Date(x.finishMs))}${x.where ? ' · ' + esc(x.where) : ''}${x.order ? ' · ' + esc(x.order) : ''}${x.qty ? ' · ' + esc(x.qty) + ' шт' : ''}</div></div>
        <b style="white-space:nowrap">${rwLong(minOf(x))}</b>${icon.next(16)}</button>`).join('')}</div>`).join('')
      : '<div class="empty">За две недели доработок не записано</div>'}
  </main>`;
}

const okFields = (f) => {
  const sup = (f.sup || '').trim();
  if (!sup) { store.say('Укажите поставщика', 'error'); return null; }
  const p = { supplier: sup, where: f.where || '', order: f.order || '', what: (f.what || '').trim(), qty: f.qty || '' };
  return p;
};

export const on = {
  'rw-open': (el) => {
    store.ui.rw = { mode: el.dataset.mode, sup: '', where: '', order: '' };
    store.ui.rwHere = el.dataset.here || 'today';
    store.emit();
    setTimeout(() => { const f = document.querySelector('.rwform'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30);
  },
  'rw-edit': (el) => {
    const r = (store.data && store.data.rework) || {};
    const x = (r.running || []).concat(r.recent || []).find((y) => String(y.n) === el.dataset.n);
    if (!x) return;
    store.ui.rw = { mode: 'edit', n: x.n, running: x.running, sup: x.supplier, where: x.where, order: x.order, what: x.what,
      qty: x.qty, start: x.startMs ? localIso(new Date(x.startMs)) : '', fin: x.finishMs ? localIso(new Date(x.finishMs)) : '',
      comment: x.comment };
    store.ui.rwHere = 'list';
    store.emit();
    setTimeout(() => window.scrollTo(0, 0), 30);
  },
  'rw-cancel': () => { store.ui.rw = null; store.emit(); },
  'rw-chip': (el) => {
    keepTyped();
    const f = F(); if (!f) return;
    f[el.dataset.k] = el.dataset.v;
    if (el.dataset.k === 'sup') { const i = document.getElementById('rw-sup'); if (i) i.value = ''; }
    store.emit();
  },
  'rw-save': async () => {
    keepTyped();
    const f = F(); if (!f) return;
    const typed = (document.getElementById('rw-sup') || {}).value;
    if (typed && typed.trim()) f.sup = typed.trim();
    const p = okFields(f); if (!p) return;
    const now = new Date();
    if (f.mode === 'start') {
      store.ui.rw = null;
      return store.act('rework', Object.assign({ op: 'start', ms: now.getTime() }, p), (d) => {
        const r = d.rework || (d.rework = { running: [], recent: [], suppliers: [] });
        r.running.unshift(Object.assign({ n: 'новая', running: true, startMs: now.getTime(), min: 0 }, p));
      }, 'Счётчик доработки пошёл');
    }
    if (!f.start) { store.say('Укажите, когда начали', 'error'); return; }
    Object.assign(p, { start: f.start, comment: (f.comment || '').trim() });
    if (!f.running) {
      const min = (Number(f.h) || 0) * 60 + (Number(f.m) || 0);
      if (f.fin) p.finish = f.fin; else if (min > 0) p.min = min;
      else { store.say('Укажите конец или сколько длилось', 'error'); return; }
    }
    if (f.mode === 'edit') p.n = f.n;
    store.ui.rw = null;
    return store.act('rework', Object.assign({ op: 'save', ms: now.getTime() }, p), (d) => {
      const r = d.rework || (d.rework = { running: [], recent: [], suppliers: [] });
      const s = new Date(p.start).getTime(), e = p.finish ? new Date(p.finish).getTime() : s + (p.min || 0) * 60000;
      const rec = Object.assign({}, p, { startMs: s, finishMs: f.running ? 0 : e, running: !!f.running,
        min: Math.round(((f.running ? Date.now() : e) - s) / 60000) });
      if (f.mode === 'edit') {
        ['running', 'recent'].forEach((k) => { r[k] = (r[k] || []).map((y) => (String(y.n) === String(f.n) ? Object.assign({}, y, rec, { n: y.n }) : y)); });
      } else r.recent.unshift(Object.assign({ n: 'новая' }, rec));
    }, f.mode === 'edit' ? 'Поправлено' : 'Доработка записана');
  },
  'rw-stop': async (el) => {
    const n = el.dataset.n, now = new Date();
    if (store.ui.rw && String(store.ui.rw.n) === String(n)) store.ui.rw = null;
    /* Начатая без связи ещё не знает своего номера — сервер найдёт идущую
       по месту и поставщику. */
    const r0 = (store.data && store.data.rework) || {};
    const x0 = (r0.running || []).find((y) => String(y.n) === String(n)) || {};
    return store.act('rework', { op: 'stop', n: Number(n) || 0, where: x0.where || '', supplier: x0.supplier || '', ms: now.getTime() }, (d) => {
      const r = d.rework; if (!r) return;
      const x = (r.running || []).find((y) => String(y.n) === String(n)); if (!x) return;
      r.running = r.running.filter((y) => y !== x);
      r.recent.unshift(Object.assign({}, x, { running: false, finishMs: now.getTime(), min: Math.round((now - x.startMs) / 60000) }));
    }, 'Доработка закончена');
  },
  'rw-drop': async (el) => {
    const n = el.dataset.n;
    if (!confirm('Убрать эту доработку? Вернуть не получится.')) return;
    store.ui.rw = null;
    return store.act('rework', { op: 'drop', n: Number(n) || n, ms: Date.now() }, (d) => {
      const r = d.rework; if (!r) return;
      r.running = (r.running || []).filter((y) => String(y.n) !== String(n));
      r.recent = (r.recent || []).filter((y) => String(y.n) !== String(n));
    }, 'Запись убрана');
  },
};
