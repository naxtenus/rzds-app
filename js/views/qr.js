/* QR-коды на маршрутном листе детали.

   Владелец печатает маршрутный лист заказа: каждая операция — строка
   с QR-кодом. Рабочий (или мастер) жмёт в приложении кнопку QR, наводит
   камеру — и сразу открывается эта операция: у рабочего — на экране смены
   с кнопками «Начал / Закончил», у владельца — в плане на своём дне.

   Сканер — внутри приложения, а не системная камера: на айфоне системная
   камера открыла бы ссылку в Safari, где человек не вошёл. Камеры нет или
   не дали доступ — QR можно сфотографировать, код прочитается со снимка.

   Библиотеки (генератор QR и распознавание) грузятся только на этих
   экранах — остальному приложению они не мешают. */

import { esc, icon, hhmm, dueText, startOfDay } from '../util.js';
import { store } from '../store.js';
import { opL } from '../ui.js';

/* ------------------------------------------------------------ библиотеки */
const loading = {};
function lib(name, file) {
  if (window[name]) return Promise.resolve(window[name]);
  if (!loading[name]) {
    loading[name] = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = file; s.async = true;
      s.onload = () => (window[name] ? ok(window[name]) : fail(new Error('Библиотека не загрузилась')));
      s.onerror = () => { delete loading[name]; fail(new Error('Нет связи — библиотека не загрузилась')); };
      document.head.appendChild(s);
    });
  }
  return loading[name];
}

/* Ссылка в коде — полный адрес приложения: её узнает и системная камера
   на Android (откроет приложение), и наш сканер. */
export const opLink = (code) => location.origin + location.pathname.replace(/index\.html$/, '') + '#/op/' + encodeURIComponent(code);

/* Из прочитанного текста — код операции. */
export function codeFrom(text) {
  const t = String(text || '').trim();
  const m = /#\/op\/([^?#\s]+)/.exec(t);
  if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
  const ops = (store.data && store.data.ops) || [];
  return ops.some((o) => o.code === t) ? t : '';
}

/* -------------------------------------------------- маршрутный лист (владелец) */
const svgCache = new Map();
function qrSvg(code) {
  if (svgCache.has(code)) return svgCache.get(code);
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M');
  q.addData(opLink(code));
  q.make();
  const svg = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true, alt: 'QR-код операции ' + code });
  svgCache.set(code, svg);
  return svg;
}

export const route = {
  render(params) {
    const code = decodeURIComponent(params[0] || '');
    const d = store.data || {};
    const ord = (d.orders || []).find((o) => o.code === code) || {};
    const ops = (d.ops || []).filter((o) => o.order === code).sort((a, b) => new Date(a.start) - new Date(b.start));
    const ready = !!window.qrcode;
    return `<main class="screen no-tabs route-sheet">
      <div class="topbar"><a class="link-btn" href="#/order/${encodeURIComponent(code)}" data-act="back">${icon.back(20)} Заказ</a>
        ${ops.length ? `<button class="btn" data-act="print" style="height:40px">${icon.doc(18)} Печать</button>` : ''}</div>
      <header><div class="eyebrow">Маршрутный лист</div>
        <h1 class="order-big" style="margin:4px 0 0;${code.length > 8 ? 'font-size:26px' : ''}">${esc(code)}</h1>
        ${ord.name ? `<div class="sub" style="margin-top:6px">${esc(ord.name)}</div>` : ''}
        ${ord.due ? `<div class="small muted" style="margin-top:4px">срок ${esc(dueText(ord.due, false))}</div>` : ''}</header>
      <div class="info no-print">${icon.qr(20)}<span>Распечатайте и положите к детали. Рабочий жмёт в приложении кнопку QR, наводит камеру — открывается операция с кнопками «Начал» и «Закончил».</span></div>
      ${ops.length ? ops.map((o, i) => `<div class="route-op">
          <div class="qr">${ready ? qrSvg(o.code) : '<i class="spinner" aria-label="Готовлю код"></i>'}</div>
          <div style="flex:1;min-width:0"><div class="num">${i + 1} · ${esc(o.code)}</div>
            <div class="strong" style="font-size:17px;margin-top:2px">${esc(o.op)}</div>
            <div class="small muted" style="margin-top:2px">${esc(o.res)} · ${esc(dueText(o.start, false))} ${hhmm(o.start)}–${hhmm(o.end)}</div>
            <div class="small" style="margin-top:4px;color:${opL(o).color}">${esc(opL(o).text)}</div></div>
        </div>`).join('')
        : '<div class="card empty">У этого заказа нет операций в ближайшем плане.</div>'}
    </main>`;
  },
  mount() {
    if (!window.qrcode) lib('qrcode', 'vendor/qrcode.js').then(() => store.emit()).catch((e) => store.say(e.message, 'error'));
  },
  on: {
    print: () => window.print(),
    back: (el, e) => { if (history.length > 1) { e.preventDefault(); history.back(); } },
  },
};

/* ------------------------------------------------------------- сканер */
let stream = null, timer = 0, busy = false, detector = null, lastBad = 0;

function stop() {
  clearTimeout(timer); timer = 0;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}

function found(text) {
  const code = codeFrom(text);
  if (!code) {
    if (Date.now() - lastBad > 3000) { lastBad = Date.now(); store.ui.scanMsg = 'Это не QR-код маршрутного листа РЗДС'; store.emit(); }
    return false;
  }
  stop();
  try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
  store.ui.scanMsg = '';
  location.hash = '#/op/' + encodeURIComponent(code);
  return true;
}

const canvas = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d', { willReadFrequently: true })]; };

async function readFrame(src, w, h, jsOnly) {
  if (detector && !jsOnly) {
    const r = await detector.detect(src);
    return r && r[0] ? r[0].rawValue : '';
  }
  const jsQR = await lib('jsQR', 'vendor/jsQR.js');
  const k = Math.min(1, 720 / Math.max(w, h));
  const [c, g] = canvas();
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  g.drawImage(src, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  return r ? r.data : '';
}

function tick() {
  timer = 0;
  if (!location.hash.startsWith('#/scan')) { stop(); return; }
  const v = document.getElementById('scan-video');
  const next = () => { if (stream) timer = setTimeout(tick, 220); };
  if (!v || busy || v.readyState < 2 || !v.videoWidth) { next(); return; }
  busy = true;
  readFrame(v, v.videoWidth, v.videoHeight)
    .then((t) => { if (!(t && found(t))) next(); })
    .catch(() => next())
    .finally(() => { busy = false; });
}

async function start() {
  if ('BarcodeDetector' in window && !detector) {
    try {
      const f = await window.BarcodeDetector.getSupportedFormats();
      if (f.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) { detector = null; }
  }
  if (!detector) lib('jsQR', 'vendor/jsQR.js').catch(() => {});
  if (!stream) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Камера в этом браузере недоступна');
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } } });
    if (!location.hash.startsWith('#/scan')) { stop(); return; }
  }
  attach();
}

function attach() {
  const v = document.getElementById('scan-video');
  if (!v || !stream) return;
  if (v.srcObject !== stream) { v.srcObject = stream; v.play().catch(() => {}); }
  if (!timer) timer = setTimeout(tick, 300);
}

export const scan = {
  render() {
    const worker = store.me && store.me.role === 'worker';
    const msg = store.ui.scanMsg || '';
    return `<main class="screen no-tabs">
      <div class="topbar"><a class="link-btn" href="${worker ? '#/shift' : '#/today'}" data-act="back">${icon.back(20)} Назад</a></div>
      <h1 class="h2" style="margin:0">Наведите на QR-код детали</h1>
      <div class="scan-box"><video id="scan-video" playsinline muted autoplay></video><div class="frame"></div></div>
      ${msg ? `<div class="info${store.ui.scanErr ? ' red' : ''}">${icon.alert(20)}<span>${esc(msg)}</span></div>`
        : '<div class="small muted" style="text-align:center">Код с маршрутного листа — откроется операция.</div>'}
      <button class="btn tall" data-act="scan-photo">${icon.camera(20)} Сфотографировать код</button>
    </main>`;
  },
  mount() {
    if (stream) { attach(); return; }
    if (store.ui.scanErr) return;
    start().catch((e) => {
      stop();
      store.ui.scanErr = true;
      store.ui.scanMsg = (e && e.name === 'NotAllowedError')
        ? 'Нет доступа к камере. Разрешите камеру для приложения в настройках телефона — или сфотографируйте код кнопкой ниже.'
        : 'Камера не включилась' + (e && e.message ? ' (' + e.message + ')' : '') + '. Сфотографируйте код кнопкой ниже.';
      store.emit();
    });
  },
  on: {
    back: (el, e) => { stop(); if (history.length > 1) { e.preventDefault(); history.back(); } },
    'scan-photo': () => {
      /* Снимок целиком, без сжатия: мелкий код на большом листе иначе не прочитать. */
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        store.ui.scanMsg = 'Читаю код…'; store.ui.scanErr = false; store.emit();
        try {
          const url = URL.createObjectURL(f);
          const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Не открылся снимок')); i.src = url; });
          let t = '';
          try { t = await readFrame(img, img.naturalWidth, img.naturalHeight); } catch (e) {}
          if (!t && detector) t = await readFrame(img, img.naturalWidth, img.naturalHeight, true);
          URL.revokeObjectURL(url);
          if (!t) { store.ui.scanMsg = 'Код на снимке не нашёлся. Снимите ближе и ровнее, чтобы код занял треть кадра.'; store.ui.scanErr = true; store.emit(); return; }
          if (!found(t)) { store.ui.scanErr = true; store.emit(); }
        } catch (e) { store.ui.scanMsg = e.message; store.ui.scanErr = true; store.emit(); }
      };
      inp.click();
    },
  },
};

/* --------------------------------------------------------- #/op/<код> */
export const op = {
  render() {
    return `<main class="screen no-tabs"><div class="status-line" style="margin-top:40px">${icon.qr(16)} Открываю операцию…</div></main>`;
  },
  mount(root, params) {
    if (!store.data) return;              // данные ещё грузятся — дождёмся перерисовки
    const code = decodeURIComponent(params[0] || '');
    const d = store.data;
    const o = (d.ops || []).find((x) => x.code === code);
    const worker = store.me && store.me.role === 'worker';
    setTimeout(() => {
      store.ui.scanMsg = ''; store.ui.scanErr = false;
      if (!o) {
        store.say(worker ? 'Операции ' + code + ' нет в вашей смене' : 'Операции ' + code + ' нет в ближайшем плане', 'error');
        location.replace(worker ? '#/shift' : '#/today');
        return;
      }
      if (worker) {
        store.ui.focusOp = o.code; store.ui.shiftForm = null; store.ui.shiftDraft = {};
        location.replace('#/shift');
      } else {
        store.ui.planView = 'day';
        store.ui.planDay = Math.round((startOfDay(new Date(o.start)) - startOfDay(new Date())) / 864e5);
        store.ui.planSel = o.code;
        store.ui.planScroll = null;
        location.replace('#/plan');
      }
    }, 0);
  },
};
