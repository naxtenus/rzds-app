/* План — лента по станкам (Гант на телефоне). Два вида: «день» (по
   часам) и «неделя» (семь дней рядом). Нажатие на этап открывает панель
   снизу: что это, что случилось и что с этим сделать.

   Волна 2 (29.09): этап можно сдвинуть — в «дне» пальцем (подержать и
   потянуть вбок, шаг 15 минут) или кнопкой «Перенести…» с календарём.
   Сначала сервер считает и показывает, что ещё сдвинется и к какому сроку
   выйдет каждый заказ; записывается только после «Сдвинуть». */

import { esc, icon, dayShort, hhmm, startOfDay, dueText } from '../util.js';
import { tabbar, opL } from '../ui.js';
import { store } from '../store.js';
import { api } from '../api.js';
import { decisionButtons } from './today.js';
import { calendar, calInit, calOn } from './calendar.js';

const HW = 56;           // ширина часа в «дне», px
const H0 = 6, H1 = 22;   // видимые часы суток
const DW = 112;          // ширина дня в «неделе», px
const WH = DW / (H1 - H0);
const SNAP = 15;         // шаг перетаскивания, мин
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const dayAt = (off) => { const d = startOfDay(new Date()); d.setDate(d.getDate() + off); return d; };
const monday = (off) => { const d = startOfDay(new Date()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d; };
const pad = (n) => String(n).padStart(2, '0');
export const localIso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const dm = (t) => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); };

function block(o, left, width, sel, drag) {
  const L = opL(o);
  return `<button class="blk ${L.cls}${sel === o.code ? ' sel' : ''}" data-act="pick" data-op="${esc(o.code)}"${drag ? ` data-drag="1"` : ''}
    style="left:${left}px;width:${width}px"
    aria-label="${esc(o.order)}, ${esc(o.op)}, ${hhmm(o.start)}–${hhmm(o.end)}, ${L.text}">
    <b>${esc(o.order)}</b>${width > 40 ? `<small>${esc(o.op.toLowerCase())}</small>` : ''}</button>`;
}

function dayView(d, sel) {
  const off = store.ui.planDay || 0;
  const day = dayAt(off);
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1);
  const x = (t) => Math.max(H0, Math.min(H1, (new Date(t) - day) / 36e5));
  const width = (H1 - H0) * HW;
  const lanes = (d.resources || []).map((r) => {
    const ops = (d.ops || []).filter((o) => o.res === r.code && new Date(o.end) > day && new Date(o.start) < dayEnd);
    const blocks = ops.map((o) => {
      const a = x(o.start), b = x(o.end);
      if (b <= a) return '';
      return block(o, (a - H0) * HW + 2, Math.max(28, (b - a) * HW - 4), sel, o.status === 'план' || o.status === 'пауза');
    }).join('');
    const busy = ops.some((o) => o.status === 'в работе');
    const bad = ops.some((o) => o.status === 'проблема');
    return { name: r.code, hint: bad ? 'стоит' : busy ? 'в работе' : ops.length ? 'по плану' : 'свободен', blocks };
  });
  const hours = [];
  for (let h = H0; h <= H1; h++) hours.push(`<span style="left:${(h - H0) * HW}px">${pad(h)}</span>`);
  const grid = [];
  for (let h = H0 + 1; h < H1; h++) grid.push(`<i class="grid" style="left:${(h - H0) * HW}px"></i>`);
  const now = new Date();
  const nowX = off === 0 ? ((now - day) / 36e5 - H0) * HW : -1;
  return {
    nav: `<button class="icon-btn" data-act="day" data-d="-1" aria-label="Предыдущий день">${icon.back(20)}</button>
      <div style="text-align:center">
        <div class="strong">${off === 0 ? 'Сегодня · ' : off === 1 ? 'Завтра · ' : off === -1 ? 'Вчера · ' : ''}${dayShort(day)}</div>
        <div class="small muted">${off ? `<button class="link-btn" data-act="day" data-d="0" style="font-size:13px;padding:2px">к сегодня</button>` : 'подержите этап и тяните — сдвинуть'}</div>
      </div>
      <button class="icon-btn" data-act="day" data-d="1" aria-label="Следующий день">${icon.next(20)}</button>`,
    lanes, width,
    head: `<div class="hours">${hours.join('')}</div>`,
    grid: grid.join(''),
    now: nowX >= 0 && nowX <= width ? `<div class="now" style="left:${nowX}px"><span>${hhmm(now)}</span></div>` : '',
  };
}

function weekView(d, sel) {
  const off = store.ui.planWeek || 0;
  const w0 = monday(off);
  const w1 = new Date(w0); w1.setDate(w1.getDate() + 7);
  const pos = (t) => {
    const x = new Date(t);
    const di = Math.floor((startOfDay(x) - w0) / 864e5);
    if (di < 0) return 0;
    if (di > 6) return 7 * DW;
    const h = Math.max(H0, Math.min(H1, x.getHours() + x.getMinutes() / 60));
    return di * DW + (h - H0) * WH;
  };
  const width = 7 * DW;
  const lanes = (d.resources || []).map((r) => {
    const ops = (d.ops || []).filter((o) => o.res === r.code && new Date(o.end) > w0 && new Date(o.start) < w1);
    const blocks = ops.map((o) => {
      const a = pos(o.start), b = pos(o.end);
      if (b - a < 1) return '';
      return block(o, a + 1, Math.max(12, b - a - 2), sel, false);
    }).join('');
    const hours = ops.reduce((s, o) => s + Math.max(0, (Math.min(new Date(o.end), w1) - Math.max(new Date(o.start), w0)) / 36e5), 0);
    return { name: r.code, hint: ops.length ? Math.round(hours) + ' ч' : 'свободен', blocks };
  });
  const t0 = startOfDay(new Date());
  const heads = [];
  const grid = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(w0); dd.setDate(dd.getDate() + i);
    const today = dd.getTime() === t0.getTime();
    const wk = dd.getDay() === 0 || dd.getDay() === 6;
    heads.push(`<span class="wd${today ? ' today' : ''}${wk ? ' wk' : ''}" style="left:${i * DW}px;width:${DW}px">${WD[dd.getDay()]} ${dd.getDate()}</span>`);
    if (i) grid.push(`<i class="grid day" style="left:${i * DW}px"></i>`);
    if (wk) grid.push(`<i class="wkbg" style="left:${i * DW}px;width:${DW}px"></i>`);
  }
  const now = new Date();
  const nowX = now >= w0 && now < w1 ? pos(now) : -1;
  const end = new Date(w1); end.setDate(end.getDate() - 1);
  return {
    nav: `<button class="icon-btn" data-act="week" data-d="-1" aria-label="Предыдущая неделя">${icon.back(20)}</button>
      <div style="text-align:center">
        <div class="strong">${off === 0 ? 'Эта неделя · ' : off === 1 ? 'Следующая · ' : ''}${dm(w0)} – ${dm(end)}</div>
        <div class="small muted">${off ? `<button class="link-btn" data-act="week" data-d="0" style="font-size:13px;padding:2px">к этой неделе</button>` : 'нажмите на этап — откроется панель'}</div>
      </div>
      <button class="icon-btn" data-act="week" data-d="1" aria-label="Следующая неделя">${icon.next(20)}</button>`,
    lanes, width,
    head: `<div class="hours week">${heads.join('')}</div>`,
    grid: grid.join(''),
    now: nowX >= 0 ? `<div class="now" style="left:${nowX}px"></div>` : '',
  };
}

export function render() {
  const d = store.data || {};
  const sel = store.ui.planSel;
  const view = store.ui.planView || 'day';
  const v = view === 'week' ? weekView(d, sel) : dayView(d, sel);
  return `<main class="screen">
    <header class="head" style="align-items:center">
      <h1 class="title" style="margin:0">План</h1>
      <a class="icon-btn" href="#/search" aria-label="Поиск">${icon.search(22)}</a>
    </header>
    <div class="segment" role="tablist" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <button role="tab" aria-selected="${view === 'day'}" class="${view === 'day' ? 'on' : ''}" data-act="pview" data-v="day">День</button>
      <button role="tab" aria-selected="${view === 'week'}" class="${view === 'week' ? 'on' : ''}" data-act="pview" data-v="week">Неделя</button>
    </div>
    <div class="row-between" style="align-items:center">${v.nav}</div>
    <section class="gantt${view === 'week' ? ' is-week' : ''}" aria-label="Диаграмма Ганта">
      <div class="names"><div></div>${v.lanes.map((l) => `<div><span class="strong" style="font-size:14px">${esc(l.name)}</span><span class="small muted" style="font-size:11px">${l.hint}</span></div>`).join('')}</div>
      <div class="scroll" id="gscroll">
        <div class="track" style="width:${v.width}px">
          ${v.head}
          ${v.lanes.map((l) => `<div class="lane">${v.grid}${l.blocks}</div>`).join('')}
          ${v.now}
        </div>
      </div>
    </section>
    <div class="chips" style="gap:12px;font-size:12px" aria-label="Обозначения">
      ${[['work', 'в работе'], ['problem', 'проблема'], ['plan', 'по плану'], ['wait', 'ждёт решения / пауза'], ['done', 'сделано']]
        .map(([c, t]) => `<span style="display:inline-flex;align-items:center;gap:6px" class="muted"><i class="blk ${c}" style="position:static;width:14px;height:14px;border-radius:4px;padding:0;display:inline-block"></i>${t}</span>`).join('')}
    </div>
  </main>${store.ui.mv ? moveSheet(d) : sel ? sheet(d, sel) : ''}${tabbar('plan', d)}`;
}

function sheet(d, code) {
  const o = (d.ops || []).find((x) => x.code === code);
  if (!o) return '';
  const L = opL(o);
  const r = (d.pending || []).find((p) => p.opCode === code);
  const [yes] = r ? decisionButtons(r) : [];
  const movable = o.status !== 'выполнено' && o.status !== 'в работе' && o.status !== 'ждёт решения';
  return `<section class="sheet" aria-label="Этап ${esc(o.order)}">
    <div class="grab"></div>
    <div class="row-between" style="align-items:flex-start">
      <div>
        <div class="strong" style="font-size:20px">${esc(o.order)} · ${esc(o.op)}</div>
        <div class="small muted" style="margin-top:2px">${esc(o.res)} · ${esc(dueText(o.start, false))} ${hhmm(o.start)}–${hhmm(o.end)} · <span style="color:${L.color};font-weight:700">${L.text}</span></div>
      </div>
      <button class="icon-btn" data-act="unpick" aria-label="Закрыть" style="width:40px;height:40px;border:none;background:#F0ECE3">${icon.close(18)}</button>
    </div>
    ${o.status === 'проблема' ? `<div class="info red" style="display:block;font-weight:500">
      <b>${esc((r && r.who) || 'Рабочий')}, ${hhmm(o.problemAt || (r && r.at))}:</b> ${esc(o.problem || (r && r.text) || '')}
      ${r && r.impact ? `<div class="muted" style="margin-top:4px">${esc(r.impact)}</div>` : ''}</div>` : ''}
    ${o.status === 'пауза' && o.pause ? `<div class="info bronze" style="display:block;font-weight:500"><b>Пауза:</b> ${esc(o.pause)}${o.pauseAt ? ' · с ' + hhmm(o.pauseAt) : ''}</div>` : ''}
    ${o.status !== 'проблема' && r && r.kind !== 'pause' ? `<div class="info bronze" style="display:block;font-weight:500"><b>${esc(r.who)}:</b> ${esc(r.text)}${r.impact ? `<div style="margin-top:4px">${esc(r.impact)}</div>` : ''}</div>` : ''}
    ${o.status === 'в работе' ? `<div class="small muted">Начато в ${hhmm(o.factStart || o.start)}${o.pct ? ' · готово ' + o.pct + '%' : ''}</div>` : ''}
    <div class="btns">
      ${r ? `<button class="btn primary" data-act="decide-op" data-id="${esc(r.id)}" data-yes="1">${yes}</button>` : ''}
      ${movable ? `<button class="btn bronze" data-act="mv-open" data-op="${esc(o.code)}">Перенести…</button>` : ''}
      <a class="btn${r || movable ? '' : ' primary'}" href="#/new?order=${encodeURIComponent(o.order)}">Поручить</a>
    </div>
    <a class="link-btn" href="#/order/${encodeURIComponent(o.order)}" style="align-self:flex-start;font-size:14px;padding:2px 0">${icon.doc(16)} Документы заказа</a>
  </section>`;
}

/* Сдвиг: выбор времени → предпросмотр → «Сдвинуть». */
function moveSheet(d) {
  const mv = store.ui.mv;
  const o = (d.ops || []).find((x) => x.code === mv.op) || {};
  const r = mv.res;
  let body = '';
  if (!mv.start) {
    body = `${calendar(mv.cal, 'mvcal')}
      <button class="btn primary" data-act="mv-preview">Показать, что сдвинется</button>`;
  } else if (mv.loading) {
    body = `<div class="status-line" style="padding:14px 0">${icon.refresh(16).replace('<svg', '<svg class="spin"')} Считаю план: что сдвинется…</div>`;
  } else if (mv.error) {
    body = `<div class="info red">${icon.alert(20)}<span>${esc(mv.error)}</span></div>
      <button class="btn" data-act="mv-preview">Посчитать ещё раз</button>`;
  } else if (r) {
    const later = r.start && new Date(r.start) - new Date(mv.start) > 5 * 6e4;
    const others = (r.changed || []).filter((x) => !x.me);
    body = `<div class="info" style="display:block">
        <b>Встанет: ${esc(dueText(r.start, false))} ${hhmm(r.start)}–${hhmm(r.end)}</b>
        ${later ? `<div class="small" style="margin-top:4px">Раньше не получается: этап ждёт предыдущий или станок занят.</div>` : ''}</div>
      ${others.length ? `<div class="small strong">Сдвинется ещё ${others.length}:</div>
        <div class="list mv-list">${others.slice(0, 6).map((x) => `<div class="kv" style="padding:8px 12px"><div style="flex:1;min-width:0"><div class="strong" style="font-size:14px">${esc(x.order)} · ${esc(x.op)}</div>
          <div class="small muted">${esc(x.res)}</div></div><span class="small">${dm(x.from)} ${hhmm(x.from)} → <b>${dm(x.to)} ${hhmm(x.to)}</b></span></div>`).join('')}
          ${others.length > 6 ? `<div class="small muted" style="padding:8px 12px">и ещё ${others.length - 6}</div>` : ''}</div>`
        : '<div class="small muted">Больше ничего не сдвинется.</div>'}
      ${(r.orders || []).map((z) => `<div class="small${z.late ? ' late' : ''}">Заказ <b>${esc(z.code)}</b> будет готов ${dm(z.now)} ${hhmm(z.now)}${z.was && dm(z.was) !== dm(z.now) ? ` (было ${dm(z.was)})` : ''}${z.due ? ` · срок ${dm(/^\d{4}-\d{2}-\d{2}$/.test(z.due) ? z.due + 'T12:00' : z.due)}` : ''}${z.late ? ' — опоздание' : ''}</div>`).join('')}
      <button class="btn primary" data-act="mv-apply">Сдвинуть</button>`;
  }
  return `<section class="sheet mv" aria-label="Перенос этапа">
    <div class="grab"></div>
    <div class="row-between" style="align-items:flex-start">
      <div><div class="strong" style="font-size:18px">Перенести: ${esc(o.order || '')} · ${esc(o.op || '')}</div>
        <div class="small muted">сейчас ${esc(dueText(o.start, false))} ${hhmm(o.start)}–${hhmm(o.end)}${mv.start ? ` · хотите с ${esc(dueText(mv.start, false))} ${hhmm(mv.start)}` : ''}</div></div>
      <button class="icon-btn" data-act="mv-close" aria-label="Отмена" style="width:40px;height:40px;border:none;background:#F0ECE3">${icon.close(18)}</button>
    </div>
    ${body}
  </section>`;
}

function preview() {
  const mv = store.ui.mv;
  if (!mv || !mv.start) return;
  mv.loading = true; mv.error = ''; mv.res = null;
  store.emit();
  const my = mv;
  api('movePreview', { op: mv.op, start: localIso(new Date(mv.start)) })
    .then((r) => { if (store.ui.mv === my) { my.res = r; } })
    .catch((e) => { if (e.code === 'auth') { store.logout(); return; } if (store.ui.mv === my) my.error = e.message; })
    .finally(() => { if (store.ui.mv === my) { my.loading = false; store.emit(); } });
}

/* ---------------------------------------------------- перетаскивание
   Подержать этап 0,35 с — он «берётся» (лёгкая вибрация), дальше тянется
   вбок с шагом 15 минут. Пока не взяли, палец просто листает ленту. */
function dragSupport(sc) {
  let t = null, st = null;
  const cancel = () => { clearTimeout(t); t = null; };
  sc.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.blk[data-drag]');
    if (!b) return;
    st = { b, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0 };
    t = setTimeout(() => {
      st.on = true;
      b.classList.add('dragging');
      try { navigator.vibrate && navigator.vibrate(15); } catch (err) {}
    }, 350);
  });
  sc.addEventListener('pointermove', (e) => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.on) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { cancel(); st = null; } return; }
    const min = Math.round((dx / HW * 60) / SNAP) * SNAP;
    st.dx = min;
    st.b.style.transform = `translateX(${min / 60 * HW}px)`;
    const o = ((store.data || {}).ops || []).find((x) => x.code === st.b.dataset.op);
    if (o) st.b.dataset.to = hhmm(new Date(new Date(o.start).getTime() + min * 6e4));
  });
  const end = () => {
    cancel();
    if (!st) return;
    const s = st; st = null;
    if (!s.on) return;
    s.b.classList.remove('dragging');
    s.b.style.transform = '';
    s.b.dataset.noclick = '1';
    setTimeout(() => { delete s.b.dataset.noclick; }, 400);
    if (!s.dx) return;
    const o = ((store.data || {}).ops || []).find((x) => x.code === s.b.dataset.op);
    if (!o) return;
    store.ui.planSel = o.code;
    store.ui.mv = { op: o.code, start: new Date(new Date(o.start).getTime() + s.dx * 6e4).toISOString() };
    preview();
  };
  sc.addEventListener('pointerup', end);
  sc.addEventListener('pointercancel', end);
  /* Когда этап взят, лента не должна ехать вместе с пальцем. */
  sc.addEventListener('touchmove', (e) => { if (st && st.on) e.preventDefault(); }, { passive: false });
  sc.addEventListener('contextmenu', (e) => { if (e.target.closest('.blk')) e.preventDefault(); });
}

export function mount(root) {
  const sc = root.querySelector('#gscroll');
  if (!sc) return;
  const view = store.ui.planView || 'day';
  const key = view + ':' + (view === 'week' ? store.ui.planWeek || 0 : store.ui.planDay || 0) + ':' + (store.ui.planSel || '');
  if (store.ui.planScroll != null && store.ui.planScrollKey === key) { sc.scrollLeft = store.ui.planScroll; }
  else {
    const selEl = store.ui.planSel && sc.querySelector('.blk.sel');
    let px;
    if (selEl) px = selEl.offsetLeft - 16;
    else if (view === 'week') { const di = ((new Date().getDay() + 6) % 7); px = (store.ui.planWeek || 0) === 0 ? di * DW - 8 : 0; }
    else { const targetH = (store.ui.planDay || 0) === 0 ? (Date.now() - startOfDay(new Date())) / 36e5 : 8; px = (targetH - H0) * HW - sc.clientWidth / 3; }
    sc.scrollLeft = Math.max(0, px);
  }
  sc.addEventListener('scroll', () => { store.ui.planScroll = sc.scrollLeft; store.ui.planScrollKey = key; }, { passive: true });
  if (view === 'day' && store.me && store.me.role === 'owner') dragSupport(sc);
}

export const on = {
  'pick': (el) => { if (el.dataset.noclick) return; store.ui.planSel = el.dataset.op; store.ui.mv = null; store.emit(); },
  'unpick': () => { store.ui.planSel = null; store.emit(); },
  'pview': (el) => { store.ui.planView = el.dataset.v; store.ui.planScroll = null; store.ui.mv = null; store.emit(); },
  'day': (el) => {
    const v = Number(el.dataset.d);
    store.ui.planDay = v === 0 ? 0 : (store.ui.planDay || 0) + v;
    store.ui.planSel = null; store.ui.planScroll = null; store.ui.mv = null; store.emit();
  },
  'week': (el) => {
    const v = Number(el.dataset.d);
    store.ui.planWeek = v === 0 ? 0 : (store.ui.planWeek || 0) + v;
    store.ui.planSel = null; store.ui.planScroll = null; store.ui.mv = null; store.emit();
  },
  'decide-op': async (el) => {
    const id = el.dataset.id;
    await store.act('decide', { id, yes: true }, (d) => { d.pending = d.pending.filter((r) => r.id !== id); }, 'Принято, план пересчитан');
  },
  'mv-open': (el) => {
    const o = ((store.data || {}).ops || []).find((x) => x.code === el.dataset.op);
    const cal = calInit(o ? o.start : null);
    store.ui.mv = { op: el.dataset.op, cal };
    store.emit();
  },
  'mv-close': () => { store.ui.mv = null; store.emit(); },
  'cal-day': (el) => { if (store.ui.mv && store.ui.mv.cal && calOn(store.ui.mv.cal, el)) store.emit(); },
  'cal-time': (el) => { if (store.ui.mv && store.ui.mv.cal && calOn(store.ui.mv.cal, el)) store.emit(); },
  'cal-month': (el) => { if (store.ui.mv && store.ui.mv.cal && calOn(store.ui.mv.cal, el)) store.emit(); },
  'mv-preview': () => {
    const mv = store.ui.mv;
    if (!mv) return;
    if (!mv.start && mv.cal) mv.start = new Date(mv.cal.date + 'T' + (mv.cal.time || '08:00')).toISOString();
    preview();
  },
  'mv-apply': async () => {
    const mv = store.ui.mv;
    if (!mv || !mv.res) return;
    store.say('Пересчитываю план…', 'wait');
    const res = await store.act('moveApply', { op: mv.op, start: localIso(new Date(mv.start)) }, null, 'Сдвинуто, план пересчитан ✓');
    if (res && !res.queued) {
      store.ui.mv = null;
      const o = (res.ops || []).find((x) => x.code === mv.op);
      if (o) {
        store.ui.planDay = Math.round((startOfDay(new Date(o.start)) - startOfDay(new Date())) / 864e5);
        store.ui.planScroll = null;
      }
      store.emit();
    }
  },
};
