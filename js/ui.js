/* Общие куски экранов: вкладки, виды важности и статусов, подписи. */

import { esc, icon, initial, dueText, isOverdue } from './util.js';
import { store } from './store.js';

/* Важность — те же четыре ступени, что в планировщике (лист «Задачи»). */
export const WEIGHTS = ['срочно', 'важно', 'обычная', 'потом'];
export const weightLook = {
  'срочно': { label: 'Срочно', ring: '#C62828', bg: '#C62828', fg: '#FFFFFF', soft: '#FDE3DF', softFg: '#9E1B12' },
  'важно': { label: 'Важно', ring: '#E0533F', bg: '#FDE3DF', fg: '#9E1B12', soft: '#FDE3DF', softFg: '#9E1B12' },
  'обычная': { label: 'Обычная', ring: '#C98A2E', bg: '#FBEBD3', fg: '#6E440F', soft: '#FBEBD3', softFg: '#6E440F' },
  'потом': { label: 'Потом', ring: '#9A9F98', bg: '#ECEDEA', fg: '#4E534D', soft: '#ECEDEA', softFg: '#4E534D' },
};
export const weightPill = (w) => {
  const l = weightLook[w] || weightLook['обычная'];
  return `<span class="pill" style="background:${l.bg};color:${l.fg}">${l.label}</span>`;
};

/* Где сейчас поручение: отправлено → доставлено → прочитал → в работе. */
export const deliveryState = (t) => {
  if (t.state === 'закрыта') return { text: 'Выполнено', color: '#1F6436' };
  const d = t.delivery || {};
  if (d.taken) return { text: 'В работе', color: '#1F6436' };
  if (d.read) return { text: 'Прочитал', color: '#5A5F58' };
  if (d.delivered) return { text: 'Не прочитал', color: '#9A5B12' };
  /* «Доставлено» ставит сам телефон исполнителя, получив уведомление.
     Нет подтверждения десять минут — повод позвонить. */
  if (d.sent && Date.now() - new Date(d.sent) > 10 * 6e4) return { text: 'Не дошло?', color: '#9A5B12' };
  return { text: 'Отправлено', color: '#5A5F58' };
};

export const opLook = {
  'в работе': { cls: 'work', dot: '#1F6436', text: 'В работе', color: '#1F6436' },
  'проблема': { cls: 'problem', dot: '#C62828', text: 'Есть проблема', color: '#B3261E' },
  'ждёт решения': { cls: 'wait', dot: '#C98A2E', text: 'Ждёт решения', color: '#6E440F' },
  'выполнено': { cls: 'done', dot: '#9A9F98', text: 'Выполнено', color: '#5A5F58' },
  'пауза': { cls: 'wait', dot: '#C98A2E', text: 'Приостановлено', color: '#6E440F' },
  'план': { cls: 'plan', dot: '#AF7C58', text: 'По плану', color: '#6B4528' },
};
export const opL = (o) => opLook[o.status] || opLook['план'];

export const personName = (data, id) => {
  if (!id) return 'Мне';
  const p = ((data && data.people) || []).find((x) => x.id === id);
  return p ? p.name : id;
};

export const avatar = (name, me) => `<span class="avatar${me ? ' me' : ''}">${esc(me ? 'Я' : initial(name))}</span>`;

export const dueHtml = (t) => {
  const over = t.state === 'открыта' && isOverdue(t.due);
  return `<span class="strong" style="color:${over ? '#B3261E' : '#5A5F58'};font-weight:600">${esc(dueText(t.due))}</span>`;
};

export const tabbar = (active, data) => {
  const pending = ((data && data.pending) || []).length;
  const t = (id, href, ic, label, badge) => `
    <a class="tab${active === id ? ' on' : ''}" href="${href}" ${active === id ? 'aria-current="page"' : ''}>
      ${ic(24)}${badge ? `<span class="badge">${badge}</span>` : ''}${label}
    </a>`;
  return `<nav class="tabbar" aria-label="Разделы"><div class="in">
    ${t('today', '#/today', icon.today, 'Сегодня')}
    ${t('plan', '#/plan', icon.plan, 'План')}
    ${t('tasks', '#/tasks', icon.tasks, 'Задачи')}
    ${t('replies', '#/replies', icon.chat, 'Ответы', pending)}
  </div></nav>`;
};

export const checkBtn = (t, act = 'task-toggle') => `
  <button class="check${t.state === 'закрыта' ? ' done' : ''}" data-act="${act}" data-n="${t.n}"
    aria-label="${t.state === 'закрыта' ? 'Вернуть в работу' : 'Отметить выполненной'}"
    ${t.state === 'закрыта' ? '' : `style="--r:${(weightLook[t.weight] || weightLook['обычная']).ring}"`}>
    <i style="${t.state === 'закрыта' ? '' : 'border-color:' + (weightLook[t.weight] || weightLook['обычная']).ring}">${t.state === 'закрыта' ? icon.check(14) : ''}</i>
  </button>`;

/* В списке задач: повтор и пункты («🔁», «2/5»). */
export const taskExtras = (t) => {
  const it = t.items || [];
  const d = it.filter((x) => x.d).length;
  return (t.repeat ? '<span class="muted" title="Повторяется" aria-label="Повторяется">🔁</span>' : '') +
    (it.length ? `<span class="muted strong" style="${d === it.length ? 'color:var(--green)' : ''}" aria-label="Пункты: ${d} из ${it.length}">☑ ${d}/${it.length}</span>` : '');
};

/* Кнопка «Обновить» на главном экране (04.10, просьба Павла). Пока идёт
   загрузка — крутится; итог — «Обновлено ✓» или почему не вышло. */
export const refreshBtn = () => `<button class="icon-btn${store.loud ? ' spinning' : ''}" data-act="reload-data" aria-label="Обновить">${icon.refresh(22)}</button>`;
export const reloadData = () => { store.ui.askRefresh = true; return store.refresh(); };
