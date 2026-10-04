/* Карточка задачи. Владельцу — всё: кому, срок, важность, путь доставки,
   переписка. Рабочему — его поручение: прочитать, взять, сделать, ответить. */

import { esc, icon, hhmm, dueText, ago, isOverdue } from '../util.js';
import { weightLook, WEIGHTS, personName, deliveryState, avatar } from '../ui.js';
import { store } from '../store.js';
import { calendar, calInit, calOn, calValue, calSummary, timePanel, dayValue, timeOk } from './calendar.js';
import { pickPhoto, thumbs, draftThumb } from '../photo.js';
import { repeatText } from '../parse.js';

const WDS = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
/* Варианты повтора — от срока задачи: «каждый <день недели срока>», «каждое <число срока>». */
const repeatOpts = (t) => {
  const base = t.due && !isNaN(new Date(t.due)) ? new Date(t.due) : new Date();
  const wd = (base.getDay() + 6) % 7 + 1;
  const list = [['', 'Не повторять'], ['день', 'Каждый день'], ['будни', 'По будням'],
    ['нед:' + wd, 'Каждый ' + WDS[wd - 1]], ['мес:' + base.getDate(), 'Каждое ' + base.getDate() + '-е']];
  if (t.repeat && !list.some(([k]) => k === t.repeat)) list.splice(1, 0, [t.repeat, repeatText(t.repeat)]);
  return list;
};

/* Пункты поручения: отмечает исполнитель (и владелец), правит — владелец. */
function itemsBlock(t, worker) {
  const items = t.items || [];
  const editing = !worker && store.ui.itemsEdit === t.n;
  if (!items.length && worker) return '';
  const doneN = items.filter((x) => x.d).length;
  const me = store.me && store.me.name;
  return `<section style="display:flex;flex-direction:column;gap:8px" aria-label="Пункты">
    <div class="row-between"><h2 class="section-title">Пункты${items.length ? ' · ' + doneN + ' из ' + items.length : ''}</h2>
      ${worker ? '' : `<button class="link-btn" data-act="it-edit" style="padding:0 4px">${editing ? 'Готово' : items.length ? 'Изменить' : 'Добавить'}</button>`}</div>
    ${items.length ? `<div class="list">${items.map((x, i) => editing
      ? `<div class="kv"><span class="v" style="flex:1">${esc(x.t)}</span>
          <button class="icon-btn" data-act="it-drop" data-n="${t.n}" data-i="${i}" aria-label="Убрать пункт" style="width:36px;height:36px">${icon.close(16)}</button></div>`
      : `<button class="check-row${x.d ? ' on' : ''}" data-act="it-check" data-n="${t.n}" data-i="${i}" aria-pressed="${x.d}">
          <span class="check${x.d ? ' done' : ''}"><i>${x.d ? icon.check(14) : ''}</i></span>
          <span style="flex:1;${x.d ? 'text-decoration:line-through;color:#5A5F58' : ''}">${esc(x.t)}</span>
          ${x.d && x.at ? `<span class="small muted">${esc(x.by && x.by !== me ? x.by + ' · ' : '')}${hhmm(x.at)}</span>` : ''}</button>`).join('')}</div>`
      : (editing ? '' : '<div class="small muted" style="padding:0 4px">Разбейте дело на шаги — исполнитель отметит каждый, вы увидите, где он.</div>')}
    ${editing ? `<div class="input-row">
      <label class="sr" for="it-new">Новый пункт</label>
      <input id="it-new" type="text" placeholder="Добавить пункт" enterkeyhint="done" autocomplete="off">
      <button class="icon-btn green" data-act="it-plus" data-n="${t.n}" aria-label="Добавить пункт">${icon.plus(18)}</button></div>` : ''}
  </section>`;
}

function repeatRow(t, worker) {
  if (worker) return t.repeat ? `<div class="kv"><span class="k">Повтор</span><span class="v">${esc(repeatText(t.repeat))}</span></div>` : '';
  const open = store.ui.repeatEdit === t.n;
  return `<div class="kv"><span class="k">Повтор</span><span class="v">${t.repeat ? '🔁 ' + esc(repeatText(t.repeat)) : '<span class="muted">нет</span>'}</span>
      <button class="btn ghost" data-act="rep-toggle" style="height:36px;padding:0 6px">${t.repeat ? 'Сменить' : 'Задать'}</button></div>
    ${open ? `<div class="chips" style="padding:12px 14px;background:var(--bg2)">
      ${repeatOpts(t).map(([k, l]) => `<button class="chip${k === (t.repeat || '') ? ' on' : ''}" style="height:40px" data-act="rep-set" data-n="${t.n}" data-v="${esc(k)}">${esc(l)}</button>`).join('')}
    </div>` : ''}`;
}

const pad = (n) => String(n).padStart(2, '0');

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

  const comments = (t.comments || []).map((c) => {
    const mine = worker ? c.who === store.me.name : !((d.people || []).some((p) => p.name === c.who));
    const onlyPhoto = (c.photos || []).length && c.text === 'фото';
    return `<div class="bubble${mine ? ' mine' : ''}"><div class="by">${esc(mine ? 'Вы' : c.who)} · ${hhmm(c.ts)}</div>${onlyPhoto ? '' : `<div style="margin-top:2px">${esc(c.text)}</div>`}${c.localPhoto ? draftThumb(c.localPhoto, 'noop') : thumbs(c.photos)}</div>`;
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
        ${[['0', 'Сегодня'], ['1', 'Завтра']].map(([k, l]) => `<button class="chip${store.ui.moveDay === k ? ' on' : ''}" style="height:40px" data-act="move-day" data-v="${k}">${l}</button>`).join('')}
        <button class="chip now" style="height:40px" data-act="move-now" data-n="${n}">⚡ Немедленно</button>
        <button class="chip${store.ui.moveCal ? ' on' : ''}" style="height:40px" data-act="move-cal">Другая дата</button>
      </div>
      ${store.ui.moveDay != null ? `<div style="padding:0 14px 14px;background:var(--bg2)">${timePanel(store.ui.moveDay, '', 'mtp')}</div>` : ''}
      ${store.ui.moveCal ? `<div style="padding:0 14px 14px;background:var(--bg2);display:flex;flex-direction:column;gap:10px">
        ${calendar(store.ui.moveCal, 'mcal')}
        <button class="btn primary" data-act="move-cal-ok" data-n="${n}">Перенести на ${esc(calSummary(store.ui.moveCal).toLowerCase())}</button>
      </div>` : ''}` : ''}
      ${t.order ? `<a class="kv" href="#/order/${encodeURIComponent(t.order)}" style="text-decoration:none;color:inherit"><span class="k">Заказ</span><span class="v"><span class="pill green" style="font-size:14px">${esc(t.order)}</span></span>${icon.next(18)}</a>` : ''}
      <div class="kv"><span class="k">Важность</span>
        <div class="levels" style="flex:1">${WEIGHTS.map((w) => {
          const X = weightLook[w], on = w === t.weight;
          return `<button data-act="weight" data-n="${n}" data-v="${w}" aria-pressed="${on}" style="height:36px;font-size:12px;background:${on ? X.ring : X.soft};color:${on ? '#fff' : X.softFg}">${X.label}</button>`;
        }).join('')}</div></div>
      ${t.state !== 'убрана' ? repeatRow(t, false) : ''}
    </div>`;

  const workerBody = `<div class="list">
      <div class="kv"><span class="k">От кого</span><span class="v">Мастер</span></div>
      <div class="kv"><span class="k">Срок</span><span class="v">${esc(dueText(t.due))}</span><span class="pill" style="background:${L.bg};color:${L.fg}">${L.label}</span></div>
      ${t.order ? `<a class="kv" href="#/order/${encodeURIComponent(t.order)}" style="text-decoration:none;color:inherit"><span class="k">Заказ</span><span class="v">${esc(t.order)}</span>${icon.next(18)}</a>` : ''}
      ${repeatRow(t, true)}
    </div>`;

  return `<main class="screen with-cta">
    <div class="topbar">
      <a class="link-btn" href="${back}">${icon.back(20)} ${worker ? 'Смена' : 'Задачи'}</a>
      ${t.to && !worker ? '<span class="pill bronze" style="font-size:13px">Поручено</span>' : ''}
    </div>
    <h1 style="font-size:24px;font-weight:700;line-height:1.25;${done ? 'text-decoration:line-through;color:#8C918A' : ''}">${esc(t.text)}</h1>
    ${worker ? workerBody : ownerBody}
    ${itemsBlock(t, worker)}
    ${steps}
    <section style="display:flex;flex-direction:column;gap:8px" aria-label="Переписка">
      <h2 class="section-title">${t.to ? 'Переписка' : 'Комментарии'}</h2>
      ${comments || `<div class="small muted" style="padding:0 4px">${t.to ? 'Пока ни слова. Напишите, если нужно уточнить.' : 'Записывайте сюда, что сделано и что дальше.'}</div>`}
      ${draftThumb(store.ui.cmtPhoto)}
      <div class="input-row">
        <button class="icon-btn" data-act="cmt-photo" aria-label="Приложить фото">${icon.camera(20)}</button>
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
  const it = root.querySelector('#it-new');
  if (it) it.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="it-plus"]').click(); } };
  const input = root.querySelector('#cmt');
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="comment"]').click(); } });
}

const upd = (n, patch, ok) => store.act('taskUpdate', Object.assign({ n }, patch), (d) => {
  const x = d.tasks.find((y) => y.n === n); if (x) Object.assign(x, patch);
}, ok);

export const on = {
  'toggle-to': () => { store.ui.changeTo = store.ui.changeTo ? null : Number(location.hash.split('/')[2]); store.emit(); },
  'set-to': (el) => { store.ui.changeTo = null; return upd(Number(el.dataset.n), { to: el.dataset.v }, el.dataset.v ? 'Передал — уведомление ушло' : 'Теперь это ваша задача'); },
  'move': () => { const n = Number(location.hash.split('/')[2]); store.ui.moving = store.ui.moving === n ? null : n; store.ui.moveCal = null; store.ui.moveDay = null; store.emit(); },
  'move-day': (el) => {
    store.ui.moveDay = store.ui.moveDay === el.dataset.v ? null : el.dataset.v; store.ui.moveCal = null; store.emit();
    setTimeout(() => document.getElementById('mtp')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  },
  'tp-time': (el) => {
    const day = Number(store.ui.moveDay || 0);
    if (!timeOk(day, el.dataset.v)) return;
    const v = dayValue(day, el.dataset.v);
    store.ui.moving = null; store.ui.moveDay = null;
    return upd(curN(), { due: v.toISOString() }, 'Перенёс ✓');
  },
  'move-now': (el) => { store.ui.moving = null; store.ui.moveDay = null; store.ui.moveCal = null; return upd(Number(el.dataset.n), { due: new Date().toISOString() }, 'Срок — немедленно'); },
  'move-cal': () => {
    const t = ((store.data && store.data.tasks) || []).find((x) => x.n === Number(location.hash.split('/')[2]));
    store.ui.moveDay = null;
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
    const photo = store.ui.cmtPhoto || null;
    if (!text && !photo) { input.focus(); return; }
    input.value = '';
    store.ui.cmtPhoto = null;
    const who = store.me && store.me.role === 'worker' ? store.me.name : 'Вы';
    const payload = { n, text };
    if (photo) payload.photo = photo;
    await store.act('taskComment', payload, (d) => {
      const x = d.tasks.find((y) => y.n === n); if (x) x.comments.push({ ts: new Date().toISOString(), who, text: text || 'фото', localPhoto: photo });
    }, photo ? 'Фото отправлено' : '');
  },
};

/* Пункты: отметка — сразу на экране, запрос в фоне (можно и без связи). */
const curN = () => Number(location.hash.split('/')[2]);
const saveItems = (n, list, ok) => store.act('taskUpdate', { n, items: list.map((x) => x.t) }, (d) => {
  const x = d.tasks.find((y) => y.n === n); if (x) x.items = list;
}, ok);
on['it-check'] = (el) => {
  const n = Number(el.dataset.n), i = Number(el.dataset.i);
  const t = ((store.data && store.data.tasks) || []).find((x) => x.n === n);
  const it = t && (t.items || [])[i];
  if (!it) return;
  const done = !it.d;
  const left = t.items.filter((x, j) => j !== i && !x.d).length;
  return store.act('taskCheck', { n, i, done }, (d) => {
    const x = d.tasks.find((y) => y.n === n);
    if (x && x.items[i]) Object.assign(x.items[i], { d: done, by: done ? (store.me && store.me.name) : '', at: done ? new Date().toISOString() : '' });
  }, done && !left ? 'Все пункты отмечены ✓' : '');
};
on['it-edit'] = () => { store.ui.itemsEdit = store.ui.itemsEdit === curN() ? null : curN(); store.emit(); };
on['it-drop'] = (el) => {
  const n = Number(el.dataset.n), i = Number(el.dataset.i);
  const t = ((store.data && store.data.tasks) || []).find((x) => x.n === n);
  if (!t) return;
  return saveItems(n, t.items.filter((x, j) => j !== i));
};
on['it-plus'] = (el) => {
  const n = Number(el.dataset.n);
  const inp = document.getElementById('it-new');
  const text = ((inp && inp.value) || '').trim();
  if (!text) { inp && inp.focus(); return; }
  const t = ((store.data && store.data.tasks) || []).find((x) => x.n === n);
  if (!t) return;
  if ((t.items || []).some((x) => x.t === text)) { store.say('Такой пункт уже есть', 'error'); return; }
  inp.value = '';
  const r = saveItems(n, (t.items || []).concat([{ t: text, d: false }]));
  setTimeout(() => document.getElementById('it-new')?.focus(), 0);
  return r;
};
on['rep-toggle'] = () => { store.ui.repeatEdit = store.ui.repeatEdit === curN() ? null : curN(); store.emit(); };
on['rep-set'] = (el) => {
  store.ui.repeatEdit = null;
  return upd(Number(el.dataset.n), { repeat: el.dataset.v }, el.dataset.v ? 'Повтор: ' + repeatText(el.dataset.v) : 'Больше не повторяется');
};

on['cmt-photo'] = async () => { const d = await pickPhoto(); if (d) { store.ui.cmtPhoto = d; store.emit(); } };
on['ph-drop'] = () => { store.ui.cmtPhoto = null; store.emit(); };
on['noop'] = () => {};

export const onChange = {
  'move-pick': (el) => { if (!el.value) return; store.ui.moving = null; upd(Number(el.dataset.n), { due: new Date(el.value).toISOString() }, 'Перенёс'); },
};

export { ago, pad };
