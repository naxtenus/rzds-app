/* Фото: снять, ужать, показать.

   Снимок с камеры телефона весит 3–6 МБ — по сотовой в цеху это минута.
   Поэтому ещё на телефоне он ужимается до 1280 точек по длинной стороне и
   JPEG 70%: 150–300 КБ, на экране не отличить. На сервере снимки лежат в
   отдельной таблице и отдаются только по входу, поэтому показываем их не
   ссылкой, а данными: запросили один раз — держим в памяти. */

import { api } from './api.js';
import { store } from './store.js';
import { esc, icon } from './util.js';

const MAX = 1280, Q = 0.7;

/* Открыть камеру (на компьютере — выбор файла). Вернёт data:-адрес или null. */
export function pickPhoto() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) { resolve(null); return; }
      try { resolve(await shrink(f)); } catch (e) { store.say('Фото не прочиталось — попробуйте ещё раз', 'error'); resolve(null); }
    };
    document.body.appendChild(inp);
    inp.click();
  });
}

export async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', Q);
  } finally { URL.revokeObjectURL(url); }
}

/* ------------------------------------------------------------- показ */
/* 04.10, жалоба Павла «ошибка с открытием фотографий». Сервер снимки отдаёт
   (2–4 с, 200–370 КБ), но раньше одна неудачная попытка — сеть мигнула,
   сервер не ответил за 25 с — запоминалась навсегда: вместо фото значок «!»
   до перезапуска приложения, а во весь экран — вечная крутилка. Теперь
   ошибка не навсегда: через 15 с пробуем сами, нажатие — пробует сразу,
   во весь экран видно, что случилось, и есть «Повторить». */
const cache = new Map();      // id → data:-адрес
const failed = new Map();     // id → { at, why }
const loading = new Set();

/* 05.10, разбор той же жалобы. Каждый снимок — 200–370 КБ, а миниатюры
   на экране просили все сразу: восемь фото — это 2–3 МБ одним махом, по
   сотовой в цеху каждое ползло дольше 25 секунд и падало. Теперь:
   — не больше двух загрузок одновременно, остальные ждут очереди — первые
     фото появляются быстро, а не все разом в самом конце;
   — загруженное фото кладётся в память телефона (Cache Storage) и при
     следующем открытии приложения берётся оттуда мгновенно, даже без связи. */
const MAXPAR = 2;
const queue = [];
let running = 0;
const STORE = 'rzds-photos';
const keyOf = (id) => new Request(location.origin + '/rzds-photo/' + encodeURIComponent(id));

async function fromDisk(id) {
  try {
    if (!('caches' in window)) return null;
    const r = await (await caches.open(STORE)).match(keyOf(id));
    return r ? await r.text() : null;
  } catch (e) { return null; }
}
function toDisk(id, data) {
  try { if ('caches' in window) caches.open(STORE).then((c) => c.put(keyOf(id), new Response(data))).catch(() => {}); } catch (e) {}
}

function pump() {
  while (running < MAXPAR && queue.length) {
    const id = queue.shift();
    running++;
    api('photo', { id }).then((r) => {
      if (!r || !/^data:image\//.test(r.data || '')) throw new Error('пустой ответ сервера');
      cache.set(id, r.data);
      toDisk(id, r.data);
    }).catch((e) => {
      if (e && e.code === 'auth') { store.logout(); return; }
      failed.set(id, { at: Date.now(), why: (e && e.message) || 'не загрузилось' });
    }).finally(() => { running--; loading.delete(id); store.emit(); pump(); });
  }
}

export function load(id, force) {
  if (!id || cache.has(id)) return;
  if (loading.has(id)) {
    /* Открыли во весь экран то, что стоит в очереди, — пусть грузится первым. */
    if (force) { const i = queue.indexOf(id); if (i > 0) { queue.splice(i, 1); queue.unshift(id); } }
    return;
  }
  const f = failed.get(id);
  if (f && !force && Date.now() - f.at < 15000) { setTimeout(() => store.emit(), 15000 - (Date.now() - f.at) + 50); return; }
  loading.add(id);
  failed.delete(id);
  fromDisk(id).then((d) => {
    if (d && /^data:image\//.test(d)) { cache.set(id, d); loading.delete(id); store.emit(); return; }
    if (force) queue.unshift(id); else queue.push(id);
    pump();
  });
}
export const photoState = (id) => (cache.has(id) ? 'ok' : loading.has(id) ? 'loading' : failed.has(id) ? 'failed' : 'none');

/* Ряд миниатюр. ids — номера снимков с сервера. */
export function thumbs(ids) {
  if (!ids || !ids.length) return '';
  return `<div class="ph-row">${ids.map((id) => {
    const d = cache.get(id);
    if (d === undefined) load(id);
    const bad = !d && failed.has(id) && !loading.has(id);
    return `<button class="ph${bad ? ' bad' : ''}" data-act="ph-open" data-id="${esc(id)}" aria-label="${bad ? 'Фото не загрузилось — нажмите, чтобы повторить' : 'Открыть фото'}">${d
      ? `<img src="${d}" alt="">` : bad ? `${icon.refresh(18)}<small>ещё раз</small>` : '<i class="spinner"></i>'}</button>`;
  }).join('')}</div>`;
}

/* Снимок, ещё не отправленный (в черновике формы), — прямо данными. */
export function draftThumb(data, act = 'ph-drop') {
  if (!data) return '';
  return `<div class="ph-row"><span class="ph"><img src="${data}" alt="Прикреплённое фото">
    <button class="ph-x" data-act="${act}" aria-label="Убрать фото">${icon.close(14)}</button></span></div>`;
}

/* Во весь экран — поверх всего. */
export function viewer(id) {
  if (!id) return '';
  const d = cache.get(id);
  if (!d) load(id);
  const f = failed.get(id);
  const bad = !d && f && !loading.has(id);
  return `<div class="ph-full" data-act="ph-close" role="dialog" aria-label="Фото">
    ${d ? `<img src="${d}" alt="">`
      : bad ? `<div class="ph-msg">Фото не загрузилось: ${esc(f.why)}<button class="btn" data-act="ph-retry" data-id="${esc(id)}">${icon.refresh(18)} Повторить</button></div>`
      : '<div class="ph-msg"><i class="spinner" style="color:#fff;width:32px;height:32px"></i>Загружаю фото…</div>'}
    <button class="ph-close" data-act="ph-close" aria-label="Закрыть">${icon.close(22)}</button>
  </div>`;
}
