/* Мелкие помощники: экранирование, даты, иконки. */

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const pad = (n) => String(n).padStart(2, '0');

export const hhmm = (d) => {
  d = d instanceof Date ? d : new Date(d);
  return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes());
};

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const dayTitle = (d) => {
  d = new Date(d);
  const w = WD[d.getDay()];
  return w[0].toUpperCase() + w.slice(1) + ', ' + d.getDate() + ' ' + MON[d.getMonth()];
};

export const dayShort = (d) => {
  d = new Date(d);
  return WD_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()];
};

export const startOfDay = (d) => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };

export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

/* «сегодня 15:00», «завтра», «вчера», «ср, 30.09» — как говорят в цеху. */
/* Срок из таблицы бывает днём без времени («2026-09-30») — это местная
   дата, а не полночь по Гринвичу (иначе в Москве вышло бы «03:00»). */
export const parseDue = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) { const d = new Date(+m[1], m[2] - 1, +m[3]); d.dayOnly = true; return d; }
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

export const dueText = (iso, withTime = true) => {
  if (!iso) return 'без срока';
  const d = parseDue(iso);
  if (!d) return String(iso);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  const t = withTime && !d.dayOnly && (d.getHours() || d.getMinutes()) ? ' ' + hhmm(d) : '';
  if (days === 0) return (t ? 'до' + t : 'сегодня');
  if (days === 1) return 'завтра' + t;
  if (days === -1) return 'вчера' + t;
  return WD_SHORT[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + t;
};

export const isOverdue = (iso) => {
  const d = parseDue(iso);
  if (!d) return false;
  if (d.dayOnly) { const end = new Date(d); end.setDate(end.getDate() + 1); return end <= new Date(); }
  return d < new Date();
};

export const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 6e4);
  if (m < 1) return 'только что';
  if (m < 60) return m + ' мин назад';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' ч назад';
  return dueText(iso, false);
};

export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

export const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

/* Иконки — тонкие контурные, цвет берут от текста. */
const I = (d, w = 22, extra = '') =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icon = {
  bell: (w) => I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', w),
  today: (w) => I('<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>', w),
  plan: (w) => I('<path d="M4 6h10M8 12h12M4 18h8"/>', w),
  tasks: (w) => I('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', w),
  chat: (w) => I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', w),
  check: (w) => I('<path d="M20 6L9 17l-5-5"/>', w, 'stroke-width="3"'),
  plus: (w) => I('<path d="M12 5v14M5 12h14"/>', w, 'stroke-width="2.6"'),
  back: (w) => I('<path d="M15 18l-6-6 6-6"/>', w, 'stroke-width="2.4"'),
  next: (w) => I('<path d="M9 18l6-6-6-6"/>', w, 'stroke-width="2.4"'),
  close: (w) => I('<path d="M6 6l12 12M18 6L6 18"/>', w, 'stroke-width="2.4"'),
  phone: (w) => I('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>', w),
  camera: (w) => I('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>', w),
  doc: (w) => I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', w),
  search: (w) => I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', w, 'stroke-width="2.2"'),
  link: (w) => I('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', w),
  clock: (w) => I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', w),
  alert: (w) => I('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', w),
  play: (w) => `<svg width="${w || 24}" height="${w || 24}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`,
  send: (w) => I('<path d="M5 12h14M13 6l6 6-6 6"/>', w, 'stroke-width="2.4"'),
  share: (w) => I('<path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', w),
  addBox: (w) => I('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>', w),
  user: (w) => I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', w),
  refresh: (w) => I('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', w),
  logout: (w) => I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>', w),
};

/* Лёгкая вибрация на нажатие главных кнопок — на Android; айфон молчит. */
export const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} };

export const uid = () => Math.random().toString(36).slice(2, 10);
