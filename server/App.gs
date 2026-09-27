/* =========================================================================
   ПРИЛОЖЕНИЕ НА ТЕЛЕФОН — серверная часть.

   Приложение живёт на GitHub Pages (naxtenus.github.io/rzds-app) и ходит
   сюда POST-запросами на АНОНИМНЫЙ адрес — тот же, что у быстрого бота:
   установленное на айфон веб-приложение не умеет входить в Google.

   Замок вместо Google-входа — сессия. Её выдают в обмен на одноразовый код,
   который владелец получает из меню таблицы («Вход в приложение на телефон»)
   или выдаёт рабочему из самого приложения. Код живёт сутки и сгорает при
   первом входе. В таблице хранится не сама сессия, а её отпечаток (SHA-256):
   утечка листа «Входы приложения» не даёт никому войти. Любой вход можно
   выключить — «Активен» = нет.

   Всё, что здесь есть, кончается подчёркиванием: такие функции со страницы
   плана через google.script.run недосягаемы. Открыты только пункты меню, и
   те — за калиткой своимиРуками_().

   Листы, которые заводит приложение (руками их трогать не нужно):
     «Входы приложения» — кто вошёл с какого телефона;
     «Push-подписки»    — куда слать уведомления;
     «Поручения»        — кому поручена задача и дошла ли она.
   ========================================================================= */

var ПРИЛ = { ВХОД: 'Входы приложения', ПУШ: 'Push-подписки', ПОРУЧ: 'Поручения' };
var COL_ПВХ = ['Имя', 'Роль', 'Код', 'Код до', 'Сессия', 'Устройство', 'Вошёл', 'Был', 'Активен'];
var COL_ППУШ = ['Кто', 'Адрес', 'Ключи', 'Устройство', 'Добавлена', 'Ошибка'];
var COL_ППОР = ['Номер задачи', 'Кому', 'Заказ', 'Отправлено', 'Доставлено', 'Прочитано', 'Взял'];
var ПРИЛ_АДРЕС = 'https://naxtenus.github.io/rzds-app/';
var ПРИЛ_ВЛАДЕЛЕЦ = 'владелец';

/* ----------------------------------------------------------- вход в сеть */
function Прил_doPost_(e) {
  var out;
  try {
    var сырьё = (e && e.postData && e.postData.contents) || '';
    var p = JSON.parse(сырьё || '{}');
    out = Прил_действие_(s_(p.a), p);
  } catch (err) {
    out = { error: String(err && err.message || err), code: err && err.code || '' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function Прил_ошибка_(текст, код) { var e = new Error(текст); e.code = код || ''; return e; }

function Прил_действие_(a, p) {
  if (a === 'login') return Прил_вход_(p);
  var me = Прил_кто_(p.s);
  var вл = me.role === 'owner';
  switch (a) {
    case 'load': return Прил_вид_(me);
    case 'decide': if (!вл) break; Прил_решить_(Number(String(p.id).replace(/^f/, '')), !!p.yes, me.name); return Прил_вид_(me);
    case 'undecide': if (!вл) break; Прил_отменить_(Number(String(p.id).replace(/^f/, ''))); return Прил_вид_(me);
    case 'mark': Прил_отметка_(me, s_(p.op), s_(p.what), s_(p.text)); return Прил_вид_(me);
    case 'taskSave': if (!вл) break; var r = Прил_задача_(me, p.task || {}); var v = Прил_вид_(me); v.created = r; return v;
    case 'taskUpdate': Прил_задачаПравка_(me, p); return Прил_вид_(me);
    case 'taskComment': Прил_задачаСлово_(me, Number(p.n), s_(p.text)); return Прил_вид_(me);
    case 'taskRead': Прил_прочитал_(me, Number(p.n)); return Прил_вид_(me);
    case 'settingsSave': if (!вл) break; Прил_настройки_(p.settings || {}); return Прил_вид_(me);
    case 'issueCode': if (!вл) break; return Прил_выдатьКод_(s_(p.name), s_(p.role) === 'owner' ? 'owner' : 'worker');
    case 'pushKey': return { key: ВебПуш_публичный_() };
    case 'pushSubscribe': Прил_подписка_(me, p.sub || {}, s_(p.ua)); return { ok: true };
    case 'pushTest':
      var n = Прил_пуш_(Прил_кому_(me), { title: 'РЗДС: проверка', body: 'Уведомления на этот телефон доходят.', url: '#/', tag: 'test' }, null, true);
      if (!n) throw Прил_ошибка_('Не дошло: подписки нет или телефон её отклонил. Нажмите «Включить уведомления» ещё раз.');
      return { ok: true, sent: n };
    default: throw Прил_ошибка_('Неизвестное действие: ' + a);
  }
  throw Прил_ошибка_('Это может только владелец');
}

/* ------------------------------------------------------------ вход и сессии */
/* Без 0/O и 1/I — не путаются на глаз; без E — иначе таблица прочтёт «3E45»
   как число 3·10⁴⁵ и код перестанет совпадать. */
var ПРИЛ_БУКВЫ = 'ABCDFGHJKLMNPQRSTUVWXYZ23456789';
function Прил_код_() {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  var s = '';
  for (var i = 0; i < 6; i++) s += ПРИЛ_БУКВЫ[(b[i] + 256) % ПРИЛ_БУКВЫ.length];
  return s;
}
function Прил_хэш_(t) {
  /* Буква впереди — чтобы таблица никогда не приняла отпечаток за число. */
  return 'h' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t))
    .map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join('');
}
function Прил_сейчас_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'); }

/* Выдать код. Одна строка — один телефон: второй телефон того же человека
   получает свою строку, и отключить можно ровно его. */
function Прил_выдатьКод_(имя, роль) {
  if (!имя) throw Прил_ошибка_('Кому выдать вход?');
  if (роль === 'worker') {
    var w = readTable_(SH.WRK, COL_WRK).filter(function (r) { return s_(r['Имя']) === имя; })[0];
    if (!w) throw Прил_ошибка_('В листе «Рабочие» нет «' + имя + '»');
  }
  var код = Прил_код_();
  var до = new Date(Date.now() + 24 * 36e5);
  sheet_(ПРИЛ.ВХОД, COL_ПВХ);
  appendRow_(ПРИЛ.ВХОД, COL_ПВХ, {
    'Имя': имя, 'Роль': роль === 'owner' ? ПРИЛ_ВЛАДЕЛЕЦ : РОЛЬ_РАБ, 'Код': код,
    'Код до': Utilities.formatDate(до, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'),
    'Сессия': '', 'Устройство': '', 'Вошёл': '', 'Был': '', 'Активен': 'да',
  });
  return { code: код, until: до.toISOString(), link: ПРИЛ_АДРЕС, name: имя };
}

function Прил_вход_(p) {
  var код = s_(p.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (код.length < 6) throw Прил_ошибка_('Введите код целиком — шесть знаков');
  /* Перебор кодов: не больше 20 попыток за 10 минут на весь сервер. */
  var c = CacheService.getScriptCache();
  var попыток = Number(c.get('app:login') || 0);
  if (попыток > 20) throw Прил_ошибка_('Слишком много попыток. Подождите 10 минут.');
  c.put('app:login', String(попыток + 1), 600);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw Прил_ошибка_('Сервер занят, попробуйте ещё раз');
  try {
    var sh = sheet_(ПРИЛ.ВХОД, COL_ПВХ);
    var last = sh.getLastRow();
    if (last < 2) throw Прил_ошибка_('Код не подошёл');
    var rows = sh.getRange(2, 1, last - 1, COL_ПВХ.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (s_(r[2]).toUpperCase() !== код || !bool_(r[8])) continue;
      var до = r[3] instanceof Date ? r[3] : Utilities.parseDate(s_(r[3]), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
      if (до < new Date()) throw Прил_ошибка_('Код просрочен — попросите новый');
      var сессия = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      sh.getRange(i + 2, 3, 1, 6).setValues([['', '', Прил_хэш_(сессия), s_(p.ua).slice(0, 120), Прил_сейчас_(), Прил_сейчас_()]]);
      var роль = s_(r[1]) === ПРИЛ_ВЛАДЕЛЕЦ ? 'owner' : 'worker';
      return { token: сессия, me: { role: роль, name: s_(r[0]), id: роль === 'owner' ? 'owner' : s_(r[0]) } };
    }
    throw Прил_ошибка_('Код не подошёл');
  } finally { lock.releaseLock(); }
}

/* Кто пришёл. Отпечаток сессии ищем в листе; результат — в кэше на 10 минут,
   чтобы не читать лист на каждое нажатие. Выключенный вход перестаёт
   работать не позже чем через 10 минут. */
function Прил_кто_(сессия) {
  if (!s_(сессия)) throw Прил_ошибка_('Нужно войти', 'auth');
  var h = Прил_хэш_(сессия);
  var c = CacheService.getScriptCache();
  var mem = c.get('app:s:' + h);
  if (mem) return JSON.parse(mem);
  var sh = sheet_(ПРИЛ.ВХОД, COL_ПВХ);
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, COL_ПВХ.length).getValues() : [];
  for (var i = 0; i < rows.length; i++) {
    if (s_(rows[i][4]) !== h) continue;
    if (!bool_(rows[i][8])) throw Прил_ошибка_('Вход на этом телефоне выключен', 'auth');
    var роль = s_(rows[i][1]) === ПРИЛ_ВЛАДЕЛЕЦ ? 'owner' : 'worker';
    var me = { role: роль, name: s_(rows[i][0]), id: роль === 'owner' ? 'owner' : s_(rows[i][0]), row: i + 2 };
    try { sh.getRange(i + 2, 8).setValue(Прил_сейчас_()); } catch (e) {}
    c.put('app:s:' + h, JSON.stringify(me), 600);
    return me;
  }
  throw Прил_ошибка_('Вход не найден — войдите заново', 'auth');
}

/* ---------------------------------------------------------------- данные */
function Прил_iso_(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  var t = s_(v);
  var m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) return Utilities.parseDate(m[3] + '-' + m[2] + '-' + m[1] + ' ' + (m[4] || '00') + ':' + (m[5] || '00'),
    Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm').toISOString();
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/);
  if (m) return Utilities.parseDate(t.replace('T', ' '), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm').toISOString();
  return t;
}

var ПРИЛ_СТАТУС = { 'в работе': 'в работе', 'есть проблема': 'проблема', 'завершено': 'выполнено',
  'приостановлено': 'пауза', 'не начато': 'план', 'просрочено': 'план' };

function Прил_настройкиВсе_() {
  var s = {};
  try { s = JSON.parse(props_().getProperty('APP_SETTINGS') || '{}'); } catch (e) { s = {}; }
  return s;
}
function Прил_настройки_(patch) {
  var s = Прил_настройкиВсе_();
  Object.keys(patch).forEach(function (k) { if (/^[a-zA-Z]{2,20}$/.test(k)) s[k] = !!patch[k]; });
  props_().setProperty('APP_SETTINGS', JSON.stringify(s));
}

function Прил_поручения_() {
  var по = {};
  readTable_(ПРИЛ.ПОРУЧ, COL_ППОР).forEach(function (r) {
    var n = n_(r['Номер задачи'], 0);
    if (!n) return;
    по[n] = { to: s_(r['Кому']), order: s_(r['Заказ']),
      delivery: { sent: Прил_iso_(r['Отправлено']), delivered: Прил_iso_(r['Доставлено']),
                  read: Прил_iso_(r['Прочитано']), taken: Прил_iso_(r['Взял']) } };
  });
  return по;
}

function Прил_задачиДляВида_() {
  var пор = Прил_поручения_();
  return задачи_(false).map(function (t) {
    var x = пор[t.n] || {};
    return {
      n: t.n, text: t.text, detail: t.detail, weight: t.weight, due: t.due || '',
      state: t.state, to: x.to || '', order: x.order || '',
      delivery: x.to ? x.delivery : undefined, closed: Прил_iso_(t.closed), by: t.by,
      comments: (t.comments || []).map(function (c) { return { ts: Прил_iso_(c.ts), who: c.who, text: c.text }; }),
    };
  });
}

function Прил_видОтметки_(f) {
  var n = s_(f.note);
  if (/^проблема:/i.test(n)) return 'problem';
  if (f.moveTo) return 'move';
  if (s_(f.scrap)) return 'scrap';
  if (f.finish && f.progress === 100) return 'done';
  if (f.start && !f.finish) return 'start';
  return 'comment';
}
var ПРИЛ_ПОСЛЕДСТВИЯ = {
  problem: 'Операция встанет в плане со статусом «есть проблема».',
  move: 'Операция начнётся не раньше указанного дня, план пересчитается.',
  scrap: 'Брак запишется в примечание операции.',
  done: 'Операция закроется, следующие пойдут по плану.',
  start: 'Отметится фактическое начало операции.',
  comment: '',
};
function Прил_текстОтметки_(f) {
  var n = s_(f.note).replace(/^(проблема|комментарий|брак):\s*/i, '');
  /* «Начал» и «Закончил» без слов — это не слова рабочего, их и так говорит
     ярлык карточки; в кавычках показываем только то, что человек написал. */
  if (/^(отмечено начало|сдано) со смены|^отметка из Telegram$/.test(n)) n = '';
  return n;
}

function Прил_вид_(me) {
  var eng = engineNow_();
  var сегодня = new Date(); сегодня.setHours(0, 0, 0, 0);
  /* Окно — вчера и три недели вперёд. Начатое и «есть проблема» видно всегда,
     даже если по плану должно было кончиться раньше: оно и есть самое важное. */
  var от = new Date(сегодня.getTime() - 864e5), до = new Date(сегодня.getTime() + 21 * 864e5);
  var ждут = pendingFacts_();
  /* Отметки, которые ещё ждут решения мастера, в плане не видны — план
     меняет только он. Но рабочему, нажавшему «Начал», экран обязан показать
     «в работе», а не снова «Начал»: иначе он нажмёт второй раз и решит, что
     приложение не работает. Поэтому поверх плана кладём последнее слово
     со смены по каждой операции. */
  var поверх = {};
  ждут.forEach(function (f) {
    var вид = Прил_видОтметки_(f);
    var x = поверх[f.op] = поверх[f.op] || {};
    if (вид === 'start') { x.start = f.start; }
    if (вид === 'done') { x.done = true; }
    if (вид === 'problem') { x.problem = Прил_текстОтметки_(f); x.problemAt = Прил_iso_(f.ts); }
  });
  var рабочие = readTable_(SH.WRK, COL_WRK).filter(function (r) { return bool_(r['Активен']); })
    .map(function (r) { return { id: s_(r['Имя']), name: s_(r['Имя']), res: parseList_(r['Ресурсы']) }; });
  var мои = null;
  if (me.role === 'worker') {
    var w = рабочие.filter(function (x) { return x.name === me.name; })[0];
    мои = w ? w.res : [];
  }
  var ops = [];
  eng.ops.forEach(function (o) {
    if (o.kind === 'stop' || !o.es || !o.ef) return;
    var живая = o.status === 'в работе' || o.status === 'есть проблема';
    if (!живая && (o.ef < от || o.es > до)) return;
    if (мои && мои.length && мои.indexOf(o.machine) < 0 && мои.indexOf(o.worker) < 0) return;
    var st = ПРИЛ_СТАТУС[o.status] || 'план';
    var x = поверх[o.id] || {};
    var начато = o.factStart ? o.factStart.toISOString() : '';
    if (x.start && st === 'план') { st = 'в работе'; начато = Прил_iso_(x.start); }
    if (x.problem && st !== 'выполнено') st = 'проблема';
    if (x.done && (st === 'в работе' || st === 'план')) st = 'ждёт решения';
    ops.push({
      code: o.id, order: o.order, op: o.stage || o.description || o.id, part: o.part || '',
      res: o.machine || o.worker || '—', start: o.es.toISOString(), end: o.ef.toISOString(),
      status: st, pct: Math.round(o.progress || 0),
      factStart: начато, problem: x.problem || o.problem || '', problemAt: x.problemAt || '',
      pending: !!(x.start || x.done || x.problem),
    });
  });
  var заказы = [];
  Object.keys(eng.orders || {}).forEach(function (k) {
    заказы.push({ code: k, name: eng.orders[k] || '', due: eng.deadlines[k] || '' });
  });
  var задачи = Прил_задачиДляВида_();

  if (me.role === 'worker') {
    return {
      me: { role: 'worker', name: me.name, id: me.name }, now: new Date().toISOString(),
      ops: ops, orders: заказы,
      tasks: задачи.filter(function (t) { return t.to === me.name; }),
    };
  }
  var ресурсы = Object.keys(eng.resources).map(function (k) {
    var r = eng.resources[k];
    return { code: r.id, name: r.name, places: r.capacity || 1 };
  });
  var pending = ждут.slice().reverse().map(function (f) {
    var вид = Прил_видОтметки_(f);
    var imp = ПРИЛ_ПОСЛЕДСТВИЯ[вид];
    if (вид === 'move' && f.moveTo) imp = 'Операция начнётся не раньше ' + f.moveTo.split('-').reverse().join('.') + ', план пересчитается.';
    return { id: 'f' + f.row, kind: вид, who: f.who, at: Прил_iso_(f.ts), opCode: f.op,
      text: Прил_текстОтметки_(f), impact: imp };
  });
  return {
    me: { role: 'owner', name: me.name, id: 'owner' }, now: new Date().toISOString(),
    people: рабочие, resources: ресурсы, orders: заказы, ops: ops,
    pending: pending, decided: Прил_решённые_(12), tasks: задачи,
    settings: Прил_настройкиВсе_(),
  };
}

function Прил_решённые_(сколько) {
  var sh = sheet_(SH.FACT, COL_FACT);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var от = Math.max(2, last - 199);
  var rows = sh.getRange(от, 1, last - от + 1, COL_FACT.length).getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < сколько; i--) {
    var r = rows[i];
    if (!s_(r[Ф.РЕШЕНИЕ])) continue;
    var f = { start: s_(r[Ф.НАЧАЛО]), finish: s_(r[Ф.КОНЕЦ]), progress: r[Ф.ПРОЦ] === '' ? null : n_(r[Ф.ПРОЦ], 0),
      scrap: s_(r[Ф.БРАК]), note: s_(r[Ф.ЗАМЕТКА]), moveTo: s_(r[Ф.ПЕРЕНОС]) };
    out.push({ id: 'f' + (от + i), kind: Прил_видОтметки_(f), who: s_(r[Ф.КТО]), at: Прил_iso_(r[Ф.ВРЕМЯ]),
      opCode: s_(r[Ф.ОП]), text: Прил_текстОтметки_(f),
      result: s_(r[Ф.РЕШЕНИЕ]) === РЕШЕНО_ДА ? 'принято' : 'не принято', decidedAt: Прил_iso_(r[Ф.ПРИМЕНЕНО]) });
  }
  return out;
}

/* ------------------------------------------------------ решение по отметке */
/* То же, что делает «Принять все отметки разом» (applyPendingFacts_), но для
   одной строки и сервером: у приложения нет браузерного движка планировщика.
   План пересчитывается тем же движком и пишется под замком. */
function Прил_решить_(row, да, кто) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята другой записью, попробуйте ещё раз');
  try {
    var sh = sheet_(SH.FACT, COL_FACT);
    if (!(row > 1) || row > sh.getLastRow()) throw Прил_ошибка_('Этого ответа уже нет в листе «Факт»');
    var r = sh.getRange(row, 1, 1, COL_FACT.length).getValues()[0];
    if (s_(r[Ф.РЕШЕНИЕ]) || s_(r[Ф.ПРИМЕНЕНО])) throw Прил_ошибка_('По этому ответу уже решено');
    if (да) {
      var plan = readPlan_();
      var op = plan.operations.filter(function (o) { return o.id === s_(r[Ф.ОП]); })[0];
      if (!op) throw Прил_ошибка_('Операции ' + s_(r[Ф.ОП]) + ' в плане больше нет');
      var st = dt_(r[Ф.НАЧАЛО]), fin = dt_(r[Ф.КОНЕЦ]);
      var pr = r[Ф.ПРОЦ] === '' ? null : n_(r[Ф.ПРОЦ], 0);
      var note = s_(r[Ф.ЗАМЕТКА]), scrap = s_(r[Ф.БРАК]);
      if (st && (!op.factStart || st < op.factStart)) op.factStart = st;
      if (fin) op.factFinish = fin;
      /* Мастер может принять «Закончил» раньше, чем «Начал». Тогда поздно
         принятое «Начал» уточняет только время начала, но не откатывает
         завершённую операцию обратно в работу. */
      var ужеГотова = op.status === 'завершено';
      if (pr !== null && !(ужеГотова && pr < 100)) op.progress = pr;
      if (pr !== null && pr >= 100) op.status = 'завершено';
      else if ((st || pr !== null) && !ужеГотова) op.status = 'в работе';
      var пер = d_(r[Ф.ПЕРЕНОС]);
      if (пер) { op.constraintType = 'SNET'; op.constraintDate = пер + 'T00:00'; }
      if (/^проблема:/i.test(note)) {
        op.status = 'есть проблема';
        op.problem = note.replace(/^проблема:\s*/i, '');
        if (!op.factStart) op.factStart = isoDT_(new Date());
      } else {
        var add = [note.replace(/^(комментарий|брак):\s*/i, ''), scrap ? 'брак ' + scrap + ' шт' : '']
          .filter(function (x) { return x && !/^(отмечено начало|сдано) со смены|^отметка из Telegram$/.test(x); }).join('; ');
        if (add) op.note = (op.note ? op.note + ' · ' : '') + add;
      }
      var computed = computeServer_(plan);
      writePlan_(plan, computed.rows);
      props_().setProperty('PLAN_VERSION', String(planVersion_() + 1));
      props_().setProperty('PLAN_SAVED_AT', new Date().toISOString());
      try {
        appendRow_(SH.LOG, COL_LOG, { 'Время': Прил_сейчас_(), 'Автор': кто + ' (приложение)', 'Объект': op.id,
          'Причина': 'ответ со смены', 'Комментарий': s_(r[Ф.КТО]) + ': ' + (note || 'отметка'), 'Изменения': '', 'Перенесено операций': '' });
      } catch (e) {}
    }
    sh.getRange(row, Ф.ПРИМЕНЕНО + 1, 1, 4).setValues([[да ? Прил_сейчас_() : '', да ? РЕШЕНО_ДА : РЕШЕНО_НЕТ, кто + ' (приложение)', '']]);
  } finally { lock.releaseLock(); }
}

/* Отменить можно только отказ: принятое уже вошло в план и сдвинуло его,
   откатывать это — работа для планировщика, а не для кнопки. */
function Прил_отменить_(row) {
  var sh = sheet_(SH.FACT, COL_FACT);
  var r = sh.getRange(row, 1, 1, COL_FACT.length).getValues()[0];
  if (s_(r[Ф.РЕШЕНИЕ]) === РЕШЕНО_ДА) throw Прил_ошибка_('Принятое уже в плане. Поправить его можно в планировщике.');
  sh.getRange(row, Ф.ПРИМЕНЕНО + 1, 1, 4).setValues([['', '', '', '']]);
}

/* ------------------------------------------------------------- отметки смены */
function Прил_отметка_(me, op, что, текст) {
  if (!op) throw Прил_ошибка_('Не сказано, по какой операции');
  var кто = me.name;
  var сейчас = isoDT_(new Date());
  var f;
  if (что === 'start') f = { who: кто, op: op, start: сейчас, finish: '', progress: 1, note: 'отмечено начало со смены (приложение)' };
  else if (что === 'finish') f = { who: кто, op: op, start: '', finish: сейчас, progress: 100, note: 'сдано со смены (приложение)' };
  else if (что === 'problem') {
    if (!текст) throw Прил_ошибка_('Напишите, что случилось');
    f = { who: кто, op: op, start: '', finish: '', progress: null, scrap: '', note: 'проблема: ' + текст };
  } else if (что === 'comment') {
    if (!текст) throw Прил_ошибка_('Пустой комментарий');
    f = { who: кто, op: op, start: '', finish: '', progress: null, scrap: '', note: 'комментарий: ' + текст };
  } else throw Прил_ошибка_('Неизвестная отметка');
  appendFact_(f);
  var слова = { start: 'начал', finish: 'закончил', problem: 'ПРОБЛЕМА', comment: 'пишет' }[что];
  var p = {
    title: (что === 'problem' ? '⚠️ ' : '') + кто + ': ' + слова + ' · ' + op,
    body: текст || (что === 'finish' ? 'Нужно ваше решение: принять в план?' : 'Отметка со смены'),
    url: '#/replies', tag: 'fact-' + op, kind: что === 'problem' ? 'problem' : 'answer',
  };
  Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, p, что === 'problem' ? 'problem' : 'answers');
  Прил_телеграм_(p.title + (текст ? '\n' + текст : ''), что === 'problem' ? 'warn' : 'wait');
}

/* ---------------------------------------------------------------- задачи */
function Прил_деньСрока_(v) {
  if (!v) return '';
  var t = s_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  var d = new Date(t);
  if (isNaN(d)) return d_(t) || '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function Прил_задача_(me, t) {
  var текст = s_(t.text);
  if (!текст) throw Прил_ошибка_('Напишите, что сделать');
  var кому = s_(t.to);
  if (кому && !readTable_(SH.WRK, COL_WRK).some(function (r) { return s_(r['Имя']) === кому; }))
    throw Прил_ошибка_('В листе «Рабочие» нет «' + кому + '»');
  var вес = ВАЖНОСТЬ.indexOf(s_(t.weight)) >= 0 ? s_(t.weight) : 'обычная';
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята, попробуйте ещё раз');
  var задача;
  try {
    var list = задачи_(true, true);
    задача = { n: следующийНомер_(list), state: ЗАДАЧА_ОТКР, opened: Прил_сейчас_(), closed: '', by: '',
      text: текст, detail: кому ? 'поручено: ' + кому : '', weight: вес, due: Прил_деньСрока_(t.due) };
    list.push(задача);
    записатьЗадачи_(list);
    sheet_(ПРИЛ.ПОРУЧ, COL_ППОР);
    appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, { 'Номер задачи': задача.n, 'Кому': кому, 'Заказ': s_(t.order),
      'Отправлено': кому ? Прил_сейчас_() : '', 'Доставлено': '', 'Прочитано': '', 'Взял': '' });
  } finally { lock.releaseLock(); }
  if (кому) {
    var n = Прил_пуш_(кому, { title: 'Поручение от мастера', body: текст + (задача.due ? ' · срок ' + задача.due.split('-').reverse().slice(0, 2).join('.') : ''),
      url: '#/task/' + задача.n, tag: 'task-' + задача.n, kind: 'task' }, 'workerNew');
    if (n) Прил_поручениеОтметить_(задача.n, 'Доставлено');
    try { сказатьРабочему_(кому, 'Поручение от мастера (№' + задача.n + '): ' + текст); } catch (e) {}
  } else {
    try { сказатьПроЗадачу_(задача, 'Новая задача'); } catch (e) {}
  }
  return задача.n;
}

function Прил_поручениеОтметить_(n, поле, кому, заказ) {
  var sh = sheet_(ПРИЛ.ПОРУЧ, COL_ППОР);
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, COL_ППОР.length).getValues() : [];
  var col = COL_ППОР.indexOf(поле) + 1;
  for (var i = 0; i < rows.length; i++) {
    if (n_(rows[i][0], 0) === n) {
      if (поле === 'Кому') { sh.getRange(i + 2, 2, 1, 6).setValues([[кому, заказ !== undefined ? заказ : rows[i][2], Прил_сейчас_(), '', '', '']]); return; }
      if (!s_(rows[i][col - 1])) sh.getRange(i + 2, col).setValue(Прил_сейчас_());
      return;
    }
  }
  if (поле === 'Кому') appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, { 'Номер задачи': n, 'Кому': кому, 'Заказ': заказ || '',
    'Отправлено': кому ? Прил_сейчас_() : '', 'Доставлено': '', 'Прочитано': '', 'Взял': '' });
}

function Прил_задачаПравка_(me, p) {
  var n = Number(p.n);
  var пор = Прил_поручения_()[n] || {};
  if (me.role === 'worker') {
    if (пор.to !== me.name) throw Прил_ошибка_('Это поручение не вам');
    if (p.taken) { Прил_поручениеОтметить_(n, 'Взял'); Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: me.name + ' взял в работу', body: 'Задача №' + n, url: '#/task/' + n, tag: 'task-' + n }, 'taskReply'); return; }
    if (p.state === ЗАДАЧА_ЗАКР || p.state === ЗАДАЧА_ОТКР) {
      Прил_состояние_(n, p.state, me.name);
      if (p.state === ЗАДАЧА_ЗАКР) {
        var t0 = задачи_(true, true).filter(function (x) { return x.n === n; })[0] || {};
        Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: '✅ ' + me.name + ': сделано', body: t0.text || ('Задача №' + n), url: '#/task/' + n, tag: 'task-' + n }, 'taskReply');
        Прил_телеграм_(me.name + ' выполнил поручение №' + n + ': ' + (t0.text || ''), 'done');
      }
      return;
    }
    throw Прил_ошибка_('Это может только мастер');
  }
  if (p.state !== undefined) { Прил_состояние_(n, s_(p.state), me.name); }
  if (p.weight !== undefined || p.due !== undefined || p.text !== undefined) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята, попробуйте ещё раз');
    try {
      var list = задачи_(true, true);
      var t = list.filter(function (x) { return x.n === n; })[0];
      if (!t) throw Прил_ошибка_('Задачи №' + n + ' нет');
      if (p.weight !== undefined && ВАЖНОСТЬ.indexOf(s_(p.weight)) >= 0) t.weight = s_(p.weight);
      if (p.due !== undefined) t.due = Прил_деньСрока_(p.due);
      if (p.text !== undefined && s_(p.text)) t.text = s_(p.text);
      записатьЗадачи_(list);
    } finally { lock.releaseLock(); }
    if (пор.to && p.due !== undefined) Прил_пуш_(пор.to, { title: 'Поручение перенесено', body: 'Новый срок: ' + Прил_деньСрока_(p.due).split('-').reverse().slice(0, 2).join('.'), url: '#/task/' + n, tag: 'task-' + n }, 'workerNew');
  }
  if (p.to !== undefined) {
    var кому = s_(p.to);
    Прил_поручениеОтметить_(n, 'Кому', кому);
    if (кому) {
      var t1 = задачи_(true, true).filter(function (x) { return x.n === n; })[0] || {};
      if (Прил_пуш_(кому, { title: 'Поручение от мастера', body: t1.text || '', url: '#/task/' + n, tag: 'task-' + n, kind: 'task' }, 'workerNew'))
        Прил_поручениеОтметить_(n, 'Доставлено');
      try { сказатьРабочему_(кому, 'Поручение от мастера (№' + n + '): ' + (t1.text || '')); } catch (e) {}
    }
  }
}

function Прил_состояние_(n, куда, кто) {
  if ([ЗАДАЧА_ОТКР, ЗАДАЧА_ЗАКР, ЗАДАЧА_УБР].indexOf(куда) < 0) throw Прил_ошибка_('Неизвестное состояние задачи');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята, попробуйте ещё раз');
  try {
    var list = задачи_(true, true);
    var t = list.filter(function (x) { return x.n === n; })[0];
    if (!t) throw Прил_ошибка_('Задачи №' + n + ' нет');
    t.state = куда;
    if (куда === ЗАДАЧА_ЗАКР) { t.closed = Прил_сейчас_(); t.by = кто; }
    if (куда === ЗАДАЧА_ОТКР) { t.closed = ''; t.by = ''; }
    записатьЗадачи_(list);
  } finally { lock.releaseLock(); }
}

function Прил_задачаСлово_(me, n, текст) {
  if (!текст) throw Прил_ошибка_('Пустой комментарий');
  var t = задачи_(true, true).filter(function (x) { return x.n === n; })[0];
  if (!t) throw Прил_ошибка_('Задачи №' + n + ' нет');
  var пор = Прил_поручения_()[n] || {};
  if (me.role === 'worker' && пор.to !== me.name) throw Прил_ошибка_('Это поручение не вам');
  appendRow_(SH.TCOM, COL_TCOM, { 'Номер задачи': n, 'Время': Прил_сейчас_(), 'Кто': me.name, 'Комментарий': текст });
  if (me.role === 'worker') {
    Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: me.name + ' пишет по задаче', body: текст, url: '#/task/' + n, tag: 'task-' + n }, 'taskReply');
    Прил_телеграм_(me.name + ' по задаче №' + n + ' (' + t.text + '):\n' + текст, 'ask');
  } else if (пор.to) {
    Прил_пуш_(пор.to, { title: 'Мастер пишет', body: текст, url: '#/task/' + n, tag: 'task-' + n }, 'workerNew');
    try { сказатьРабочему_(пор.to, 'Мастер по задаче №' + n + ': ' + текст); } catch (e) {}
  }
}

function Прил_прочитал_(me, n) {
  var пор = Прил_поручения_()[n] || {};
  if (me.role === 'worker' && пор.to === me.name) {
    Прил_поручениеОтметить_(n, 'Доставлено');
    Прил_поручениеОтметить_(n, 'Прочитано');
  }
}

/* ----------------------------------------------------------- уведомления */
function Прил_кому_(me) { return me.role === 'owner' ? ПРИЛ_ВЛАДЕЛЕЦ : me.name; }

function Прил_подписка_(me, sub, ua) {
  if (!sub || !/^https:\/\//.test(s_(sub.endpoint)) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
    throw Прил_ошибка_('Телефон прислал неполную подписку');
  var кто = Прил_кому_(me);
  var rows = readTable_(ПРИЛ.ПУШ, COL_ППУШ).filter(function (r) { return s_(r['Адрес']) !== s_(sub.endpoint); });
  rows.push({ 'Кто': кто, 'Адрес': sub.endpoint, 'Ключи': JSON.stringify(sub.keys), 'Устройство': ua.slice(0, 100),
    'Добавлена': Прил_сейчас_(), 'Ошибка': '' });
  sheet_(ПРИЛ.ПУШ, COL_ППУШ);
  writeTable_(ПРИЛ.ПУШ, COL_ППУШ, rows, 'подписки');
}

/* Отправить push всем телефонам человека. настройка — ключ из «Уведомления»
   в приложении (выключено — не шлём). Тихие часы глушат всё, кроме проблем.
   Возвращает число телефонов, до которых дошло. */
function Прил_пуш_(кому, p, настройка, всегда) {
  var s = Прил_настройкиВсе_();
  if (!всегда) {
    if (настройка && s[настройка] === false) return 0;
    var h = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'H'));
    if (s.quiet === true && (h >= 22 || h < 7) && p.kind !== 'problem') return 0;   // тихие часы — только если включены
  }
  var rows = readTable_(ПРИЛ.ПУШ, COL_ППУШ);
  var мои = rows.filter(function (r) { return s_(r['Кто']) === кому; });
  if (!мои.length) return 0;
  var ok = 0, убрать = {}, ошибки = {};
  мои.forEach(function (r) {
    var res;
    try { res = ВебПуш_отправить_({ endpoint: s_(r['Адрес']), keys: JSON.parse(s_(r['Ключи'])) }, p); }
    catch (e) { res = 'сбой: ' + e; }
    if (res === 'ok') ok++;
    else if (res === 'gone') убрать[s_(r['Адрес'])] = 1;
    else ошибки[s_(r['Адрес'])] = res;
  });
  if (Object.keys(убрать).length || Object.keys(ошибки).length) {
    try {
      writeTable_(ПРИЛ.ПУШ, COL_ППУШ, rows.filter(function (r) { return !убрать[s_(r['Адрес'])]; })
        .map(function (r) { if (ошибки[s_(r['Адрес'])]) r['Ошибка'] = Прил_сейчас_() + ' ' + ошибки[s_(r['Адрес'])]; return r; }), 'подписки');
    } catch (e) {}
  }
  return ok;
}

/* Всё, что планировщик и так сообщает владельцу в Телеграм через Уведомить_,
   дублируется push-уведомлением — Телеграм в России ненадёжен. Вызывается
   из самого Уведомить_ (одна строка там). Когда в Телеграм пишет само
   приложение, push оно уже отправило своё, с точной ссылкой, — второй не
   нужен: для этого флаг __прилБезПуша. */
var __прилБезПуша = false;
function Прил_телеграм_(text, kind) {
  if (Прил_настройкиВсе_().telegram === false) return;
  __прилБезПуша = true;
  try { Уведомить_(text, kind); } catch (e) { Logger.log('приложение → Телеграм: %s', e); }
  finally { __прилБезПуша = false; }
}
function Прил_пушВладельцу_(text, kind) {
  if (__прилБезПуша) return;
  var t = s_(text);
  if (!t) return;
  var шапка = { ask: 'Вопрос', wait: 'Жду решения', done: 'Готово', warn: 'Внимание' }[s_(kind)] || 'План производства';
  Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: шапка, body: t.slice(0, 180), url: '#/today', tag: 'note-' + s_(kind),
    kind: kind === 'warn' ? 'problem' : 'note' }, null);
}

/* -------------------------------------------------------------- меню */
function Меню_вход_в_приложение() {
  своимиРуками_();
  var r = Прил_выдатьКод_('Павел', 'owner');
  var ui = SpreadsheetApp.getUi();
  ui.alert('Вход в приложение на телефон',
    'Код владельца: ' + r.code + '\n\nДействует сутки, вводится один раз.\n\n' +
    '1. Откройте на айфоне в Safari: ' + r.link + '\n' +
    '2. «Поделиться» → «На экран „Домой“».\n' +
    '3. Откройте РЗДС с иконки и введите код.\n\n' +
    'Рабочим коды выдаются из самого приложения: колокольчик → «Выдать вход».',
    ui.ButtonSet.OK);
}
function Пуск_A_вход_в_приложение() { своимиРуками_(); var r = Прил_выдатьКод_('Павел', 'owner'); Logger.log('Код: %s, адрес: %s', r.code, r.link); return r.code; }
