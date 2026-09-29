/* Задачи: себе и поручения другим. Одним списком, с фильтром
   «Все / Мне / Поручил». У поручения видно, дошло ли оно до человека. */

import { esc, icon, startOfDay, isOverdue, plural, parseDue } from '../util.js';
import { tabbar, checkBtn, weightPill, deliveryState, personName, avatar, dueHtml, WEIGHTS } from '../ui.js';
import { store } from '../store.js';

const byDue = (a, b) => (parseDue(a.due) || 8.64e15) - (parseDue(b.due) || 8.64e15)
  || WEIGHTS.indexOf(a.weight) - WEIGHTS.indexOf(b.weight);

export function taskRow(d, t) {
  const del = t.to ? deliveryState(t) : null;
  const n = (t.comments || []).length;
  if (t.saving || t.n < 0) {
    return `<div class="task saving${t.queued ? ' queued' : ''}" aria-busy="${!t.queued}" id="task-saving">
    <span class="check">${t.queued ? icon.clock(18) : '<i class="spinner" aria-hidden="true"></i>'}</span>
    <div class="body"><span class="text">${esc(t.text)}</span>
      <span class="meta">${t.to ? `<span class="who">${avatar(personName(d, t.to))}${esc(personName(d, t.to))}</span>` : ''}
        <span class="strong" style="color:${t.queued ? 'var(--bronze-d, #8A5A34)' : 'var(--green)'}">${t.queued ? 'ждёт отправки — нет связи' : t.to ? 'отправляю…' : 'сохраняю…'}</span></span></div>
  </div>`;
  }
  return `<div class="task${t.state === 'закрыта' ? ' is-done' : ''}${store.ui.flash === t.n ? ' flash' : ''}" id="task-${t.n}">
    ${checkBtn(t)}
    <a class="body" href="#/task/${t.n}">
      <span class="text">${esc(t.text)}</span>
      <span class="meta">
        ${t.to ? `<span class="who">${avatar(personName(d, t.to))}${esc(personName(d, t.to))}</span>
          <span style="color:${del.color};font-weight:600">${del.text}</span>` : ''}
        ${dueHtml(t)}
        ${weightPill(t.weight)}
        ${n ? `<span class="muted" style="display:inline-flex;align-items:center;gap:4px">${icon.chat(14)}${n}</span>` : ''}
      </span>
    </a>
  </div>`;
}

export function render() {
  const d = store.data || {};
  const mode = store.ui.taskMode || 'all';
  const all = (d.tasks || []).filter((t) => t.state !== 'убрана');
  const open = all.filter((t) => t.state === 'открыта');
  const mine = open.filter((t) => !t.to), given = open.filter((t) => t.to);
  const today = startOfDay(new Date()), tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const groups = [];
  if (mode !== 'given') {
    const over = mine.filter((t) => isOverdue(t.due)).sort(byDue);
    const todayL = mine.filter((t) => !isOverdue(t.due) && t.due && parseDue(t.due) < tomorrow).sort(byDue);
    const later = mine.filter((t) => !isOverdue(t.due) && (!t.due || parseDue(t.due) >= tomorrow)).sort(byDue);
    if (over.length) groups.push({ title: 'Просрочено', color: '#B3261E', list: over });
    if (todayL.length) groups.push({ title: 'Мне · сегодня', color: '#1F6436', list: todayL });
    if (later.length) groups.push({ title: 'Мне · дальше', color: '#5A5F58', list: later });
  }
  if (mode !== 'mine' && given.length) groups.push({ title: 'Поручил другим', color: '#6B4528', list: given.sort(byDue) });
  const done = all.filter((t) => t.state === 'закрыта' && (mode === 'all' || (mode === 'mine' ? !t.to : t.to)));

  const seg = [['all', 'Все'], ['mine', 'Мне'], ['given', 'Поручил']]
    .map(([k, l]) => `<button role="tab" aria-selected="${k === mode}" class="${k === mode ? 'on' : ''}" data-act="mode" data-m="${k}">${l}</button>`).join('');

  return `<main class="screen">
    <header class="head" style="align-items:flex-end">
      <div>
        <h1 class="title" style="margin:0">Задачи</h1>
        <div class="sub">Мне ${mine.length} · поручил ${given.length}</div>
      </div>
      <a class="btn primary" href="#/new" style="height:48px;border-radius:16px">${icon.plus(20)} Задача</a>
    </header>
    <div class="segment" role="tablist" aria-label="Фильтр" style="grid-template-columns:repeat(3,minmax(0,1fr))">${seg}</div>
    ${groups.map((g) => `<section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title" style="color:${g.color}">${g.title}</h2>
      <div class="list">${g.list.map((t) => taskRow(d, t)).join('')}</div>
    </section>`).join('') || `<div class="card empty">${mode === 'given' ? 'Поручений нет. Нажмите «Задача» и выберите, кому.' : 'Открытых задач нет'}</div>`}
    ${done.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <button class="link-btn" data-act="show-done" style="align-self:flex-start;color:#5A5F58">${store.ui.showDone ? 'Скрыть' : 'Показать'} выполненные (${done.length})</button>
      ${store.ui.showDone ? `<div class="list">${done.slice(-20).reverse().map((t) => taskRow(d, t)).join('')}</div>` : ''}
    </section>` : ''}
  </main>${tabbar('tasks', d)}`;
}

/* Только что поставленная задача — на виду: список прокручивается к ней,
   строка коротко подсвечивается. Иначе поручение с дальним сроком уезжает
   вниз списка, и снова кажется, что ничего не произошло. */
export function mount(root) {
  const el = root.querySelector('#task-saving') || (store.ui.flash != null && root.querySelector('#task-' + store.ui.flash));
  if (!el || store.ui.flashShown === (el.id + store.ui.flash)) return;
  store.ui.flashShown = el.id + store.ui.flash;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (el.classList.contains('flash')) setTimeout(() => { store.ui.flash = null; }, 2500);
}

export const toggleTask = async (n) => {
  const t = (store.data.tasks || []).find((x) => x.n === n);
  if (!t) return;
  const state = t.state === 'закрыта' ? 'открыта' : 'закрыта';
  await store.act('taskUpdate', { n, state }, (d) => {
    const x = d.tasks.find((y) => y.n === n); if (x) x.state = state;
  }, state === 'закрыта' ? 'Выполнено ✓' : 'Вернул в работу');
};

export const on = {
  'mode': (el) => { store.ui.taskMode = el.dataset.m; store.emit(); },
  'task-toggle': (el) => toggleTask(Number(el.dataset.n)),
  'show-done': () => { store.ui.showDone = !store.ui.showDone; store.emit(); },
};

export { plural };
