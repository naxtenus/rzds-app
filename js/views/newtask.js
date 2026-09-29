/* Новая задача — себе или кому-то из цеха. Всё выбирается нажатием:
   кому, срок, важность, заказ. Печатать нужно только саму задачу. */

import { esc, icon, initial } from '../util.js';
import { weightLook, WEIGHTS } from '../ui.js';
import { store } from '../store.js';
import { calendar, calInit, calOn, calValue } from './calendar.js';
import { pickPhoto, draftThumb } from '../photo.js';

const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; };
const pad = (n) => String(n).padStart(2, '0');
const at = (d, h) => { d = new Date(d); d.setHours(h, 0, 0, 0); return d; };

const DUES = () => {
  const now = new Date();
  const t17 = at(now, 17);
  const todayOpt = now < t17 ? { k: 'today', l: 'Сегодня 17:00', v: t17 } : { k: 'today', l: 'Сегодня 20:00', v: at(now, 20) };
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  const mon = nextMonday();
  return [todayOpt, { k: 'tom', l: 'Завтра 12:00', v: at(tm, 12) },
    { k: 'mon', l: 'Пн, ' + pad(mon.getDate()) + '.' + pad(mon.getMonth() + 1), v: at(mon, 12) },
    { k: 'none', l: 'Без срока', v: null }, { k: 'pick', l: 'Другая дата', v: 'pick' }];
};

const draft = () => {
  if (!store.ui.draft) {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    store.ui.draft = { text: '', to: q.get('to') || '', due: 'today', cal: null, weight: 'обычная', order: q.get('order') || '' };
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
      <textarea rows="2" data-bind="text" placeholder="Например: подготовить заготовки для ФДЗ" autocomplete="off">${esc(f.text)}</textarea>
    </label>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Кому</h2>
      <div class="chips">${people.map((p) => `<button class="chip person${p.id === f.to ? ' on' : ''}" data-act="set" data-k="to" data-v="${esc(p.id)}" aria-pressed="${p.id === f.to}">
        <span class="avatar lg${p.id ? '' : ' me'}">${p.id ? esc(initial(p.name)) : 'Я'}</span>${esc(p.name)}</button>`).join('')}</div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Срок</h2>
      <div class="chips">${DUES().map((o) => `<button class="chip${o.k === f.due ? ' on' : ''}" data-act="set" data-k="due" data-v="${o.k}" aria-pressed="${o.k === f.due}">${o.k === 'pick' ? '' : ''}${o.l}</button>`).join('')}</div>
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
      <h2 class="section-title" style="text-transform:none;letter-spacing:0;font-size:13px">Фото</h2>
      ${draftThumb(f.photo)}
      <button class="btn" data-act="nt-photo" style="align-self:flex-start">${icon.camera(20)} ${f.photo ? 'Переснять' : 'Сфотографировать'}</button>
    </section>

    <div class="info">${icon.bell(20)}<span>${isMe
      ? 'Напомню push-уведомлением за 1 час до срока.'
      : esc(person.name) + ' получит push сразу. Вы увидите, когда он прочитает и возьмёт в работу.'}</span></div>
  </main>
  <div class="cta"><div class="in">
    <button class="btn primary" data-act="save" style="flex:1">${isMe ? 'Поставить себе' : 'Поручить: ' + esc(person.name)}</button>
  </div></div>`;
}

export const on = {
  'nt-photo': async () => { const p = await pickPhoto(); if (p) { draft().photo = p; store.emit(); } },
  'ph-drop': () => { draft().photo = null; store.emit(); },
  'set': (el) => {
    const f = draft();
    f[el.dataset.k] = el.dataset.v;
    if (el.dataset.k === 'due' && el.dataset.v === 'pick' && !f.cal) f.cal = calInit();
    store.emit();
    if (el.dataset.k === 'due' && el.dataset.v === 'pick') {
      setTimeout(() => document.getElementById('cal')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  },
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
    const text = (f.text || '').trim();
    if (!text) { store.say('Напишите, что сделать', 'error'); document.querySelector('[data-bind="text"]')?.focus(); return; }
    const opt = DUES().find((o) => o.k === f.due);
    let due = opt && opt.v && opt.v !== 'pick' ? opt.v.toISOString() : '';
    if (f.due === 'pick') {
      const v = calValue(f.cal);
      if (!v) { store.say('Выберите день в календаре', 'error'); return; }
      due = v.toISOString();
    }
    const task = { text, to: f.to, due, weight: f.weight, order: f.order };
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
      d.tasks.push(t);
    }, task.to ? 'Поручено — уведомление ушло ✓' : 'Задача поставлена ✓').then((res) => {
      if (!res) { store.ui.draft = kept; location.hash = '#/new'; }
      else if (res.created != null) { store.ui.flash = typeof res.created === 'object' ? res.created.n : res.created; store.emit(); }
      return res;
    });
  },
};
