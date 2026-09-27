/* План — лента дня по станкам (Гант на телефоне). Лента едет пальцем
   вбок, при открытии сама встаёт на «сейчас». Нажатие на этап открывает
   панель снизу: что это, что случилось и что с этим сделать. */

import { esc, icon, dayShort, hhmm, startOfDay } from '../util.js';
import { tabbar, opL } from '../ui.js';
import { store } from '../store.js';
import { decisionButtons } from './today.js';

const HW = 56;           // ширина часа, px
const H0 = 6, H1 = 22;   // видимые часы суток

const dayAt = (off) => { const d = startOfDay(new Date()); d.setDate(d.getDate() + off); return d; };

export function render() {
  const d = store.data || {};
  const off = store.ui.planDay || 0;
  const day = dayAt(off);
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1);
  const x = (t) => {
    const h = (new Date(t) - day) / 36e5;
    return Math.max(H0, Math.min(H1, h));
  };
  const width = (H1 - H0) * HW;
  const sel = store.ui.planSel;

  const lanes = (d.resources || []).map((r) => {
    const ops = (d.ops || []).filter((o) => o.res === r.code && new Date(o.end) > day && new Date(o.start) < dayEnd);
    const blocks = ops.map((o) => {
      const a = x(o.start), b = x(o.end);
      if (b <= a) return '';
      const L = opL(o);
      return `<button class="blk ${L.cls}${sel === o.code ? ' sel' : ''}" data-act="pick" data-op="${esc(o.code)}"
        style="left:${(a - H0) * HW + 2}px;width:${Math.max(28, (b - a) * HW - 4)}px"
        aria-label="${esc(o.order)}, ${esc(o.op)}, ${hhmm(o.start)}–${hhmm(o.end)}, ${L.text}">
        <b>${esc(o.order)}</b><small>${esc(o.op.toLowerCase())}</small></button>`;
    }).join('');
    const busy = ops.some((o) => o.status === 'в работе');
    const bad = ops.some((o) => o.status === 'проблема');
    return { name: r.code, hint: bad ? 'стоит' : busy ? 'в работе' : ops.length ? 'по плану' : 'свободен', blocks };
  });

  const hours = [];
  for (let h = H0; h <= H1; h++) hours.push(`<span style="left:${(h - H0) * HW}px">${String(h).padStart(2, '0')}</span>`);
  const grid = [];
  for (let h = H0 + 1; h < H1; h++) grid.push(`<i class="grid" style="left:${(h - H0) * HW}px"></i>`);
  const now = new Date();
  const nowX = off === 0 ? ((now - day) / 36e5 - H0) * HW : -1;

  return `<main class="screen">
    <header class="head" style="align-items:center">
      <h1 class="title" style="margin:0">План</h1>
    </header>
    <div class="row-between" style="align-items:center">
      <button class="icon-btn" data-act="day" data-d="-1" aria-label="Предыдущий день">${icon.back(20)}</button>
      <div style="text-align:center">
        <div class="strong">${off === 0 ? 'Сегодня · ' : off === 1 ? 'Завтра · ' : off === -1 ? 'Вчера · ' : ''}${dayShort(day)}</div>
        <div class="small muted">${off ? `<button class="link-btn" data-act="day" data-d="0" style="font-size:13px;padding:2px">к сегодня</button>` : 'двигайте ленту · нажмите на этап'}</div>
      </div>
      <button class="icon-btn" data-act="day" data-d="1" aria-label="Следующий день">${icon.next(20)}</button>
    </div>
    <section class="gantt" aria-label="Диаграмма Ганта">
      <div class="names"><div></div>${lanes.map((l) => `<div><span class="strong" style="font-size:14px">${esc(l.name)}</span><span class="small muted" style="font-size:11px">${l.hint}</span></div>`).join('')}</div>
      <div class="scroll" id="gscroll">
        <div class="track" style="width:${width}px">
          <div class="hours">${hours.join('')}</div>
          ${lanes.map((l) => `<div class="lane">${grid.join('')}${l.blocks}</div>`).join('')}
          ${nowX >= 0 && nowX <= width ? `<div class="now" style="left:${nowX}px"><span>${hhmm(now)}</span></div>` : ''}
        </div>
      </div>
    </section>
    <div class="chips" style="gap:12px;font-size:12px" aria-label="Обозначения">
      ${[['work', 'в работе'], ['problem', 'проблема'], ['plan', 'по плану'], ['wait', 'ждёт решения'], ['done', 'сделано']]
        .map(([c, t]) => `<span style="display:inline-flex;align-items:center;gap:6px" class="muted"><i class="blk ${c}" style="position:static;width:14px;height:14px;border-radius:4px;padding:0;display:inline-block"></i>${t}</span>`).join('')}
    </div>
  </main>${sel ? sheet(d, sel) : ''}${tabbar('plan', d)}`;
}

function sheet(d, code) {
  const o = (d.ops || []).find((x) => x.code === code);
  if (!o) return '';
  const L = opL(o);
  const r = (d.pending || []).find((p) => p.opCode === code);
  const [yes, no] = r ? decisionButtons(r) : [];
  return `<section class="sheet" aria-label="Этап ${esc(o.order)}">
    <div class="grab"></div>
    <div class="row-between" style="align-items:flex-start">
      <div>
        <div class="strong" style="font-size:20px">${esc(o.order)} · ${esc(o.op)}</div>
        <div class="small muted" style="margin-top:2px">${esc(o.res)} · ${hhmm(o.start)}–${hhmm(o.end)} · <span style="color:${L.color};font-weight:700">${L.text}</span></div>
      </div>
      <button class="icon-btn" data-act="unpick" aria-label="Закрыть" style="width:40px;height:40px;border:none;background:#F0ECE3">${icon.close(18)}</button>
    </div>
    ${o.status === 'проблема' ? `<div class="info red" style="display:block;font-weight:500">
      <b>${esc((r && r.who) || 'Рабочий')}, ${hhmm(o.problemAt || (r && r.at))}:</b> ${esc(o.problem || (r && r.text) || '')}
      ${r && r.impact ? `<div class="muted" style="margin-top:4px">${esc(r.impact)}</div>` : ''}</div>` : ''}
    ${o.status !== 'проблема' && r ? `<div class="info bronze" style="display:block;font-weight:500"><b>${esc(r.who)}:</b> ${esc(r.text)}${r.impact ? `<div style="margin-top:4px">${esc(r.impact)}</div>` : ''}</div>` : ''}
    ${o.status === 'в работе' ? `<div class="small muted">Начато в ${hhmm(o.factStart || o.start)}${o.pct ? ' · готово ' + o.pct + '%' : ''}</div>` : ''}
    <div class="btns">
      ${r ? `<button class="btn primary" data-act="decide-op" data-id="${esc(r.id)}" data-yes="1">${yes}</button>` : ''}
      <a class="btn${r ? '' : ' primary'}" href="#/new?order=${encodeURIComponent(o.order)}">Поручить задачу</a>
    </div>
  </section>`;
}

export function mount(root) {
  const sc = root.querySelector('#gscroll');
  if (!sc) return;
  const key = (store.ui.planDay || 0) + ':' + (store.ui.planSel || '');
  if (store.ui.planScroll != null && store.ui.planScrollKey === key) { sc.scrollLeft = store.ui.planScroll; }
  else {
    /* Встаём так, чтобы «сейчас» (или выбранный этап) было на трети ширины. */
    let targetH = (store.ui.planDay || 0) === 0 ? (Date.now() - startOfDay(new Date())) / 36e5 : 8;
    const selEl = store.ui.planSel && sc.querySelector('.blk.sel');
    const px = selEl ? selEl.offsetLeft - 16 : (targetH - H0) * HW - sc.clientWidth / 3;
    sc.scrollLeft = Math.max(0, px);
  }
  sc.addEventListener('scroll', () => { store.ui.planScroll = sc.scrollLeft; store.ui.planScrollKey = key; }, { passive: true });
}

export const on = {
  'pick': (el) => { store.ui.planSel = el.dataset.op; store.emit(); },
  'unpick': () => { store.ui.planSel = null; store.emit(); },
  'day': (el) => {
    const v = Number(el.dataset.d);
    store.ui.planDay = v === 0 ? 0 : (store.ui.planDay || 0) + v;
    store.ui.planSel = null; store.ui.planScroll = null; store.emit();
  },
  'decide-op': async (el) => {
    const id = el.dataset.id;
    await store.act('decide', { id, yes: true }, (d) => { d.pending = d.pending.filter((r) => r.id !== id); }, 'Принято, план пересчитан');
  },
};
