/* Смена — экран рабочего. Одно текущее задание крупно, три большие
   кнопки (можно нажать в перчатках), ниже — что дальше и поручения. */

import { esc, icon, hhmm, dayShort, sameDay, dueText } from '../util.js';
import { store } from '../store.js';
import { weightLook } from '../ui.js';

const ACTIVE = ['в работе', 'проблема'];

export function currentOp(d) {
  const now = new Date();
  const ops = (d.ops || []).slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  return ops.find((o) => ACTIVE.includes(o.status))
    || ops.find((o) => o.status === 'план' && new Date(o.end) > now && new Date(o.start) < new Date(now.getTime() + 18 * 36e5))
    || ops.find((o) => o.status === 'ждёт решения' && sameDay(o.start, now));
}

export function render() {
  const d = store.data || {};
  const me = store.me || {};
  const cur = currentOp(d);
  const form = store.ui.shiftForm;
  const next = (d.ops || []).filter((o) => o !== cur && o.status === 'план' && new Date(o.start) > new Date())
    .sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 3);
  const tasks = (d.tasks || []).filter((t) => t.state !== 'убрана');
  const endSoon = (() => { const h = new Date().getHours(); return h >= 16 && h < 18; })();

  let actions = '';
  if (cur) {
    if (cur.status === 'план') {
      actions = `<button class="btn primary big" data-act="mark" data-w="start" data-op="${esc(cur.code)}">${icon.play(24)} Начал</button>`;
    } else if (cur.status === 'ждёт решения') {
      actions = `<div class="info">${icon.check(20)}<span>Отметка ушла мастеру в ${hhmm(cur.factEnd || new Date())}. Ждём его решения.</span></div>`;
    } else {
      actions = `<div class="small strong" style="color:${cur.status === 'проблема' ? '#B3261E' : '#1F6436'}">
          ${cur.status === 'проблема' ? 'Отмечена проблема · мастер уведомлён' : 'В работе с ' + hhmm(cur.factStart || cur.start)}</div>
        <button class="btn primary big" data-act="mark" data-w="finish" data-op="${esc(cur.code)}">${icon.check(26)} Закончил</button>
        <div class="grid2">
          <button class="btn danger tall${form === 'problem' || cur.status === 'проблема' ? ' on' : ''}" data-act="form" data-f="problem">Есть проблема</button>
          <button class="btn tall" data-act="form" data-f="comment" style="border-width:2px">Комментарий</button>
        </div>
        ${form ? `<div class="${form === 'problem' ? 'info red' : 'info bronze'}" style="display:flex;flex-direction:column;gap:8px;align-items:stretch">
          <label class="strong" for="shift-text">${form === 'problem' ? 'Что случилось? Мастер получит сразу' : 'Комментарий мастеру'}</label>
          <textarea id="shift-text" rows="2" placeholder="${form === 'problem' ? 'Например: сломалась фреза, нет заготовки…' : 'Например: деталь ушла на контроль'}"
            style="border:none;outline:none;resize:none;background:#fff;border-radius:12px;padding:10px;font-size:16px;color:#1B1F1C"></textarea>
          <button class="btn ${form === 'problem' ? 'primary' : 'primary'}" data-act="send-form" data-op="${esc(cur.code)}" style="${form === 'problem' ? 'background:#C62828;border-color:#C62828' : ''}">Отправить</button>
        </div>` : ''}`;
    }
  }

  return `<main class="screen no-tabs">
    <header class="head" style="align-items:center">
      <div>
        <div class="eyebrow">Моя смена</div>
        <div class="sub" style="margin-top:2px">${esc(me.name || '')} · ${dayShort(new Date())}</div>
      </div>
      <a class="icon-btn" href="#/notify" aria-label="Уведомления и настройки">${icon.bell()}</a>
    </header>
    ${endSoon ? `<div class="info bronze" role="status">${icon.clock(20)}<span>Скоро конец смены — не забудьте отметить, что сделано.</span></div>` : ''}
    ${cur ? `<section class="shift-card">
      <div class="row-between" style="align-items:center">
        <span class="pill green" style="font-size:13px">${cur.status === 'план' ? 'Следующее' : 'Сейчас'}</span>
        <span class="small muted">${hhmm(cur.start)} – ${hhmm(cur.end)}${sameDay(cur.start, new Date()) ? '' : ' · ' + esc(dueText(cur.start, false))}</span>
      </div>
      <div><div class="order-big" style="${cur.order.length > 8 ? 'font-size:26px' : cur.order.length > 6 ? 'font-size:32px' : ''}">${esc(cur.order)}</div>
        <div class="strong" style="margin-top:8px;font-size:17px">${esc(cur.op)}</div>
        <div class="small muted" style="margin-top:2px">${esc(cur.res)}</div></div>
      ${actions}
    </section>` : `<section class="card empty">На сегодня заданий нет. Когда мастер поставит — придёт уведомление.</section>`}

    ${tasks.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="color:#6B4528">Поручения от мастера</h2>
      <div class="list">${tasks.map((t) => {
        const L = weightLook[t.weight] || weightLook['обычная'];
        const done = t.state === 'закрыта';
        return `<div class="task${done ? ' is-done' : ''}" style="padding-left:14px;align-items:center">
          <a class="body" href="#/task/${t.n}">
            <span class="text">${!t.delivery || !t.delivery.read ? '<span class="dot" style="display:inline-block;background:#C62828;margin-right:6px;vertical-align:1px"></span>' : ''}${esc(t.text)}</span>
            <span class="meta"><span class="muted">${esc(dueText(t.due))}</span><span class="pill" style="background:${L.bg};color:${L.fg}">${L.label}</span>
            ${(t.comments || []).length ? `<span class="muted" style="display:inline-flex;gap:4px;align-items:center">${icon.chat(14)}${t.comments.length}</span>` : ''}</span>
          </a>
          ${done ? `<span class="check done"><i>${icon.check(14)}</i></span>`
            : `<button class="btn primary" data-act="task-done" data-n="${t.n}" style="height:44px;flex-shrink:0">Сделал</button>`}
        </div>`;
      }).join('')}</div>
    </section>` : ''}

    ${next.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title">Дальше</h2>
      <div class="list">${next.map((o) => `<div class="kv"><div style="flex:1"><div class="strong">${esc(o.order)}</div><div class="small muted">${esc(o.op)}</div></div>
        <span class="strong">${sameDay(o.start, new Date()) ? hhmm(o.start) : esc(dueText(o.start))}</span></div>`).join('')}</div>
    </section>` : ''}
  </main>`;
}

export const on = {
  'mark': async (el) => {
    const w = el.dataset.w, code = el.dataset.op;
    const now = new Date().toISOString();
    await store.act('mark', { op: code, what: w }, (d) => {
      const o = d.ops.find((x) => x.code === code);
      if (!o) return;
      if (w === 'start') { o.status = 'в работе'; o.factStart = now; }
      if (w === 'finish') { o.status = 'ждёт решения'; o.factEnd = now; }
    }, w === 'start' ? 'Отметил: начал' : 'Отметка ушла мастеру');
    store.ui.shiftForm = null;
  },
  'form': (el) => { store.ui.shiftForm = store.ui.shiftForm === el.dataset.f ? null : el.dataset.f; store.emit(); setTimeout(() => document.querySelector('#shift-text')?.focus(), 50); },
  'send-form': async (el) => {
    const text = (document.querySelector('#shift-text')?.value || '').trim();
    const f = store.ui.shiftForm;
    if (!text) { store.say(f === 'problem' ? 'Напишите, что случилось' : 'Пустой комментарий', 'error'); return; }
    const code = el.dataset.op;
    await store.act('mark', { op: code, what: f, text }, (d) => {
      const o = d.ops.find((x) => x.code === code);
      if (o && f === 'problem') { o.status = 'проблема'; o.problem = text; o.problemAt = new Date().toISOString(); }
    }, f === 'problem' ? 'Мастер получил сообщение о проблеме' : 'Комментарий отправлен');
    store.ui.shiftForm = null; store.emit();
  },
  'task-done': (el) => {
    const n = Number(el.dataset.n);
    store.act('taskUpdate', { n, state: 'закрыта' }, (d) => { const x = d.tasks.find((y) => y.n === n); if (x) x.state = 'закрыта'; }, 'Мастер увидит, что сделано');
  },
};
