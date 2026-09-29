/* Сквозная проверка: приложение в настоящем Chromium ходит в серверный код
   (живой Код.gs + App.gs на поддельной таблице), как будет ходить в бою. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { makeEnv, loadServer } from "./gasmock.mjs";

const require = createRequire("/tmp/jt/");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "one");
const APP = "/home/claude/rzds-app";
const OUT = process.argv[2] || "/tmp/e2e";
fs.mkdirSync(OUT, { recursive: true });

/* ---- сервер Apps Script на заглушках (как в app_test.mjs) ---- */
const { ctx, state } = makeEnv({ dir: DIR, email: "hozyain@example.com" });
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
    if (fmt === "dd.MM.yyyy HH:mm" && (m = s.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}):(\d{2})$/))) return new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]);
    if (fmt === "yyyy-MM-dd HH:mm" && (m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/))) return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    throw new Error("parseDate " + s);
  },
});
const baseFmt = ctx.Utilities.formatDate;
ctx.Utilities.formatDate = (d, tz, p) => (p === "H" ? String(d.getHours()) : baseFmt(d, tz, p));
ctx.ContentService = { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) };
ctx.console = { log: () => {}, warn: () => {}, error: console.error, info: () => {} };
loadServer(ctx, DIR, ["Код.gs", "Пуск.gs", "WebPush.gs", "App.gs"]);
const run = (code) => vm.runInContext(code, ctx);
run("Настроить_()");
run("writeConfig_({'Дата отчёта': ''})");
const M = JSON.parse(run("JSON.stringify(readTable_(SH.OPS, COL_OPS).filter(function(r){return r['Оборудование']})[0]['Оборудование'])"));
run(`appendRow_(SH.WRK, COL_WRK, {'Имя':'Слесарь','Ресурсы':${JSON.stringify(M)},'Токен':'tok1','Активен':'да'})`);
const ownerCode = JSON.parse(run("JSON.stringify(Прил_выдатьКод_('Павел','owner'))")).code;

let calls = 0; const acts = {};
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/exec" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls++;
      try { const a = JSON.parse(body).a; acts[a] = (acts[a] || 0) + 1; } catch (e) {}
      ctx.__body = body;
      const out = run(`doPost({ parameter: { app: ${JSON.stringify(u.searchParams.get("app") || "")} }, postData: { contents: __body } })`);
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(out.t || out.getContent());
    });
    return;
  }
  /* само приложение, с подменённым адресом сервера */
  let f = path.join(APP, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(f);
  if (f.endsWith("config.js")) data = Buffer.from(String(data).replace(/server: '[^']*'/, "server: 'http://127.0.0.1:8777/exec?app=1'"));
  const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(f)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(data);
});
await new Promise((r) => srv.listen(8777, "127.0.0.1", r));

const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args.concat(["--no-sandbox"]), headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await sleep(500); await page.screenshot({ path: `${OUT}/${n}.png` }); };
const txt = () => page.evaluate(() => document.getElementById("app").innerText);
let ok = 0, bad = 0;
const expect = async (c, m) => { if (await c) { ok++; console.log("  ✓ " + m); } else { bad++; console.log("  ✗ " + m); } };
const go = async (h) => { await page.evaluate((h) => { location.hash = h; }, h); await sleep(700); };

await page.goto("http://127.0.0.1:8777/", { waitUntil: "networkidle0" });
await expect((await txt()).includes("Код входа"), "экран входа с полем кода");
await page.type("#code", ownerCode.toLowerCase());
await page.click('button[type="submit"]');
await sleep(1500);
await expect((await txt()).includes("Станки и участки"), "вошёл владельцем, главный экран");
await shot("e1-today");
await go("#/plan");
await expect((await page.$$(".lane .blk")).length > 0, "лента плана с настоящими операциями");
await shot("e2-plan");

/* рабочий: код из приложения владельца */
await go("#/notify");
await page.evaluate(() => [...document.querySelectorAll('[data-act="issue"]')].find((b) => b.dataset.name === "Слесарь").click());
await sleep(1200);
const wcode = await page.evaluate(() => (document.body.innerText.match(/Код для: Слесарь\s+([A-Z2-9]{6})/) || [])[1]);
await expect(!!wcode, "владелец выдал код рабочему из приложения: " + wcode);
await shot("e3-issue");

/* поручение рабочему */
await go("#/new");
await page.type('[data-bind="text"]', "Подготовить заготовки");
await page.evaluate(() => [...document.querySelectorAll('[data-act="set"][data-k="to"]')].find((b) => b.dataset.v === "Слесарь").click());
await sleep(300);
await page.click('[data-act="save"]');
await sleep(1500);
await expect((await txt()).includes("Подготовить заготовки"), "поручение появилось в списке");

/* вход рабочим на «другом телефоне» */
const browser2 = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args.concat(["--no-sandbox"]), headless: true, userDataDir: "/tmp/e2e-worker-profile" });
const wp = await browser2.newPage();
await wp.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
wp.on("pageerror", (e) => errs.push("worker pageerror: " + e.message));
await wp.goto("http://127.0.0.1:8777/", { waitUntil: "networkidle0" });
await wp.type("#code", wcode);
await wp.click('button[type="submit"]');
await sleep(1500);
const wt = () => wp.evaluate(() => document.getElementById("app").innerText);
await expect((await wt()).toLowerCase().includes("моя смена") && (await wt()).includes("Подготовить заготовки"), "рабочий видит смену и поручение");
await wp.screenshot({ path: `${OUT}/e4-worker.png` });
const hasStart = await wp.$('[data-act="mark"][data-w="start"]');
if (hasStart) { await hasStart.click(); await sleep(1500); }
/* фото к комментарию — настоящая камера заменена файлом */
fs.writeFileSync("/tmp/e2e-photo.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANGgEBi1OTgAAAAABJRU5ErkJggg==", "base64"));
await wp.click('[data-act="form"][data-f="comment"]'); await sleep(300);
const [chooser] = await Promise.all([wp.waitForFileChooser({ timeout: 5000 }), wp.click('[data-act="photo"]')]);
await chooser.accept(["/tmp/e2e-photo.png"]); await sleep(800);
await expect(!!(await wp.$(".ph img")), "фото прикрепилось к комментарию (ужато на телефоне)");
await wp.type("#shift-text", "вот так стоит деталь");
await wp.click('[data-act="send-form"]'); await sleep(1500);
await wp.click('[data-act="form"][data-f="pause"]'); await sleep(300);
await wp.click('[data-act="pause-why"]'); await wp.click('[data-act="send-pause"]'); await sleep(1500);
await expect((await wt()).includes("На паузе"), "пауза у рабочего");
await wp.click('[data-act="mark"][data-w="resume"]'); await sleep(1500);
const fin = await wp.$('[data-act="form"][data-f="finish"]');
await expect(!!fin, "после «Начал» есть «Закончил»");
if (fin) { await fin.click(); await sleep(300); await wp.type("#fin-qty", "7"); await wp.click('[data-act="send-finish"]'); await sleep(1500); }
await wp.screenshot({ path: `${OUT}/e5-worker-after.png` });

/* владелец видит ответы и решает */
await go("#/replies");
await page.evaluate(() => location.reload());
await sleep(2000);
await go("#/replies");
await expect((await page.$$('[data-act="decide"]')).length >= 2, "у владельца ответы со смены");
await sleep(1500);
await expect(!!(await page.$(".ph img")), "владелец видит фото со смены");
await expect((await txt()).includes("сделано 7 шт") && (await txt()).includes("Нет заготовки"), "у владельца «сделано 7 шт» и причина паузы");
await shot("e6-replies");
await page.click('[data-act="decide"][data-yes="1"]');
await sleep(2000);
await expect(!(await txt()).includes("Не удалось") && (await page.$$('[data-act="decide"]')).length >= 1, "решение принято сервером");
await shot("e7-after-decide");

/* «Исходящие»: без сети задача не пропадает и уходит сама */
await go("#/new");
await page.type('[data-bind="text"]', "Задача без связи");
await page.setOfflineMode(true);
await page.click('[data-act="save"]');
await sleep(1200);
await expect((await txt()).includes("Ждёт отправки: 1") && (await txt()).includes("ждёт отправки"), "без связи: задача на экране, «Ждёт отправки: 1»");
await shot("e8-outbox");
await page.click('[data-act="ob-open"]');
await sleep(400);
await expect((await txt()).includes("Задача: Задача без связи"), "в «Исходящих» видно, что ждёт");
await shot("e9-outbox-sheet");
await page.setOfflineMode(false);
await sleep(2500);
const tasksNow = JSON.parse(run("JSON.stringify(задачи_(false).filter(function(t){return t.text==='Задача без связи'}).length)"));
await expect(tasksNow === 1 && !(await txt()).includes("Ждёт отправки"), "сеть вернулась — ушла сама, ровно одна задача на сервере (" + tasksNow + ")");
await expect((acts.flush || 0) > 0, "телефон просит разослать уведомления отдельным запросом (flush: " + (acts.flush || 0) + ")");

/* план: перенос этапа с предпросмотром */
await go("#/plan");
const blk = await page.$('.blk[data-drag]');
if (blk) {
  await blk.click(); await sleep(400);
  await page.click('[data-act="mv-open"]'); await sleep(400);
  const dd = await page.$$('#mvcal [data-act="cal-day"]:not([disabled])'); await dd[3].click(); await sleep(200);
  await page.click('[data-act="mv-preview"]'); await sleep(2500);
  await expect((await txt()).includes("Встанет:"), "предпросмотр переноса с сервера");
  await shot("e11-move-preview");
  const v0 = Number(run("planVersion_()"));
  await page.click('[data-act="mv-apply"]'); await sleep(2500);
  await expect(Number(run("planVersion_()")) === v0 + 1, "перенос записан в план");
} else await expect(false, "в плане нет этапа, который можно двигать");

/* «Мои входы» */
await go("#/sessions");
await sleep(1200);
await expect((await txt()).toLowerCase().includes("этот телефон") && (await txt()).toLowerCase().includes("слесарь"), "«Входы в приложение»: свой телефон и рабочий");
await shot("e10-sessions");

console.log(`\nзапросов к серверу: ${calls} — ${JSON.stringify(acts)}`);
console.log(errs.length ? "ошибки на странице:\n" + errs.join("\n") : "ошибок на странице нет");
console.log(`Итого: ${ok} прошло, ${bad} упало`);
await browser.close(); await browser2.close(); srv.close();
process.exit(bad || errs.length ? 1 : 0);
