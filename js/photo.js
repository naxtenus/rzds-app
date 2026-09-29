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
const cache = new Map();      // id → data:-адрес
const loading = new Set();

function load(id) {
  if (!id || cache.has(id) || loading.has(id)) return;
  loading.add(id);
  api('photo', { id }).then((r) => { cache.set(id, r.data); })
    .catch(() => { cache.set(id, ''); })
    .finally(() => { loading.delete(id); store.emit(); });
}

/* Ряд миниатюр. ids — номера снимков с сервера. */
export function thumbs(ids) {
  if (!ids || !ids.length) return '';
  return `<div class="ph-row">${ids.map((id) => {
    const d = cache.get(id);
    if (d === undefined) load(id);
    return `<button class="ph" data-act="ph-open" data-id="${esc(id)}" aria-label="Открыть фото">${d
      ? `<img src="${d}" alt="">` : d === '' ? icon.alert(18) : '<i class="spinner"></i>'}</button>`;
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
  return `<div class="ph-full" data-act="ph-close" role="dialog" aria-label="Фото">
    ${d ? `<img src="${d}" alt="">` : '<i class="spinner" style="color:#fff;width:32px;height:32px"></i>'}
    <button class="ph-close" data-act="ph-close" aria-label="Закрыть">${icon.close(22)}</button>
  </div>`;
}
