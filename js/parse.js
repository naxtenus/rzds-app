/* Ввод задачи одной строкой.

   «заказать электроды завтра 15:00 слесарю срочно» → задача «Заказать
   электроды», кому — Слесарь, срок — завтра 15:00, важность — срочно.
   Разбор идёт прямо в телефоне, на каждую букву, без сервера: под полем
   видно, что понято, и всё понятое можно поправить кнопками ниже.

   Что узнаётся:
   — срок: сегодня, завтра, послезавтра, в понедельник…воскресенье (пн…вс),
     через 3 дня, через неделю, 30.09, 30 сентября; время 15:00, в 15, к 9;
   — повтор: каждый день / ежедневно, по будням, каждый понедельник,
     по пн и чт, каждое 15 число;
   — кому: имя из списка людей в любом падеже («слесарю», «Игошеву»);
     «себе», «мне» — себе;
   — важность: срочно, важно, потом;
   — заказ: код заказа из плана («ФДЗ», «ВР-300», «фд 4»). */

const pad = (n) => String(n).padStart(2, '0');
const WD = [['пн', 'понедельник', 'понедельника', 'понедельникам'], ['вт', 'вторник', 'вторника', 'вторникам'],
  ['ср', 'среда', 'среду', 'среды', 'средам'], ['чт', 'четверг', 'четверга', 'четвергам'],
  ['пт', 'пятница', 'пятницу', 'пятницы', 'пятницам'], ['сб', 'суббота', 'субботу', 'субботы', 'субботам'],
  ['вс', 'воскресенье', 'воскресенья', 'воскресеньям']];
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const wdIndex = (w) => WD.findIndex((forms) => forms.includes(w));
const WDRE = WD.flat().sort((a, b) => b.length - a.length).join('|');

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
/* Основа слова для сравнения падежей: «слесарь» → «слесар», «игошев» → «игошев». */
const stem = (w) => { w = norm(w); return w.length > 5 ? w.replace(/(ь|ю|я|у|а|ом|ем|ой|ей|ым|ов|ев)$/, '') : w; };

export function parseLine(line, ctx = {}) {
  const people = ctx.people || [];
  const orders = ctx.orders || [];
  const now = ctx.now ? new Date(ctx.now) : new Date();
  let s = ' ' + String(line || '') + ' ';
  const out = { text: '', found: [] };
  const cut = (re, fn) => {
    const m = re.exec(s);
    if (!m) return false;
    const r = fn(m);
    if (r === false) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return true;
  };
  /* Без «просмотра назад» (?<=…): его нет в Safari до iOS 16.4, а у
     рабочих телефоны бывают старые — модуль просто не загрузился бы. */
  const B = '(?:^|[\\s,.;:!?(])', E = '(?=[\\s,.;:!?)]|$)';
  const rx = (body) => new RegExp(B + body + E, 'i');

  /* важность */
  cut(rx('(очень\\s+)?(срочно|срочная|срочный|важно|важная|потом|не\\s+срочно)'), (m) => {
    const w = norm(m[2]);
    out.weight = /^срочн/.test(w) ? 'срочно' : /^важн/.test(w) ? 'важно' : 'потом';
  });

  /* повтор */
  cut(rx('(каждый\\s+день|ежедневно|каждое\\s+утро)'), () => { out.repeat = 'день'; });
  if (!out.repeat) cut(rx('(по\\s+будням|каждый\\s+будний\\s+день)'), () => { out.repeat = 'будни'; });
  if (!out.repeat) cut(rx('(?:каждое|ежемесячно)\\s+(\\d{1,2})(?:\\s*-?\\s*(?:е|го))?(?:\\s+числ[оа])?'), (m) => { out.repeat = 'мес:' + Number(m[1]); });
  if (!out.repeat) cut(rx('(?:каждый|каждую|каждое|по)\\s+((?:' + WDRE + ')(?:\\s*(?:,|и)\\s*(?:' + WDRE + '))*)'), (m) => {
    const days = norm(m[1]).split(/\s*(?:,|\sи\s)\s*/).map(wdIndex).filter((i) => i >= 0).map((i) => i + 1);
    if (!days.length) return false;
    out.repeat = 'нед:' + [...new Set(days)].sort().join(',');
  });
  if (!out.repeat) cut(rx('(каждую\\s+неделю|еженедельно)'), () => { out.repeat = 'нед:' + (((now.getDay() + 6) % 7) + 1); });

  /* время */
  let hh = null, mm = 0;
  cut(rx('(?:(в|к|до)\\s*)?(\\d{1,2})([:.])(\\d{2})'), (m) => {
    if (Number(m[2]) > 23 || Number(m[4]) > 59) return false;
    /* «5.10» без «в/к/до» — это дата, а не 5:10; «9.30» — время (30-го месяца нет). */
    if (m[3] === '.' && !m[1] && Number(m[4]) <= 12) return false;
    hh = Number(m[2]); mm = Number(m[4]);
  });
  if (hh === null) cut(rx('(?:в|к|до)\\s+(\\d{1,2})(?:\\s*(?:ч|час(?:а|ов|ам)?))?'), (m) => {
    const h = Number(m[1]);
    if (h < 6 || h > 22) return false;
    hh = h;
  });

  /* день */
  let day = null;
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const plus = (n) => { const d = new Date(d0); d.setDate(d.getDate() + n); return d; };
  cut(rx('(сегодня|завтра|послезавтра)'), (m) => { day = plus({ сегодня: 0, завтра: 1, послезавтра: 2 }[norm(m[1])]); });
  if (!day) cut(rx('через\\s+(\\d{1,2}|одну|один|два|две|три|пять)?\\s*(день|дня|дней|недел[юи]|неделю)'), (m) => {
    const words = { одну: 1, один: 1, два: 2, две: 2, три: 3, пять: 5 };
    const k = m[1] ? (Number(m[1]) || words[norm(m[1])] || 1) : 1;
    day = plus(/недел/.test(m[2]) ? 7 * k : k);
  });
  if (!day) cut(rx('(?:в|во|к|до)?\\s*(' + WDRE + ')'), (m) => {
    const i = wdIndex(norm(m[1]));
    if (i < 0) return false;
    const today = (now.getDay() + 6) % 7;
    let k = (i - today + 7) % 7;
    if (k === 0) k = 7;
    day = plus(k);
  });
  if (!day) cut(rx('(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?'), (m) => {
    const d = Number(m[1]), mo = Number(m[2]) - 1;
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return false;
    let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear();
    let x = new Date(y, mo, d);
    if (!m[3] && x < d0) x = new Date(y + 1, mo, d);
    day = x;
  });
  if (!day) cut(rx('(\\d{1,2})\\s+(' + MONTHS.join('|') + ')[а-я]*'), (m) => {
    const mo = MONTHS.indexOf(norm(m[2]).replace(/[яеь]$/, ''));
    const mi = mo >= 0 ? mo : MONTHS.findIndex((x) => norm(m[2]).startsWith(x));
    if (mi < 0) return false;
    let x = new Date(now.getFullYear(), mi, Number(m[1]));
    if (x < d0) x = new Date(now.getFullYear() + 1, mi, Number(m[1]));
    day = x;
  });
  /* Повтор без дня («по пн и чт в 16») — первый раз в ближайший подходящий день. */
  if (!day && out.repeat) {
    const fits = (d) => {
      const wd = (d.getDay() + 6) % 7 + 1;
      if (out.repeat === 'день') return true;
      if (out.repeat === 'будни') return wd <= 5;
      const w = /^нед:(.+)$/.exec(out.repeat);
      if (w) return w[1].split(',').includes(String(wd));
      const mo = /^мес:(\d+)$/.exec(out.repeat);
      return mo ? d.getDate() === Math.min(Number(mo[1]), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) : false;
    };
    for (let k = 0; k < 62; k++) {
      const d = plus(k);
      if (!fits(d)) continue;
      const t = new Date(d); t.setHours(hh !== null ? hh : 17, hh !== null ? mm : 0);
      if (t > now) { day = d; break; }
    }
  }
  if (day || hh !== null) {
    if (!day) {
      day = new Date(d0);
      const t = new Date(d0); t.setHours(hh, mm);
      if (t <= now) day = plus(1);
    }
    const due = new Date(day);
    due.setHours(hh !== null ? hh : 17, hh !== null ? mm : 0, 0, 0);
    out.due = due;
  }

  /* кому */
  if (cut(rx('(себе|мне|сам|сама)'), () => {})) out.to = '';
  else {
    const words = norm(s).split(/[^a-zа-я0-9-]+/).filter(Boolean);
    let best = null;
    for (const p of people) {
      const nameWords = norm(p.name).split(/\s+/);
      const hit = nameWords.every((nw) => words.some((w) => w === nw || (nw.length >= 4 && w.startsWith(stem(nw)) && w.length <= nw.length + 3)));
      if (hit && (!best || p.name.length > best.name.length)) best = p;
    }
    if (best) {
      out.to = best.id;
      norm(best.name).split(/\s+/).forEach((nw) => {
        cut(new RegExp(B + '(?:для\\s+|поручить\\s+)?' + stem(nw).replace(/[-]/g, '\\-') + '[а-яё]{0,3}' + E, 'i'), () => {});
      });
    }
  }

  /* заказ */
  const byLen = orders.slice().sort((a, b) => String(b.code).length - String(a.code).length);
  for (const o of byLen) {
    const code = String(o.code || '');
    if (!code) continue;
    const loose = code.replace(/[\s-]+/g, '').split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]?');
    if (cut(new RegExp(B + '(?:по\\s+заказу\\s+|к\\s+заказу\\s+|заказ\\s+|для\\s+)?' + loose + E, 'i'), () => {})) { out.order = code; break; }
  }

  let text = s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,.;:—-]+|[\s,;:—-]+$/g, '').trim();
  text = text.charAt(0).toUpperCase() + text.slice(1);
  out.text = text;
  if (out.to !== undefined) out.found.push('to');
  if (out.due) out.found.push('due');
  if (out.weight) out.found.push('weight');
  if (out.order) out.found.push('order');
  if (out.repeat) out.found.push('repeat');
  return out;
}

export function repeatText(r) {
  if (!r) return '';
  if (r === 'день') return 'каждый день';
  if (r === 'будни') return 'по будням';
  let m = /^нед:(.+)$/.exec(r);
  if (m) return 'по ' + m[1].split(',').map((i) => WD[Number(i) - 1][0]).join(', ');
  m = /^мес:(\d+)$/.exec(r);
  if (m) return 'каждое ' + m[1] + '-е число';
  return r;
}

export const dueLabel = (d) => {
  if (!d) return '';
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const k = Math.round((new Date(d).setHours(0, 0, 0, 0) - d0) / 864e5);
  const t = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const w = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()];
  return (k === 0 ? 'сегодня' : k === 1 ? 'завтра' : k === 2 ? 'послезавтра' : w + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1)) + ' ' + t;
};
