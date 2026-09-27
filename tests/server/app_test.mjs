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
check("верный код даёт сессию владельца, код сгорает", () => {
  const code = j("Прил_выдатьКод_('Павел','owner')").code;
  const r = post({ a: "login", code: code.toLowerCase(), ua: "iPhone" });
  truthy(r.token && r.token.length >= 64, "нет сессии");
  eq(r.me.role, "owner", "роль");
  OWN = r.token;
  eq(post({ a: "login", code }).error, "Код не подошёл", "повторный вход тем же кодом");
  const row = j("readTable_('Входы приложения', COL_ПВХ)[1]");
  truthy(String(row['Сессия']).startsWith("h") && !String(row['Сессия']).includes(OWN), "в таблице лежит сама сессия");
  return "в таблице только отпечаток";
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
check("отметка рабочего будит владельца push-уведомлением", () => {
  pushes.length = 0;
  post({ a: "mark", s: WRK, op: WOP, what: "comment", text: "деталь на контроле" });
  truthy(pushes.some((p) => p.url.endsWith("/own")), "владельцу не ушло");
  eq(pushes[0].headers.Urgency, "normal", "срочность");
});
check("проблема — со срочностью high", () => {
  pushes.length = 0;
  post({ a: "mark", s: WRK, op: WOP, what: "problem", text: "нет заготовки" });
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
  truthy(/^\d{4}-\d{2}-\d{2}$/.test(t.due), "срок " + t.due);
});
check("поручение рабочему: push ушёл, «Доставлено» отмечено", () => {
  pushes.length = 0;
  const v = post({ a: "taskSave", s: OWN, task: { text: "Подготовить заготовки", to: "Слесарь", order: "", weight: "срочно" } });
  N = v.created;
  const t = v.tasks.find((x) => x.n === N);
  eq(t.to, "Слесарь", "кому");
  truthy(t.delivery.sent && t.delivery.delivered, "нет отметок доставки");
  truthy(pushes.some((p) => p.url.endsWith("/wrk2")), "рабочему не ушло");
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
  eq(t.weight, "потом", "важность"); eq(t.due, "2026-10-05", "срок"); eq(t.to, "Маляр", "кому");
  eq(post({ a: "load", s: WRK }).tasks.length, 0, "у прежнего исполнителя осталось");
});
check("задачи видны и в планировщике (тот же лист «Задачи»)", () => {
  const t = j("задачи_(false)");
  truthy(t.some((x) => x.text === "Подготовить заготовки"), "нет в листе");
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
check("перебор кодов упирается в предел", () => {
  state.cache.clear();
  let r; for (let i = 0; i < 25; i++) r = post({ a: "login", code: "QQQQQQ" });
  truthy(/Слишком много попыток/.test(r.error), r.error);
});

console.log(`\nИтого: ${ok} прошло, ${bad} упало`);
process.exit(bad ? 1 : 0);
