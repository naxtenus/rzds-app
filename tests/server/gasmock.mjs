/* =========================================================================
   Заглушки сервисов Google Apps Script — чтобы обкатать серверный код здесь,
   а не впервые в бою. Реализовано ровно то, чем пользуется планировщик:
   таблицы, свойства скрипта, календарь, исходящие запросы, блокировки,
   триггеры и форматирование дат.

   Это не эмулятор Apps Script и не заменяет проверку в настоящем проекте:
   он ловит механические ошибки (опечатки, неверные диапазоны, потерянные
   поля при круге план → таблица → план), но не расхождения в поведении
   самих сервисов Google.
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const pad = (n, w = 2) => String(n).padStart(w, "0");

/* ------------------------------------------------------------- Таблицы */
class FakeRange {
  constructor(sheet, r, c, nr, nc) {
    Object.assign(this, { sheet, r, c, nr, nc });
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet._get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.sheet._get(this.r, this.c); }
  setValues(v) {
    if (v.length !== this.nr) throw new Error(`setValues: строк ${v.length}, ожидалось ${this.nr}`);
    v.forEach((row, i) => {
      if (row.length !== this.nc)
        throw new Error(`setValues: колонок ${row.length}, ожидалось ${this.nc}`);
      row.forEach((x, j) => this.sheet._set(this.r + i, this.c + j, x));
    });
    return this;
  }
  setValue(x) { this.sheet._set(this.r, this.c, x); return this; }
  clearContent() {
    for (let i = 0; i < this.nr; i++)
      for (let j = 0; j < this.nc; j++) this.sheet._set(this.r + i, this.c + j, "");
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
  /* Проверка данных и подсказки: запоминаем, чтобы сценарии могли убедиться,
     что списки и заметки вообще поставлены, а не молча пропущены. */
  setDataValidation(rule) {
    for (let i = 0; i < this.nr; i++)
      for (let j = 0; j < this.nc; j++)
        this.sheet.validation.set(this.r + i + ":" + (this.c + j), rule);
    return this;
  }
  getDataValidation() { return this.sheet.validation.get(this.r + ":" + this.c) || null; }
  setNote(text) { this.sheet.notes.set(this.r + ":" + this.c, text); return this; }
  getNote() { return this.sheet.notes.get(this.r + ":" + this.c) || ""; }
}
class FakeSheet {
  constructor(name) {
    this.name = name; this.cells = new Map(); this.maxCols = 40;
    this.validation = new Map(); this.notes = new Map();
  }
  _k(r, c) { return r + ":" + c; }
  _get(r, c) { const v = this.cells.get(this._k(r, c)); return v === undefined ? "" : v; }
  _set(r, c, v) {
    if (v === "" || v === null || v === undefined) this.cells.delete(this._k(r, c));
    else this.cells.set(this._k(r, c), v);
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    let m = 0;
    for (const k of this.cells.keys()) m = Math.max(m, +k.split(":")[0]);
    return m;
  }
  getLastColumn() {
    let m = 0;
    for (const k of this.cells.keys()) m = Math.max(m, +k.split(":")[1]);
    return m;
  }
  getMaxColumns() { return Math.max(this.maxCols, this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    vals.forEach((v, j) => this._set(r, j + 1, v));
  }
  setFrozenRows() { return this; }
}
class FakeSpreadsheet {
  constructor(name, id) { this.name = name; this.id = id; this.sheets = [new FakeSheet("Лист1")]; }
  getName() { return this.name; }
  getId() { return this.id; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

/* ------------------------------------------------------------ Календарь */
class FakeEvent {
  constructor(cal, id, title, start, end, opt) {
    Object.assign(this, { cal, id, title, start, end,
      description: (opt || {}).description || "", location: (opt || {}).location || "",
      reminders: [], deleted: false });
  }
  getId() { return this.id; }
  getTitle() { return this.title; }
  setTitle(t) { this.title = t; return this; }
  getDescription() { return this.description; }
  setDescription(d) { this.description = d; return this; }
  getStartTime() { return this.start; }
  getEndTime() { return this.end; }
  setTime(a, b) { this.start = a; this.end = b; return this; }
  addPopupReminder(m) { this.reminders.push(m); return this; }
  deleteEvent() { this.deleted = true; this.cal.events.delete(this.id); }
}
class FakeCalendar {
  constructor(name, id) { this.name = name; this.id = id; this.events = new Map(); this.seq = 0; }
  getName() { return this.name; }
  getId() { return this.id; }
  createEvent(title, s, e, opt) {
    const id = "ev" + (++this.seq) + "@fake";
    const ev = new FakeEvent(this, id, title, s, e, opt);
    this.events.set(id, ev);
    return ev;
  }
  getEventById(id) { return this.events.get(id) || null; }
}

/* =========================================================== сборка среды */
export function makeEnv(opts = {}) {
  const state = {
    props: new Map(), spreadsheets: new Map(), calendars: [],
    fetches: [], logs: [], triggers: [], alerts: [], menus: [], nextId: 1,
    cache: new Map(), fail: {}, slept: 0, updates: [], lastMessageId: 1000,
    url: opts.url || "https://script.google.com/macros/s/AKfake/exec",
    email: opts.email === undefined ? "" : opts.email,
    tz: opts.tz || "Europe/Moscow",
  };

  const fmt = (d, tz, pattern) => {
    const p = {
      "yyyy": d.getFullYear(), "MM": pad(d.getMonth() + 1), "dd": pad(d.getDate()),
      "HH": pad(d.getHours()), "mm": pad(d.getMinutes()), "ss": pad(d.getSeconds()),
    };
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, m => p[m]);
  };

  const g = {
    console,
    Logger: { log: (...a) => {
      const s = a.length > 1 && /%s/.test(String(a[0]))
        ? a.slice(1).reduce((t, x) => t.replace("%s", x), String(a[0]))
        : a.map(String).join(" ");
      state.logs.push(s);
      if (opts.verbose) console.log("   [log] " + s);
    } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (state.props.has(k) ? state.props.get(k) : null),
        setProperty: (k, v) => { state.props.set(k, String(v)); },
        deleteProperty: k => { state.props.delete(k); },
        getProperties: () => Object.fromEntries(state.props),
        setProperties: m => { Object.keys(m).forEach(k => state.props.set(k, String(m[k]))); },
      }),
    },
    SpreadsheetApp: {
      create: name => {
        const id = "sheet" + (state.nextId++);
        const s = new FakeSpreadsheet(name, id);
        state.spreadsheets.set(id, s);
        return s;
      },
      openById: id => {
        const s = state.spreadsheets.get(id);
        if (!s) throw new Error("нет такой таблицы: " + id);
        return s;
      },
      /* Строитель правила проверки данных — тот же порядок вызовов, что и
         в Apps Script, чтобы сценарии ловили опечатки в цепочке. */
      /* Меню и окна: запоминаем, что построено, — сценарии проверяют состав. */
      getUi: () => ({
        ButtonSet: { OK: "OK", YES_NO: "YES_NO" },
        Button: { YES: "YES", NO: "NO" },
        alert: (title, text) => { state.alerts.push({ title, text }); return "YES"; },
        createMenu: name => {
          const m = { name, items: [] };
          const api = {
            addItem: (label, fn) => { m.items.push({ label, fn }); return api; },
            addSeparator: () => { m.items.push({ sep: true }); return api; },
            addToUi: () => { state.menus.push(m); return api; },
          };
          return api;
        },
      }),
      newDataValidation: () => {
        const rule = { kind: null, values: null, range: null, allowInvalid: true, help: "" };
        const b = {
          requireValueInList(values, showDropdown) {
            rule.kind = "list"; rule.values = values; rule.dropdown = showDropdown !== false;
            return b;
          },
          requireValueInRange(range, showDropdown) {
            rule.kind = "range";
            rule.range = range.sheet.name + "!" + range.r + ":" + range.c;
            rule.dropdown = showDropdown !== false;
            return b;
          },
          setAllowInvalid(v) { rule.allowInvalid = v; return b; },
          setHelpText(t) { rule.help = t; return b; },
          build() {
            if (!rule.kind) throw new Error("правило без условия: забыт requireValueIn…");
            return rule;
          },
        };
        return b;
      },
    },
    Session: {
      getScriptTimeZone: () => state.tz,
      getActiveUser: () => ({ getEmail: () => state.email }),
      getEffectiveUser: () => ({ getEmail: () => state.email }),
    },
    Utilities: {
      getUuid: () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
      }),
      formatDate: fmt,
      /* Паузу не спим по-настоящему — только считаем: проверкам важно, что
         повтор выждал, а не чтобы они шли на секунды дольше. */
      sleep: ms => { state.slept += ms; },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true, waitLock: () => true, releaseLock: () => {},
      }),
    },
    /* Кэш скрипта. Срок жизни не имитируем: в проверках он не нужен,
       а точность «в секундах» здесь только сбивала бы с толку. */
    CacheService: {
      getScriptCache: () => ({
        get: k => (state.cache.has(k) ? state.cache.get(k) : null),
        put: (k, v) => { state.cache.set(k, String(v)); },
        remove: k => { state.cache.delete(k); },
        getAll: ks => Object.fromEntries(ks.filter(k => state.cache.has(k)).map(k => [k, state.cache.get(k)])),
        putAll: m => { Object.keys(m).forEach(k => state.cache.set(k, String(m[k]))); },
      }),
    },
    ScriptApp: {
      WeekDay: { MONDAY: "MONDAY", TUESDAY: "TUESDAY", WEDNESDAY: "WEDNESDAY",
                 THURSDAY: "THURSDAY", FRIDAY: "FRIDAY", SATURDAY: "SATURDAY",
                 SUNDAY: "SUNDAY" },
      getService: () => ({ getUrl: () => state.url }),
      getProjectTriggers: () => state.triggers,
      deleteTrigger: tr => {
        const i = state.triggers.indexOf(tr);
        if (i >= 0) state.triggers.splice(i, 1);
      },
      newTrigger: fn => {
        const t = { fn, _h: null };
        const api = {
          timeBased: () => api, atHour: h => { t._h = h; return api; },
          everyDays: () => api,
          onWeekDay: d => { t._wd = d; return api; },
          everyMinutes: m => { t._min = m; return api; },
          forSpreadsheet: s => { t._ss = s && s.getId ? s.getId() : String(s); return api; },
          onOpen: () => { t._kind = "onOpen"; return api; },
          create: () => {
            state.triggers.push({ getHandlerFunction: () => fn, hour: t._h,
                                  weekDay: t._wd || null, minutes: t._min || null,
                                  spreadsheet: t._ss || null, kind: t._kind || "time" });
            return { getUniqueId: () => "trig" + state.triggers.length };
          },
        };
        return api;
      },
    },
    CalendarApp: {
      Color: { CYAN: "CYAN" },
      getCalendarsByName: n => state.calendars.filter(c => c.name === n),
      getCalendarById: id => state.calendars.find(c => c.id === id) || null,
      createCalendar: (n) => {
        const c = new FakeCalendar(n, "cal" + (state.nextId++) + "@group.calendar.google.com");
        state.calendars.push(c);
        return c;
      },
    },
    UrlFetchApp: {
      fetch: (url, params) => {
        const body = params && params.payload ? JSON.parse(params.payload) : {};
        const method = url.split("/").pop();
        state.fetches.push({ url, method, body });
        /* Заглушка сбоев: state.fail[method] — очередь того, что вернуть
           вместо ответа. "throw" изображает обрыв связи, число — код HTTP. */
        const q = state.fail[method];
        if (q && q.length) {
          const f = q.shift();
          if (f === "throw") throw new Error("Address unavailable: " + url);
          return {
            getResponseCode: () => f,
            getContentText: () => JSON.stringify({ ok: false, description: "код " + f }),
          };
        }
        const reply = (opts.telegram || {})[method];
        /* getUpdates отдаёт очередь state.updates, уважая offset — так же,
           как настоящий Telegram: подтверждённое больше не возвращается. */
        let out;
        if (reply !== undefined) out = reply;
        else if (method === "getMe") out = { ok: true, result: { username: "fake_bot" } };
        else if (method === "getUpdates") {
          const off = Number(body.offset || 0);
          out = { ok: true, result: state.updates.filter(u => u.update_id >= off) };
        } else if (method === "sendMessage") {
          /* Настоящий Telegram всегда возвращает номер отправленного
             сообщения — на нём держится приём ответов рабочего. */
          out = { ok: true, result: { message_id: ++state.lastMessageId } };
        } else out = { ok: true, result: {} };
        return { getResponseCode: () => (out.ok ? 200 : 400),
                 getContentText: () => JSON.stringify(out) };
      },
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createHtmlOutput: h => ({ _h: h, getContent: () => h,
        setTitle: function () { return this; }, addMetaTag: function () { return this; },
        setXFrameOptionsMode: function () { return this; } }),
      createHtmlOutputFromFile: name => {
        const p = path.join(opts.dir, name.endsWith(".html") ? name : name + ".html");
        const h = fs.readFileSync(p, "utf8");
        return { getContent: () => h };
      },
      createTemplateFromFile: name => {
        const p = path.join(opts.dir, name.endsWith(".html") ? name : name + ".html");
        const raw = fs.readFileSync(p, "utf8");
        const t = {
          _raw: raw,
          evaluate() {
            /* Подставляем скриптлеты <?= x ?> и <?!= x ?>, включения раскрываем. */
            let out = raw.replace(/<\?!?=?\s*include\('([^']+)'\);?\s*\?>/g,
              (_, f) => g.HtmlService.createHtmlOutputFromFile(f).getContent());
            out = out.replace(/<\?!?=\s*([\w.]+)\s*\?>/g, (_, k) => String(t[k]));
            return { _h: out, getContent: () => out,
              setTitle: function () { return this; }, addMetaTag: function () { return this; },
              setXFrameOptionsMode: function () { return this; } };
          },
        };
        return t;
      },
    },
    ContentService: {
      createTextOutput: t => ({ getContent: () => t }),
    },
  };
  g.globalThis = g;
  const ctx = vm.createContext(g);
  return { ctx, state };
}

export function loadServer(ctx, dir, files) {
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    try { vm.runInContext(src, ctx, { filename: f }); }
    catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
}
