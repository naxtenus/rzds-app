/* Календарь срока — виден сразу, без скрытых полей.

   Раньше «Дата…» открывала системное поле даты iOS, а до первого нажатия
   оно выглядело пустой белой полоской (жалоба владельца, 29.09). Теперь
   месяц нарисован целиком: сегодня обведено, выходные серые, прошедшие дни
   не нажимаются, выбранный день залит зелёным. Время — крупными кнопками,
   самые частые цеховые часы. Над календарём словами: что сейчас выбрано.

   Состояние живёт в объекте st, который хранит экран-хозяин:
     { month: 'ГГГГ-ММ', date: 'ГГГГ-ММ-ДД', time: 'ЧЧ:ММ' }
   Нажатия приходят сюда через calOn(st, el) — экран сам решает, где st. */

import { esc } from '../util.js';

const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль',
  'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WD_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const TIMES = ['08:00', '10:00', '12:00', '14:00', '15:00', '17:00', '19:00'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/* Новое состояние: по умолчанию — завтра, 17:00. */
export function calInit(iso) {
  let d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) { d = today(); d.setDate(d.getDate() + 1); d.setHours(17, 0, 0, 0); }
  return { month: d.getFullYear() + '-' + pad(d.getMonth() + 1), date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
}

export const calValue = (st) => (st && st.date ? new Date(st.date + 'T' + (st.time || '17:00')) : null);

export function calSummary(st) {
  const v = calValue(st);
  if (!v) return 'Выберите день';
  return WD_LONG[v.getDay()][0].toUpperCase() + WD_LONG[v.getDay()].slice(1) + ', ' + v.getDate() + ' ' + MON_G[v.getMonth()] + ', ' + (st.time || '17:00');
}

/* Не календарный месяц, а пять недель начиная с текущей: 29-го числа
   месячная сетка — это четыре недели серых прошедших дней и два живых
   (так и вышло на первом снимке). Цеху нужны ближайшие недели. */
const MON_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monday = (d) => { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const WEEKS = 5;

export function calendar(st, idp = 'cal') {
  const t0 = today();
  const from = st.from ? new Date(st.from + 'T00:00') : monday(t0);
  const to = new Date(from); to.setDate(to.getDate() + WEEKS * 7 - 1);
  const canBack = from > monday(t0);
  const cells = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(from); d.setDate(from.getDate() + i);
    const key = ymd(d);
    const past = d < t0;
    const isToday = d.getTime() === t0.getTime();
    const sel = key === st.date;
    const wknd = d.getDay() === 0 || d.getDay() === 6;
    const newMonth = d.getDate() === 1 || i === 0;
    cells.push(`<button class="cal-d${sel ? ' sel' : ''}${isToday ? ' today' : ''}${wknd ? ' wknd' : ''}"
      data-act="cal-day" data-v="${key}" ${past ? 'disabled' : ''} aria-pressed="${sel}"
      aria-label="${d.getDate()} ${MON_G[d.getMonth()]}${isToday ? ', сегодня' : ''}">${newMonth ? `<small>${MON_S[d.getMonth()]}</small>` : ''}${d.getDate()}</button>`);
  }
  const range = from.getDate() + ' ' + MON_S[from.getMonth()] + ' — ' + to.getDate() + ' ' + MON_S[to.getMonth()];
  return `<div class="cal" id="${idp}">
    <div class="cal-sum" aria-live="polite">${esc(calSummary(st))}</div>
    <div class="cal-head">
      <button class="icon-btn" data-act="cal-month" data-v="-1" aria-label="Раньше" ${canBack ? '' : 'disabled'}>‹</button>
      <b>${range}</b>
      <button class="icon-btn" data-act="cal-month" data-v="1" aria-label="Дальше">›</button>
    </div>
    <div class="cal-wd">${WD.map((w, i) => `<span${i > 4 ? ' class="wknd"' : ''}>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="cal-times" role="group" aria-label="Время">
      ${TIMES.map((t) => `<button class="chip${t === st.time ? ' on' : ''}" data-act="cal-time" data-v="${t}" aria-pressed="${t === st.time}">${t}</button>`).join('')}
    </div>
  </div>`;
}

/* true — состояние изменилось, экран надо перерисовать. */
export function calOn(st, el) {
  const a = el.dataset.act, v = el.dataset.v;
  if (a === 'cal-day') { st.date = v; return true; }
  if (a === 'cal-time') { st.time = v; return true; }
  if (a === 'cal-month') {
    const from = st.from ? new Date(st.from + 'T00:00') : monday(today());
    from.setDate(from.getDate() + Number(v) * WEEKS * 7);
    const floor = monday(today());
    st.from = ymd(from < floor ? floor : from);
    return true;
  }
  return false;
}
