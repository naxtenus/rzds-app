/* Демо-сервер: живёт прямо в телефоне и отвечает так же, как будет отвечать
   настоящий (Apps Script). Нужен, чтобы приложение можно было открыть и
   потрогать до того, как сервер подключён, и чтобы проверять экраны без
   риска задеть боевой план. Всё хранится в памяти телефона. */

const KEY = 'rzds-demo-v1';

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
        delivery: { sent: at(0, 7, 55), delivered: at(0, 7, 55) }, comments: [] },
    ],
    settings: {
      problem: true, answers: true, morning: true, weekly: true,
      taskDue: true, taskReply: true, taskUnread: true,
      workerNew: true, workerReport: true, quiet: false, telegram: true,
    },
    nextTask: 8,
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
      orders: db.orders,
    };
  }
  return {
    me, now: new Date().toISOString(),
    people: db.people, resources: db.resources, orders: db.orders, ops: db.ops,
    pending: db.pending, decided: db.decided,
    tasks: db.tasks.filter((t) => t.state !== 'убрана'),
    settings: db.settings,
  };
};

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
        const n = db.nextTask++;
        const now = new Date().toISOString();
        db.tasks.push({
          n, text: String(t.text).trim(), weight: t.weight || 'обычная', due: t.due || '',
          state: 'открыта', to: t.to || '', order: t.order || '', comments: [],
          delivery: t.to ? { sent: now, delivered: now } : undefined,
        });
        out = Object.assign(view(me), { created: n }); break;
      }
      case 'taskUpdate': {
        const t = task(p.n); if (!t) throw new Error('Задача не найдена');
        ['weight', 'due', 'state', 'to', 'text'].forEach((k) => { if (p[k] !== undefined) t[k] = p[k]; });
        if (p.state === 'закрыта') { t.closed = new Date().toISOString(); t.by = by; }
        if (p.taken && t.delivery) t.delivery.taken = new Date().toISOString();
        out = view(me); break;
      }
      case 'taskComment': {
        const t = task(p.n); if (!t) throw new Error('Задача не найдена');
        const text = String(p.text || '').trim(); if (!text) throw new Error('Пустой комментарий');
        t.comments.push({ ts: new Date().toISOString(), who: by, text });
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
        if (p.what === 'start') { o.status = 'в работе'; o.factStart = now; }
        if (p.what === 'finish') {
          o.status = 'ждёт решения'; o.factEnd = now; o.pct = 100;
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'done', who: me.name, at: now, opCode: o.code, text: p.text || 'Закончил', impact: 'Если принять: операция закрыта, следующие идут по плану.' });
        }
        if (p.what === 'problem') {
          o.status = 'проблема'; o.problem = p.text || 'Есть проблема'; o.problemAt = now;
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'problem', who: me.name, at: now, opCode: o.code, text: o.problem, shiftMin: 60, impact: 'Сдвиг +1:00 по этой операции и тому, что за ней.' });
        }
        if (p.what === 'comment') {
          db.pending.unshift({ id: 'r' + Date.now(), kind: 'comment', who: me.name, at: now, opCode: o.code, text: p.text || '', impact: '' });
        }
        out = view(me); break;
      }
      case 'settingsSave': Object.assign(db.settings, p.settings || {}); out = view(me); break;
      case 'issueCode': out = { code: 'DEMO' + Math.random().toString(36).slice(2, 4).toUpperCase(), name: p.name, until: new Date(Date.now() + 864e5).toISOString() }; break;
      case 'pushKey': out = { key: '' }; break;
      case 'pushSubscribe': out = { ok: true }; break;
      case 'reset': db = seed(); out = view(me); break;
      default: throw new Error('Неизвестное действие: ' + action);
    }
    save(db);
    return JSON.parse(JSON.stringify(out));
  },
};
