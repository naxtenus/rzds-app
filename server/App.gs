/* =========================================================================
   ПРИЛОЖЕНИЕ НА ТЕЛЕФОН — серверная часть.

   Приложение живёт на GitHub Pages (naxtenus.github.io/rzds-app) и ходит
   сюда POST-запросами на АНОНИМНЫЙ адрес — тот же, что у быстрого бота:
   установленное на айфон веб-приложение не умеет входить в Google.

   Замок вместо Google-входа — сессия. Её выдают в обмен на код, который
   владелец получает из меню таблицы («Вход в приложение на телефон»), со
   страницы плана (…/exec?appcode=1) или выдаёт рабочему из самого
   приложения. Код живёт сутки и годится на три входа. В таблице хранится не
   сама сессия, а её отпечаток (SHA-256): утечка листа «Входы приложения» не
   даёт никому войти. Любой вход можно выключить — из приложения («Мои
   входы») или в листе («Активен» = нет). Вход, которым не пользовались 90
   дней, выключается сам.

   Всё, что здесь есть, кончается подчёркиванием: такие функции со страницы
   плана через google.script.run недосягаемы. Открыты только пункты меню и
   триггер, и те безвредны или за калиткой своимиРуками_().

   Листы, которые заводит приложение (руками их трогать не нужно):
     «Входы приложения» — кто вошёл с какого телефона;
     «Push-подписки»    — куда слать уведомления;
     «Поручения»        — кому поручена задача и дошла ли она.

   Волна 1 (30.09.2026) — надёжность и скорость:
     — все листы читаются по одному обращению, свойства — одним;
     — push и Телеграм не держат ответ: они встают в очередь, телефон
       сразу после ответа просит «разошли» (a: 'flush'), а если не попросил —
       очередь разберёт триггер «Триггер_приложение» раз в пять минут;
     — телефон подтверждает, что push дошёл (a: 'ack'); не подтвердил за
       10 минут — владельцу сообщение в Телеграм;
     — утренняя сводка, «за час до срока», повтор непрочитанного поручения,
       «отчитаться» в конце смены, недельный отчёт — тем же триггером;
     — повтор одного и того же нажатия (связь оборвалась, телефон отправил
       ещё раз) не делает дела дважды: у каждого нажатия свой номер (cid).
   ========================================================================= */

var ПРИЛ = { ВХОД: 'Входы приложения', ПУШ: 'Push-подписки', ПОРУЧ: 'Поручения' };
var COL_ПВХ = ['Имя', 'Роль', 'Код', 'Код до', 'Сессия', 'Устройство', 'Вошёл', 'Был', 'Активен'];
var COL_ППУШ = ['Кто', 'Адрес', 'Ключи', 'Устройство', 'Добавлена', 'Ошибка'];
var COL_ППОР = ['Номер задачи', 'Кому', 'Заказ', 'Отправлено', 'Доставлено', 'Прочитано', 'Взял', 'Срок время', 'Повтор', 'Пункты'];
var ПРИЛ_СЕРВЕР = 'https://script.google.com/macros/s/AKfycbxgsJlROkVTBdFnsgbimTqCyrmgyiEDh3Bh9h8d7b_ZIDWlgcpHbQ_yU58PcDBS57Gr/exec?app=1';
var ПРИЛ_АДРЕС = 'https://naxtenus.github.io/rzds-app/';
var ПРИЛ_ВЛАДЕЛЕЦ = 'владелец';
var ПРИЛ_ВХОДОВ = 3;          // на сколько телефонов (или Safari + иконка) годится один код
var ПРИЛ_ДНЕЙ_ВХОДА = 90;     // вход, которым не пользовались столько дней, выключается
var ПРИЛ_ПРАВКИ = { decide: 1, undecide: 1, mark: 1, taskSave: 1, taskUpdate: 1, taskComment: 1,
  taskRead: 1, settingsSave: 1, checklistSave: 1, moveApply: 1, taskCheck: 1, orderSay: 1 };

/* ------------------------------------------------ память одного запроса
   Всё, что прочитано за запрос, живёт здесь и выбрасывается в конце.
   отложить — push и Телеграм не слать сейчас, а поставить в очередь. */
var __прил = null;
/* Засечки по шагам — видны в ответе (tm) и в журнале: где уходит время. */
function Прил_засечь_(k, t0) {
  if (!__прил) return;
  var tm = __прил.tm || (__прил.tm = {});
  tm[k] = (tm[k] || 0) + (Date.now() - t0);
}
/* части — какие данные поменялись: 'ф' (отметки со смены), 'з' (задачи);
   не сказано — обе. Остальное (свойства, листы, план) забывается всегда. */
function Прил_забыть_(части) { Прил_данныеСбросить_(части); if (__прил) { __прил.св = null; __прил.листы = {}; __прил.план = null; } }

/* Все свойства скрипта одним обращением. */
function Прил_св_() {
  if (__прил && __прил.св) return __прил.св;
  var св = props_().getProperties();
  if (__прил) __прил.св = св;
  return св;
}

/* ----------------------------------------------------------- вход в сеть */
function Прил_doPost_(e) {
  __прил = { отложить: true, очередь: [], листы: {} };
  var t0 = Date.now(), out, a = '';
  try {
    var сырьё = (e && e.postData && e.postData.contents) || '';
    var p = JSON.parse(сырьё || '{}');
    a = s_(p.a);
    out = Прил_действие_(a, p);
  } catch (err) {
    out = { error: String(err && err.message || err), code: err && err.code || '' };
  }
  try {
    if (__прил.очередь.length) { Прил_вОчередь_(__прил.очередь); out.flush = true; }
  } catch (err) { Logger.log('очередь уведомлений: %s', err); }
  out.ms = Date.now() - t0;
  if (__прил.tm) out.tm = __прил.tm;
  /* Видно в «Количестве выполнений» → строка → журнал: какое действие
     сколько стоило (сами запросы там все называются doPost). */
  try { console.log('приложение: ' + a + ' — ' + out.ms + ' мс' + (out.tm ? ' ' + JSON.stringify(out.tm) : '') + (out.error ? ' — ' + out.error : '')); } catch (err) {}
  __прил = null;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function Прил_ошибка_(текст, код) { var e = new Error(текст); e.code = код || ''; return e; }

function Прил_действие_(a, p) {
  if (a === 'login') return Прил_вход_(p);
  /* Где владелец возьмёт код, если вышел: страница плана (вход по Google)
     выдаёт его сама. Адрес плана и так защищён Google-входом — отдать его
     без сессии безопасно, а зашивать в приложение незачем. */
  if (a === 'ownerLink') return { url: webAppUrl_() + '?appcode=1' };
  /* Подтверждение доставки приходит от самого телефона (служебный
     работник), у которого нет сессии. Номер уведомления случайный и
     одноразовый — знать его может только тот, кому оно пришло. */
  if (a === 'ack') return Прил_получено_(p.id);
  if (a === 'ping') return { ok: true };
  var tк = Date.now();
  var me = Прил_кто_(p.s);
  Прил_засечь_('вход', tк);
  var вл = me.role === 'owner';

  /* Повтор того же нажатия: связь оборвалась после записи, телефон
     отправил ещё раз. Второй раз не делаем — только отдаём свежий вид. */
  var cidKey = ПРИЛ_ПРАВКИ[a] && s_(p.cid) ? 'app:cid:' + s_(p.cid).replace(/[^\w-]/g, '').slice(0, 40) : '';
  if (cidKey) {
    var было = CacheService.getScriptCache().get(cidKey);
    if (было) {
      var v0 = Прил_вид_(me);
      try { var x = JSON.parse(было); if (x.created) v0.created = x.created; } catch (e) {}
      v0.repeat = true;
      return v0;
    }
  }
  var сделано = function (created, части) {
    if (cidKey) CacheService.getScriptCache().put(cidKey, JSON.stringify({ created: created || 0 }), 21600);
    Прил_забыть_(части === undefined ? ЧАСТИ[a] : части);
    var v = Прил_вид_(me);
    if (created) v.created = created;
    return v;
  };

  var ЧАСТИ = { decide: 'ф', undecide: 'ф', mark: 'ф', taskSave: 'з', taskUpdate: 'з', taskComment: 'з',
    taskRead: 'з', taskCheck: 'з', settingsSave: '-', checklistSave: '-', moveApply: '-' };
  switch (a) {
    case 'ping': return { ok: true };
    case 'load':
      if (вл && !Прил_св_().APP_CLOCK) { try { Прил_часыЗавести_(); } catch (e) { Logger.log('часы приложения: %s', e); } }
      return Прил_вид_(me);
    case 'decide': if (!вл) break; Прил_решить_(Number(String(p.id).replace(/^f/, '')), !!p.yes, me.name); return сделано();
    case 'undecide': if (!вл) break; Прил_отменить_(Number(String(p.id).replace(/^f/, ''))); return сделано();
    case 'mark': Прил_отметка_(me, s_(p.op), s_(p.what), s_(p.text), { qty: p.qty, scrap: p.scrap, photo: p.photo, check: p.check }); return сделано();
    case 'taskSave': if (!вл) break; return сделано(Прил_задача_(me, p.task || {}));
    case 'taskUpdate': Прил_задачаПравка_(me, p); return сделано();
    case 'taskComment': Прил_задачаСлово_(me, Number(p.n), s_(p.text), p.photo); return сделано();
    case 'taskRead': Прил_прочитал_(me, Number(p.n)); return сделано();
    case 'settingsSave': if (!вл) break; Прил_настройки_(p.settings || {}); return сделано();
    case 'issueCode': if (!вл) break; return Прил_выдатьКод_(s_(p.name), s_(p.role) === 'owner' ? 'owner' : 'worker');
    case 'sessions': return { sessions: Прил_входы_(me) };
    case 'revoke': Прил_отключить_(me, Number(p.row)); return { sessions: Прил_входы_(me) };
    case 'flush': __прил.отложить = false; return { ok: true, sent: Прил_разослать_() };
    case 'photo': return { id: s_(p.id), data: Прил_фотоВзять_(s_(p.id)) };
    case 'orderInfo': return Прил_заказИнфо_(me, s_(p.order));
    case 'taskCheck': Прил_пунктОтметить_(me, Number(p.n), Number(p.i), !!p.done); return сделано();
    case 'orderSay': return { chat: Прил_заказСказать_(me, s_(p.order), s_(p.text), p.photo) };
    case 'checklistSave': if (!вл) break; Прил_чекЛистЗаписать_(s_(p.res), p.items || []); return сделано();
    case 'movePreview': if (!вл) break; return Прил_сдвиг_(s_(p.op), s_(p.start), false, me.name);
    case 'moveApply': if (!вл) break; var сд = Прил_сдвиг_(s_(p.op), s_(p.start), true, me.name); var v2 = сделано(); v2.moved = сд; return v2;
    case 'pushKey': return { key: ВебПуш_публичный_() };
    case 'pushSubscribe': Прил_подписка_(me, p.sub || {}, s_(p.ua)); return { ok: true };
    case 'pushTest':
      var n = Прил_пушСейчас_(Прил_кому_(me), { title: 'РЗДС: проверка', body: 'Уведомления на этот телефон доходят.', url: '#/', tag: 'test' }, null, true);
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
function Прил_чч_(d) { return Utilities.formatDate(d instanceof Date ? d : new Date(d), Session.getScriptTimeZone(), 'HH:mm'); }

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
  /* Перебор кодов. Раньше предел был один на весь сервер — 20 попыток за
     10 минут, и кто-то один, ошибаясь, запирал вход всем. Теперь предел у
     каждого телефона свой (10 попыток), а общий (100) только страхует от
     перебора с множества «телефонов»: 100 попыток из 887 млн сочетаний. */
  var c = CacheService.getScriptCache();
  var dev = s_(p.dev).replace(/[^\w-]/g, '').slice(0, 40) || 'без-номера';
  var кд = 'app:login:' + dev, кв = 'app:login:all';
  var nd = Number(c.get(кд) || 0), nv = Number(c.get(кв) || 0);
  if (nd >= 10) throw Прил_ошибка_('С этого телефона слишком много попыток. Подождите 10 минут.');
  if (nv >= 100) throw Прил_ошибка_('Слишком много попыток входа. Подождите 10 минут.');
  c.put(кд, String(nd + 1), 600);
  c.put(кв, String(nv + 1), 600);
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
      /* Код годится на ПРИЛ_ВХОДОВ входов за сутки, а не на один. Живой
         случай (29.09): владелец ввёл код в Safari, потом добавил приложение
         на экран «Домой» — а у приложения с иконки своя память, и там снова
         экран входа. Каждый вход — своя строка и своя сессия, так что
         отключить можно ровно один телефон. */
      var сч = 'app:uses:' + код;
      var было = Number(props_().getProperty(сч) || 0) + 1;
      var строка = [Прил_хэш_(сессия), s_(p.ua).slice(0, 120), Прил_сейчас_(), Прил_сейчас_()];
      if (!s_(r[4])) {
        sh.getRange(i + 2, 5, 1, 4).setValues([строка]);
      } else {
        appendRow_(ПРИЛ.ВХОД, COL_ПВХ, {
          'Имя': s_(r[0]), 'Роль': s_(r[1]), 'Код': '', 'Код до': '',
          'Сессия': строка[0], 'Устройство': строка[1], 'Вошёл': строка[2], 'Был': строка[3], 'Активен': 'да',
        });
      }
      if (было >= ПРИЛ_ВХОДОВ) {
        sh.getRange(i + 2, 3, 1, 2).setValues([['', '']]);   // код израсходован
        props_().deleteProperty(сч);
      } else props_().setProperty(сч, String(было));
      c.remove(кд);
      var роль = s_(r[1]) === ПРИЛ_ВЛАДЕЛЕЦ ? 'owner' : 'worker';
      return { token: сессия, me: { role: роль, name: s_(r[0]), id: роль === 'owner' ? 'owner' : s_(r[0]) } };
    }
    throw Прил_ошибка_('Код не подошёл');
  } finally { lock.releaseLock(); }
}

/* Кто пришёл. Отпечаток сессии ищем в листе; результат — в кэше на 10 минут,
   чтобы не читать лист на каждое нажатие. Выключенный вход перестаёт
   работать сразу, если выключен из приложения, и не позже чем через 10
   минут, если руками в листе. */
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
    /* Телефон потерян или отдан — а вход в нём жив годами. Не заходили
       ПРИЛ_ДНЕЙ_ВХОДА дней — вход выключается, нужен новый код. */
    var был = Прил_дата_(rows[i][7]) || Прил_дата_(rows[i][6]);
    if (был && Date.now() - был.getTime() > ПРИЛ_ДНЕЙ_ВХОДА * 864e5) {
      try { sh.getRange(i + 2, 9).setValue('нет'); } catch (e) {}
      throw Прил_ошибка_('Вход устарел: больше ' + ПРИЛ_ДНЕЙ_ВХОДА + ' дней без захода. Попросите новый код.', 'auth');
    }
    var роль = s_(rows[i][1]) === ПРИЛ_ВЛАДЕЛЕЦ ? 'owner' : 'worker';
    var me = { role: роль, name: s_(rows[i][0]), id: роль === 'owner' ? 'owner' : s_(rows[i][0]), row: i + 2, h: h };
    try { sh.getRange(i + 2, 8).setValue(Прил_сейчас_()); } catch (e) {}
    c.put('app:s:' + h, JSON.stringify(me), 600);
    return me;
  }
  throw Прил_ошибка_('Вход не найден — войдите заново', 'auth');
}

/* «Мои входы»: владелец видит все телефоны, рабочий — свои. */
function Прил_входы_(me) {
  var sh = sheet_(ПРИЛ.ВХОД, COL_ПВХ);
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, COL_ПВХ.length).getValues() : [];
  var out = [];
  rows.forEach(function (r, i) {
    if (!s_(r[4])) return;                                   // код без входа
    if (me.role !== 'owner' && s_(r[0]) !== me.name) return;
    out.push({ row: i + 2, name: s_(r[0]), role: s_(r[1]) === ПРИЛ_ВЛАДЕЛЕЦ ? 'owner' : 'worker',
      device: s_(r[5]), since: Прил_iso_(r[6]), seen: Прил_iso_(r[7]), active: bool_(r[8]),
      me: (me.h && s_(r[4]) === me.h) || (!me.h && me.row === i + 2) });
  });
  out.sort(function (a, b) { return (b.active - a.active) || String(b.seen).localeCompare(String(a.seen)); });
  return out;
}
function Прил_отключить_(me, row) {
  var sh = sheet_(ПРИЛ.ВХОД, COL_ПВХ);
  if (!(row > 1) || row > sh.getLastRow()) throw Прил_ошибка_('Этого входа уже нет в листе');
  var r = sh.getRange(row, 1, 1, COL_ПВХ.length).getValues()[0];
  if (!s_(r[4])) throw Прил_ошибка_('Это не вход, а невыданный код');
  if (me.role !== 'owner' && s_(r[0]) !== me.name) throw Прил_ошибка_('Это не ваш вход');
  sh.getRange(row, 9).setValue('нет');
  CacheService.getScriptCache().remove('app:s:' + s_(r[4]));
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
function Прил_дата_(v) {
  var t = Прил_iso_(v);
  if (!t) return null;
  var d = new Date(t);
  return isNaN(d) ? null : d;
}

var ПРИЛ_СТАТУС = { 'в работе': 'в работе', 'есть проблема': 'проблема', 'завершено': 'выполнено',
  'приостановлено': 'пауза', 'не начато': 'план', 'просрочено': 'план' };

function Прил_настройкиВсе_() {
  try { return JSON.parse(Прил_св_().APP_SETTINGS || '{}') || {}; } catch (e) { return {}; }
}
function Прил_настройки_(patch) {
  var s = Прил_настройкиВсе_();
  Object.keys(patch).forEach(function (k) { if (/^[a-zA-Z]{2,20}$/.test(k)) s[k] = !!patch[k]; });
  props_().setProperty('APP_SETTINGS', JSON.stringify(s));
}

/* Лист целиком одним обращением. Прежде каждый лист читался пятью-шестью
   (последняя строка, ширина, шапка, строки…), а на один ответ приложения
   шло четыре листа — это и были секунды. */
var ПРИЛ_ЛИСТЫ = {
  факт: function () { return [SH.FACT, COL_FACT]; },
  задачи: function () { return [SH.TASK, COL_TASK]; },
  комм: function () { return [SH.TCOM, COL_TCOM]; },
  пор: function () { return [ПРИЛ.ПОРУЧ, COL_ППОР]; },
};
function Прил_лист_(ключ) {
  var м = __прил && __прил.листы;
  if (м && м[ключ]) return м[ключ];
  var имя = ПРИЛ_ЛИСТЫ[ключ]()[0], cols = ПРИЛ_ЛИСТЫ[ключ]()[1];
  var t0 = Date.now();
  var книга = ss_();
  Прил_засечь_('таблица', t0);
  t0 = Date.now();
  var sh = книга.getSheetByName(имя);
  var v = sh ? sh.getDataRange().getValues() : [];
  Прил_засечь_('лист ' + ключ, t0);
  var шапка = v.length ? v[0].map(function (h) { return String(h || '').trim(); }) : cols.slice();
  var строки = v.length > 1 ? v.slice(1) : [];
  var т = {
    шапка: шапка, строки: строки,
    объекты: function () {
      return строки.map(function (row) {
        var o = {};
        шапка.forEach(function (h, i) { if (h) o[h] = row[i]; });
        return o;
      }).filter(function (o) { return s_(o[cols[0]]) !== ''; });
    },
  };
  if (м) м[ключ] = т;
  return т;
}

function Прил_поручения_() {
  var по = {};
  Прил_лист_('пор').объекты().forEach(function (r) {
    var n = n_(r['Номер задачи'], 0);
    if (!n) return;
    по[n] = { to: s_(r['Кому']), order: s_(r['Заказ']), time: Прил_времяКлетки_(r['Срок время']),
      repeat: s_(r['Повтор']), items: Прил_пунктыИз_(r['Пункты']),
      delivery: { sent: Прил_iso_(r['Отправлено']), delivered: Прил_iso_(r['Доставлено']),
                  read: Прил_iso_(r['Прочитано']), taken: Прил_iso_(r['Взял']) } };
  });
  return по;
}
/* «17:00» таблица хранит как дату 30.12.1899 17:00 — достаём часы. */
function Прил_времяКлетки_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  var m = s_(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? pad2_(m[1]) + ':' + m[2] : '';
}

function Прил_задачиДляВида_() {
  var пор = Прил_поручения_();
  var комм = {};
  Прил_лист_('комм').объекты().forEach(function (r) {
    var n = n_(r['Номер задачи'], 0);
    if (n) (комм[n] = комм[n] || []).push({ ts: Прил_iso_(датаКлетки_(r['Время'])), who: s_(r['Кто']),
      text: Прил_безФото_(r['Комментарий']), photos: Прил_фотоИз_(r['Комментарий']) });
  });
  return Прил_лист_('задачи').объекты().map(function (r) {
    var n = n_(r['Номер'], 0), x = пор[n] || {};
    var день = d_(r['Срок']) || '';
    return {
      n: n, text: s_(r['Задача']), detail: s_(r['Подробно']), weight: s_(r['Важность']) || 'обычная',
      due: день && x.time ? Прил_iso_(день + 'T' + x.time) : день,
      state: s_(r['Статус']) || ЗАДАЧА_ОТКР, to: x.to || '', order: x.order || '',
      delivery: x.to ? x.delivery : undefined, closed: Прил_iso_(датаКлетки_(r['Закрыта'])), by: s_(r['Кто закрыл']),
      repeat: x.repeat || '', items: x.items || [],
      comments: комм[n] || [],
    };
  }).filter(function (t) { return t.n && t.state !== ЗАДАЧА_УБР; });
}

function Прил_видОтметки_(f) {
  var n = s_(f.note);
  if (/^проблема:/i.test(n)) return 'problem';
  if (/^пауза:/i.test(n)) return 'pause';
  if (/^продолжил/i.test(n)) return 'resume';
  if (f.moveTo) return 'move';
  /* «Закончил» с браком — это всё равно «Закончил»: брак едет вместе с ним. */
  if (f.finish && f.progress === 100) return 'done';
  if (s_(f.scrap)) return 'scrap';
  if (f.start && !f.finish) return 'start';
  return 'comment';
}
var ПРИЛ_ПОСЛЕДСТВИЯ = {
  problem: 'Операция встанет в плане со статусом «есть проблема».',
  move: 'Операция начнётся не раньше указанного дня, план пересчитается.',
  scrap: 'Брак запишется в примечание операции.',
  done: 'Операция закроется, следующие пойдут по плану.',
  start: 'Отметится фактическое начало операции.',
  pause: 'Операция встанет в плане «приостановлено» с этой причиной.',
  resume: 'Операция снова «в работе».',
  comment: '',
};
function Прил_текстОтметки_(f) {
  var n = Прил_безФото_(f.note).replace(/^(проблема|комментарий|брак|пауза):\s*/i, '');
  /* «Начал» и «Закончил» без слов — это не слова рабочего, их и так говорит
     ярлык карточки; в кавычках показываем только то, что человек написал
     (и что он добавил к отметке: сколько сделал, чек-лист). */
  n = n.replace(/^(отмечено начало|сдано) со смены( \(приложение\))?(\s*[:·]\s*)?/, '').replace(/^отметка из Telegram$/, '');
  if (s_(f.scrap) && Прил_видОтметки_(f) === 'done') n = (n ? n + ', ' : '') + 'брак ' + s_(f.scrap) + ' шт';
  return n;
}
/* Фото в тексте хранится меткой «[фото: 12-ab3cd9]»: так снимок виден и в
   планировщике (есть метка — есть фото), а лишних листов читать не надо. */
var ПРИЛ_ФОТО_МЕТКА = /\s*\[фото: ([\w-]+)\]/g;
function Прил_фотоИз_(t) { var out = [], m; ПРИЛ_ФОТО_МЕТКА.lastIndex = 0; while ((m = ПРИЛ_ФОТО_МЕТКА.exec(s_(t)))) out.push(m[1]); return out; }
function Прил_безФото_(t) { return s_(t).replace(ПРИЛ_ФОТО_МЕТКА, '').trim(); }

/* ------------------------------------------------ план — один раз на версию
   Журнал выполнения за 28.09 показал, откуда «пять секунд»: каждый запрос
   приложения — от 4 до 13 секунд на сервере. На каждое нажатие сервер читал
   весь план из восьми листов и заново прогонял расчёт критического пути.

   Теперь посчитанная часть (операции окна, заказы, станки, люди) лежит в
   кэше сервера под номером версии плана. Любое сохранение плана — из
   планировщика, решением по ответу, ночным пересчётом — меняет номер, и
   следующий запрос посчитает заново. Правка руками прямо в таблице номер не
   меняет, поэтому срок жизни кэша ограничен пятью минутами: хуже этого
   старым план в телефоне не будет.

   В кэш не кладётся то, что меняется между сохранениями плана: ответы со
   смены, задачи, настройки. Их читаем каждый раз — они лёгкие. */
/* Замер 29.09 на живом плане: чтение листов — около секунды, а расчёт
   плана при промахе кэша — 2,3 с и больше. Кэш жил 5 минут, и каждое
   открытие приложения после перерыва попадало на расчёт. Теперь кэш живёт
   полчаса, а освежает его не человек, а часы приложения (раз в 5 минут,
   если посчитанному больше 10 минут). Правка руками в таблице доходит до
   телефона не позже чем через 15 минут; сохранение из планировщика —
   сразу (меняется номер версии). */
var ПРИЛ_КЭШ_СЕК = 1800, ПРИЛ_СВЕЖЕСТЬ_МС = 10 * 60000;
function Прил_ключПлана_() {
  return 'app:plan:v' + Number(Прил_св_().PLAN_VERSION || 0) + ':' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}
function Прил_планЧасть_(заново) {
  if (__прил && __прил.план && !заново) return __прил.план;
  var t0 = Date.now();
  var ключ = Прил_ключПлана_();
  var c = CacheService.getScriptCache();
  var готово = заново ? null : Прил_кэшВзять_(c, ключ);
  Прил_засечь_('план из кэша', t0);
  if (готово) { if (__прил) __прил.план = готово; return готово; }
  t0 = Date.now();

  var eng = engineNow_();
  var сегодня = new Date(); сегодня.setHours(0, 0, 0, 0);
  /* Окно — вчера и три недели вперёд. Начатое и «есть проблема» видно всегда,
     даже если по плану должно было кончиться раньше: оно и есть самое важное. */
  var от = new Date(сегодня.getTime() - 864e5), до = new Date(сегодня.getTime() + 21 * 864e5);
  var ops = [];
  eng.ops.forEach(function (o) {
    if (o.kind === 'stop' || !o.es || !o.ef) return;
    var живая = o.status === 'в работе' || o.status === 'есть проблема';
    if (!живая && (o.ef < от || o.es > до)) return;
    ops.push({
      code: o.id, order: o.order, op: o.stage || o.description || o.id, part: o.part || '',
      res: o.machine || o.worker || '—', machine: o.machine || '', worker: o.worker || '',
      start: o.es.toISOString(), end: o.ef.toISOString(),
      status: ПРИЛ_СТАТУС[o.status] || 'план', pct: Math.round(o.progress || 0),
      factStart: o.factStart ? o.factStart.toISOString() : '', problem: o.problem || '',
    });
  });
  var заказы = Object.keys(eng.orders || {}).map(function (k) {
    return { code: k, name: eng.orders[k] || '', due: eng.deadlines[k] || '' };
  });
  var ресурсы = Object.keys(eng.resources).map(function (k) {
    var r = eng.resources[k];
    return { code: r.id, name: r.name, places: r.capacity || 1 };
  });
  var рабочие = readTable_(SH.WRK, COL_WRK).filter(function (r) { return bool_(r['Активен']); })
    .map(function (r) { return { id: s_(r['Имя']), name: s_(r['Имя']), res: parseList_(r['Ресурсы']) }; });
  var часть = { ops: ops, orders: заказы, resources: ресурсы, people: рабочие, at: Date.now() };
  Прил_кэшПоложить_(c, ключ, часть, ПРИЛ_КЭШ_СЕК);
  if (__прил) __прил.план = часть;
  Прил_засечь_('расчёт плана', t0);
  return часть;
}

/* Кэш сервера держит до 100 КБ на ключ; большой план режем на куски. */
function Прил_кэшПоложить_(c, ключ, объект, сек) {
  try {
    var t = JSON.stringify(объект), n = Math.ceil(t.length / 90000) || 1, m = {};
    for (var i = 0; i < n; i++) m[ключ + ':' + i] = t.slice(i * 90000, (i + 1) * 90000);
    m[ключ + ':n'] = String(n);
    if (c.putAll) c.putAll(m, сек); else Object.keys(m).forEach(function (k) { c.put(k, m[k], сек); });
  } catch (e) { /* не влезло в кэш — ничего страшного, посчитаем в следующий раз */ }
}
function Прил_кэшВзять_(c, ключ) {
  try {
    var n = Number(c.get(ключ + ':n') || 0);
    if (!n) return null;
    var ключи = [];
    for (var i = 0; i < n; i++) ключи.push(ключ + ':' + i);
    var все = c.getAll ? c.getAll(ключи) : null;
    var t = '';
    for (var j = 0; j < n; j++) {
      var кус = все ? все[ключи[j]] : c.get(ключи[j]);
      if (кус == null) return null;
      t += кус;
    }
    return JSON.parse(t);
  } catch (e) { return null; }
}

/* Ответы со смены, задачи, поручения — в кэше на минуту.
   Замер 29.09 (засечки tm): открыть таблицу 0,25–0,4 с и по 0,2–1 с на
   каждый из четырёх листов — 1,2–2,9 с на каждое открытие приложения,
   хотя между двумя открытиями в этих листах обычно не меняется ничего.
   Теперь листы читаются, только когда что-то поменялось:
     — любое изменение из приложения сбрасывает кэш сразу;
     — всё, о чём планировщик сообщает владельцу (Уведомить_: отметки из
       Телеграма, решения, отчёты), — тоже сразу (Прил_пушВладельцу_);
     — правка руками в таблице или на странице плана — не позже чем через
       минуту (срок жизни кэша). */
var ПРИЛ_ДАННЫЕ_СЕК = 60;
/* Две части отдельно: отметка со смены не заставляет перечитывать задачи, а
   комментарий к задаче — «Факт» (замер 29.09: каждый лист — 0,2–1 с). */
function Прил_данные_() {
  if (__прил && __прил.данные) return __прил.данные;
  var t0 = Date.now();
  var c = CacheService.getScriptCache();
  var ф = Прил_кэшВзять_(c, 'app:dv:ф');
  var з = Прил_кэшВзять_(c, 'app:dv:з');
  Прил_засечь_('данные из кэша', t0);
  if (!ф) {
    var строки = Прил_лист_('факт').строки;
    ф = { ждут: изСтрок_(строки), решённые: Прил_решённые_(строки, 12) };
    Прил_кэшПоложить_(c, 'app:dv:ф', ф, ПРИЛ_ДАННЫЕ_СЕК);
  }
  if (!з) {
    з = { задачи: Прил_задачиДляВида_() };
    Прил_кэшПоложить_(c, 'app:dv:з', з, ПРИЛ_ДАННЫЕ_СЕК);
  }
  var д = { ждут: ф.ждут, решённые: ф.решённые, задачи: з.задачи };
  if (__прил) __прил.данные = д;
  return д;
}
function Прил_данныеСбросить_(части) {
  var c = CacheService.getScriptCache();
  try {
    if (!части || части.indexOf('ф') >= 0) c.remove('app:dv:ф:n');
    if (!части || части.indexOf('з') >= 0) c.remove('app:dv:з:n');
  } catch (e) {}
  if (__прил) __прил.данные = null;
}

function Прил_вид_(me) {
  var часть = Прил_планЧасть_();
  var данные = Прил_данные_();
  var ждут = данные.ждут;
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
    if (вид === 'pause') { x.pause = Прил_текстОтметки_(f); x.pauseAt = Прил_iso_(f.ts); }
    if (вид === 'resume') { x.pause = ''; x.pauseAt = ''; x.resumed = true; }
  });
  var мои = Прил_мойУчасток_(me, часть);
  var ops = [];
  часть.ops.forEach(function (o) {
    if (мои && мои.length && мои.indexOf(o.machine) < 0 && мои.indexOf(o.worker) < 0) return;
    var st = o.status, начато = o.factStart;
    var x = поверх[o.code] || {};
    if (x.start && st === 'план') { st = 'в работе'; начато = Прил_iso_(x.start); }
    if (x.resumed && st === 'пауза') st = 'в работе';
    if (x.pause && st !== 'выполнено') st = 'пауза';
    if (x.problem && st !== 'выполнено') st = 'проблема';
    if (x.done && (st === 'в работе' || st === 'план' || st === 'пауза')) st = 'ждёт решения';
    ops.push({
      code: o.code, order: o.order, op: o.op, part: o.part, res: o.res, machine: o.machine || '', start: o.start, end: o.end,
      status: st, pct: o.pct, factStart: начато, problem: x.problem || o.problem || '', problemAt: x.problemAt || '',
      pause: x.pause || '', pauseAt: x.pauseAt || '',
      pending: !!(x.start || x.done || x.problem || x.pause || x.resumed),
    });
  });
  var задачи = данные.задачи;

  var tч = Date.now();
  var чек = Прил_чекЛисты_();
  Прил_засечь_('чек-листы', tч);
  if (me.role === 'worker') {
    var мойЧек = {};
    Object.keys(чек).forEach(function (k) { if (k === ПРИЛ_ВСЕ || !мои || !мои.length || мои.indexOf(k) >= 0) мойЧек[k] = чек[k]; });
    return {
      me: { role: 'worker', name: me.name, id: me.name }, now: new Date().toISOString(),
      ops: ops, orders: часть.orders, checklists: мойЧек,
      tasks: задачи.filter(function (t) { return t.to === me.name; }),
    };
  }
  var pending = ждут.slice().reverse().map(function (f) {
    var вид = Прил_видОтметки_(f);
    var imp = ПРИЛ_ПОСЛЕДСТВИЯ[вид];
    if (вид === 'move' && f.moveTo) imp = 'Операция начнётся не раньше ' + f.moveTo.split('-').reverse().join('.') + ', план пересчитается.';
    return { id: 'f' + f.row, kind: вид, who: f.who, at: Прил_iso_(f.ts), opCode: f.op,
      text: Прил_текстОтметки_(f), impact: imp, photos: Прил_фотоИз_(f.note) };
  });
  return {
    me: { role: 'owner', name: me.name, id: 'owner' }, now: new Date().toISOString(),
    people: часть.people, resources: часть.resources, orders: часть.orders, ops: ops,
    pending: pending, decided: данные.решённые, tasks: задачи,
    settings: Прил_настройкиВсе_(), checklists: чек,
  };
}

/* Станки и участки рабочего. null — владелец (видит всё); пустой список —
   рабочий без закреплённых станков (тоже видит всё, как в плане). */
function Прил_мойУчасток_(me, часть) {
  if (me.role !== 'worker') return null;
  var w = часть.people.filter(function (x) { return x.name === me.name; })[0];
  return w ? w.res : [];
}

function Прил_решённые_(rows, сколько) {
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < сколько; i--) {
    var r = rows[i];
    if (!s_(r[Ф.РЕШЕНИЕ])) continue;
    var f = { start: s_(r[Ф.НАЧАЛО]), finish: s_(r[Ф.КОНЕЦ]), progress: r[Ф.ПРОЦ] === '' || r[Ф.ПРОЦ] == null ? null : n_(r[Ф.ПРОЦ], 0),
      scrap: s_(r[Ф.БРАК]), note: s_(r[Ф.ЗАМЕТКА]), moveTo: s_(r[Ф.ПЕРЕНОС]) };
    out.push({ id: 'f' + (i + 2), kind: Прил_видОтметки_(f), who: s_(r[Ф.КТО]), at: Прил_iso_(r[Ф.ВРЕМЯ]),
      opCode: s_(r[Ф.ОП]), text: Прил_текстОтметки_(f), photos: Прил_фотоИз_(f.note),
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
      note = Прил_безФото_(note);
      if (/^проблема:/i.test(note)) {
        op.status = 'есть проблема';
        op.problem = note.replace(/^проблема:\s*/i, '');
        if (!op.factStart) op.factStart = isoDT_(new Date());
      } else if (/^пауза:/i.test(note)) {
        if (!ужеГотова) op.status = 'приостановлено';
        op.note = (op.note ? op.note + ' · ' : '') + note;
      } else if (/^продолжил/i.test(note)) {
        if (!ужеГотова) op.status = 'в работе';
      } else {
        var add = [note.replace(/^(комментарий|брак):\s*/i, ''), scrap ? 'брак ' + scrap + ' шт' : '']
          .map(function (x) { return x.replace(/^(отмечено начало|сдано) со смены( \(приложение\))?(\s*[:·]\s*)?/, '').replace(/^отметка из Telegram$/, ''); })
          .filter(function (x) { return x; }).join('; ');
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
function Прил_отметка_(me, op, что, текст, доп) {
  доп = доп || {};
  if (!op) throw Прил_ошибка_('Не сказано, по какой операции');
  /* Рабочий отмечает только своё. Экран и так показывает ему только его
     станки, но запрос можно собрать руками — проверяем и здесь. */
  if (me.role === 'worker') {
    var часть = Прил_планЧасть_();
    var о = часть.ops.filter(function (x) { return x.code === op; })[0];
    if (!о) throw Прил_ошибка_('Операции ' + op + ' нет в плане на эти дни — обновите экран');
    var мои = Прил_мойУчасток_(me, часть);
    if (мои.length && мои.indexOf(о.machine) < 0 && мои.indexOf(о.worker) < 0)
      throw Прил_ошибка_('Операция ' + op + ' не на вашем участке');
  }
  var кто = me.name;
  var сейчас = isoDT_(new Date());
  var фото = доп.photo ? ' [фото: ' + Прил_фотоСохранить_(me, доп.photo, 'отметка ' + op) + ']' : '';
  var f;
  if (что === 'start') {
    var чл = s_(доп.check);
    f = { who: кто, op: op, start: сейчас, finish: '', progress: 1,
      note: 'отмечено начало со смены (приложение)' + (/^\d+\/\d+$/.test(чл) ? ' · чек-лист ' + чл : '') + фото };
  } else if (что === 'finish') {
    var шт = Math.max(0, Math.round(n_(доп.qty, 0))), брак = Math.max(0, Math.round(n_(доп.scrap, 0)));
    f = { who: кто, op: op, start: '', finish: сейчас, progress: 100, scrap: брак ? String(брак) : '',
      note: 'сдано со смены (приложение)' + (шт ? ': сделано ' + шт + ' шт' : '') + фото };
  } else if (что === 'problem') {
    if (!текст) throw Прил_ошибка_('Напишите, что случилось');
    f = { who: кто, op: op, start: '', finish: '', progress: null, scrap: '', note: 'проблема: ' + текст + фото };
  } else if (что === 'pause') {
    if (!текст) throw Прил_ошибка_('Выберите причину паузы');
    f = { who: кто, op: op, start: '', finish: '', progress: null, scrap: '', note: 'пауза: ' + текст + фото };
  } else if (что === 'resume') {
    f = { who: кто, op: op, start: '', finish: '', progress: null, scrap: '', note: 'продолжил работу' + (текст ? ': ' + текст : '') };
  } else if (что === 'comment') {
    if (!текст && !фото) throw Прил_ошибка_('Пустой комментарий');
    f = { who: кто, op: op, start: '', finish: '', progress: null, scrap: '', note: 'комментарий: ' + (текст || 'фото') + фото };
  } else throw Прил_ошибка_('Неизвестная отметка');
  appendFact_(f);
  var слова = { start: 'начал', finish: 'закончил', problem: 'ПРОБЛЕМА', comment: 'пишет', pause: 'пауза', resume: 'продолжил' }[что];
  var хвост = что === 'finish' ? [доп.qty ? 'сделано ' + доп.qty + ' шт' : '', n_(доп.scrap, 0) ? 'брак ' + доп.scrap + ' шт' : ''].filter(String).join(', ') : '';
  var p = {
    title: (что === 'problem' ? '⚠️ ' : что === 'pause' ? '⏸ ' : '') + кто + ': ' + слова + ' · ' + op,
    body: (текст || хвост || (что === 'finish' ? 'Нужно ваше решение: принять в план?' : 'Отметка со смены')) + (фото ? ' · 📷 фото' : ''),
    url: '#/replies', tag: 'fact-' + op, kind: что === 'problem' ? 'problem' : 'answer',
  };
  Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, p, что === 'problem' ? 'problem' : 'answers');
  Прил_телеграм_(p.title + (текст || хвост ? '\n' + (текст || хвост) : '') + (фото ? '\n(фото — в приложении)' : ''), что === 'problem' ? 'warn' : 'wait');
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
/* Время срока. Лист «Задачи» хранит только день (так его понимает
   планировщик), а приложение ставит срок «до 15:00». Час храним рядом, в
   «Поручениях»; пусто — значит конец дня. */
function Прил_времяСрока_(v) {
  var t = s_(v);
  if (!t || /^\d{4}-\d{2}-\d{2}$/.test(t)) return '';
  var d = new Date(t);
  return isNaN(d) ? '' : Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
}
function Прил_поручДоп_() {
  /* «Срок время» добавлен в схему позже — дописать столбец в старый лист. */
  if (__прил && __прил.шапкаПор) return;
  ensureHeader_(ПРИЛ.ПОРУЧ, COL_ППОР);
  if (__прил) __прил.шапкаПор = true;
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
    Прил_поручДоп_();
    appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, { 'Номер задачи': задача.n, 'Кому': кому, 'Заказ': s_(t.order),
      'Отправлено': кому ? Прил_сейчас_() : '', 'Доставлено': '', 'Прочитано': '', 'Взял': '',
      'Срок время': Прил_времяСрока_(t.due), 'Повтор': Прил_правило_(t.repeat),
      'Пункты': Прил_пунктыВ_((t.items || []).map(function (x) { return { t: s_(x), d: false }; })) });
  } finally { lock.releaseLock(); }
  if (t.photo) {
    appendRow_(SH.TCOM, COL_TCOM, { 'Номер задачи': задача.n, 'Время': Прил_сейчас_(), 'Кто': me.name,
      'Комментарий': 'фото [фото: ' + Прил_фотоСохранить_(me, t.photo, 'задача ' + задача.n) + ']' });
  }
  if (кому) {
    Прил_пуш_(кому, { title: 'Поручение от мастера', body: текст + (t.photo ? ' · 📷 фото' : '') + (задача.due ? ' · срок ' + задача.due.split('-').reverse().slice(0, 2).join('.') : ''),
      url: '#/task/' + задача.n, tag: 'task-' + задача.n, kind: 'task', n: задача.n }, 'workerNew');
    Прил_вОчередьДело_({ k: 'раб', кому: кому, text: 'Поручение от мастера (№' + задача.n + '): ' + текст });
  } else {
    Прил_вОчередьДело_({ k: 'задача', t: задача, шапка: 'Новая задача' });
  }
  return задача.n;
}

function Прил_поручениеОтметить_(n, поле, кому, заказ) {
  var sh = sheet_(ПРИЛ.ПОРУЧ, COL_ППОР);
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, 7).getValues() : [];
  var col = COL_ППОР.indexOf(поле) + 1;
  for (var i = 0; i < rows.length; i++) {
    if (n_(rows[i][0], 0) === n) {
      if (поле === 'Кому') { sh.getRange(i + 2, 2, 1, 6).setValues([[кому, заказ !== undefined ? заказ : rows[i][2], кому ? Прил_сейчас_() : '', '', '', '']]); return; }
      if (поле === 'Срок время') { Прил_поручДоп_(); sh.getRange(i + 2, col).setValue(заказ || ''); return; }
      if (!s_(rows[i][col - 1])) sh.getRange(i + 2, col).setValue(Прил_сейчас_());
      return;
    }
  }
  if (поле === 'Кому') appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, { 'Номер задачи': n, 'Кому': кому, 'Заказ': заказ || '',
    'Отправлено': кому ? Прил_сейчас_() : '', 'Доставлено': '', 'Прочитано': '', 'Взял': '' });
  if (поле === 'Срок время' && заказ) { Прил_поручДоп_(); appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, { 'Номер задачи': n, 'Срок время': заказ }); }
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
    if (p.due !== undefined) Прил_поручениеОтметить_(n, 'Срок время', '', Прил_времяСрока_(p.due));
    if (пор.to && p.due !== undefined) Прил_пуш_(пор.to, { title: 'Поручение перенесено', body: 'Новый срок: ' + Прил_деньСрока_(p.due).split('-').reverse().slice(0, 2).join('.') + (Прил_времяСрока_(p.due) ? ' ' + Прил_времяСрока_(p.due) : ''), url: '#/task/' + n, tag: 'task-' + n }, 'workerNew');
  }
  if (p.repeat !== undefined) Прил_поручЗаписать_(n, { 'Повтор': Прил_правило_(p.repeat) });
  if (p.items !== undefined) {
    var были = {};
    (пор.items || []).forEach(function (x) { были[x.t] = x; });
    Прил_поручЗаписать_(n, { 'Пункты': Прил_пунктыВ_((p.items || []).map(s_).filter(String).map(function (t) { return были[t] || { t: t, d: false }; })) });
  }
  if (p.to !== undefined) {
    var кому = s_(p.to);
    Прил_поручениеОтметить_(n, 'Кому', кому);
    if (кому) {
      var t1 = задачи_(true, true).filter(function (x) { return x.n === n; })[0] || {};
      Прил_пуш_(кому, { title: 'Поручение от мастера', body: t1.text || '', url: '#/task/' + n, tag: 'task-' + n, kind: 'task', n: n }, 'workerNew');
      Прил_вОчередьДело_({ k: 'раб', кому: кому, text: 'Поручение от мастера (№' + n + '): ' + (t1.text || '') });
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
    if (куда === ЗАДАЧА_ЗАКР) Прил_повторитьБезЗамка_(n, list);
  } finally { lock.releaseLock(); }
}

function Прил_задачаСлово_(me, n, текст, фотоДанные) {
  var фото = фотоДанные ? ' [фото: ' + Прил_фотоСохранить_(me, фотоДанные, 'задача ' + n) + ']' : '';
  if (!текст && !фото) throw Прил_ошибка_('Пустой комментарий');
  if (!текст) текст = 'фото';
  var t = задачи_(true, true).filter(function (x) { return x.n === n; })[0];
  if (!t) throw Прил_ошибка_('Задачи №' + n + ' нет');
  var пор = Прил_поручения_()[n] || {};
  if (me.role === 'worker' && пор.to !== me.name) throw Прил_ошибка_('Это поручение не вам');
  appendRow_(SH.TCOM, COL_TCOM, { 'Номер задачи': n, 'Время': Прил_сейчас_(), 'Кто': me.name, 'Комментарий': текст + фото });
  if (фото) текст += ' · 📷 фото';
  if (me.role === 'worker') {
    Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: me.name + ' пишет по задаче', body: текст, url: '#/task/' + n, tag: 'task-' + n }, 'taskReply');
    Прил_телеграм_(me.name + ' по задаче №' + n + ' (' + t.text + '):\n' + текст, 'ask');
  } else if (пор.to) {
    Прил_пуш_(пор.to, { title: 'Мастер пишет', body: текст, url: '#/task/' + n, tag: 'task-' + n }, 'workerNew');
    Прил_вОчередьДело_({ k: 'раб', кому: пор.to, text: 'Мастер по задаче №' + n + ': ' + текст });
  }
}

function Прил_прочитал_(me, n) {
  var пор = Прил_поручения_()[n] || {};
  if (me.role === 'worker' && пор.to === me.name) {
    Прил_поручениеОтметить_(n, 'Доставлено');
    Прил_поручениеОтметить_(n, 'Прочитано');
  }
}

/* ============================================================ уведомления
   Путь уведомления:
     1. действие в запросе кладёт его в __прил.очередь (Прил_пуш_,
        Прил_телеграм_, Прил_вОчередьДело_) — ответ телефону не ждёт
        Apple, Google и Телеграм;
     2. в конце запроса очередь пишется в свойства (APP_Q:…), в ответе
        flush: true;
     3. телефон тут же присылает a: 'flush' — рассылка идёт отдельным
        запросом, пока человек уже видит результат своего нажатия;
     4. не прислал (закрыл приложение, пропала сеть) — разошлёт триггер
        Триггер_приложение в течение пяти минут.
   Вне запроса приложения (триггеры планировщика, меню) — сразу. */
function Прил_кому_(me) { return me.role === 'owner' ? ПРИЛ_ВЛАДЕЛЕЦ : me.name; }

function Прил_пуш_(кому, p, настройка, всегда) {
  if (__прил && __прил.отложить) {
    __прил.очередь.push({ k: 'push', кому: кому, p: p, н: настройка || '', в: !!всегда });
    return -1;
  }
  return Прил_пушСейчас_(кому, p, настройка, всегда);
}
function Прил_вОчередьДело_(x) {
  if (__прил && __прил.отложить) { __прил.очередь.push(x); return; }
  Прил_выполнить_(x);
}

/* Каждое дело — своё свойство: предел свойства 9 КБ, а очередь из многих
   дел в одном свойстве его бы переросла. */
function Прил_вОчередь_(дела) {
  var m = {}, t = Date.now();
  дела.forEach(function (x, i) {
    x.at = t;
    m['APP_Q:' + t + ':' + i + ':' + Math.floor(Math.random() * 1e6)] = JSON.stringify(x);
  });
  props_().setProperties(m);
}

function Прил_разослать_() {
  var pr = props_();
  var взял = [];
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return 0;
  try {
    var св = pr.getProperties();
    Object.keys(св).sort().forEach(function (k) {
      if (k.indexOf('APP_Q:') !== 0) return;
      pr.deleteProperty(k);                    // забрали — второй рассыльщик его не увидит
      try { взял.push(JSON.parse(св[k])); } catch (e) {}
    });
  } finally { lock.releaseLock(); }
  var назад = [], послано = 0;
  взял.forEach(function (x) {
    try { var r = Прил_выполнить_(x); if (r > 0 || r === true) послано++; }
    catch (e) {
      Logger.log('уведомление не ушло: %s', e);
      x.попыток = (x.попыток || 0) + 1;
      if (x.попыток < 3) назад.push(x);
    }
  });
  if (назад.length) Прил_вОчередь_(назад);
  return послано;
}

function Прил_выполнить_(x) {
  if (x.k === 'push') return Прил_пушСейчас_(x.кому, x.p, x.н, x.в);
  if (x.k === 'tg') return Прил_телеграмСейчас_(x.text, x.kind);
  if (x.k === 'раб') { сказатьРабочему_(x.кому, x.text); return true; }
  if (x.k === 'задача') {
    /* Своя задача владельца: в Телеграм — как у планировщика, но без push
       самому себе о том, что он только что завёл. */
    if (Прил_настройкиВсе_().telegram === false) return false;
    __прилБезПуша = true;
    try { сказатьПроЗадачу_(x.t, x.шапка); } finally { __прилБезПуша = false; }
    return true;
  }
  return false;
}

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

function Прил_тихо_(s, d) {
  var h = Number(Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), 'H'));
  return s.quiet === true && (h >= 22 || h < 7);
}

/* Отправить push всем телефонам человека. настройка — ключ из «Уведомления»
   в приложении (выключено — не шлём). Тихие часы глушат всё, кроме проблем.
   Возвращает число телефонов, до которых дошло.

   У каждого уведомления свой номер (p.id). Телефон, получив его, отвечает
   a: 'ack' — и это настоящая «доставка», а не «Apple принял». Пока ответа
   нет, номер лежит в свойствах APP_ACK:…; контроль доставки смотрит туда. */
function Прил_пушСейчас_(кому, p, настройка, всегда) {
  var s = Прил_настройкиВсе_();
  if (!всегда) {
    if (настройка && s[настройка] === false) return 0;
    if (Прил_тихо_(s) && p.kind !== 'problem') return 0;
  }
  var rows = readTable_(ПРИЛ.ПУШ, COL_ППУШ);
  var мои = rows.filter(function (r) { return s_(r['Кто']) === кому; });
  if (!мои.length) return 0;
  p.id = p.id || (Прил_код_() + Прил_код_());
  var ok = 0, убрать = {}, ошибки = {};
  мои.forEach(function (r) {
    var res;
    try { res = ВебПуш_отправить_({ endpoint: s_(r['Адрес']), keys: JSON.parse(s_(r['Ключи'])) }, p); }
    catch (e) { res = 'сбой: ' + e; }
    if (res === 'ok') ok++;
    else if (res === 'gone') убрать[s_(r['Адрес'])] = 1;
    else ошибки[s_(r['Адрес'])] = res;
  });
  if (ok && p.tag !== 'test') {
    try {
      props_().setProperty('APP_ACK:' + p.id, JSON.stringify({ к: кому, t: s_(p.title).slice(0, 80), at: Date.now(), n: p.n || 0 }));
    } catch (e) {}
  }
  if (Object.keys(убрать).length || Object.keys(ошибки).length) {
    try {
      writeTable_(ПРИЛ.ПУШ, COL_ППУШ, rows.filter(function (r) { return !убрать[s_(r['Адрес'])]; })
        .map(function (r) { if (ошибки[s_(r['Адрес'])]) r['Ошибка'] = Прил_сейчас_() + ' ' + ошибки[s_(r['Адрес'])]; return r; }), 'подписки');
    } catch (e) {}
    /* Все телефоны человека отказались от подписки (приложение удалено или
       уведомления выключены в настройках) — сказать владельцу, иначе он
       будет думать, что поручения доходят. */
    if (!ok && Object.keys(убрать).length === мои.length) {
      Прил_тревога_(кому, (кому === ПРИЛ_ВЛАДЕЛЕЦ ? 'На вашем телефоне' : 'У ' + кому) +
        ' отключились уведомления приложения РЗДС. Откройте приложение → колокольчик → «Включить уведомления».');
    }
  }
  return ok;
}

/* Подтверждение от телефона: уведомление дошло. */
function Прил_получено_(id) {
  id = s_(id).replace(/[^A-Z0-9]/g, '').slice(0, 24);
  if (!id) return { ok: true };
  var pr = props_(), k = 'APP_ACK:' + id, v = pr.getProperty(k);
  if (!v) return { ok: true };
  pr.deleteProperty(k);
  var e = {};
  try { e = JSON.parse(v); } catch (x) {}
  if (e.к) pr.setProperty('APP_ACKSEEN:' + e.к, String(Date.now()));
  if (e.n && e.к && e.к !== ПРИЛ_ВЛАДЕЛЕЦ) {
    try { Прил_поручениеОтметить_(Number(e.n), 'Доставлено'); Прил_данныеСбросить_('з'); } catch (x) {}
  }
  return { ok: true };
}

/* Не подтвердил за 10 минут — владельцу в Телеграм. Молчим про телефоны,
   которые не подтверждали ни разу (стоит старая версия приложения, она
   подтверждать не умеет), и не чаще раза в три часа на человека. */
function Прил_контрольДоставки_(сейчас) {
  var t = (сейчас || new Date()).getTime();
  var pr = props_(), св = pr.getProperties();
  var по = {};
  Object.keys(св).forEach(function (k) {
    if (k.indexOf('APP_ACK:') !== 0) return;
    var e;
    try { e = JSON.parse(св[k]); } catch (x) { pr.deleteProperty(k); return; }
    var возраст = t - Number(e.at || 0);
    if (возраст < 10 * 60000) return;
    pr.deleteProperty(k);
    if (возраст > 6 * 3600000) return;
    if (!св['APP_ACKSEEN:' + e.к]) return;
    (по[e.к] = по[e.к] || []).push(e);
  });
  Object.keys(по).forEach(function (кто) {
    var сп = по[кто], посл = сп[сп.length - 1];
    Прил_тревога_(кто, (кто === ПРИЛ_ВЛАДЕЛЕЦ ? 'Уведомления приложения не доходят до вашего телефона' :
      кто + ' не получил уведомление приложения') +
      (сп.length > 1 ? ' (' + сп.length + ' шт.)' : '') + ': «' + посл.t + '», отправлено в ' + Прил_чч_(new Date(посл.at)) +
      '. Телефон без интернета, выключен или приложение удалено.' +
      (кто !== ПРИЛ_ВЛАДЕЛЕЦ && посл.n ? ' Поручение №' + посл.n + ' — лучше позвонить.' : ''));
  });
  return Object.keys(по).length;
}
function Прил_тревога_(кто, текст) {
  var pr = props_(), k = 'APP_ACKREP:' + кто;
  if (Number(pr.getProperty(k) || 0) > Date.now() - 3 * 3600000) return false;
  pr.setProperty(k, String(Date.now()));
  Прил_телеграмСейчас_(текст, 'warn', true);
  return true;
}

/* Всё, что планировщик и так сообщает владельцу в Телеграм через Уведомить_,
   дублируется push-уведомлением — Телеграм в России ненадёжен. Вызывается
   из самого Уведомить_ (одна строка там). Когда в Телеграм пишет само
   приложение, push оно уже отправило своё, с точной ссылкой, — второй не
   нужен: для этого флаг __прилБезПуша. */
var __прилБезПуша = false;
function Прил_телеграм_(text, kind) {
  if (__прил && __прил.отложить) { __прил.очередь.push({ k: 'tg', text: text, kind: kind }); return; }
  Прил_телеграмСейчас_(text, kind);
}
function Прил_телеграмСейчас_(text, kind, всегда) {
  if (!всегда && Прил_настройкиВсе_().telegram === false) return false;
  __прилБезПуша = true;
  try { Уведомить_(text, kind); } catch (e) { Logger.log('приложение → Телеграм: %s', e); }
  finally { __прилБезПуша = false; }
  return true;
}
function Прил_пушВладельцу_(text, kind) {
  Прил_данныеСбросить_();          // планировщик что-то сообщил — данные в кэше могли устареть
  if (__прилБезПуша) return;
  var t = s_(text);
  if (!t) return;
  var шапка = { ask: 'Вопрос', wait: 'Жду решения', done: 'Готово', warn: 'Внимание' }[s_(kind)] || 'План производства';
  var настройка = null, tag = 'note-' + s_(kind);
  /* Недельный отчёт планировщик шлёт в понедельник утром через Уведомить_;
     его можно выключить в приложении отдельно от остального. */
  if (s_(kind) === 'done' && /^Неделя /.test(t)) { шапка = 'Недельный отчёт'; настройка = 'weekly'; tag = 'weekly'; }
  Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: шапка, body: t.slice(0, 180), url: '#/today', tag: tag,
    kind: kind === 'warn' ? 'problem' : 'note' }, настройка);
}


/* ================================================================ ВОЛНА 2
   Фото, документы заказа у станка, чек-листы, сдвиг этапа из плана. */

/* ------------------------------------------------------------------ фото
   Снимки лежат в отдельной таблице «РЗДС — фото приложения» в Диске
   владельца, по строке на снимок: base64 кусками по 45 000 знаков (в
   клетку влезает 50 000). Почему не папкой с файлами: для папки скрипту
   нужно новое разрешение Google на Диск, а до того как владелец нажмёт
   «Разрешить», падают все запуски от его имени — бот, утренняя рассылка,
   часы приложения (решение 29.09, записано и в Archive.gs у apiDocAdd).
   Таблицу скрипт заводит сам, с разрешением, которое у него уже есть.

   Номер снимка — «строка-ключ»: строку находим сразу, а случайный ключ не
   даёт перебором достать чужие снимки. Отдаётся снимок только по входу. */
var ПРИЛ_ФОТО_КУСОК = 45000, ПРИЛ_ФОТО_МАКС = 2500000;
function Прил_фотоТаблица_() {
  var pr = props_(), id = pr.getProperty('APP_PHOTO_SS'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('РЗДС — фото приложения');
    var sh0 = ss.getSheets()[0];
    sh0.setName('Фото');
    sh0.getRange(1, 1, 1, 6).setValues([['Когда', 'Кто', 'К чему', 'Ключ', 'Тип', 'Данные (кусками вправо)']]).setFontWeight('bold');
    sh0.setFrozenRows(1);
    pr.setProperty('APP_PHOTO_SS', ss.getId());
  }
  return ss.getSheets()[0];
}
function Прил_фотоСохранить_(me, данные, кЧему) {
  var m = s_(данные).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw Прил_ошибка_('Фото не прочиталось — снимите ещё раз');
  if (m[2].length > ПРИЛ_ФОТО_МАКС) throw Прил_ошибка_('Фото слишком большое');
  var куски = [];
  for (var i = 0; i < m[2].length; i += ПРИЛ_ФОТО_КУСОК) куски.push(m[2].slice(i, i + ПРИЛ_ФОТО_КУСОК));
  var ключ = Прил_код_().toLowerCase();
  var sh = Прил_фотоТаблица_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Прил_ошибка_('Сервер занят, попробуйте ещё раз');
  try {
    sh.appendRow([Прил_сейчас_(), me.name, s_(кЧему), ключ, m[1]].concat(куски));
    return sh.getLastRow() + '-' + ключ;
  } finally { lock.releaseLock(); }
}
function Прил_фотоВзять_(id) {
  var m = s_(id).match(/^(\d+)-([a-z0-9]{6})$/);
  if (!m) throw Прил_ошибка_('Нет такого фото');
  var кэш = CacheService.getScriptCache(), k = 'app:photo:' + id;
  var был = Прил_кэшВзять_(кэш, k);
  if (был) return был;
  var sh = Прил_фотоТаблица_(), r = Number(m[1]);
  if (r < 2 || r > sh.getLastRow()) throw Прил_ошибка_('Нет такого фото');
  var v = sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0];
  if (s_(v[3]) !== m[2]) throw Прил_ошибка_('Нет такого фото');
  var данные = 'data:' + (s_(v[4]) || 'image/jpeg') + ';base64,' + v.slice(5).map(s_).join('');
  Прил_кэшПоложить_(кэш, k, данные, 21600);
  return данные;
}

/* ------------------------------------------------ документы заказа у станка
   Всё, что владелец завёл в реестре к заказу: ссылки на чертёж, УП, карту
   наладки (лист «Документы заказов») и паспорт (технология, заготовки,
   режимы, инструмент). Плюс прошлые заказы той же детали — там уже
   записано, как её делали. Рабочему — только по заказам его участка. */
function Прил_заказИнфо_(me, заказ, толькоПроверить) {
  if (!заказ) throw Прил_ошибка_('Не сказано, какой заказ');
  var часть = Прил_планЧасть_();
  var паспорта = паспорта_();
  var документы = документыЗаказов_();
  var имя = ((часть.orders.filter(function (o) { return o.code === заказ; })[0] || {}).name) ||
    ((паспорта[заказ] || {})['Наименование']) || '';
  var мои = Прил_мойУчасток_(me, часть);
  if (me.role === 'worker' && мои && мои.length) {
    var свои = {};
    часть.ops.forEach(function (o) { if (мои.indexOf(o.machine) >= 0 || мои.indexOf(o.worker) >= 0) свои[o.order] = 1; });
    /* Прошлый заказ той же детали рабочему тоже можно — ради него он и открывает. */
    var родня = Object.keys(свои).some(function (k) {
      var n = ((часть.orders.filter(function (o) { return o.code === k; })[0] || {}).name) || '';
      return n && n === ((паспорта[заказ] || {})['Наименование']);
    });
    if (!свои[заказ] && !родня) throw Прил_ошибка_('Этот заказ не на вашем участке');
  }
  if (толькоПроверить) return true;
  var пасп = паспорта[заказ] || null;
  var чисто = function (p) {
    if (!p) return null;
    var o = {};
    ['Наименование', 'Заказчик', 'Количество', 'Детали', 'Маршрут', 'Технология', 'Заготовки', 'Режимы резания',
      'Инструмент', 'Прочее', 'Выполнен'].forEach(function (k) { if (s_(p[k])) o[k] = s_(p[k]); });
    return Object.keys(o).length ? o : null;
  };
  var норм = function (t) { return s_(t).toLowerCase().replace(/\s+/g, ' '); };
  var раньше = [];
  if (имя) {
    Object.keys(паспорта).forEach(function (k) {
      if (k === заказ) return;
      var p = паспорта[k];
      if (норм(p['Наименование']) === норм(имя) || (s_(p['Детали']) && норм(p['Детали']) === норм((пасп || {})['Детали'])))
        раньше.push({ order: k, name: s_(p['Наименование']), finished: s_(p['Выполнен']), docs: (документы[k] || []).length });
    });
    раньше.sort(function (a, b) { return String(b.finished).localeCompare(String(a.finished)); });
  }
  return {
    order: заказ, name: имя, passport: чисто(пасп),
    docs: (документы[заказ] || []).filter(function (d) { return /^https?:\/\//i.test(d.url); })
      .map(function (d) { return { kind: d.kind, title: d.title, url: d.url }; }),
    earlier: раньше.slice(0, 5),
    chat: Прил_заказЧат_(заказ),
  };
}

/* ------------------------------------------------------------- чек-листы
   Лист «Чек-листы»: станок (или «все»), пункт, порядок. Перед «Начал»
   рабочий отмечает все пункты своего станка — без этого кнопка не нажмётся.
   Сколько пунктов отмечено, ложится в «Факт» вместе с «Начал». */
var ПРИЛ_ЧЕК = 'Чек-листы', COL_ПЧЕК = ['Станок', 'Пункт', 'Порядок'], ПРИЛ_ВСЕ = 'все';
ПРИЛ_ЛИСТЫ.чек = function () { return [ПРИЛ_ЧЕК, COL_ПЧЕК]; };
/* Чек-листы меняются редко, а нужны в каждом ответе — держим в кэше
   10 минут; правка из приложения кэш сбрасывает сразу. */
function Прил_чекЛисты_() {
  var c = CacheService.getScriptCache(), был = c.get('app:chk');
  if (был) { try { return JSON.parse(был); } catch (e) {} }
  var по = Прил_чекЛистыЧитать_();
  try { c.put('app:chk', JSON.stringify(по), 600); } catch (e) {}
  return по;
}
function Прил_чекЛистыЧитать_() {
  var по = {};
  Прил_лист_('чек').объекты().forEach(function (r) {
    var ст = s_(r['Станок']), п = s_(r['Пункт']);
    if (!ст || !п) return;
    if (ст.toLowerCase() === ПРИЛ_ВСЕ) ст = ПРИЛ_ВСЕ;
    (по[ст] = по[ст] || []).push({ text: п, order: n_(r['Порядок'], 0) });
  });
  Object.keys(по).forEach(function (k) {
    по[k] = по[k].sort(function (a, b) { return a.order - b.order; }).map(function (x) { return x.text; });
  });
  return по;
}
function Прил_чекЛистЗаписать_(станок, пункты) {
  if (!станок) throw Прил_ошибка_('Не сказано, для какого станка');
  if (станок.toLowerCase() === ПРИЛ_ВСЕ) станок = ПРИЛ_ВСЕ;
  var чисто = (пункты || []).map(s_).filter(String).slice(0, 30).map(function (t) { return t.slice(0, 200); });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята, попробуйте ещё раз');
  try {
    sheet_(ПРИЛ_ЧЕК, COL_ПЧЕК);
    var rows = readTable_(ПРИЛ_ЧЕК, COL_ПЧЕК).filter(function (r) {
      var ст = s_(r['Станок']);
      return (ст.toLowerCase() === ПРИЛ_ВСЕ ? ПРИЛ_ВСЕ : ст) !== станок;
    });
    чисто.forEach(function (t, i) { rows.push({ 'Станок': станок, 'Пункт': t, 'Порядок': i + 1 }); });
    writeTable_(ПРИЛ_ЧЕК, COL_ПЧЕК, rows, 'чек-листы');
    CacheService.getScriptCache().remove('app:chk');
    if (__прил && __прил.листы) delete __прил.листы.чек;
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------ сдвиг этапа из плана
   Владелец тянет этап пальцем по ленте. Сначала — предпросмотр: движок
   планировщика считает план с «начало не ранее …» у этого этапа и
   показывает, что ещё сдвинется и к какому сроку выйдет каждый заказ.
   Записывается только после «Сдвинуть» — тем же движком и под замком, как
   решение по ответу со смены. Ограничение то же, что ставит перетаскивание
   в самом планировщике (SNET): раньше, чем позволяют предыдущие этапы,
   этап не встанет — предпросмотр покажет, где он окажется на самом деле. */
function Прил_сдвиг_(код, начало, записать, кто) {
  if (!код) throw Прил_ошибка_('Не сказано, какой этап');
  var m = s_(начало).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!m) throw Прил_ошибка_('Не понял время начала');
  var было = {};
  Прил_планЧасть_().ops.forEach(function (o) { было[o.code] = o; });
  var lock = null;
  if (записать) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята другой записью, попробуйте ещё раз');
  }
  try {
    var plan = readPlan_();
    var op = plan.operations.filter(function (o) { return o.id === код; })[0];
    if (!op) throw Прил_ошибка_('Этапа ' + код + ' в плане больше нет');
    if (op.status === 'завершено') throw Прил_ошибка_('Этап уже сделан — двигать нечего');
    var прежде = { t: op.constraintType, d: op.constraintDate };
    op.constraintType = 'SNET';
    op.constraintDate = начало;
    var eng = new Engine(plan);
    eng.compute('strict');
    var сдвинуто = [], конецЗаказа = {};
    eng.ops.forEach(function (o) {
      if (o.kind === 'stop' || !o.es || !o.ef) return;
      if (!конецЗаказа[o.order] || o.ef > конецЗаказа[o.order]) конецЗаказа[o.order] = o.ef;
      var b = было[o.id];
      if (!b) return;
      var d0 = new Date(b.start).getTime(), d1 = o.es.getTime();
      if (Math.abs(d1 - d0) < 60000 && Math.abs(new Date(b.end).getTime() - o.ef.getTime()) < 60000) return;
      сдвинуто.push({ code: o.id, order: o.order, op: o.stage || o.description || o.id, res: o.machine || o.worker || '—',
        from: b.start, to: o.es.toISOString(), end: o.ef.toISOString(), me: o.id === код });
    });
    var сам = eng.ops.filter(function (o) { return o.id === код; })[0] || {};
    var заказы = [];
    var прежнийКонец = {};
    Object.keys(было).forEach(function (k) {
      var o = было[k];
      if (!прежнийКонец[o.order] || o.end > прежнийКонец[o.order]) прежнийКонец[o.order] = o.end;
    });
    var тронуто = {};
    сдвинуто.forEach(function (x) { тронуто[x.order] = 1; });
    Object.keys(тронуто).forEach(function (k) {
      var срок = eng.deadlines[k] ? new Date(eng.deadlines[k] + (String(eng.deadlines[k]).length <= 10 ? 'T23:59' : '')) : null;
      var конец = конецЗаказа[k];
      заказы.push({ code: k, was: прежнийКонец[k] || '', now: конец ? конец.toISOString() : '',
        due: eng.deadlines[k] || '', late: !!(срок && конец && конец > срок) });
    });
    var итог = { op: код, asked: начало, start: сам.es ? сам.es.toISOString() : '', end: сам.ef ? сам.ef.toISOString() : '',
      changed: сдвинуто.sort(function (a, b) { return a.to < b.to ? -1 : 1; }), orders: заказы, applied: false };
    if (!записать) return итог;
    var computed = computeServer_(plan);
    writePlan_(plan, computed.rows);
    props_().setProperty('PLAN_VERSION', String(planVersion_() + 1));
    props_().setProperty('PLAN_SAVED_AT', new Date().toISOString());
    try {
      appendRow_(SH.LOG, COL_LOG, { 'Время': Прил_сейчас_(), 'Автор': кто + ' (приложение)', 'Объект': код,
        'Причина': 'сдвиг этапа в приложении', 'Комментарий': 'начало не ранее ' + начало.replace('T', ' ') +
          (прежде.d ? ' (было ' + прежде.t + ' ' + прежде.d + ')' : ''),
        'Изменения': '', 'Перенесено операций': String(сдвинуто.length) });
    } catch (e) {}
    итог.applied = true;
    return итог;
  } finally { if (lock) lock.releaseLock(); }
}


/* ================================================================ ВОЛНА 3 */

/* --------------------------------------------- поля «Поручений» по номеру */
function Прил_поручЗаписать_(n, поля) {
  Прил_поручДоп_();
  var sh = sheet_(ПРИЛ.ПОРУЧ, COL_ППОР);
  var last = sh.getLastRow();
  var номера = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  var шапка = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h || '').trim(); });
  for (var i = 0; i < номера.length; i++) {
    if (n_(номера[i][0], 0) !== n) continue;
    Object.keys(поля).forEach(function (k) {
      var c = шапка.indexOf(k);
      if (c >= 0) sh.getRange(i + 2, c + 1).setValue(поля[k] === undefined || поля[k] === null ? '' : поля[k]);
    });
    return;
  }
  var row = { 'Номер задачи': n };
  Object.keys(поля).forEach(function (k) { row[k] = поля[k]; });
  appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, row);
}

/* --------------------------------------------------- чек-лист в поручении
   Пункты лежат в «Поручениях» одной клеткой: [{"t":"…","d":true,"by":"…","at":"…"}].
   Отмечать может исполнитель и владелец. */
function Прил_пунктыИз_(v) {
  var t = s_(v);
  if (!t) return [];
  try {
    var a = JSON.parse(t);
    return Array.isArray(a) ? a.filter(function (x) { return x && s_(x.t); }).map(function (x) {
      return { t: s_(x.t), d: !!x.d, by: s_(x.by), at: s_(x.at) };
    }) : [];
  } catch (e) { return []; }
}
function Прил_пунктыВ_(a) {
  a = (a || []).slice(0, 30).map(function (x) { return { t: s_(x.t).slice(0, 200), d: !!x.d, by: x.by || undefined, at: x.at || undefined }; });
  return a.length ? JSON.stringify(a) : '';
}
function Прил_пунктОтметить_(me, n, i, готово) {
  var пор = Прил_поручения_()[n];
  if (!пор) throw Прил_ошибка_('У задачи №' + n + ' нет пунктов');
  if (me.role === 'worker' && пор.to !== me.name) throw Прил_ошибка_('Это поручение не вам');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Прил_ошибка_('Таблица занята, попробуйте ещё раз');
  var все = false, текст = '';
  try {
    var пункты = Прил_пунктыИз_(Прил_поручЧитать_(n)['Пункты']);
    if (!(i >= 0 && i < пункты.length)) throw Прил_ошибка_('Такого пункта нет — обновите экран');
    пункты[i].d = готово;
    пункты[i].by = готово ? me.name : '';
    пункты[i].at = готово ? new Date().toISOString() : '';
    Прил_поручЗаписать_(n, { 'Пункты': Прил_пунктыВ_(пункты) });
    все = пункты.every(function (x) { return x.d; });
    текст = пункты[i].t;
  } finally { lock.releaseLock(); }
  if (me.role === 'worker' && все) {
    Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, { title: me.name + ': все пункты отмечены', body: 'Задача №' + n, url: '#/task/' + n, tag: 'task-' + n }, 'taskReply');
  }
}
function Прил_поручЧитать_(n) {
  var sh = sheet_(ПРИЛ.ПОРУЧ, COL_ППОР);
  var last = sh.getLastRow();
  if (last < 2) return {};
  var v = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var шапка = v[0].map(function (h) { return String(h || '').trim(); });
  for (var i = 1; i < v.length; i++) {
    if (n_(v[i][0], 0) !== n) continue;
    var o = {};
    шапка.forEach(function (h, j) { if (h) o[h] = v[i][j]; });
    return o;
  }
  return {};
}

/* --------------------------------------------------- повторяющиеся задачи
   Правило в «Поручениях», столбец «Повтор»:
     день — каждый день; будни — пн–пт; нед:1,4 — по понедельникам и
     четвергам (1 = пн … 7 = вс); мес:15 — 15-го числа каждого месяца.
   Выполнили такую задачу — сразу заводится следующая с тем же текстом,
   исполнителем, важностью, заказом и пунктами (неотмеченными), а правило
   переезжает к ней. Закрыли в планировщике или в Телеграме — следующую
   заведут часы приложения в течение пяти минут. */
function Прил_правило_(v) {
  var t = s_(v).toLowerCase();
  if (!t) return '';
  if (t === 'день' || t === 'будни') return t;
  var m = t.match(/^нед:([1-7](?:,[1-7])*)$/);
  if (m) return 'нед:' + m[1].split(',').filter(function (x, i, a) { return a.indexOf(x) === i; }).sort().join(',');
  m = t.match(/^мес:(\d{1,2})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) return 'мес:' + Number(m[1]);
  throw Прил_ошибка_('Не понял правило повтора: ' + v);
}
function Прил_подходит_(правило, d) {
  var wd = (d.getDay() + 6) % 7 + 1;          // 1 = пн … 7 = вс
  if (правило === 'день') return true;
  if (правило === 'будни') return wd <= 5;
  var m = правило.match(/^нед:(.+)$/);
  if (m) return m[1].split(',').indexOf(String(wd)) >= 0;
  m = правило.match(/^мес:(\d+)$/);
  if (m) {
    var хочу = Number(m[1]);
    var дней = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(хочу, дней);
  }
  return false;
}
/* Следующий подходящий день после прежнего срока, но не раньше завтра. */
function Прил_следующийДень_(правило, прежний) {
  var d = прежний ? new Date(прежний + 'T12:00:00') : new Date();
  if (isNaN(d)) d = new Date();
  var завтра = new Date(); завтра.setHours(12, 0, 0, 0); завтра.setDate(завтра.getDate() + 1);
  for (var i = 0; i < 800; i++) {
    d.setDate(d.getDate() + 1);
    if (d < завтра) continue;
    if (Прил_подходит_(правило, d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return '';
}
/* Под замком, который уже взят (list — только что записанный список задач). */
function Прил_повторитьБезЗамка_(n, list) {
  Прил_поручДоп_();
  var пор = Прил_поручЧитать_(n);
  var правило = s_(пор['Повтор']);
  if (!правило) return 0;
  var t = list.filter(function (x) { return x.n === n; })[0];
  if (!t) return 0;
  var день = Прил_следующийДень_(правило, t.due);
  if (!день) return 0;
  var новая = { n: следующийНомер_(list), state: ЗАДАЧА_ОТКР, opened: Прил_сейчас_(), closed: '', by: '',
    text: t.text, detail: t.detail, weight: t.weight, due: день };
  list.push(новая);
  записатьЗадачи_(list);
  var кому = s_(пор['Кому']);
  appendRow_(ПРИЛ.ПОРУЧ, COL_ППОР, { 'Номер задачи': новая.n, 'Кому': кому, 'Заказ': s_(пор['Заказ']),
    'Отправлено': кому ? Прил_сейчас_() : '', 'Срок время': Прил_времяКлетки_(пор['Срок время']), 'Повтор': правило,
    'Пункты': Прил_пунктыВ_(Прил_пунктыИз_(пор['Пункты']).map(function (x) { return { t: x.t, d: false }; })) });
  Прил_поручЗаписать_(n, { 'Повтор': '' });
  Прил_данныеСбросить_('з');
  if (кому) {
    Прил_пуш_(кому, { title: 'Повторное поручение', body: новая.text + ' · срок ' + день.split('-').reverse().slice(0, 2).join('.'),
      url: '#/task/' + новая.n, tag: 'task-' + новая.n, kind: 'task', n: новая.n }, 'workerNew');
  }
  return новая.n;
}
/* Часы приложения: задачи, закрытые не из приложения. */
function Прил_повторыДогнать_() {
  var по = Прил_поручения_();
  var ждут = Object.keys(по).filter(function (k) { return по[k].repeat; });
  if (!ждут.length) return 0;
  var закрытые = {};
  задачи_(true, true).forEach(function (t) { if (t.state === ЗАДАЧА_ЗАКР) закрытые[t.n] = 1; });
  var надо = ждут.filter(function (k) { return закрытые[k]; });
  if (!надо.length) return 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;
  var сделано = 0;
  try {
    надо.forEach(function (k) {
      var list = задачи_(true, true);
      if (Прил_повторитьБезЗамка_(Number(k), list)) сделано++;
    });
  } finally { lock.releaseLock(); }
  return сделано;
}

/* ------------------------------------------------------- переписка по заказу
   Отдельный лист, а не «Заметки заказов» планировщика: в заметках цены и
   договорённости с заказчиком, рабочим их видеть незачем. Здесь пишут все,
   кто работает над заказом, и владелец. */
var ПРИЛ_ЧАТ = 'Переписка по заказам', COL_ПЧАТ = ['Заказ', 'Время', 'Кто', 'Текст'];
function Прил_заказЧат_(заказ) {
  var sh = ss_().getSheetByName(ПРИЛ_ЧАТ);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  return v.filter(function (r) { return s_(r[0]) === заказ; }).slice(-80).map(function (r) {
    return { ts: Прил_iso_(датаКлетки_(r[1])), who: s_(r[2]), text: Прил_безФото_(r[3]), photos: Прил_фотоИз_(r[3]) };
  });
}
function Прил_заказСказать_(me, заказ, текст, фотоДанные) {
  Прил_заказИнфо_(me, заказ, true);            // та же проверка доступа, что у экрана заказа
  var фото = фотоДанные ? ' [фото: ' + Прил_фотоСохранить_(me, фотоДанные, 'заказ ' + заказ) + ']' : '';
  if (!s_(текст) && !фото) throw Прил_ошибка_('Пустое сообщение');
  var t = s_(текст) || 'фото';
  sheet_(ПРИЛ_ЧАТ, COL_ПЧАТ);
  appendRow_(ПРИЛ_ЧАТ, COL_ПЧАТ, { 'Заказ': заказ, 'Время': Прил_сейчас_(), 'Кто': me.name, 'Текст': t + фото });
  var p = { title: (me.role === 'owner' ? 'Мастер' : me.name) + ' · заказ ' + заказ, body: t + (фото ? ' · 📷 фото' : ''),
    url: '#/order/' + encodeURIComponent(заказ), tag: 'chat-' + заказ };
  if (me.role === 'worker') {
    Прил_пуш_(ПРИЛ_ВЛАДЕЛЕЦ, p, 'taskReply');
    Прил_телеграм_(me.name + ' по заказу ' + заказ + ':\n' + t, 'ask');
  } else {
    var часть = Прил_планЧасть_(), кому = {};
    часть.people.forEach(function (w) {
      if (часть.ops.some(function (o) { return o.order === заказ && (w.res.indexOf(o.machine) >= 0 || w.res.indexOf(o.worker) >= 0); })) кому[w.name] = 1;
    });
    Object.keys(кому).forEach(function (k) { Прил_пуш_(k, p, 'workerNew'); });
  }
  return Прил_заказЧат_(заказ);
}

/* ------------------------------------------------- прогрев веб-приложения
   Первый запрос к «остывшему» веб-приложению Google запускает его заново.
   Часы раз в пять минут стучатся к нему сами — телефону чаще достаётся
   уже запущенное. */
function Прил_прогретьВеб_() {
  try {
    UrlFetchApp.fetch(ПРИЛ_СЕРВЕР, { method: 'post', contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ a: 'ping' }), muteHttpExceptions: true, followRedirects: true });
  } catch (e) {}
}

/* ======================================================= часы приложения
   Триггер раз в пять минут: разослать то, что телефон не попросил
   разослать сам; проверить доставку; напомнить по срокам. Всё, что уже
   сказано, помечается в свойствах APP_REM:… — второй раз не говорится. */
function Триггер_приложение() {
  __прил = { отложить: false, очередь: [], листы: {} };
  var сейчас = new Date();
  [Прил_разослать_, Прил_контрольДоставки_, Прил_прогреть_, Прил_повторыДогнать_, Прил_напоминания_, Прил_прогретьВеб_].forEach(function (f) {
    try { f(сейчас); } catch (e) { Logger.log('часы приложения: %s', e && e.stack || e); }
  });
  __прил = null;
}

/* План в кэше держим тёплым: посчитанному больше 10 минут — считаем
   заново здесь, в часах, чтобы человеку не ждать расчёта. */
function Прил_прогреть_() {
  var c = CacheService.getScriptCache();
  var ч = Прил_кэшВзять_(c, Прил_ключПлана_());
  if (ч && ч.at && Date.now() - ч.at < ПРИЛ_СВЕЖЕСТЬ_МС) return false;
  Прил_планЧасть_(true);
  return true;
}

/* заново — снести и завести снова. Нужно, когда часы заведены из
   веб-приложения: такой триггер привязан к версии развёртывания и после
   выкладки продолжает крутить старый код. Заведённый из редактора
   (Пуск_B) работает на последнем сохранённом коде. */
function Прил_часыЗавести_(заново) {
  var было = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() !== 'Триггер_приложение') return;
    if (заново) ScriptApp.deleteTrigger(t); else было++;
  });
  if (!было) ScriptApp.newTrigger('Триггер_приложение').timeBased().everyMinutes(5).create();
  props_().setProperty('APP_CLOCK', '1');
  return было ? 'часы приложения уже идут' : 'часы приложения заведены';
}

function Прил_напоминания_(сейчас) {
  сейчас = сейчас || new Date();
  var t = сейчас.getTime(), tz = Session.getScriptTimeZone();
  var s = Прил_настройкиВсе_();
  var мин = Number(Utilities.formatDate(сейчас, tz, 'H')) * 60 + Number(Utilities.formatDate(сейчас, tz, 'mm'));
  var сегодня = Utilities.formatDate(сейчас, tz, 'yyyy-MM-dd');
  var pr = props_(), св = pr.getProperties();
  var было = function (k) { return !!св['APP_REM:' + k]; };
  var отметить = function (k) { св['APP_REM:' + k] = String(t); pr.setProperty('APP_REM:' + k, String(t)); };
  Object.keys(св).forEach(function (k) {
    if (k.indexOf('APP_REM:') === 0 && Number(св[k]) < t - 4 * 864e5) pr.deleteProperty(k);
  });
  var сказано = [];

  /* 1. Утренняя сводка владельцу, 07:45. */
  if (мин >= 7 * 60 + 45 && мин < 11 * 60 && !было('утро:' + сегодня)) {
    отметить('утро:' + сегодня);
    if (s.morning !== false) {
      var текст = Прил_сводка_(сейчас);
      if (текст) { Прил_пушСейчас_(ПРИЛ_ВЛАДЕЛЕЦ, { title: 'Доброе утро · что сегодня', body: текст, url: '#/today', tag: 'morning' }, 'morning'); сказано.push('утро'); }
    }
  }
  if (Прил_тихо_(s, сейчас)) return сказано;

  var задачи = Прил_задачиДляВида_();
  задачи.forEach(function (x) {
    if (x.state !== ЗАДАЧА_ОТКР) return;
    /* 2. За час до срока — исполнителю (себе, если задача своя). Срок без
       часа — это конец рабочего дня, 17:00. */
    if (x.due) {
      var срок = /T/.test(x.due) ? new Date(x.due) : Прил_дата_(x.due + 'T17:00');
      var до = срок ? срок.getTime() - t : -1;
      var k = 'срок:' + x.n + ':' + x.due;
      if (до > 0 && до <= 60 * 60000 && !было(k)) {
        отметить(k);
        Прил_пушСейчас_(x.to || ПРИЛ_ВЛАДЕЛЕЦ, { title: '⏰ Через ' + Math.max(1, Math.round(до / 60000)) + ' мин срок', body: x.text,
          url: '#/task/' + x.n, tag: 'task-' + x.n, kind: x.to ? 'task' : 'note' }, 'taskDue');
        сказано.push('срок №' + x.n);
      }
    }
    /* 3. Поручение не прочитано 30 минут — повторить исполнителю и сказать
       владельцу. Один раз на каждое отправление. */
    var d = x.delivery;
    if (x.to && d && d.sent && !d.read) {
      var прошло = t - new Date(d.sent).getTime();
      var k2 = 'непрочитано:' + x.n + ':' + d.sent;
      if (прошло >= 30 * 60000 && прошло < 24 * 3600000 && !было(k2)) {
        отметить(k2);
        if (s.taskUnread !== false) {
          Прил_пушСейчас_(x.to, { title: 'Напоминание: поручение от мастера', body: x.text, url: '#/task/' + x.n,
            tag: 'task-' + x.n, kind: 'task', n: x.n }, null);
          Прил_пушСейчас_(ПРИЛ_ВЛАДЕЛЕЦ, { title: x.to + ' не прочитал поручение', body: '№' + x.n + ' · ' + x.text +
            ' — отправлено в ' + Прил_чч_(new Date(d.sent)) + '. Напомнил ему ещё раз.', url: '#/task/' + x.n, tag: 'task-' + x.n }, 'taskUnread');
          сказано.push('непрочитано №' + x.n);
        }
      }
    }
  });

  /* 4. Конец смены — рабочим «отчитайтесь» за 5–15 минут до конца. */
  var концы = Прил_концыСмен_(сегодня, мин);
  Object.keys(концы).forEach(function (имя) {
    var до = концы[имя] - t;
    var k = 'смена:' + сегодня + ':' + имя;
    if (до > 0 && до <= 15 * 60000 && !было(k)) {
      отметить(k);
      Прил_пушСейчас_(имя, { title: 'Смена кончается в ' + Прил_чч_(new Date(концы[имя])), body: 'Отметьте, что сделано: «Закончил» или «Проблема» по своим операциям.',
        url: '#/shift', tag: 'report' }, 'workerReport');
      сказано.push('смена ' + имя);
    }
  });
  return сказано;
}

/* Концы смен считаются раз в день (движок плана дорогой) и лежат в
   свойствах до завтра. */
function Прил_концыСмен_(сегодня, мин) {
  var pr = props_();
  try {
    var x = JSON.parse(pr.getProperty('APP_ENDS') || '{}');
    if (x.д === сегодня) return x.e || {};
  } catch (e) {}
  if (мин < 5 * 60) return {};
  var eng = engineNow_(), e = {};
  readTable_(SH.WRK, COL_WRK).forEach(function (r) {
    if (!bool_(r['Активен'])) return;
    try {
      var конец = конецСмены_(eng, parseList_(r['Ресурсы']), сегодня);
      if (конец) e[s_(r['Имя'])] = конец.getTime();
    } catch (err) {}
  });
  pr.setProperty('APP_ENDS', JSON.stringify({ д: сегодня, e: e }));
  return e;
}

function Прил_сводка_(сейчас) {
  var v = Прил_вид_({ role: 'owner', name: 'Павел' });
  var с0 = new Date(сейчас); с0.setHours(0, 0, 0, 0);
  var с1 = new Date(с0.getTime() + 864e5);
  var опс = v.ops.filter(function (o) { return new Date(o.start) < с1 && new Date(o.end) >= с0 && o.status !== 'выполнено'; });
  var пробл = v.ops.filter(function (o) { return o.status === 'проблема'; }).length;
  var мои = v.tasks.filter(function (x) { return x.state === ЗАДАЧА_ОТКР && !x.to && x.due; });
  var срокДня = function (x) { return /T/.test(x.due) ? new Date(x.due) : Прил_дата_(x.due + 'T17:00'); };
  var наСегодня = мои.filter(function (x) { var d = срокДня(x); return d && d >= с0 && d < с1; }).length;
  var проср = мои.filter(function (x) { var d = срокДня(x); return d && d < с0; }).length;
  var части = [];
  if (опс.length) части.push('в цеху ' + опс.length + ' ' + Прил_мн_(опс.length, 'операция', 'операции', 'операций'));
  if (пробл) части.push('⚠️ проблем: ' + пробл);
  if (v.pending.length) части.push('ждут решения: ' + v.pending.length);
  if (наСегодня) части.push('ваших задач на сегодня: ' + наСегодня);
  if (проср) части.push('просрочено: ' + проср);
  if (!части.length) return '';
  var т = части.join(' · ');
  return т.charAt(0).toUpperCase() + т.slice(1) + '.';
}
function Прил_мн_(n, a, b, c) {
  var x = Math.abs(n) % 100, y = x % 10;
  return x > 10 && x < 20 ? c : y === 1 ? a : y >= 2 && y <= 4 ? b : c;
}

/* ----------------------------------------------- код владельцу с телефона */
/* Страница плана по адресу …/exec?appcode=1. Сюда ведёт кнопка «Получить
   код» на экране входа приложения: план открывается в Safari с входом через
   Google, владелец узнан по почте — и видит код крупно, с кнопкой
   «Скопировать». Из приложения Google Таблиц этого не сделать: на айфоне
   своих пунктов меню у таблицы нет. Остальным — отказ. */
function Прил_кодСтраница_(role) {
  var тело;
  if (!role || role.role !== 'owner') {
    тело = '<h1>Код выдаёт владелец</h1><p>Попросите код у мастера: в приложении — колокольчик → «Выдать вход».</p>';
  } else {
    var r = Прил_выдатьКод_('Павел', 'owner');
    тело = '<h1>Код входа в приложение</h1>' +
      '<div class="code" id="c">' + r.code + '</div>' +
      '<button onclick="navigator.clipboard.writeText(\'' + r.code + '\').then(function(){this.textContent=\'Скопировано ✓\'}.bind(this))">Скопировать код</button>' +
      '<p>Вернитесь в приложение <b>РЗДС</b> (иконка на экране «Домой») и введите код.</p>' +
      '<p class="m">Действует сутки, годится на три входа.</p>';
  }
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font:17px -apple-system,system-ui,sans-serif;background:#F4F1EA;color:#1B1F1C;margin:0;padding:32px 22px;text-align:center}' +
    'h1{font-size:22px;margin:0 0 20px}.code{font:700 44px ui-monospace,Menlo,monospace;letter-spacing:.2em;background:#fff;border:1px solid #E0DACD;border-radius:20px;padding:22px 8px;margin:0 0 16px;user-select:all;-webkit-user-select:all}' +
    'button{width:100%;height:56px;border:0;border-radius:16px;background:#1F6436;color:#fff;font:700 17px system-ui;margin-bottom:18px}.m{color:#5A5F58;font-size:15px}</style>' + тело)
    .setTitle('РЗДС — код входа')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* -------------------------------------------------------------- меню */
function Меню_вход_в_приложение() {
  своимиРуками_();
  var r = Прил_выдатьКод_('Павел', 'owner');
  var ui = SpreadsheetApp.getUi();
  ui.alert('Вход в приложение на телефон',
    'Код владельца: ' + r.code + '\n\nДействует сутки, годится на три входа (например, Safari и иконка).\n\n' +
    '1. Откройте на айфоне в Safari: ' + r.link + '\n' +
    '2. «Поделиться» → «На экран „Домой“».\n' +
    '3. Откройте РЗДС с иконки и введите код.\n\n' +
    'Рабочим коды выдаются из самого приложения: колокольчик → «Выдать вход».',
    ui.ButtonSet.OK);
}
function Пуск_A_вход_в_приложение() { своимиРуками_(); var r = Прил_выдатьКод_('Павел', 'owner'); Logger.log('Код: %s, адрес: %s', r.code, r.link); return r.code; }
function Пуск_B_часы_приложения() { своимиРуками_(); var m = Прил_часыЗавести_(true); Logger.log(m); return m; }

/* Замер: сколько стоит каждый шаг ответа приложения. Запускать из
   редактора; итог — в журнале выполнения. */
function Пуск_C_замер_приложения() {
  своимиРуками_();
  var т = [], t0 = Date.now(), всего = Date.now();
  var шаг = function (имя) { var t = Date.now(); т.push(имя + ': ' + (t - t0) + ' мс'); t0 = t; };
  __прил = { отложить: true, очередь: [], листы: {} };
  Прил_св_(); шаг('свойства скрипта');
  ss_(); шаг('открыть таблицу');
  var ф = Прил_лист_('факт'); шаг('лист «Факт», строк ' + ф.строки.length);
  var з = Прил_лист_('задачи'); шаг('лист «Задачи», строк ' + з.строки.length);
  var к = Прил_лист_('комм'); шаг('лист «Комментарии задач», строк ' + к.строки.length);
  var п = Прил_лист_('пор'); шаг('лист «Поручения», строк ' + п.строки.length);
  Прил_планЧасть_(); шаг('план (кэш или расчёт)');
  var v = Прил_вид_({ role: 'owner', name: 'Павел' }); шаг('сборка ответа');
  т.push('размер ответа: ' + Math.round(JSON.stringify(v).length / 1024) + ' КБ');
  т.push('всего: ' + (Date.now() - всего) + ' мс');
  __прил = { отложить: true, очередь: [], листы: {} };
  t0 = Date.now();
  Прил_вид_({ role: 'owner', name: 'Павел' }); шаг('повтор (таблица уже открыта, план в кэше)');
  __прил = null;
  Logger.log(т.join('\n'));
  return т.join('\n');
}
