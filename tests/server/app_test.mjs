/* Серверная часть приложения на копии живого кода — до боевого проекта. */
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { makeEnv, loadServer } from "./gasmock.mjs";

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "one");
const { ctx, state } = makeEnv({ dir: DIR, email: "hozyain@example.com" });

/* Недостающее в заглушках: криптография, разбор дат, ответы JSON. */
const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => b & 255));
const bytesOf = (v) => (typeof v === "string" ? Buffer.from(v, "utf8") : unsigned(v));
Object.assign(ctx.Utilities, {
  DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
  computeDigest: (_a, v) => signed(crypto.createHash("sha256").update(bytesOf(v)).digest()),
  computeHmacSha256Signature: (v, k) => signed(crypto.createHmac("sha256", bytesOf(k)).update(bytesOf(v)).digest()),
  newBlob: (s) => ({ getBytes: () => signed(Buffer.from(s, "utf8")) }),
  base64EncodeWebSafe: (a) => (typeof a === "string" ? Buffer.from(a, "utf8") : unsigned(a)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
  base64Decode: (s) => signed(Buffer.from(s, "base64")),
  parseDate: (s, _tz, fmt) => {
    let m;
    if (fmt === "dd.MM.yyyy HH:mm" && (m = s.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}):(\d{2})$/)))
      return new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]);
    if (fmt === "yyyy-MM-dd HH:mm" && (m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/)))
      return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    throw new Error("parseDate: " + s + " / " + fmt);
  },
});
const baseFmt = ctx.Utilities.formatDate;
ctx.Utilities.formatDate = (d, tz, p) => (p === "H" ? String(d.getHours()) : baseFmt(d, tz, p));
ctx.ContentService = {
  MimeType: { JSON: "json" },
  createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent: () => t }),
};
const pushes = [];
let pushStatus = 201;
const origFetch = ctx.UrlFetchApp.fetch;
ctx.UrlFetchApp.fetch = (url, params) => {
  if (/push\.example/.test(url)) {
    pushes.push({ url, headers: params.headers, len: params.payload.length });
    return { getResponseCode: () => pushStatus, getContentText: () => "" };
  }
  return origFetch(url, params);
};

ctx.console = { log: () => {}, warn: () => {}, error: console.error, info: () => {} };
loadServer(ctx, DIR, ["Код.gs", "Пуск.gs", "WebPush.gs", "App.gs"]);
const run = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(run(`JSON.stringify(${code})`));
const post = (body, app = "1") => {
  ctx.__body = JSON.stringify(body);
  const out = run(`doPost({ parameter: { app: ${JSON.stringify(app)} }, postData: { contents: __body } })`);
  return JSON.parse(out.getContent ? out.getContent() : out.t);
};

let ok = 0, bad = 0;
const check = (name, fn) => {
  try { const r = fn(); console.log(`  ✓ ${name}${r ? " — " + r : ""}`); ok++; }
  catch (e) { console.log(`  ✗ ${name} — ${e.message}`); bad++; }
};
const eq = (a, b, what) => { if (String(a) !== String(b)) throw new Error(`${what}: ${a} вместо ${b}`); };
const truthy = (a, what) => { if (!a) throw new Error(what); };

run("Настроить_()");
run("writeConfig_({'Дата отчёта': ''})");   // план считается от сегодняшнего дня
const ops = j("readTable_(SH.OPS, COL_OPS).map(function(r){return {id:r['Код'], m:r['Оборудование']}})");
const M = ops.find((o) => o.m).m;
run(`appendRow_(SH.WRK, COL_WRK, {'Имя':'Слесарь','Ресурсы':${JSON.stringify(M)},'Токен':'tok1','Активен':'да'})`);
run(`appendRow_(SH.WRK, COL_WRK, {'Имя':'Маляр','Ресурсы':'покраска','Токен':'tok2','Активен':'да'})`);

console.log(`\nДемо-план: ${ops.length} операций, рабочий «Слесарь» на ${M}`);
let OWN, WRK;

console.log("\n1. Вход");
check("меню таблицы выдаёт код владельцу", () => {
  run("Меню_вход_в_приложение()");
  const a = state.alerts.pop();
  truthy(/Код владельца: [A-Z2-9]{6}/.test(a.text), "в окне нет кода");
  return a.text.match(/Код владельца: (\w+)/)[1];
});
check("в меню появился пункт", () => {
  run("Меню_открытие && Меню_открытие()");
  const m = state.menus.pop();
  truthy(m.items.some((i) => i.fn === "Меню_вход_в_приложение"), "пункта нет");
});
check("неверный код не пускает", () => { const r = post({ a: "login", code: "ZZZZZZ" }); eq(r.error, "Код не подошёл", "ответ"); });
check("верный код даёт сессию владельца", () => {
  const code = j("Прил_выдатьКод_('Павел','owner')").code;
  const r = post({ a: "login", code: code.toLowerCase(), ua: "iPhone Safari" });
  truthy(r.token && r.token.length >= 64, "нет сессии");
  eq(r.me.role, "owner", "роль");
  OWN = r.token;
  const row = j("readTable_('Входы приложения', COL_ПВХ)[1]");
  truthy(String(row['Сессия']).startsWith("h") && !String(row['Сессия']).includes(OWN), "в таблице лежит сама сессия");
  /* Safari → иконка «Домой»: тот же код второй и третий раз, каждый вход — своя строка */
  const r2 = post({ a: "login", code, ua: "iPhone иконка" });
  truthy(r2.token && r2.token !== OWN, "второй вход тем же кодом не прошёл: " + r2.error);
  const r3 = post({ a: "login", code, ua: "второй телефон" });
  truthy(r3.token, "третий вход не прошёл: " + r3.error);
  eq(post({ a: "load", s: OWN }).me.name, "Павел", "первая сессия жива после второго входа");
  eq(post({ a: "login", code }).error, "Код не подошёл", "четвёртый вход тем же кодом");
  const rows = j("readTable_('Входы приложения', COL_ПВХ).filter(function(r){return r['Имя']==='Павел' && r['Сессия']})");
  truthy(rows.length >= 3, "строк со входами " + rows.length);
  return "код годится на 3 входа, у каждого своя строка";
});
check("код владельца с телефона: страница плана ?appcode=1", () => {
  const html = run("Прил_кодСтраница_({role:'owner'}).getContent()");
  const code = (html.match(/id="c">([A-Z2-9]{6})</) || [])[1];
  truthy(code, "на странице нет кода");
  truthy(post({ a: "login", code }).token, "код со страницы не пускает");
  truthy(!run("Прил_кодСтраница_({role:'viewer'}).getContent()").includes('id="c"'), "не владельцу показали код");
  const link = post({ a: "ownerLink" });
  truthy(/\?appcode=1$/.test(link.url), "ссылка на страницу кода: " + link.url);
});
check("без сессии — отказ с кодом auth", () => { const r = post({ a: "load", s: "чужая" }); eq(r.code, "auth", "код"); });
check("просроченный код не пускает", () => {
  const code = j("Прил_выдатьКод_('Павел','owner')").code;
  run(`(function(){var sh=sheet_('Входы приложения',COL_ПВХ);var v=sh.getRange(2,1,sh.getLastRow()-1,COL_ПВХ.length).getValues();
    v.forEach(function(r,i){ if(r[2]===${JSON.stringify(code)}) sh.getRange(i+2,4).setValue('01.01.2020 00:00'); });})()`);
  eq(post({ a: "login", code }).error, "Код просрочен — попросите новый", "ответ");
});
check("код рабочему выдаёт владелец из приложения", () => {
  const r = post({ a: "issueCode", s: OWN, name: "Слесарь" });
  truthy(/^[A-Z2-9]{6}$/.test(r.code), "код " + r.code);
  const w = post({ a: "login", code: r.code });
  eq(w.me.role, "worker", "роль"); eq(w.me.name, "Слесарь", "имя");
  WRK = w.token;
});
check("рабочему не выдать код незнакомцу", () => eq(post({ a: "issueCode", s: OWN, name: "Кто-то" }).error, "В листе «Рабочие» нет «Кто-то»", "ответ"));
check("рабочий не может выдавать коды", () => eq(post({ a: "issueCode", s: WRK, name: "Маляр" }).error, "Это может только владелец", "ответ"));

console.log("\n2. Данные");
let V;
check("владелец видит план, станки, людей, задачи", () => {
  V = post({ a: "load", s: OWN });
  truthy(!V.error, V.error);
  truthy(V.ops.length > 0 && V.resources.length > 0, "пусто");
  truthy(V.people.some((p) => p.name === "Слесарь"), "нет рабочего");
  truthy(V.ops.every((o) => o.start && o.end && !isNaN(new Date(o.start))), "кривые даты");
  return `операций ${V.ops.length}, станков ${V.resources.length}, статусы: ${[...new Set(V.ops.map((o) => o.status))].join(", ")}`;
});
let WOP;
check("рабочий видит только свои операции", () => {
  const w = post({ a: "load", s: WRK });
  truthy(!w.error, w.error);
  truthy(w.ops.length && w.ops.every((o) => o.res === M), "чужие операции: " + w.ops.map((o) => o.res).join(","));
  truthy(!w.pending && !w.people, "рабочему видны ответы или люди");
  WOP = w.ops[0].code;
  return `${w.ops.length} на ${M}`;
});

console.log("\n3. Отметки со смены и решения");
check("«Начал» и «Закончил» ложатся в «Факт» ждущими", () => {
  post({ a: "mark", s: WRK, op: WOP, what: "start" });
  post({ a: "mark", s: WRK, op: WOP, what: "start" });   // повторное нажатие не плодит строк
  post({ a: "mark", s: WRK, op: WOP, what: "finish" });
  const p = j("pendingFacts_()");
  eq(p.length, 2, "ждут");
  const v = post({ a: "load", s: OWN });
  eq(v.pending.map((x) => x.kind).join(","), "done,start", "виды (новые сверху)");
  eq(v.ops.find((o) => o.code === WOP).status, "ждёт решения", "статус операции");
});
check("«Есть проблема» — владельцу, и в Телеграм", () => {
  const was = state.fetches.filter((f) => f.method === "sendMessage").length;
  post({ a: "mark", s: WRK, op: WOP, what: "problem", text: "сломалась фреза" });
  const v = post({ a: "load", s: OWN });
  const p = v.pending.find((x) => x.kind === "problem");
  eq(p.text, "сломалась фреза", "текст");
  return `в Телеграм ушло сообщений: ${state.fetches.filter((f) => f.method === "sendMessage").length - was} (токен бота в заглушке не задан — это нормально)`;
});
check("принять проблему → операция «проблема» в плане, версия плана +1", () => {
  const ver = run("planVersion_()");
  const v0 = post({ a: "load", s: OWN });
  const p = v0.pending.find((x) => x.kind === "problem");
  const v = post({ a: "decide", s: OWN, id: p.id, yes: true });
  truthy(!v.error, v.error);
  const o = v.ops.find((x) => x.code === WOP);
  eq(o.status, "проблема", "статус"); eq(o.problem, "сломалась фреза", "текст проблемы");
  eq(run("planVersion_()"), ver + 1, "версия");
  truthy(!v.pending.some((x) => x.id === p.id), "ответ не ушёл из ждущих");
  truthy(v.decided.some((x) => x.id === p.id && x.result === "принято"), "нет в разобранных");
});
check("повторное решение по тому же ответу — отказ", () => {
  const d = post({ a: "load", s: OWN }).decided[0];
  eq(post({ a: "decide", s: OWN, id: d.id, yes: true }).error, "По этому ответу уже решено", "ответ");
});
check("отклонить «Начал» и вернуть отказ обратно", () => {
  const v0 = post({ a: "load", s: OWN });
  const p = v0.pending.find((x) => x.kind === "start");
  let v = post({ a: "decide", s: OWN, id: p.id, yes: false });
  truthy(v.decided.some((x) => x.id === p.id && x.result === "не принято"), "не отклонено");
  v = post({ a: "undecide", s: OWN, id: p.id });
  truthy(v.pending.some((x) => x.id === p.id), "не вернулось");
});
check("отменить принятое нельзя", () => {
  const d = post({ a: "load", s: OWN }).decided.find((x) => x.result === "принято");
  truthy(/в планировщике/.test(post({ a: "undecide", s: OWN, id: d.id }).error), "отменилось");
});
check("принять «Закончил» → операция выполнена", () => {
  const p = post({ a: "load", s: OWN }).pending.find((x) => x.kind === "done");
  const v = post({ a: "decide", s: OWN, id: p.id, yes: true });
  truthy(!v.error, v.error);
  eq(run(`readPlan_().operations.filter(function(o){return o.id===${JSON.stringify(WOP)}})[0].status`), "завершено", "статус в плане");
});
check("рабочий не может решать", () => {
  const p = post({ a: "load", s: OWN }).pending[0];
  eq(post({ a: "decide", s: WRK, id: p.id, yes: true }).error, "Это может только владелец", "ответ");
});

check("поздно принятое «Начал» не откатывает готовую операцию", () => {
  const p = post({ a: "load", s: OWN }).pending.find((x) => x.kind === "start");
  truthy(p, "нет ждущего «Начал»");
  const v = post({ a: "decide", s: OWN, id: p.id, yes: true });
  truthy(!v.error, v.error);
  eq(run(`readPlan_().operations.filter(function(o){return o.id===${JSON.stringify(WOP)}})[0].status`), "завершено", "статус");
});

console.log("\n4. Push-уведомления");
const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
const sub = (tag) => ({ endpoint: "https://push.example/" + tag, keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } });
check("ключ VAPID отдаётся приложению", () => { const r = post({ a: "pushKey", s: OWN }); eq(r.key.length, 87, "длина ключа"); });
check("подписки владельца и рабочего записаны", () => {
  post({ a: "pushSubscribe", s: OWN, sub: sub("own"), ua: "iPhone" });
  post({ a: "pushSubscribe", s: WRK, sub: sub("wrk"), ua: "Android" });
  post({ a: "pushSubscribe", s: WRK, sub: sub("wrk"), ua: "Android" });   // повтор не удваивает
  eq(j("readTable_('Push-подписки', COL_ППУШ).length"), 2, "подписок");
});
check("пробное уведомление уходит с подписью VAPID и шифрованием", () => {
  pushes.length = 0;
  const r = post({ a: "pushTest", s: OWN });
  eq(r.sent, 1, "отправлено");
  const h = pushes[0].headers;
  truthy(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/.test(h.Authorization), "заголовок VAPID: " + h.Authorization);
  eq(h["Content-Encoding"], "aes128gcm", "шифрование");
  return `тело ${pushes[0].len} байт`;
});
check("отметка рабочего будит владельца push — отдельным запросом flush, ответ его не ждёт", () => {
  post({ a: "flush", s: WRK });            // очередь от отметок раздела 3
  pushes.length = 0;
  const v = post({ a: "mark", s: WRK, op: WOP, what: "comment", text: "деталь на контроле" });
  eq(pushes.length, 0, "push ушёл прямо в ответе на нажатие");
  truthy(v.flush, "в ответе нет просьбы разослать");
  truthy(post({ a: "flush", s: WRK }).sent >= 1, "не разослано");
  truthy(pushes.some((p) => p.url.endsWith("/own")), "владельцу не ушло");
  eq(pushes[0].headers.Urgency, "normal", "срочность");
});
check("проблема — со срочностью high", () => {
  pushes.length = 0;
  post({ a: "mark", s: WRK, op: WOP, what: "problem", text: "нет заготовки" });
  post({ a: "flush", s: WRK });
  eq(pushes[0].headers.Urgency, "high", "срочность");
});
check("Уведомить_ (всё, что планировщик пишет владельцу) дублируется push", () => {
  pushes.length = 0;
  run("Уведомить_('Готова утренняя рассылка', 'done')");
  eq(pushes.length, 1, "push");
});
check("выключенная настройка глушит push", () => {
  post({ a: "settingsSave", s: OWN, settings: { answers: false } });
  pushes.length = 0;
  post({ a: "mark", s: WRK, op: WOP, what: "comment", text: "ещё слово" });
  post({ a: "flush", s: WRK });
  eq(pushes.length, 0, "ушло, хотя выключено");
  post({ a: "settingsSave", s: OWN, settings: { answers: true } });
});
check("мёртвая подписка (410) убирается сама", () => {
  pushStatus = 410;
  post({ a: "pushTest", s: WRK }).error;
  pushStatus = 201;
  eq(j("readTable_('Push-подписки', COL_ППУШ).filter(function(r){return r['Кто']==='Слесарь'}).length"), 0, "осталась");
  post({ a: "pushSubscribe", s: WRK, sub: sub("wrk2"), ua: "Android" });
});

console.log("\n5. Задачи себе и поручения");
let N;
check("задача себе", () => {
  const v = post({ a: "taskSave", s: OWN, task: { text: "Заказать электроды", weight: "важно", due: new Date(Date.now() + 864e5).toISOString() } });
  truthy(!v.error, v.error);
  const t = v.tasks.find((x) => x.n === v.created);
  eq(t.to, "", "кому"); eq(t.weight, "важно", "важность");
  truthy(/T/.test(t.due) && Math.abs(new Date(t.due) - Date.now() - 864e5) < 61000, "срок со временем " + t.due);
  const v2 = post({ a: "taskSave", s: OWN, task: { text: "Без часа", due: "2026-12-01" } });
  eq(v2.tasks.find((x) => x.n === v2.created).due, "2026-12-01", "срок днём");
  post({ a: "taskUpdate", s: OWN, n: v2.created, state: "убрана" });
});
check("поручение рабочему: push ушёл, «Доставлено» отмечено", () => {
  pushes.length = 0;
  post({ a: "flush", s: OWN });
  run("Object.keys(props_().getProperties()).forEach(function(k){ if (k.indexOf('APP_ACK:')===0) props_().deleteProperty(k); })");
  pushes.length = 0;
  const v = post({ a: "taskSave", s: OWN, task: { text: "Подготовить заготовки", to: "Слесарь", order: "", weight: "срочно" } });
  N = v.created;
  let t = v.tasks.find((x) => x.n === N);
  eq(t.to, "Слесарь", "кому");
  truthy(t.delivery.sent && !t.delivery.delivered, "«Доставлено» раньше, чем телефон подтвердил");
  post({ a: "flush", s: OWN });
  truthy(pushes.some((p) => p.url.endsWith("/wrk2")), "рабочему не ушло");
  const ack = Object.keys(j("props_().getProperties()")).filter((k) => k.startsWith("APP_ACK:"));
  eq(ack.length, 1, "ждущих подтверждения");
  eq(post({ a: "ack", id: ack[0].slice(8) }).ok, true, "подтверждение без сессии");
  t = post({ a: "load", s: OWN }).tasks.find((x) => x.n === N);
  truthy(t.delivery.delivered, "после подтверждения нет «Доставлено»");
  return "«Доставлено» — по подтверждению телефона";
});
check("рабочий видит только свои поручения и читает", () => {
  let w = post({ a: "load", s: WRK });
  eq(w.tasks.length, 1, "поручений");
  post({ a: "taskRead", s: WRK, n: N });
  post({ a: "taskUpdate", s: WRK, n: N, taken: true });
  const t = post({ a: "load", s: OWN }).tasks.find((x) => x.n === N);
  truthy(t.delivery.read && t.delivery.taken, "нет «Прочитал» / «Взял»");
});
check("переписка в обе стороны", () => {
  post({ a: "taskComment", s: WRK, n: N, text: "Нет прутка Ø60" });
  post({ a: "taskComment", s: OWN, n: N, text: "Бери Ø65" });
  const t = post({ a: "load", s: OWN }).tasks.find((x) => x.n === N);
  eq(t.comments.map((c) => c.who).join(","), "Слесарь,Павел", "кто писал");
  truthy(t.comments.every((c) => !isNaN(new Date(c.ts))), "время комментариев не читается");
});
check("чужое поручение рабочему недоступно", () => {
  const v = post({ a: "taskSave", s: OWN, task: { text: "Покрасить", to: "Маляр" } });
  eq(post({ a: "taskComment", s: WRK, n: v.created, text: "я" }).error, "Это поручение не вам", "ответ");
  eq(post({ a: "taskUpdate", s: WRK, n: v.created, state: "закрыта" }).error, "Это поручение не вам", "ответ");
});
check("рабочий закрыл — владелец видит «закрыта» и кем", () => {
  post({ a: "taskUpdate", s: WRK, n: N, state: "закрыта" });
  const t = post({ a: "load", s: OWN }).tasks.find((x) => x.n === N);
  eq(t.state, "закрыта", "состояние"); eq(t.by, "Слесарь", "кто");
});
check("перенос, важность, передача другому", () => {
  post({ a: "taskUpdate", s: OWN, n: N, state: "открыта" });
  post({ a: "taskUpdate", s: OWN, n: N, weight: "потом", due: "2026-10-05T12:00:00.000Z" });
  post({ a: "taskUpdate", s: OWN, n: N, to: "Маляр" });
  const t = post({ a: "load", s: OWN }).tasks.find((x) => x.n === N);
  eq(t.weight, "потом", "важность"); truthy(String(t.due).startsWith("2026-10-05T"), "срок " + t.due); eq(t.to, "Маляр", "кому");
  eq(post({ a: "load", s: WRK }).tasks.length, 0, "у прежнего исполнителя осталось");
});
check("задачи видны и в планировщике (тот же лист «Задачи»)", () => {
  const t = j("задачи_(false)");
  truthy(t.some((x) => x.text === "Подготовить заготовки"), "нет в листе");
});

console.log("\n6. Скорость: план из кэша");
check("второй запрос не пересчитывает план", () => {
  run("var __счётДвижка = 0; var __старыйДвижок = engineNow_; engineNow_ = function(){ __счётДвижка++; return __старыйДвижок(); };");
  run("CacheService.getScriptCache().remove && Object.keys({}).length");
  const v = j("planVersion_()");
  run(`props_().setProperty('PLAN_VERSION', String(${v} + 1000))`);   // новая версия — чистый кэш
  post({ a: "load", s: OWN }); post({ a: "load", s: OWN }); post({ a: "load", s: WRK });
  eq(j("__счётДвижка"), 1, "пересчётов на три запроса");
  run(`props_().setProperty('PLAN_VERSION', String(${v} + 1001))`);    // план сохранили — пересчёт
  post({ a: "load", s: OWN });
  eq(j("__счётДвижка"), 2, "после смены версии");
  run("engineNow_ = __старыйДвижок;");
  return "3 запроса — 1 расчёт; новая версия плана — новый расчёт";
});
check("рабочий по-прежнему видит только свои станки", () => {
  const w = post({ a: "load", s: WRK });
  truthy(Array.isArray(w.ops), "нет операций");
  truthy(!w.people && !w.pending, "рабочему ушли чужие данные");
});

console.log("\n6. Прочее");
check("старый путь бота не сломан: POST без app и без секрета — «ok»", () => {
  ctx.__body = "{}";
  const out = run(`doPost({ parameter: {}, postData: { contents: __body } })`);
  eq(out.getContent(), "ok", "ответ");
});
check("выключенный вход перестаёт работать", () => {
  run(`(function(){var sh=sheet_('Входы приложения',COL_ПВХ);var v=sh.getRange(2,1,sh.getLastRow()-1,COL_ПВХ.length).getValues();
    v.forEach(function(r,i){ if(r[0]==='Слесарь') sh.getRange(i+2,9).setValue('нет'); });})()`);
  state.cache.clear();
  eq(post({ a: "load", s: WRK }).code, "auth", "код");
});
check("перебор кодов упирается в предел — у каждого телефона свой", () => {
  state.cache.clear();
  let r; for (let i = 0; i < 12; i++) r = post({ a: "login", code: "QQQQQQ", dev: "dev-A" });
  truthy(/С этого телефона слишком много попыток/.test(r.error), r.error);
  eq(post({ a: "login", code: "QQQQQQ", dev: "dev-B" }).error, "Код не подошёл", "другой телефон заперт чужими ошибками");
  for (let i = 0; i < 100; i++) r = post({ a: "login", code: "QQQQQQ", dev: "d" + i });
  truthy(/Слишком много попыток входа/.test(r.error), "общий предел: " + r.error);
  state.cache.clear();
});

console.log("\n7. Волна 1: надёжность");
const topics = () => pushes.map((p) => (p.url.split("/").pop()) + ":" + (p.headers.Topic || ""));
WRK = post({ a: "login", code: post({ a: "issueCode", s: OWN, name: "Слесарь" }).code, dev: "wrk-new" }).token;   // прежний вход выключен в разделе 6
const ackKeys = () => Object.keys(j("props_().getProperties()")).filter((k) => k.startsWith("APP_ACK:"));
check("повтор того же нажатия (cid) не делает дело дважды", () => {
  const n0 = post({ a: "load", s: OWN }).tasks.length;
  const a = post({ a: "taskSave", s: OWN, cid: "abc-1", task: { text: "Один раз" } });
  const b = post({ a: "taskSave", s: OWN, cid: "abc-1", task: { text: "Один раз" } });
  eq(b.tasks.length, n0 + 1, "задач");
  eq(b.created, a.created, "номер в повторе"); truthy(b.repeat, "повтор не узнан");
  post({ a: "taskUpdate", s: OWN, n: a.created, state: "убрана" });
});
check("рабочий не отмечает чужую операцию", () => {
  const all = post({ a: "load", s: OWN }).ops;
  const чужая = all.find((o) => o.res !== M);
  truthy(чужая, "нет чужой операции в демо-плане");
  const r = post({ a: "mark", s: WRK, op: чужая.code, what: "start" });
  truthy(/не на вашем участке/.test(r.error), "отметил чужую: " + чужая.code + " " + чужая.res + " / " + JSON.stringify(r.error || "без ошибки") + " / люди " + JSON.stringify(post({ a: "load", s: OWN }).people));
  truthy(/нет в плане/.test(post({ a: "mark", s: WRK, op: "НЕТ-ТАКОЙ", what: "start" }).error), "отметил несуществующую");
});
let WRK2;
check("«Мои входы»: владелец видит все, рабочий — свои, отключение работает сразу", () => {
  WRK2 = post({ a: "login", code: post({ a: "issueCode", s: OWN, name: "Маляр" }).code, ua: "Mozilla (Linux; Android 14) Chrome" }).token;
  const own = post({ a: "sessions", s: OWN }).sessions;
  truthy(own.some((x) => x.me && x.role === "owner"), "владелец не видит свой телефон");
  truthy(own.some((x) => x.name === "Маляр"), "владелец не видит рабочего");
  const w = post({ a: "sessions", s: WRK2 }).sessions;
  truthy(w.length && w.every((x) => x.name === "Маляр"), "рабочий видит чужие входы");
  const mine = w.find((x) => x.me);
  truthy(/не ваш вход/.test(post({ a: "revoke", s: WRK2, row: own.find((x) => x.me).row }).error), "рабочий отключил вход владельца");
  post({ a: "revoke", s: OWN, row: mine.row });
  eq(post({ a: "load", s: WRK2 }).code, "auth", "отключённый вход работает");
});
check("вход, которым не пользовались 90 дней, выключается сам", () => {
  const code = post({ a: "issueCode", s: OWN, name: "Маляр" }).code;
  const t = post({ a: "login", code }).token;
  state.cache.clear();
  run(`(function(){var sh=sheet_('Входы приложения',COL_ПВХ);var last=sh.getLastRow();sh.getRange(last,8).setValue('01.01.2026 10:00');})()`);
  const r = post({ a: "load", s: t });
  eq(r.code, "auth", "пустил"); truthy(/90 дней/.test(r.error), r.error);
});
check("часы приложения заводятся сами при входе владельца", () => {
  run("props_().deleteProperty('APP_CLOCK')");
  post({ a: "load", s: OWN });
  truthy(state.triggers.some((t) => t.getHandlerFunction() === "Триггер_приложение" && t.minutes === 5), "триггера нет");
  post({ a: "load", s: OWN });
  eq(state.triggers.filter((t) => t.getHandlerFunction() === "Триггер_приложение").length, 1, "триггеров");
});
check("телефон не попросил разослать — разошлёт триггер", () => {
  post({ a: "flush", s: OWN }); pushes.length = 0;
  post({ a: "mark", s: WRK, op: WOP, what: "comment", text: "без flush" });
  eq(pushes.length, 0, "ушло сразу");
  run("Триггер_приложение()");
  truthy(pushes.some((p) => p.url.endsWith("/own")), "триггер не разослал: " + state.logs.slice(-5).join(" | "));
  eq(Object.keys(j("props_().getProperties()")).filter((k) => k.startsWith("APP_Q:")).length, 0, "очередь не пуста");
});
check("контроль доставки: телефон молчит 10 минут — владельцу в Телеграм, раз в три часа", () => {
  run("var __ув = []; var __старУв = Уведомить_; Уведомить_ = function (t, k) { __ув.push(t); return 'ok'; };");
  run("Object.keys(props_().getProperties()).forEach(function(k){ if (k.indexOf('APP_ACK')===0) props_().deleteProperty(k); })");
  run(`props_().setProperty('APP_ACK:OLD1', JSON.stringify({ к: 'Слесарь', t: 'Поручение от мастера', at: Date.now() - 15 * 60000, n: ${N} }))`);
  run("Прил_контрольДоставки_(new Date())");
  eq(j("__ув").length, 0, "тревога про телефон, который ни разу не подтверждал (старая версия)");
  run("props_().setProperty('APP_ACKSEEN:Слесарь', String(Date.now() - 864e5))");
  run(`props_().setProperty('APP_ACK:OLD2', JSON.stringify({ к: 'Слесарь', t: 'Поручение от мастера', at: Date.now() - 15 * 60000, n: ${N} }))`);
  run(`props_().setProperty('APP_ACK:NEW1', JSON.stringify({ к: 'Слесарь', t: 'свежее', at: Date.now() - 60000 }))`);
  run("Прил_контрольДоставки_(new Date())");
  const ув = j("__ув");
  eq(ув.length, 1, "сообщений"); truthy(/Слесарь не получил/.test(ув[0]) && /позвонить/.test(ув[0]), ув[0]);
  truthy(ackKeys().includes("APP_ACK:NEW1"), "свежее ожидание снято раньше времени");
  run(`props_().setProperty('APP_ACK:OLD3', JSON.stringify({ к: 'Слесарь', t: 'ещё', at: Date.now() - 15 * 60000 }))`);
  run("Прил_контрольДоставки_(new Date())");
  eq(j("__ув").length, 1, "повторная тревога раньше трёх часов");
  return ув[0].slice(0, 90) + "…";
});
check("напоминания: за час до срока, непрочитанное поручение, утро, конец смены — по разу", () => {
  post({ a: "flush", s: OWN });
  run("Object.keys(props_().getProperties()).forEach(function(k){ if (k.indexOf('APP_REM:')===0) props_().deleteProperty(k); })");
  const soon = new Date(Date.now() + 40 * 60000).toISOString();
  const d = post({ a: "taskSave", s: OWN, task: { text: "Скоро срок", to: "Слесарь", due: soon } }).created;
  post({ a: "flush", s: OWN });
  /* отправлено 40 минут назад и не прочитано */
  run(`(function(){var sh=sheet_('Поручения',COL_ППОР);var v=sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
    v.forEach(function(r,i){ if(Number(r[0])===${d}) sh.getRange(i+2,4).setValue(Utilities.formatDate(new Date(Date.now()-40*60000),'','dd.MM.yyyy HH:mm')); });})()`);
  run(`props_().setProperty('APP_ENDS', JSON.stringify({ д: Utilities.formatDate(new Date(), '', 'yyyy-MM-dd'), e: { 'Слесарь': Date.now() + 8 * 60000 } }))`);
  pushes.length = 0;
  const said = j("Прил_напоминания_(new Date())");
  const tp = topics();
  truthy(tp.includes("wrk2:task-" + d), "исполнителю ни срок, ни повтор: " + tp.join(" "));
  truthy(tp.includes("own:task-" + d), "владельцу про непрочитанное: " + tp.join(" "));
  truthy(tp.includes("wrk2:report"), "рабочему «отчитаться»: " + tp.join(" "));
  truthy(said.some((x) => /^срок/.test(x)) && said.some((x) => /^непрочитано/.test(x)), said.join(", "));
  pushes.length = 0;
  run("Прил_напоминания_(new Date())");
  eq(pushes.length, 0, "повтор тех же напоминаний");
  /* утро: 07:50 */
  const m = new Date(); m.setHours(7, 50, 0, 0);
  run("props_().deleteProperty('APP_ENDS')");
  pushes.length = 0;
  run(`Прил_напоминания_(new Date(${m.getTime()}))`);
  truthy(topics().includes("own:morning"), "утренней сводки нет: " + topics().join(" "));
  return said.join(", ");
});
check("тихие часы глушат напоминания, но не проблему", () => {
  post({ a: "settingsSave", s: OWN, settings: { quiet: true } });
  const night = new Date(); night.setHours(23, 30, 0, 0);
  run("Object.keys(props_().getProperties()).forEach(function(k){ if (k.indexOf('APP_REM:')===0) props_().deleteProperty(k); })");
  run(`var __д = Date; Прил_тихо_ = (function (old) { return function (s, d) { return old(s, d || new Date(${night.getTime()})); }; })(Прил_тихо_);`);
  pushes.length = 0;
  run(`Прил_напоминания_(new Date(${night.getTime()}))`);
  eq(pushes.length, 0, "ночью ушло");
  post({ a: "mark", s: WRK, op: WOP, what: "problem", text: "ночная авария" });
  post({ a: "flush", s: WRK });
  truthy(topics().some((t) => t.startsWith("own:fact-")), "проблема ночью не дошла");
  post({ a: "settingsSave", s: OWN, settings: { quiet: false } });
});
check("недельный отчёт — push «Недельный отчёт», выключается отдельно", () => {
  pushes.length = 0;
  run("__старУв('Неделя 22.09–28.09\\n\\nСделано: 5', 'done')");
  truthy(topics().includes("own:weekly"), "нет push: " + topics().join(" "));
  post({ a: "settingsSave", s: OWN, settings: { weekly: false } });
  pushes.length = 0;
  run("__старУв('Неделя 22.09–28.09\\n\\nСделано: 5', 'done')");
  eq(pushes.length, 0, "ушло, хотя выключено");
  post({ a: "settingsSave", s: OWN, settings: { weekly: true } });
});
check("часы держат план в кэше тёплым: свежий не пересчитывают, старый — да", () => {
  run("__счётДвижка = 0; engineNow_ = function(){ __счётДвижка++; return __старыйДвижок(); };");
  post({ a: "load", s: OWN });
  eq(j("Прил_прогреть_()"), false, "свежий план пересчитан");
  const k = j("(function(){ __прил = {листы:{}}; var k = Прил_ключПлана_(); __прил = null; return k; })()");
  run(`(function(){ var c = CacheService.getScriptCache(); var x = Прил_кэшВзять_(c, ${JSON.stringify(k)}); x.at = Date.now() - 11*60000; Прил_кэшПоложить_(c, ${JSON.stringify(k)}, x, 1800); })()`);
  const n0 = j("__счётДвижка");
  eq(j("Прил_прогреть_()"), true, "старый не пересчитан");
  eq(j("__счётДвижка"), n0 + 1, "расчётов");
  run("engineNow_ = __старыйДвижок;");
});
check("ответ приложения сообщает время сервера", () => { truthy(post({ a: "load", s: OWN }).ms >= 0, "нет ms"); });

console.log("\n8. Волна 2: у станка и в плане");
const PNG = "data:image/png;base64," + Buffer.from("фото-проверка-".repeat(8000)).toString("base64");
let WOP2;
check("пауза с причиной → «пауза», продолжил → снова «в работе»", () => {
  const w = post({ a: "load", s: WRK });
  WOP2 = (w.ops.find((o) => o.status === "план" && o.code !== WOP) || w.ops[0]).code;
  post({ a: "mark", s: WRK, op: WOP2, what: "start" });
  let v = post({ a: "mark", s: WRK, op: WOP2, what: "pause", text: "нет заготовки" });
  let o = v.ops.find((x) => x.code === WOP2);
  eq(o.status, "пауза", "статус"); eq(o.pause, "нет заготовки", "причина"); truthy(o.pauseAt, "нет времени паузы");
  truthy(/нужна причина|Выберите причину/.test(post({ a: "mark", s: WRK, op: WOP2, what: "pause" }).error), "пауза без причины прошла");
  v = post({ a: "mark", s: WRK, op: WOP2, what: "resume" });
  eq(v.ops.find((x) => x.code === WOP2).status, "в работе", "после «Продолжил»");
  const kinds = post({ a: "load", s: OWN }).pending.filter((r) => r.opCode === WOP2).map((r) => r.kind).join(",");
  truthy(/pause/.test(kinds) && /resume/.test(kinds), "у владельца: " + kinds);
});
check("владелец принял паузу → в плане «приостановлено», принял «продолжил» → «в работе»", () => {
  const pend = post({ a: "load", s: OWN }).pending.filter((r) => r.opCode === WOP2);
  const st = pend.find((r) => r.kind === "start");
  if (st) post({ a: "decide", s: OWN, id: st.id, yes: true });
  post({ a: "decide", s: OWN, id: pend.find((r) => r.kind === "pause").id, yes: true });
  eq(run(`readPlan_().operations.filter(function(o){return o.id===${JSON.stringify(WOP2)}})[0].status`), "приостановлено", "после паузы");
  post({ a: "decide", s: OWN, id: pend.find((r) => r.kind === "resume").id, yes: true });
  eq(run(`readPlan_().operations.filter(function(o){return o.id===${JSON.stringify(WOP2)}})[0].status`), "в работе", "после «продолжил»");
});
check("«Закончил» со сколько сделано и браком", () => {
  post({ a: "mark", s: WRK, op: WOP2, what: "finish", qty: 48, scrap: 2 });
  const r = post({ a: "load", s: OWN }).pending.find((x) => x.opCode === WOP2 && x.kind === "done");
  truthy(r, "нет «Закончил» у владельца");
  eq(r.text, "сделано 48 шт, брак 2 шт", "текст");
  post({ a: "decide", s: OWN, id: r.id, yes: true });
  const op = j(`readPlan_().operations.filter(function(o){return o.id===${JSON.stringify(WOP2)}})[0]`);
  eq(op.status, "завершено", "статус"); truthy(/сделано 48 шт/.test(op.note) && /брак 2 шт/.test(op.note), "примечание: " + op.note);
});
let PH;
check("фото к проблеме: хранится в отдельной таблице, видно владельцу, отдаётся по входу", () => {
  const v = post({ a: "mark", s: WRK, op: WOP, what: "problem", text: "трещина", photo: PNG });
  truthy(!v.error, v.error);
  const r = post({ a: "load", s: OWN }).pending.find((x) => x.kind === "problem" && x.text === "трещина");
  truthy(r && r.photos.length === 1, "нет фото в ответе");
  PH = r.photos[0];
  const got = post({ a: "photo", s: OWN, id: PH });
  eq(got.data === PNG, true, "фото пришло не тем");
  truthy(post({ a: "photo", s: OWN, id: PH.replace(/-\w+$/, "-zzzzzz") }).error, "чужой ключ подошёл");
  truthy(post({ a: "photo", id: PH }).code === "auth", "без входа отдали");
  truthy(j("props_().getProperty('APP_PHOTO_SS')") !== j("props_().getProperty('SHEET_ID')"), "фото в таблице плана");
  const note = j("pendingFacts_().filter(function(f){return /трещина/.test(f.note)})[0].note");
  truthy(/\[фото: \d+-\w{6}\]/.test(note), "в «Факте» нет метки фото: " + note);
});
check("фото к комментарию поручения и к новой задаче", () => {
  const v = post({ a: "taskComment", s: WRK, n: N2(), text: "", photo: PNG });
  truthy(!v.error, v.error);
  const c = post({ a: "load", s: OWN }).tasks.find((t) => t.n === N2()).comments.pop();
  eq(c.photos.length, 1, "фото в комментарии"); eq(c.text, "фото", "текст");
  const t = post({ a: "taskSave", s: OWN, task: { text: "Посмотри фото", to: "Слесарь", photo: PNG } });
  eq(t.tasks.find((x) => x.n === t.created).comments[0].photos.length, 1, "фото в новой задаче");
});
function N2() { return post({ a: "load", s: WRK }).tasks[0].n; }
check("чертёж и паспорт заказа у станка + прошлые заказы той же детали; чужой заказ — нет", () => {
  const w = post({ a: "load", s: WRK });
  const ord = w.ops[0].order;
  const name = (w.orders.find((o) => o.code === ord) || {}).name || "";
  run(`appendRow_(SH.DOCS, COL_DOCS, {'Заказ':${JSON.stringify(ord)},'Вид':'КД','Название':'Чертёж','Ссылка':'https://drive.google.com/x','Добавлен':'','Кто':''})`);
  run(`записатьВПаспорт_(${JSON.stringify(ord)}, {'Режимы резания':'S 1200, F 300', 'Наименование': ${JSON.stringify(name)}})`);
  run(`записатьВПаспорт_('СТАРЫЙ-1', {'Наименование': ${JSON.stringify(name)}, 'Выполнен': '2026-08-01', 'Инструмент': 'фреза Ø12'})`);
  const r = post({ a: "orderInfo", s: WRK, order: ord });
  truthy(!r.error, r.error);
  eq(r.docs[0].url, "https://drive.google.com/x", "документ");
  eq(r.passport["Режимы резания"], "S 1200, F 300", "режимы");
  truthy(r.earlier.some((e) => e.order === "СТАРЫЙ-1"), "нет прошлого заказа");
  eq(post({ a: "orderInfo", s: WRK, order: "СТАРЫЙ-1" }).passport["Инструмент"], "фреза Ø12", "прошлый заказ рабочему");
  const чужой = post({ a: "load", s: OWN }).ops.find((o) => o.res !== M && !w.ops.some((x) => x.order === o.order));
  if (чужой) truthy(/не на вашем участке/.test(post({ a: "orderInfo", s: WRK, order: чужой.order }).error), "чужой заказ открылся");
});
check("чек-лист станка: владелец правит, рабочий видит, «Начал» пишет, сколько отмечено", () => {
  const v = post({ a: "checklistSave", s: OWN, res: M, items: ["Проверить вылет фрезы", "Зажим детали", "  "] });
  truthy(!v.error, v.error);
  eq(v.checklists[M].length, 2, "пунктов у владельца");
  post({ a: "checklistSave", s: OWN, res: "ВСЕ", items: ["Очки надеты"] });
  const w = post({ a: "load", s: WRK });
  eq(w.checklists[M].length, 2, "пунктов у рабочего"); eq(w.checklists["все"][0], "Очки надеты", "общий пункт");
  truthy(post({ a: "checklistSave", s: WRK, res: M, items: [] }).error, "рабочий правит чек-лист");
  const op = w.ops.find((o) => o.status === "план" && o.code !== WOP && o.code !== WOP2);
  if (op) {
    post({ a: "mark", s: WRK, op: op.code, what: "start", check: "3/3" });
    truthy(post({ a: "load", s: OWN }).pending.some((r) => r.opCode === op.code && /чек-лист 3\/3/.test(r.text)), "нет чек-листа в отметке");
  }
});
check("сдвиг этапа: предпросмотр ничего не пишет, «Сдвинуть» пишет и сдвигает следующие", () => {
  const v0 = post({ a: "load", s: OWN });
  const op = v0.ops.filter((o) => o.status === "план").sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  const d = new Date(new Date(op.start).getTime() + 2 * 864e5); d.setHours(10, 0, 0, 0);
  const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + "T10:00";
  const ver = run("planVersion_()");
  const p = post({ a: "movePreview", s: OWN, op: op.code, start: iso });
  truthy(!p.error, p.error);
  truthy(p.changed.some((x) => x.me), "сам этап не в списке сдвинутых");
  truthy(new Date(p.start) >= d, "встал раньше, чем просили: " + p.start);
  eq(run("planVersion_()"), ver, "предпросмотр записал план");
  truthy(post({ a: "movePreview", s: WRK, op: op.code, start: iso }).error, "рабочий двигает план");
  const a = post({ a: "moveApply", s: OWN, op: op.code, start: iso, cid: "mv-1" });
  truthy(!a.error, a.error);
  eq(run("planVersion_()"), ver + 1, "версия");
  eq(a.ops.find((x) => x.code === op.code).start, p.start, "в ответе этап не там");
  eq(j(`readPlan_().operations.filter(function(o){return o.id===${JSON.stringify(op.code)}})[0].constraintType`), "SNET", "ограничение");
  return `сдвинулось этапов: ${p.changed.length}, заказов затронуто: ${p.orders.length}`;
});

console.log(`\nИтого: ${ok} прошло, ${bad} упало`);
process.exit(bad ? 1 : 0);
