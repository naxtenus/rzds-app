/* Демо-сервер: живёт прямо в телефоне и отвечает так же, как будет отвечать
   настоящий (Apps Script). Нужен, чтобы приложение можно было открыть и
   потрогать до того, как сервер подключён, и чтобы проверять экраны без
   риска задеть боевой план. Всё хранится в памяти телефона. */

const KEY = 'rzds-demo-v2';

const at = (dayOffset, h, m = 0) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const minutesAgo = (m) => new Date(Date.now() - m * 6e4).toISOString();

function seed() {
  return {
    people: [
      { id: 'w1', name: 'Оператор фре1360', res: ['фре1360'] },
      { id: 'w2', name: 'Оператор эро7745', res: ['эро7745'] },
      { id: 'w3', name: 'Слесарь', res: ['слесарка'] },
      { id: 'w4', name: 'Термист', res: ['термичка'] },
      { id: 'w5', name: 'Маляр', res: ['покраска'] },
    ],
    resources: [
      { code: 'фре1360', name: 'Фрезерный фре1360', places: 1 },
      { code: 'эро7745', name: 'Эрозия эро7745', places: 1 },
      { code: 'слесарка', name: 'Слесарный участок', places: 1 },
      { code: 'термичка', name: 'Термоучасток', places: 1 },
      { code: 'покраска', name: 'Покраска', places: 1 },
    ],
    orders: [
      { code: 'ФД 4', name: 'Фрезерный диск', due: at(4, 17) },
      { code: 'ФДЗ', name: 'Фрезерный диск запасной', due: at(7, 17) },
      { code: 'ВР-300', name: 'Валец разъёмный РЗТ-02.00.000СБ', due: at(2, 17) },
    ],
    ops: [
      { code: 'ФД4-020', order: 'ФД 4', op: 'Фрезеровка корпуса, 1-я установка', res: 'фре1360', start: at(-1, 8), end: at(-1, 17), status: 'выполнено', pct: 100 },
      { code: 'ФД4-030', order: 'ФД 4', op: 'Фрезеровка корпуса, 2-я установка', res: 'фре1360', start: at(0, 8), end: at(0, 14, 30), status: 'в работе', pct: 60, factStart: at(0, 8, 5) },
      { code: 'ФДЗ-020', order: 'ФДЗ', op: 'Фрезеровка, 1-я установка', res: 'фре1360', start: at(0, 14, 30), end: at(0, 17), status: 'план', pct: 0 },
      { code: 'ВР300-040', order: 'ВР-300', op: 'Эрозия паза', res: 'эро7745', start: at(0, 8), end: at(0, 13), status: 'проблема', pct: 35, factStart: at(0, 8, 2), problem: 'Электрод изношен раньше срока, нужен новый. Станок стоит.', problemAt: at(0, 10, 40) },
      { code: 'ФДЗ-030', order: 'ФДЗ', op: 'Слесарная доработка', res: 'слесарка', start: at(0, 13), end: at(0, 16), status: 'план', pct: 0 },
      { code: 'ФД4-040', order: 'ФД 4', op: 'Термообработка', res: 'термичка', start: at(0, 16), end: at(0, 20), status: 'план', pct: 0 },
      { code: 'ВР300-050', order: 'ВР-300', op: 'Фрезеровка основания', res: 'фре1360', start: at(1, 8), end: at(1, 12), status: 'план', pct: 0 },
      { code: 'ФД4-050', order: 'ФД 4', op: 'Покраска', res: 'покраска', start: at(1, 9), end: at(1, 13), status: 'план', pct: 0 },
      { code: 'ФДЗ-040', order: 'ФДЗ', op: 'Термообработка', res: 'термичка', start: at(1, 8), end: at(1, 12), status: 'план', pct: 0 },
    ],
    pending: [
      { id: 'r1', kind: 'problem', who: 'Оператор эро7745', at: at(0, 10, 40), opCode: 'ВР300-040',
        text: 'Электрод изношен раньше срока, нужен новый. Станок стоит.', shiftMin: 80,
        impact: 'Сдвиг +1:20: ВР-300 закончится в 14:20, ФДЗ на слесарке — с 13:40.' },
      { id: 'r2', kind: 'late', who: 'Оператор фре1360', at: at(0, 10, 15), opCode: 'ФД4-030',
        text: 'Долго выставлял базу, дальше пойдёт быстрее.', shiftMin: 40,
        impact: 'Если принять: ФДЗ на фре1360 начнётся в 15:10 вместо 14:30.' },
    ],
    decided: [
      { id: 'r0', kind: 'start', who: 'Оператор фре1360', at: at(0, 8, 5), opCode: 'ФД4-030', text: 'Начал', result: 'без вопросов' },
    ],
    tasks: [
      { n: 1, text: 'Согласовать с заказчиком срок по ВР-300', weight: 'срочно', due: at(-1, 17), state: 'открыта', to: '', order: 'ВР-300',
        comments: [{ ts: at(-1, 16, 10), who: 'Вы', text: 'Звонил, не взяли трубку.' }, { ts: at(0, 9, 2), who: 'Вы', text: 'Написал на почту, жду ответ до обеда.' }] },
      { n: 2, text: 'Заказать электроды для эро7745', weight: 'важно', due: at(0, 15), state: 'открыта', to: '', order: '', comments: [] },
      { n: 3, text: 'Посмотреть недельный отчёт', weight: 'потом', due: at(0, 18), state: 'открыта', to: '', order: '', comments: [] },
      { n: 4, text: 'Подготовить заготовки для ФДЗ', weight: 'важно', due: at(0, 13), state: 'открыта', to: 'w3', order: 'ФДЗ',
        delivery: { sent: at(0, 8, 30), delivered: at(0, 8, 30), read: at(0, 8, 41), taken: at(0, 8, 50) },
        comments: [{ ts: at(0, 9, 12), who: 'Слесарь', text: 'Нет прутка Ø60, есть Ø65. Брать?' }, { ts: at(0, 9, 15), who: 'Вы', text: 'Бери Ø65, припуск снимем на фрезере.' }] },
      { n: 5, text: 'Убрать стружку у эро7745, проверить фильтр', weight: 'обычная', due: at(0, 17), state: 'открыта', to: 'w2', order: '',
        delivery: { sent: at(0, 9), delivered: at(0, 9), read: at(0, 9, 20) }, comments: [] },
      { n: 6, text: 'Покрасить кронштейны ФД 4', weight: 'обычная', due: at(2, 17), state: 'открыта', to: 'w5', order: 'ФД 4',
        delivery: { sent: minutesAgo(45), delivered: minutesAgo(45) }, comments: [] },
      { n: 7, text: 'Проверить вылет фрезы Ø12 перед ФДЗ', weight: 'важно', due: at(0, 14), state: 'открыта', to: 'w1', order: 'ФДЗ',
        delivery: { sent: at(0, 7, 55), delivered: at(0, 7, 55) }, comments: [],
        items: [{ t: 'Замерить вылет индикатором', d: false }, { t: 'Записать в карту наладки', d: false }] },
      { n: 8, text: 'Заточка фрез', weight: 'обычная', due: at(0, 16), state: 'открыта', to: 'w3', order: '', repeat: 'будни',
        delivery: { sent: at(0, 7), delivered: at(0, 7), read: at(0, 7, 30) }, comments: [] },
    ],
    settings: {
      problem: true, answers: true, morning: true, weekly: true,
      taskDue: true, taskReply: true, taskUnread: true,
      workerNew: true, workerReport: true, quiet: false, telegram: true,
    },
    nextTask: 9,
    chats: { 'ФДЗ': [{ ts: at(0, 9, 40), who: 'Оператор фре1360', text: 'Заготовки ФДЗ короче на 2 мм, чем в чертеже. Работать?' }] },
    checklists: { 'фре1360': ['Проверить вылет фрезы', 'Зажим детали', 'СОЖ включена'], 'все': ['Очки надеты'] },
    docs: {
      'ФДЗ': [{ kind: 'КД', title: 'Чертёж ФДЗ-01', url: 'https://example.com/fdz.pdf' }, { kind: 'Карта наладки', title: 'Наладка фре1360', url: 'https://example.com/nal.pdf' }],
    },
    passports: {
      'ФДЗ': { 'Технология': 'Черновая Ø12, чистовая Ø8', 'Режимы резания': 'S 1200, F 300, ap 2', 'Инструмент': 'Фреза Ø12 Z4, фреза Ø8 Z3' },
      'ФД 3': { 'Наименование': 'Фрезерный диск запасной', 'Выполнен': '2026-08-14', 'Технология': 'Так же, как ФДЗ' },
    },
    photos: {},
    nextPhoto: 1,
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.day === new Date().toDateString()) return s.db;
  } catch (e) {}
  /* Каждый новый день демо начинается заново: даты в нём «сегодняшние». */
  return seed();
}

function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify({ day: new Date().toDateString(), db })); } catch (e) {}
}

let db = load();
const savePhoto = (data) => { db.photos = db.photos || {}; const id = (db.nextPhoto = (db.nextPhoto || 1) + 1) + '-demo01'; db.photos[id] = data; return id; };

const shiftOrderAfter = (op, min) => {
  /* Упрощённый каскад: всё, что у этого станка и этого заказа идёт после
     сдвинутой операции и в неё упирается, едет следом. Настоящий расчёт
     делает движок планировщика на сервере. */
  const ms = min * 6e4;
  const end = new Date(op.end).getTime();
  op.end = new Date(end + ms).toISOString();
  db.ops.forEach((o) => {
    if (o === op) return;
    const s = new Date(o.start).getTime();
    if ((o.res === op.res || o.order === op.order) && s >= end - 1 && s < end + ms + 1) {
      o.start = new Date(s + ms).toISOString();
      o.end = new Date(new Date(o.end).getTime() + ms).toISOString();
    }
  });
};

const view = (me) => {
  if (me.role === 'worker') {
    const w = db.people.find((p) => p.id === me.id) || db.people[0];
    return {
      me, now: new Date().toISOString(),
      ops: db.ops.filter((o) => w.res.includes(o.res)),
      tasks: db.tasks.filter((t) => t.to === w.id && t.state !== 'убрана'),
      orders: db.orders, checklists: db.checklists || {},
    };
  }
  return {
    me, now: new Date().toISOString(),
    people: db.people, resources: db.resources, orders: db.orders, ops: db.ops,
    pending: db.pending, decided: db.decided,
    tasks: db.tasks.filter((t) => t.state !== 'убрана'),
    settings: db.settings, checklists: db.checklists || {}, stops: db.stops || [],
  };
};

/* Повтор: следующий подходящий день после прежнего срока, не раньше завтра. */
const fits = (r, d) => {
  const wd = (d.getDay() + 6) % 7 + 1;
  if (r === 'день') return true;
  if (r === 'будни') return wd <= 5;
  let m = /^нед:(.+)$/.exec(r); if (m) return m[1].split(',').includes(String(wd));
  m = /^мес:(\d+)$/.exec(r); if (m) return d.getDate() === Math.min(Number(m[1]), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return false;
};
const nextDue = (r, prev) => {
  const d = prev ? new Date(prev) : new Date();
  const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1);
  for (let i = 0; i < 800; i++) { d.setDate(d.getDate() + 1); if (d >= tomorrow && fits(r, d)) return d.toISOString(); }
  return '';
};
const RULE = /^(день|будни|нед:[1-7](,[1-7])*|мес:([1-9]|[12]\d|3[01]))$/;

const ME = {
  owner: { role: 'owner', name: 'Павел', id: 'owner' },
  worker: { role: 'worker', name: 'Оператор фре1360', id: 'w1' },
};

export const demo = {
  isDemo: true,
  async call(action, p = {}, session = {}) {
    await new Promise((r) => setTimeout(r, Number((() => { try { return localStorage.getItem('rzds-demo-delay'); } catch (e) { return 0; } })()) || 120));
    const me = ME[session.role] || ME.owner;
    const by = me.role === 'worker' ? me.name : 'Вы';
    const task = (n) => db.tasks.find((t) => t.n === Number(n));
    const op = (c) => db.ops.find((o) => o.code === c);
    let out;
    switch (action) {
      case 'load': out = view(me); break;
      case 'decide': {
        const i = db.pending.findIndex((r) => r.id === p.id);
        if (i < 0) throw new Error('Этот ответ уже разобран');
        const r = db.pending.splice(i, 1)[0];
        if (p.yes && r.shiftMin) { const o = op(r.opCode); if (o) shiftOrderAfter(o, r.shiftMin); }
        if (p.yes && r.kind === 'done') { const o = op(r.opCode); if (o) { o.status = 'выполнено'; o.pct = 100; } }
        r.result = p.yes ? 'принято' : 'план оставлен';
        r.decidedAt = new Date().toISOString();
        db.decided.unshift(r);
        out = view(me); break;
      }
      case 'undecide': {
        const i = db.decided.findIndex((r) => r.id === p.id);
        if (i >= 0) { const r = db.decided.splice(i, 1)[0]; delete r.result; db.pending.unshift(r); }
        out = view(me); break;
      }
      case 'taskSave': {
        const t = p.task || {};
        if (!String(t.text || '').trim()) throw new Error('Напишите, что сделать');
        if (t.repeat && !RULE.test(t.repeat)) throw new Error('Не понял правило повтора: ' + t.repeat);
        const n = db.nextTask++;
        const now = new Date().toISOString();
        db.tasks.push({
          n, text: String(t.text).trim(), weight: t.weight || 'обычная', due: t.due || '',
          state: 'открыта', to: t.to || '', order: t.order || '', comments: t.photo ? [{ ts: now, who: 'Вы', text: 'фото', photos: [savePhoto(t.photo)] }] : [],
          repeat: t.repeat || '', items: (t.items || []).map((x) => String(x).trim()).filter(Boolean).map((x) => ({ t: x, d: false })),
          delivery: t.to ? { sent: now, delivered: now } : undefined,
        });
        out = Object.assign(view(me), { created: n }); break;
      }
      case 'taskUpdate': {
        const t = task(p.n); if (!t) throw new Error('Задача не найдена');
        if (p.repeat && !RULE.test(p.repeat)) throw new Error('Не понял правило повтора: ' + p.repeat);
        ['weight', 'due', 'state', 'to', 'text', 'repeat'].forEach((k) => { if (p[k] !== undefined) t[k] = p[k]; });
        if (p.items !== undefined) {
          const was = {}; (t.items || []).forEach((x) => { was[x.t] = x; });
          t.items = p.items.map((x) => String(x).trim()).filter(Boolean).map((x) => was[x] || { t: x, d: false });
        }
        if (p.state === 'закрыта') { t.closed = new Date().toISOString(); t.by = by; }
        if (p.state === 'закрыта' && t.repeat) {
          const now = new Date().toISOString();
          db.tasks.push({ n: db.nextTask++, text: t.text, weight: t.weight, due: nextDue(t.repeat, t.due), state: 'открыта', to: t.to, order: t.order,
            comments: [], repeat: t.repeat, items: (t.items || []).map((x) => ({ t: x.t, d: false })), delivery: t.to ? { sent: now, delivered: now } : undefined });
          t.repeat = '';
        }
        if (p.taken && t.delivery) t.delivery.taken = new Date().toISOString();
        out = view(me); break;
      }
      case 'taskComment': {
        const t = task(p.n); if (!t) throw new Error('Задача не найдена');
        const text = String(p.text || '').trim();
        const text2 = text || (p.photo ? 'фото' : '');
        if (!text2) throw new Error('Пустой комментарий');
        t.comments.push({ ts: new Date().toISOString(), who: by, text: text2, photos: p.photo ? [savePhoto(p.photo)] : [] });
        out = view(me); break;
      }
      case 'taskCheck': {
        const t = task(p.n); if (!t) throw new Error('Задача не найдена');
        const x = (t.items || [])[Number(p.i)]; if (!x) throw new Error('Такого пункта нет — обновите экран');
        Object.assign(x, { d: !!p.done, by: p.done ? me.name : '', at: p.done ? new Date().toISOString() : '' });
        out = view(me); break;
      }
      case 'orderSay': {
        const text = String(p.text || '').trim();
        if (!text && !p.photo) throw new Error('Пустое сообщение');
        db.chats = db.chats || {};
        (db.chats[p.order] || (db.chats[p.order] = [])).push({ ts: new Date().toISOString(), who: me.name, text: text || 'фото', photos: p.photo ? [savePhoto(p.photo)] : [] });
        out = { chat: db.chats[p.order] }; break;
      }
      case 'ping': out = { ok: true }; break;
      case 'downtime': {
        /* Простой станка (04.10): как на сервере — «стоит» заводит простой,
           «пошёл» закрывает идущий. */
        db.stops = db.stops || [];
        const now = new Date(Number(p.ms) || Date.now()).toISOString();
        const cur = db.stops.find((s) => s.active && s.machine === p.machine);
        if (p.on && !cur) db.stops.unshift({ id: 'STOP-' + (db.stops.length + 1), machine: p.machine, reason: p.reason || 'Простой',
          comment: p.text || '', start: now, finish: '', active: true, until: p.until || '' });
        if (p.on && cur && p.text) cur.comment = [cur.comment, p.text].filter(Boolean).join(' · ');
        if (!p.on && cur) { cur.active = false; cur.finish = now; }
        out = view(me); break;
      }
      case 'taskRead': {
        const t = task(p.n);
        if (t && t.delivery && !t.delivery.read) t.delivery.read = new Date().toISOString();
        out = view(me); break;
      }
      case 'mark': {
        const o = op(p.op); if (!o) throw new Error('Операция не найдена');
        const now = new Date().toISOString();
        const ph = p.photo ? [savePhoto(p.photo)] : [];
        if (p.what === 'start') { o.status = 'в работе'; o.factStart = now; }
        if (p.what === 'finish') {
          o.status = 'ждёт решения'; o.factEnd = now; o.pct = 100;
          const t = [p.qty ? 'сделано ' + p.qty + ' шт' : '', p.scrap ? 'брак ' + p.scrap + ' шт' : ''].filter(Boolean).join(', ');
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'done', who: me.name, at: now, opCode: o.code, text: t, impact: 'Если принять: операция закрыта, следующие идут по плану.' });
        }
        if (p.what === 'problem') {
          o.status = 'проблема'; o.problem = p.text || 'Есть проблема'; o.problemAt = now;
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'problem', who: me.name, at: now, opCode: o.code, text: o.problem, shiftMin: 60, impact: 'Сдвиг +1:00 по этой операции и тому, что за ней.', photos: ph });
        }
        if (p.what === 'comment') {
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'comment', who: me.name, at: now, opCode: o.code, text: p.text || '', impact: '', photos: ph });
        }
        if (p.what === 'pause') {
          if (!p.text) throw new Error('Выберите причину паузы');
          o.status = 'пауза'; o.pause = p.text; o.pauseAt = now;
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'pause', who: me.name, at: now, opCode: o.code, text: p.text, impact: 'Операция встанет в плане «приостановлено».' });
        }
        if (p.what === 'resume') {
          o.status = 'в работе'; o.pause = ''; o.pauseAt = '';
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'resume', who: me.name, at: now, opCode: o.code, text: '', impact: 'Операция снова «в работе».' });
        }
        out = view(me); break;
      }
      case 'settingsSave': Object.assign(db.settings, p.settings || {}); out = view(me); break;
      case 'issueCode': out = { code: 'DEMO' + Math.random().toString(36).slice(2, 4).toUpperCase(), name: p.name, until: new Date(Date.now() + 864e5).toISOString() }; break;
      case 'pushKey': out = { key: '' }; break;
      case 'pushSubscribe': out = { ok: true }; break;
      case 'reset': db = seed(); out = view(me); break;
      case 'flush': case 'ack': out = { ok: true }; break;
      case 'photo': if (!db.photos[p.id]) throw new Error('Нет такого фото'); out = { id: p.id, data: db.photos[p.id] }; break;
      case 'orderInfo': {
        const o = db.orders.find((x) => x.code === p.order);
        const name = (o && o.name) || ((db.passports || {})[p.order] || {})['Наименование'] || '';
        const earlier = Object.keys(db.passports || {}).filter((k) => k !== p.order && db.passports[k]['Наименование'] === name)
          .map((k) => ({ order: k, name, finished: db.passports[k]['Выполнен'] || '', docs: 0 }));
        out = { order: p.order, name, docs: (db.docs || {})[p.order] || [], passport: (db.passports || {})[p.order] || null, earlier, chat: (db.chats || {})[p.order] || [] };
        break;
      }
      case 'checklistSave': {
        db.checklists = db.checklists || {};
        const items = (p.items || []).map((x) => String(x).trim()).filter(Boolean);
        if (items.length) db.checklists[p.res] = items; else delete db.checklists[p.res];
        out = view(me); break;
      }
      case 'movePreview': case 'moveApply': {
        const o = op(p.op); if (!o) throw new Error('Этап не найден');
        const want = new Date(p.start), dur = new Date(o.end) - new Date(o.start);
        const shift = want - new Date(o.start);
        const changed = [{ code: o.code, order: o.order, op: o.op, res: o.res, from: o.start, to: want.toISOString(), end: new Date(want.getTime() + dur).toISOString(), me: true }];
        db.ops.filter((x) => x !== o && x.order === o.order && new Date(x.start) >= new Date(o.end) && shift > 0).forEach((x) => {
          changed.push({ code: x.code, order: x.order, op: x.op, res: x.res, from: x.start, to: new Date(new Date(x.start).getTime() + shift).toISOString() });
        });
        const last = changed.reduce((m, x) => Math.max(m, new Date(x.end || x.to).getTime()), 0);
        const ord = db.orders.find((x) => x.code === o.order) || {};
        const res = { op: o.code, asked: p.start, start: want.toISOString(), end: new Date(want.getTime() + dur).toISOString(), changed,
          orders: [{ code: o.order, was: '', now: new Date(last).toISOString(), due: ord.due || '', late: !!(ord.due && last > new Date(ord.due)) }], applied: action === 'moveApply' };
        if (action === 'moveApply') {
          changed.forEach((c) => { const x = op(c.code); const d0 = new Date(x.end) - new Date(x.start); x.start = c.to; x.end = new Date(new Date(c.to).getTime() + d0).toISOString(); });
          out = Object.assign(view(me), { moved: res });
        } else out = res;
        break;
      }
      case 'sessions': out = { sessions: db.sessions || (db.sessions = [
        { row: 2, name: 'Павел', role: 'owner', device: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari', since: new Date(Date.now() - 12 * 864e5).toISOString(), seen: new Date().toISOString(), active: true, me: me.role === 'owner' },
        { row: 3, name: 'Оператор фре1360', role: 'worker', device: 'Mozilla/5.0 (Linux; Android 14) Chrome/128', since: new Date(Date.now() - 5 * 864e5).toISOString(), seen: new Date(Date.now() - 3 * 36e5).toISOString(), active: true, me: me.role === 'worker' },
      ]).filter((x) => me.role === 'owner' || x.name === me.name) }; break;
      case 'revoke': { const x = (db.sessions || []).find((y) => y.row === Number(p.row)); if (x) x.active = false; out = { sessions: (db.sessions || []).filter((y) => me.role === 'owner' || y.name === me.name) }; break; }
      default: throw new Error('Неизвестное действие: ' + action);
    }
    save(db);
    return JSON.parse(JSON.stringify(out));
  },
};
