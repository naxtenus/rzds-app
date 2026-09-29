/* Карточка задачи. Владельцу — всё: кому, срок, важность, путь доставки,
   переписка. Рабочему — его поручение: прочитать, взять, сделать, ответить. */

import { esc, icon, hhmm, dueText, ago, isOverdue } from '../util.js';
import { weightLook, WEIGHTS, personName, deliveryState, avatar } from '../ui.js';
import { store } from '../store.js';
import { calendar, calInit, calOn, calValue, calSummary } from './calendar.js';

const pad = (n) => String(n).padStart(2, '0');
const at = (off, h) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(h, 0, 0, 0); return d; };

export function render(params) {
  const d = store.data || {};
  const n = Number(params[0]);
  const t = (d.tasks || []).find((x) => x.n === n);
  const worker = store.me && store.me.role === 'worker';
  const back = worker ? '#/shift' : '#/tasks';
  if (!t) return `<main class="screen no-tabs"><div class="topbar"><a class="link-btn" href="${back}">${icon.back(20)} Назад</a></div>
    <div class="card empty">Задача не найдена — возможно, её убрали.</div></main>`;

  const done = t.state === 'закрыта';
  const L = weightLook[t.weight] || weightLook['обычная'];
  const del = t.delivery || {};
  const who = personName(d, t.to);

  const steps = t.to ? `<section class="card" style="padding:0" aria-label="Доставка">
    <div class="steps">
      ${[['Поставлена', del.sent], ['Доставлено', del.delivered], ['Прочитал', del.read], [done ? 'Выполнено' : 'В работе', done ? (t.closed || true) : del.taken]]
        .map(([l, v], i, arr) => `<div><i class="${v ? (i === arr.length - 1 && !done ? 'now' : 'on') : ''}"></i><b>${l}</b><span class="muted">${v && v !== true ? hhmm(v) : '—'}</span></div>`).join('')}
    </div></section>` : '';

  const moving = store.ui.moving === n;
  const moves = [['Сегодня 17:00', at(0, 17)], ['Завтра 12:00', at(1, 12)], ['Через 2 дня', at(2, 12)], ['Через неделю', at(7, 12)]];

  const comments = (t.comments || []).map((c) => {
    const mine = worker ? c.who === store.me.name : !((d.people || []).some((p) => p.name === c.who));
    return `<div class="bubble${mine ? ' mine' : ''}"><div class="by">${esc(mine ? 'Вы' : c.who)} · ${hhmm(c.ts)}</div><div style="margin-top:2px">${esc(c.text)}</div></div>`;
  }).join('');

  const ownerBody = `
    <div class="list">
      <div class="kv"><span class="k">Кому</span>${t.to ? avatar(who) : avatar('', true)}<span class="v">${esc(who)}</span>
        <button class="btn ghost" data-act="toggle-to" style="height:36px;padding:0 6px">Сменить</button></div>
      ${store.ui.changeTo === n ? `<div class="chips" style="padding:12px 14px;background:var(--bg2)">
        ${[{ id: '', name: 'Мне' }].concat(d.people || []).map((p) => `<button class="chip${p.id === (t.to || '') ? ' on' : ''}" style="height:40px" data-act="set-to" data-n="${n}" data-v="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
      </div>` : ''}
      <div class="kv"><span class="k">Срок</span><span class="v" style="color:${!done && isOverdue(t.due) ? '#B3261E' : 'inherit'}">${esc(dueText(t.due))}</span>
        <button class="btn bronze" data-act="move" style="height:36px;padding:0 12px">Перенести</button></div>
      ${moving ? `<div class="chips" style="padding:12px 14px;background:var(--bg2)">
        ${moves.map(([l, v]) => `<button class="chip" style="height:40px" data-act="move-to" data-n="${n}" data-v="${v.toISOString()}">${l}</button>`).join('')}
        <button class="chip${store.ui.moveCal ? ' on' : ''}" style="height:40px" data-act="move-cal">Другая дата</button>
      </div>
      ${store.ui.moveCal ? `<div style="padding:0 14px 14px;background:var(--bg2);display:flex;flex-direction:column;gap:10px">
        ${calendar(store.ui.moveCal, 'mcal')}
        <button class="btn primary" data-act="move-cal-ok" data-n="${n}">Перенести на ${esc(calSummary(store.ui.moveCal).toLowerCase())}</button>
      </div>` : ''}` : ''}
      ${t.order ? `<div class="kv"><span class="k">Заказ</span><span class="v"><span class="pill green" style="font-size:14px">${esc(t.order)}</span></span></div>` : ''}
      <div class="kv"><span class="k">Важность</span>
        <div class="levels" style="flex:1">${WEIGHTS.map((w) => {
          const X = weightLook[w], on = w === t.weight;
          return `<button data-act="weight" data-n="${n}" data-v="${w}" aria-pressed="${on}" style="height:36px;font-size:12px;background:${on ? X.ring : X.soft};color:${on ? '#fff' : X.softFg}">${X.label}</button>`;
        }).join('')}</div></div>
    </div>`;

  const workerBody = `<div class="list">
      <div class="kv"><span class="k">От кого</span><span class="v">Мастер</span></div>
      <div class="kv"><span class="k">Срок</span><span class="v">${esc(dueText(t.due))}</span><span class="pill" style="background:${L.bg};color:${L.fg}">${L.label}</span></div>
      ${t.order ? `<div class="kv"><span class="k">Заказ</span><span class="v">${esc(t.order)}</span></div>` : ''}
    </div>`;

  return `<main class="screen with-cta">
    <div class="topbar">
      <a class="link-btn" href="${back}">${icon.back(20)} ${worker ? 'Смена' : 'Задачи'}</a>
      ${t.to && !worker ? '<span class="pill bronze" style="font-size:13px">Поручено</span>' : ''}
    </div>
    <h1 style="font-size:24px;font-weight:700;line-height:1.25;${done ? 'text-decoration:line-through;color:#8C918A' : ''}">${esc(t.text)}</h1>
    ${worker ? workerBody : ownerBody}
    ${steps}
    <section style="display:flex;flex-direction:column;gap:8px" aria-label="Переписка">
      <h2 class="section-title">${t.to ? 'Переписка' : 'Комментарии'}</h2>
      ${comments || `<div class="small muted" style="padding:0 4px">${t.to ? 'Пока ни слова. Напишите, если нужно уточнить.' : 'Записывайте сюда, что сделано и что дальше.'}</div>`}
      <div class="input-row">
        <label class="sr" for="cmt">Комментарий</label>
        <input id="cmt" type="text" data-bind="comment" placeholder="${t.to && !worker ? 'Написать: ' + esc(who) + '…' : 'Написать…'}" enterkeyhint="send" autocomplete="off">
        <button class="icon-btn green" data-act="comment" data-n="${n}" aria-label="Отправить">${icon.send(18)}</button>
      </div>
    </section>
  </main>
  <div class="cta"><div class="in">
    ${worker
      ? (done ? `<button class="btn" data-act="state" data-n="${n}" data-v="открыта" style="flex:1">Сделано · вернуть</button>`
        : (del.taken ? '' : `<button class="btn bronze" data-act="take" data-n="${n}" style="flex:1">Взял в работу</button>`)
          + `<button class="btn primary" data-act="state" data-n="${n}" data-v="закрыта" style="flex:2">${icon.check(22)} Сделал</button>`)
      : `<button class="btn" data-act="remove" data-n="${n}" style="flex:1;color:#5A5F58">Убрать</button>
         ${done ? `<button class="btn" data-act="state" data-n="${n}" data-v="открыта" style="flex:2;border:2px solid #1F6436;background:#E3EFE6;color:#174D2A">Выполнена · вернуть</button>`
           : `<button class="btn primary" data-act="state" data-n="${n}" data-v="закрыта" style="flex:2">${icon.check(22)} Выполнено</button>`}`}
  </div></div>`;
}

export function mount(root, params) {
  const n = Number(params[0]);
  const t = ((store.data && store.data.tasks) || []).find((x) => x.n === n);
  /* Рабочий открыл поручение — владелец увидит «Прочитал». */
  if (t && store.me && store.me.role === 'worker' && t.delivery && !t.delivery.read && !store.ui['read' + n]) {
    store.ui['read' + n] = true;
    store.act('taskRead', { n }, (d) => { const x = d.tasks.find((y) => y.n === n); if (x) x.delivery.read = new Date().toISOString(); });
  }
  const input = root.querySelector('#cmt');
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="comment"]').click(); } });
}

const upd = (n, patch, ok) => store.act('taskUpdate', Object.assign({ n }, patch), (d) => {
  const x = d.tasks.find((y) => y.n === n); if (x) Object.assign(x, patch);
}, ok);

export const on = {
  'toggle-to': () => { store.ui.changeTo = store.ui.changeTo ? null : Number(location.hash.split('/')[2]); store.emit(); },
  'set-to': (el) => { store.ui.changeTo = null; return upd(Number(el.dataset.n), { to: el.dataset.v }, el.dataset.v ? 'Передал — уведомление ушло' : 'Теперь это ваша задача'); },
  'move': () => { const n = Number(location.hash.split('/')[2]); store.ui.moving = store.ui.moving === n ? null : n; store.ui.moveCal = null; store.emit(); },
  'move-to': (el) => { store.ui.moving = null; store.ui.moveCal = null; return upd(Number(el.dataset.n), { due: el.dataset.v }, 'Перенёс ✓'); },
  'move-cal': () => {
    const t = ((store.data && store.data.tasks) || []).find((x) => x.n === Number(location.hash.split('/')[2]));
    store.ui.moveCal = store.ui.moveCal ? null : calInit(t && t.due && new Date(t.due) > new Date() ? t.due : null);
    store.emit();
    setTimeout(() => document.getElementById('mcal')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  },
  'cal-day': (el) => { if (store.ui.moveCal && calOn(store.ui.moveCal, el)) store.emit(); },
  'cal-time': (el) => { if (store.ui.moveCal && calOn(store.ui.moveCal, el)) store.emit(); },
  'cal-month': (el) => { if (store.ui.moveCal && calOn(store.ui.moveCal, el)) store.emit(); },
  'move-cal-ok': (el) => {
    const v = calValue(store.ui.moveCal);
    if (!v) { store.say('Выберите день', 'error'); return; }
    store.ui.moving = null; store.ui.moveCal = null;
    return upd(Number(el.dataset.n), { due: v.toISOString() }, 'Перенёс ✓');
  },
  'weight': (el) => upd(Number(el.dataset.n), { weight: el.dataset.v }),
  'state': (el) => upd(Number(el.dataset.n), { state: el.dataset.v }, el.dataset.v === 'закрыта' ? 'Выполнено ✓' : 'Вернул в работу'),
  'take': (el) => store.act('taskUpdate', { n: Number(el.dataset.n), taken: true }, (d) => {
    const x = d.tasks.find((y) => y.n === Number(el.dataset.n)); if (x && x.delivery) x.delivery.taken = new Date().toISOString();
  }, 'Мастер увидит, что вы взялись'),
  'remove': async (el) => {
    const n = Number(el.dataset.n);
    if (!confirm('Убрать задачу? Она пропадёт из списка и из отчёта, но в таблице останется.')) return;
    const r = await upd(n, { state: 'убрана' }, 'Убрал');
    if (r) location.hash = '#/tasks';
  },
  'comment': async (el) => {
    const n = Number(el.dataset.n);
    const input = document.querySelector('#cmt');
    const text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    input.value = '';
    const who = store.me && store.me.role === 'worker' ? store.me.name : 'Вы';
    await store.act('taskComment', { n, text }, (d) => {
      const x = d.tasks.find((y) => y.n === n); if (x) x.comments.push({ ts: new Date().toISOString(), who, text });
    });
  },
};

export const onChange = {
  'move-pick': (el) => { if (!el.value) return; store.ui.moving = null; upd(Number(el.dataset.n), { due: new Date(el.value).toISOString() }, 'Перенёс'); },
};

export { ago, pad };
