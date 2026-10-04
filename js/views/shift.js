/* Смена — экран рабочего. Одно текущее задание крупно, большие кнопки
   (можно нажать в перчатках), ниже — что дальше и поручения.

   Волна 2 (29.09): «Пауза» с причиной и «Продолжил»; таймер — сколько идёт
   работа или пауза; «Закончил» спрашивает, сколько сделано и сколько брака;
   к проблеме и комментарию можно приложить фото; перед «Начал» — чек-лист
   станка, если владелец его завёл; кнопка «Чертёж и технология» — всё, что
   есть по заказу в реестре. */

import { esc, icon, hhmm, dayShort, sameDay, dueText } from '../util.js';
import { store } from '../store.js';
import { weightLook, taskExtras, refreshBtn, reloadData } from '../ui.js';
import { pickPhoto, draftThumb } from '../photo.js';

const ACTIVE = ['в работе', 'проблема', 'пауза'];
export const PAUSES = ['Нет заготовки', 'Наладка', 'Жду ОТК', 'Нет инструмента', 'Поломка', 'Обед'];

export function currentOp(d) {
  const now = new Date();
  const ops = (d.ops || []).slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  return ops.find((o) => ACTIVE.includes(o.status))
    || ops.find((o) => o.status === 'план' && new Date(o.end) > now && new Date(o.start) < new Date(now.getTime() + 18 * 36e5))
    || ops.find((o) => o.status === 'ждёт решения' && sameDay(o.start, now));
}

/* «1 ч 25 мин», «12 мин», «меньше минуты». */
export const span = (from) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(from)) / 6e4));
  if (m < 1) return 'меньше минуты';
  const h = Math.floor(m / 60);
  return (h ? h + ' ч ' : '') + (m % 60 || !h ? (m % 60) + ' мин' : '').trim();
};

const checklistFor = (d, o) => {
  const c = d.checklists || {};
  return [].concat(c['все'] || [], (o && c[o.machine || o.res]) || []);
};

function formBlock(cur) {
  const f = store.ui.shiftForm;
  const ui = store.ui.shiftDraft || (store.ui.shiftDraft = {});
  if (f === 'pause') {
    return `<div class="info bronze" style="display:flex;flex-direction:column;gap:10px;align-items:stretch">
      <div class="strong">Почему пауза? Мастер увидит сразу</div>
      <div class="chips">${PAUSES.map((p) => `<button class="chip${ui.pause === p ? ' on' : ''}" data-act="pause-why" data-v="${esc(p)}" aria-pressed="${ui.pause === p}">${esc(p)}</button>`).join('')}</div>
      <input id="pause-other" class="field-in" placeholder="Или своими словами" value="${esc(ui.pauseOther || '')}" autocomplete="off">
      <button class="btn primary" data-act="send-pause" data-op="${esc(cur.code)}">${icon.clock(20)} Поставить на паузу</button>
    </div>`;
  }
  if (f === 'finish') {
    const q = ui.qty == null ? '' : ui.qty, s = ui.scrap || 0;
    return `<div class="info" style="display:flex;flex-direction:column;gap:12px;align-items:stretch;background:var(--green-l);color:var(--ink)">
      <div class="strong">Сколько сделано?</div>
      <div class="stepper"><button class="icon-btn" data-act="step" data-k="qty" data-v="-1" aria-label="Меньше">−</button>
        <input id="fin-qty" type="number" inputmode="numeric" min="0" placeholder="шт" value="${esc(q)}" aria-label="Сделано, шт">
        <button class="icon-btn" data-act="step" data-k="qty" data-v="1" aria-label="Больше">+</button></div>
      <div class="strong">Брак</div>
      <div class="stepper"><button class="icon-btn" data-act="step" data-k="scrap" data-v="-1" aria-label="Меньше">−</button>
        <input id="fin-scrap" type="number" inputmode="numeric" min="0" value="${esc(s)}" aria-label="Брак, шт">
        <button class="icon-btn" data-act="step" data-k="scrap" data-v="1" aria-label="Больше">+</button></div>
      <button class="btn primary big" data-act="send-finish" data-op="${esc(cur.code)}">${icon.check(24)} Сдать мастеру</button>
      <button class="link-btn" data-act="form" data-f="finish" style="align-self:center">Отмена</button>
    </div>`;
  }
  if (f === 'problem' || f === 'comment') {
    return `<div class="${f === 'problem' ? 'info red' : 'info bronze'}" style="display:flex;flex-direction:column;gap:8px;align-items:stretch">
      <label class="strong" for="shift-text">${f === 'problem' ? 'Что случилось? Мастер получит сразу' : 'Комментарий мастеру'}</label>
      <textarea id="shift-text" rows="2" placeholder="${f === 'problem' ? 'Например: сломалась фреза, нет заготовки…' : 'Например: деталь ушла на контроль'}"
        style="border:none;outline:none;resize:none;background:#fff;border-radius:12px;padding:10px;font-size:16px;color:#1B1F1C"></textarea>
      ${draftThumb(ui.photo)}
      <div class="btns">
        <button class="btn" data-act="photo" style="background:#fff">${icon.camera(20)} ${ui.photo ? 'Переснять' : 'Фото'}</button>
        <button class="btn primary" data-act="send-form" data-op="${esc(cur.code)}" style="${f === 'problem' ? 'background:#C62828;border-color:#C62828' : ''}">Отправить</button>
      </div>
    </div>`;
  }
  return '';
}

function checkSheet(d, cur) {
  const items = checklistFor(d, cur);
  const got = store.ui.checked || {};
  const all = items.every((_, i) => got[i]);
  return `<div class="ob-back" data-act="check-close"></div>
  <section class="ob-sheet" role="dialog" aria-label="Чек-лист перед началом">
    <div class="row-between"><h2 class="h2" style="margin:0">Перед началом</h2>
      <button class="link-btn" data-act="check-close">Отмена</button></div>
    <p class="small muted" style="margin:0">${esc(cur.order)} · ${esc(cur.op)} · ${esc(cur.res)}</p>
    <div class="list">${items.map((t, i) => `<button class="check-row${got[i] ? ' on' : ''}" data-act="check-tick" data-i="${i}" aria-pressed="${!!got[i]}">
      <span class="check${got[i] ? ' done' : ''}"><i>${got[i] ? icon.check(14) : ''}</i></span><span>${esc(t)}</span></button>`).join('')}</div>
    <button class="btn primary big" data-act="mark" data-w="start" data-op="${esc(cur.code)}" data-checked="1" ${all ? '' : 'disabled'}>
      ${icon.play(24)} ${all ? 'Начал' : 'Отметьте все пункты'}</button>
  </section>`;
}

export function render() {
  const d = store.data || {};
  const me = store.me || {};
  /* Навёл камеру на QR маршрутного листа — на экране эта операция. */
  const focus = store.ui.focusOp && (d.ops || []).find((o) => o.code === store.ui.focusOp);
  const cur = focus || currentOp(d);
  const form = store.ui.shiftForm;
  const next = (d.ops || []).filter((o) => o !== cur && o.status === 'план' && new Date(o.start) > new Date())
    .sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 3);
  const tasks = (d.tasks || []).filter((t) => t.state !== 'убрана');
  const endSoon = (() => { const h = new Date().getHours(); return h >= 16 && h < 18; })();

  let actions = '';
  if (cur) {
    const docs = `<a class="btn tall" href="#/order/${encodeURIComponent(cur.order)}" style="border-width:2px">${icon.doc(20)} Чертёж и технология</a>`;
    if (cur.status === 'план') {
      const n = checklistFor(d, cur).length;
      actions = `<button class="btn primary big" data-act="${n ? 'check-open' : 'mark'}" data-w="start" data-op="${esc(cur.code)}">${icon.play(24)} Начал</button>
        ${n ? `<div class="small muted" style="text-align:center;margin-top:-6px">перед началом — чек-лист, ${n} ${n === 1 ? 'пункт' : n < 5 ? 'пункта' : 'пунктов'}</div>` : ''}
        ${docs}`;
    } else if (cur.status === 'ждёт решения') {
      actions = `<div class="info">${icon.check(20)}<span>Отметка ушла мастеру в ${hhmm(cur.factEnd || new Date())}. Ждём его решения.</span></div>`;
    } else if (cur.status === 'выполнено') {
      actions = `<div class="info">${icon.check(20)}<span>Операция выполнена${cur.factEnd ? ' в ' + hhmm(cur.factEnd) : ''}.</span></div>${docs}`;
    } else if (cur.status === 'пауза') {
      actions = `<div class="timer paused">${icon.clock(20)}<span><b>На паузе ${cur.pauseAt ? span(cur.pauseAt) : ''}</b>${cur.pause ? ' · ' + esc(cur.pause) : ''}</span></div>
        <button class="btn primary big" data-act="mark" data-w="resume" data-op="${esc(cur.code)}">${icon.play(24)} Продолжил</button>
        <div class="grid2">
          <button class="btn danger tall${form === 'problem' ? ' on' : ''}" data-act="form" data-f="problem">Есть проблема</button>
          <button class="btn tall" data-act="form" data-f="comment" style="border-width:2px">Комментарий</button>
        </div>
        ${formBlock(cur)}${docs}`;
    } else {
      const since = cur.factStart || cur.start;
      actions = `<div class="timer${cur.status === 'проблема' ? ' bad' : ''}">${cur.status === 'проблема' ? icon.alert(20) : icon.clock(20)}
          <span>${cur.status === 'проблема' ? '<b>Отмечена проблема</b> · мастер уведомлён' : `<b>В работе ${span(since)}</b> · с ${hhmm(since)}`}</span></div>
        ${form === 'finish' ? '' : `<button class="btn primary big" data-act="form" data-f="finish">${icon.check(26)} Закончил</button>`}
        <div class="grid2">
          <button class="btn tall${form === 'pause' ? ' on' : ''}" data-act="form" data-f="pause" style="border-width:2px">${icon.clock(18)} Пауза</button>
          <button class="btn danger tall${form === 'problem' || cur.status === 'проблема' ? ' on' : ''}" data-act="form" data-f="problem">Есть проблема</button>
          <button class="btn tall" data-act="form" data-f="comment" style="border-width:2px">Комментарий</button>
          <a class="btn tall" href="#/order/${encodeURIComponent(cur.order)}" style="border-width:2px">${icon.doc(18)} Чертёж</a>
        </div>
        ${formBlock(cur)}`;
    }
  }

  return `<main class="screen no-tabs">
    <header class="head" style="align-items:center">
      <div>
        <div class="eyebrow">Моя смена</div>
        <div class="sub" style="margin-top:2px">${esc(me.name || '')} · ${dayShort(new Date())}</div>
      </div>
      <div class="head-btns"><a class="icon-btn" href="#/scan" aria-label="Сканировать QR-код детали">${icon.qr(22)}</a>${refreshBtn()}
      <a class="icon-btn" href="#/notify" aria-label="Уведомления и настройки">${icon.bell()}</a></div>
    </header>
    ${endSoon ? `<div class="info bronze" role="status">${icon.clock(20)}<span>Скоро конец смены — не забудьте отметить, что сделано.</span></div>` : ''}
    ${cur ? `<section class="shift-card">
      <div class="row-between" style="align-items:center">
        ${focus ? `<span class="pill bronze" style="font-size:13px">${icon.qr(14)} По QR-коду</span>` : `<span class="pill green" style="font-size:13px">${cur.status === 'план' ? 'Следующее' : 'Сейчас'}</span>`}
        <span class="small muted">${hhmm(cur.start)} – ${hhmm(cur.end)}${sameDay(cur.start, new Date()) ? '' : ' · ' + esc(dueText(cur.start, false))}</span>
      </div>
      <div><div class="order-big" style="${cur.order.length > 8 ? 'font-size:26px' : cur.order.length > 6 ? 'font-size:32px' : ''}">${esc(cur.order)}</div>
        <div class="strong" style="margin-top:8px;font-size:17px">${esc(cur.op)}</div>
        <div class="small muted" style="margin-top:2px">${esc(cur.res)}</div></div>
      ${actions}
      ${focus ? '<button class="link-btn" data-act="unfocus" style="align-self:center;font-size:14px">К текущему заданию</button>' : ''}
    </section>` : `<section class="card empty">На сегодня заданий нет. Когда мастер поставит — придёт уведомление.</section>`}

    ${tasks.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="color:#6B4528">Поручения от мастера</h2>
      <div class="list">${tasks.map((t) => {
        const L = weightLook[t.weight] || weightLook['обычная'];
        const done = t.state === 'закрыта';
        return `<div class="task${done ? ' is-done' : ''}" style="padding-left:14px;align-items:center">
          <a class="body" href="#/task/${t.n}">
            <span class="text">${!t.delivery || !t.delivery.read ? '<span class="dot" style="display:inline-block;background:#C62828;margin-right:6px;vertical-align:1px"></span>' : ''}${esc(t.text)}</span>
            <span class="meta"><span class="muted">${esc(dueText(t.due))}</span><span class="pill" style="background:${L.bg};color:${L.fg}">${L.label}</span>${taskExtras(t)}
            ${(t.comments || []).length ? `<span class="muted" style="display:inline-flex;gap:4px;align-items:center">${icon.chat(14)}${t.comments.length}</span>` : ''}</span>
          </a>
          ${done ? `<span class="check done"><i>${icon.check(14)}</i></span>`
            : `<button class="btn primary" data-act="task-done" data-n="${t.n}" style="height:44px;flex-shrink:0">Сделал</button>`}
        </div>`;
      }).join('')}</div>
    </section>` : ''}

    ${next.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title">Дальше</h2>
      <div class="list">${next.map((o) => `<a class="kv" href="#/order/${encodeURIComponent(o.order)}" style="text-decoration:none;color:inherit"><div style="flex:1"><div class="strong">${esc(o.order)}</div><div class="small muted">${esc(o.op)}</div></div>
        <span class="strong">${sameDay(o.start, new Date()) ? hhmm(o.start) : esc(dueText(o.start))}</span></a>`).join('')}</div>
    </section>` : ''}
  </main>${cur && store.ui.checkOpen === cur.code ? checkSheet(d, cur) : ''}`;
}

const clearForm = () => { store.ui.shiftForm = null; store.ui.shiftDraft = {}; };

export const on = {
  'reload-data': () => reloadData(),
  'unfocus': () => { store.ui.focusOp = null; clearForm(); store.emit(); },
  'check-open': (el) => { store.ui.checkOpen = el.dataset.op; store.ui.checked = {}; store.emit(); },
  'check-close': () => { store.ui.checkOpen = null; store.emit(); },
  'check-tick': (el) => { const g = store.ui.checked || (store.ui.checked = {}); g[el.dataset.i] = !g[el.dataset.i]; store.emit(); },
  'mark': async (el) => {
    const w = el.dataset.w, code = el.dataset.op;
    const now = new Date().toISOString();
    const payload = { op: code, what: w };
    if (el.dataset.checked) {
      const n = checklistFor(store.data || {}, (store.data.ops || []).find((o) => o.code === code)).length;
      payload.check = n + '/' + n;
    }
    store.ui.checkOpen = null;
    await store.act('mark', payload, (d) => {
      const o = d.ops.find((x) => x.code === code);
      if (!o) return;
      if (w === 'start') { o.status = 'в работе'; o.factStart = now; }
      if (w === 'resume') { o.status = 'в работе'; o.pause = ''; o.pauseAt = ''; }
    }, w === 'start' ? 'Отметил: начал' : w === 'resume' ? 'Отметил: продолжил' : 'Отметка ушла мастеру');
    clearForm();
  },
  'form': (el) => {
    const f = el.dataset.f;
    const same = store.ui.shiftForm === f;
    store.ui.shiftForm = same ? null : f;
    if (!same) store.ui.shiftDraft = {};
    store.emit();
    setTimeout(() => document.querySelector('#shift-text, #fin-qty')?.focus(), 50);
  },
  'photo': async () => {
    const keep = document.querySelector('#shift-text')?.value || '';
    const data = await pickPhoto();
    if (data) { store.ui.shiftDraft = Object.assign(store.ui.shiftDraft || {}, { photo: data }); store.emit(); }
    const t = document.querySelector('#shift-text'); if (t && keep) t.value = keep;
  },
  'ph-drop': () => { const keep = document.querySelector('#shift-text')?.value || ''; store.ui.shiftDraft.photo = null; store.emit(); const t = document.querySelector('#shift-text'); if (t) t.value = keep; },
  'pause-why': (el) => { const u = store.ui.shiftDraft || (store.ui.shiftDraft = {}); u.pause = u.pause === el.dataset.v ? '' : el.dataset.v; u.pauseOther = document.querySelector('#pause-other')?.value || ''; store.emit(); },
  'send-pause': async (el) => {
    const u = store.ui.shiftDraft || {};
    const other = (document.querySelector('#pause-other')?.value || '').trim();
    const why = [u.pause, other].filter(Boolean).join(': ');
    if (!why) { store.say('Выберите причину паузы', 'error'); return; }
    const code = el.dataset.op, now = new Date().toISOString();
    await store.act('mark', { op: code, what: 'pause', text: why }, (d) => {
      const o = d.ops.find((x) => x.code === code);
      if (o) { o.status = 'пауза'; o.pause = why; o.pauseAt = now; }
    }, 'Пауза отмечена, мастер увидит');
    clearForm(); store.emit();
  },
  'step': (el) => {
    const u = store.ui.shiftDraft || (store.ui.shiftDraft = {});
    const k = el.dataset.k;
    const inp = document.querySelector(k === 'qty' ? '#fin-qty' : '#fin-scrap');
    const cur = Number(inp && inp.value) || 0;
    u.qty = Number(document.querySelector('#fin-qty')?.value) || (u.qty || 0);
    u.scrap = Number(document.querySelector('#fin-scrap')?.value) || 0;
    u[k] = Math.max(0, cur + Number(el.dataset.v));
    store.emit();
  },
  'send-finish': async (el) => {
    const qty = Math.max(0, Math.round(Number(document.querySelector('#fin-qty')?.value) || 0));
    const scrap = Math.max(0, Math.round(Number(document.querySelector('#fin-scrap')?.value) || 0));
    const code = el.dataset.op, now = new Date().toISOString();
    await store.act('mark', { op: code, what: 'finish', qty, scrap }, (d) => {
      const o = d.ops.find((x) => x.code === code);
      if (o) { o.status = 'ждёт решения'; o.factEnd = now; }
    }, 'Сдано мастеру' + (qty ? ': ' + qty + ' шт' : '') + (scrap ? ', брак ' + scrap : ''));
    clearForm(); store.emit();
  },
  'send-form': async (el) => {
    const text = (document.querySelector('#shift-text')?.value || '').trim();
    const f = store.ui.shiftForm;
    const photo = (store.ui.shiftDraft || {}).photo || null;
    if (!text && !(f === 'comment' && photo)) { store.say(f === 'problem' ? 'Напишите, что случилось' : 'Пустой комментарий', 'error'); return; }
    const code = el.dataset.op;
    const payload = { op: code, what: f, text };
    if (photo) payload.photo = photo;
    await store.act('mark', payload, (d) => {
      const o = d.ops.find((x) => x.code === code);
      if (o && f === 'problem') { o.status = 'проблема'; o.problem = text; o.problemAt = new Date().toISOString(); }
    }, f === 'problem' ? 'Мастер получил сообщение о проблеме' : 'Комментарий отправлен');
    clearForm(); store.emit();
  },
  'task-done': (el) => {
    const n = Number(el.dataset.n);
    return store.act('taskUpdate', { n, state: 'закрыта' }, (d) => { const x = d.tasks.find((y) => y.n === n); if (x) x.state = 'закрыта'; }, 'Мастер увидит, что сделано');
  },
};
