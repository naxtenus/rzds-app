/* Новая задача — себе или кому-то из цеха. Всё выбирается нажатием:
   кому, срок, важность, заказ. Печатать нужно только саму задачу.

   Волна 3 (30.09): можно написать всё одной строкой — «заказать электроды
   завтра 15:00 слесарю срочно» — и кнопки ниже встанут сами (разбор в
   js/parse.js, прямо в телефоне). Выбранное руками разбор не перебивает.
   Ещё: повтор (каждый день, по будням, раз в неделю, раз в месяц) и
   пункты — чек-лист внутри поручения. */

import { esc, icon, initial } from '../util.js';
import { weightLook, WEIGHTS } from '../ui.js';
import { store } from '../store.js';
import { calendar, calInit, calOn, calValue, timePanel, dayValue, timeOk, defaultTime, HOURS } from './calendar.js';
import { pickPhoto, draftThumb } from '../photo.js';
import { parseLine, repeatText, dueLabel } from '../parse.js';

/* Срок (04.10, просьба Павла): «Сегодня», «Завтра», «Немедленно», «Другая
   дата». После «Сегодня»/«Завтра» появляется выбор времени; «Немедленно» —
   срок прямо сейчас, исполнителю уходит уведомление «⚡ Немедленно», которое
   не исчезает с экрана, пока его не откроют. */
const dueOpts = (f) => (f.dueParsed ? [{ k: 'text', l: dueLabel(new Date(f.dueParsed)) }] : []).concat([
  { k: 'today', l: 'Сегодня' + (f.due === 'today' && f.time ? ' · ' + f.time : '') },
  { k: 'tom', l: 'Завтра' + (f.due === 'tom' && f.time ? ' · ' + f.time : '') },
  { k: 'now', l: '⚡ Немедленно' },
  { k: 'pick', l: 'Другая дата' },
]);
/* Срок как дата — или null, если ещё не выбран. */
function dueDate(f) {
  if (f.due === 'now') return new Date();
  if (f.due === 'text' && f.dueParsed) return new Date(f.dueParsed);
  if (f.due === 'pick') return calValue(f.cal);
  if (f.due === 'today' || f.due === 'tom') return f.time && timeOk(f.due === 'tom' ? 1 : 0, f.time) ? dayValue(f.due === 'tom' ? 1 : 0, f.time) : null;
  return null;
}

const WDS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const REPEATS = (f) => {
  const base = dueDate(f) || new Date();
  const wd = (base.getDay() + 6) % 7 + 1;
  const list = [['', 'Не повторять'], ['день', 'Каждый день'], ['будни', 'По будням'],
    ['нед:' + wd, 'Каждый ' + WDS[wd - 1]], ['мес:' + base.getDate(), 'Каждое ' + base.getDate() + '-е']];
  if (f.repeat && !list.some(([k]) => k === f.repeat)) list.splice(1, 0, [f.repeat, repeatText(f.repeat)]);
  return list;
};

/* Разбор строки: что понято — ставится в кнопки, если человек не выбрал руками. */
function applyParse(f, d) {
  const r = parseLine(f.text, { people: d.people || [], orders: d.orders || [] });
  const man = f.manual || (f.manual = {});
  const auto = f.auto || (f.auto = {});
  const setIf = (k, has, val, def) => {
    if (man[k]) return;
    if (has) { f[k] = val; auto[k] = true; } else if (auto[k]) { f[k] = def; auto[k] = false; }
  };
  setIf('to', r.to !== undefined, r.to, '');
  setIf('weight', !!r.weight, r.weight, 'обычная');
  setIf('order', !!r.order, r.order, '');
  setIf('repeat', !!r.repeat, r.repeat, '');
  if (!man.due) {
    if (r.due) { f.dueParsed = r.due.toISOString(); f.due = 'text'; auto.due = true; }
    else if (auto.due) { f.dueParsed = null; f.due = 'today'; f.time = defaultTime(0); auto.due = false; }
  }
  f.parsed = r.found.length ? r : null;
}

const draft = () => {
  if (!store.ui.draft) {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    store.ui.draft = { text: q.get('text') || '', to: q.get('to') || '', due: 'today', time: defaultTime(0), cal: null, weight: 'обычная', order: q.get('order') || '',
      repeat: '', items: [], manual: q.get('order') ? { order: true } : {} };
  }
  return store.ui.draft;
};

export function render() {
  const d = store.data || {};
  const f = draft();
  const people = [{ id: '', name: 'Мне' }].concat(d.people || []);
  const person = people.find((p) => p.id === f.to) || people[0];
  const isMe = !f.to;

  return `<main class="screen with-cta">
    <div class="topbar">
      <a class="link-btn" href="#/tasks" data-act="cancel">Отмена</a>
      <h1 class="h2">Новая задача</h1>
      <span style="width:58px"></span>
    </div>
    <label class="field">
      <span>Что сделать</span>
      <textarea rows="2" data-bind="text" id="nt-text" placeholder="Например: заказать электроды завтра 15:00 слесарю срочно" autocomplete="off">${esc(f.text)}</textarea>
    </label>
    ${f.parsed ? `<div class="parsed" aria-live="polite">${icon.check(16)}<span>Понял: <b>«${esc(f.parsed.text || '…')}»</b>${
      [f.parsed.to !== undefined ? (f.parsed.to ? esc(person.name) : 'себе') : '', f.parsed.due ? esc(dueLabel(f.parsed.due)) : '',
        f.parsed.weight || '', f.parsed.order ? 'заказ ' + esc(f.parsed.order) : '', f.parsed.repeat ? esc(repeatText(f.parsed.repeat)) : '']
        .filter(Boolean).map((x) => ' · ' + x).join('')}</span></div>` : ''}

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Кому</h2>
      <div class="chips">${people.map((p) => `<button class="chip person${p.id === f.to ? ' on' : ''}" data-act="set" data-k="to" data-v="${esc(p.id)}" aria-pressed="${p.id === f.to}">
        <span class="avatar lg${p.id ? '' : ' me'}">${p.id ? esc(initial(p.name)) : 'Я'}</span>${esc(p.name)}</button>`).join('')}</div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Срок</h2>
      <div class="chips">${dueOpts(f).map((o) => `<button class="chip${o.k === f.due ? ' on' : ''}${o.k === 'now' ? ' now' : ''}" data-act="set" data-k="due" data-v="${o.k}" aria-pressed="${o.k === f.due}">${esc(o.l)}</button>`).join('')}</div>
      ${f.due === 'today' || f.due === 'tom' ? timePanel(f.due === 'tom' ? 1 : 0, f.time) : ''}
      ${f.due === 'pick' ? calendar(f.cal || (f.cal = calInit())) : ''}
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Важность</h2>
      <div class="levels">${WEIGHTS.map((w) => {
        const L = weightLook[w], on = w === f.weight;
        return `<button data-act="set" data-k="weight" data-v="${w}" aria-pressed="${on}"
          style="background:${on ? L.ring : L.soft};color:${on ? '#fff' : L.softFg};border-color:${on ? L.ring : 'transparent'}">${L.label}</button>`;
      }).join('')}</div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">К заказу</h2>
      <div class="chips">${[{ code: '' }].concat(d.orders || []).map((o) => `<button class="chip${o.code === f.order ? ' on' : ''}" style="height:40px" data-act="set" data-k="order" data-v="${esc(o.code)}" aria-pressed="${o.code === f.order}">${o.code ? esc(o.code) : 'Без заказа'}</button>`).join('')}</div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Повторять</h2>
      <div class="chips">${REPEATS(f).map(([k, l]) => `<button class="chip${k === (f.repeat || '') ? ' on' : ''}" style="height:40px" data-act="set" data-k="repeat" data-v="${esc(k)}" aria-pressed="${k === (f.repeat || '')}">${esc(l)}</button>`).join('')}</div>
      ${f.repeat ? '<div class="small muted">Выполнили — следующая заведётся сама, с тем же текстом и исполнителем.</div>' : ''}
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Пункты${isMe ? '' : ' — исполнитель отметит каждый'}</h2>
      ${(f.items || []).length ? `<div class="list">${f.items.map((t, i) => `<div class="kv"><span class="check"><i></i></span><span class="v" style="flex:1">${esc(t)}</span>
        <button class="icon-btn" data-act="it-del" data-i="${i}" aria-label="Убрать пункт" style="width:36px;height:36px">${icon.close(16)}</button></div>`).join('')}</div>` : ''}
      <div class="input-row">
        <label class="sr" for="it-new">Новый пункт</label>
        <input id="it-new" type="text" placeholder="Добавить пункт" enterkeyhint="done" autocomplete="off">
        <button class="icon-btn green" data-act="it-add" aria-label="Добавить пункт">${icon.plus(18)}</button>
      </div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Фото</h2>
      ${draftThumb(f.photo)}
      <button class="btn" data-act="nt-photo" style="align-self:flex-start">${icon.camera(20)} ${f.photo ? 'Переснять' : 'Сфотографировать'}</button>
    </section>

    <div class="info${f.due === 'now' && !isMe ? ' red' : ''}">${icon.bell(20)}<span>${isMe
      ? (f.due === 'now' ? 'Срок — прямо сейчас.' : 'Напомню push-уведомлением за 1 час до срока.')
      : f.due === 'now'
        ? esc(person.name) + ' получит «⚡ Немедленно» сразу — уведомление не уйдёт с экрана, пока он его не откроет.'
        : esc(person.name) + ' получит push сразу. Вы увидите, когда он прочитает и возьмёт в работу.'}</span></div>
  </main>
  <div class="cta"><div class="in">
    <button class="btn primary" data-act="save" style="flex:1">${isMe ? 'Поставить себе' : (f.due === 'now' ? 'Поручить немедленно: ' : 'Поручить: ') + esc(person.name)}</button>
  </div></div>`;
}

export const on = {
  'nt-photo': async () => { const p = await pickPhoto(); if (p) { draft().photo = p; store.emit(); } },
  'ph-drop': () => { draft().photo = null; store.emit(); },
  'it-add': () => {
    const inp = document.querySelector('#it-new');
    const t = (inp && inp.value || '').trim();
    if (!t) { inp && inp.focus(); return; }
    (draft().items || (draft().items = [])).push(t);
    store.emit();
    setTimeout(() => document.querySelector('#it-new')?.focus(), 30);
  },
  'it-del': (el) => { draft().items.splice(Number(el.dataset.i), 1); store.emit(); },
  'set': (el) => {
    const f = draft();
    f[el.dataset.k] = el.dataset.v;
    (f.manual || (f.manual = {}))[el.dataset.k] = true;
    if (el.dataset.k === 'due' && el.dataset.v === 'pick' && !f.cal) f.cal = calInit();
    const day = el.dataset.v === 'tom' ? 1 : 0;
    /* Время с прошлого дня оставляем, только если оно есть среди кнопок
       этого дня: «через час · 22:15» у «завтра» не нарисовано (04.10). */
    if (el.dataset.k === 'due' && (el.dataset.v === 'today' || el.dataset.v === 'tom') &&
      (!timeOk(day, f.time) || (day === 1 && !HOURS.includes(f.time)))) f.time = defaultTime(day);
    store.emit();
    const box = el.dataset.k !== 'due' ? '' : el.dataset.v === 'pick' ? 'cal' : (el.dataset.v === 'today' || el.dataset.v === 'tom') ? 'tp' : '';
    if (box) setTimeout(() => document.getElementById(box)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  },
  'tp-time': (el) => { draft().time = el.dataset.v; store.emit(); },
  'cal-day': (el) => { if (calOn(draft().cal, el)) store.emit(); },
  'cal-time': (el) => { if (calOn(draft().cal, el)) store.emit(); },
  'cal-month': (el) => { if (calOn(draft().cal, el)) store.emit(); },
  'cancel': () => { store.ui.draft = null; },
  /* Отклик — сразу. Жалоба 29.09: после нажатия пять секунд ничего не
     происходило, хотелось нажать ещё раз. Теперь экран уходит в список
     мгновенно, задача уже там с пометкой «сохраняю…», а внизу строка
     состояния; подтверждение «поставлена ✓» — когда сервер ответил. Если
     сервер отказал — возвращаемся в форму, всё набранное на месте. */
  'save': () => {
    const f = draft();
    const text = ((f.parsed && f.parsed.text) || f.text || '').trim();
    if (!text) { store.say('Напишите, что сделать', 'error'); document.querySelector('[data-bind="text"]')?.focus(); return; }
    const dv = dueDate(f);
    if (!dv && f.due === 'pick') { store.say('Выберите день в календаре', 'error'); return; }
    if (!dv && (f.due === 'today' || f.due === 'tom')) { store.say('Выберите время', 'error'); document.getElementById('tp')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const due = dv ? dv.toISOString() : '';
    const task = { text, to: f.to, due, weight: f.weight, order: f.order };
    if (f.due === 'now') task.now = true;
    if (f.repeat) task.repeat = f.repeat;
    if ((f.items || []).length) task.items = f.items.slice();
    if (f.photo) task.photo = f.photo;
    const tmp = -Date.now();
    const kept = JSON.parse(JSON.stringify(f));
    store.ui.draft = null;
    location.hash = '#/tasks';
    store.say(task.to ? 'Отправляю поручение…' : 'Сохраняю задачу…', 'wait');
    return store.act('taskSave', { task }, (d) => {
      const now = new Date().toISOString();
      const t = Object.assign({ n: tmp, state: 'открыта', comments: [], saving: true, delivery: task.to ? { sent: now } : undefined }, task);
      delete t.photo;
      t.items = (task.items || []).map((x) => ({ t: x, d: false }));
      d.tasks.push(t);
    }, task.to ? 'Поручено — уведомление ушло ✓' : 'Задача поставлена ✓').then((res) => {
      if (!res) { store.ui.draft = kept; location.hash = '#/new'; }
      else if (res.created != null) { store.ui.flash = typeof res.created === 'object' ? res.created.n : res.created; store.emit(); }
      return res;
    });
  },
};

export function mount(root) {
  const ta = root.querySelector('#nt-text');
  if (ta) ta.addEventListener('input', () => {
    const f = draft();
    f.text = ta.value;
    applyParse(f, store.data || {});
    clearTimeout(ta._t);
    ta._t = setTimeout(() => store.emit(), 120);
  });
  const it = root.querySelector('#it-new');
  if (it) it.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); on['it-add'](); } };
  const f = draft();
  if (f.text && !f.parsedOnce) { f.parsedOnce = true; applyParse(f, store.data || {}); if (f.parsed) setTimeout(() => store.emit(), 0); }
}
