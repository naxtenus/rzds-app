/* Заказ у станка: чертёж, карта наладки, технология — всё, что владелец
   завёл в реестре к этому заказу, и как ту же деталь делали раньше.

   Документы в реестре — ссылки (обычно на Google Диск): открываются в
   браузере телефона. Паспорт (технология, заготовки, режимы, инструмент)
   показывается прямо здесь, крупно, чтобы читать у станка. */

import { esc, icon, hhmm, dueText } from '../util.js';
import { store } from '../store.js';
import { api } from '../api.js';
import { pickPhoto, thumbs, draftThumb } from '../photo.js';

const FIELDS = ['Технология', 'Заготовки', 'Режимы резания', 'Инструмент', 'Маршрут', 'Детали', 'Прочее'];

function load(code, force) {
  const all = store.ui.orderInfo || (store.ui.orderInfo = {});
  const st = all[code];
  if (!force && st && (st.loading || Date.now() - (st.at || 0) < 60000)) return;
  all[code] = Object.assign({}, st, { loading: true, error: '' });
  api('orderInfo', { order: code })
    .then((r) => { all[code] = Object.assign(r, { at: Date.now() }); store.emit(); })
    .catch((e) => {
      if (e.code === 'auth') { store.logout(); return; }
      all[code] = Object.assign({}, all[code], { loading: false, error: e.message, at: Date.now() }); store.emit();
    });
}

/* Переписка по заказу — общая для всех, кто над ним работает, и владельца.
   Владелец одним нажатием делает из сообщения задачу. */
function chatBlock(code, st, worker) {
  const me = store.me && store.me.name;
  const list = st.chat || [];
  const text = (x) => x.text === 'фото' && ((x.photos || []).length || x.localPhoto) ? '' : x.text;
  return `<section style="display:flex;flex-direction:column;gap:8px" aria-label="Переписка по заказу">
    <h2 class="section-title">Переписка по заказу</h2>
    ${list.length ? list.map((x, i) => {
      const mine = x.who === me;
      return `<div class="bubble${mine ? ' mine' : ''}${x.queued ? ' queued' : ''}"><div class="by">${esc(mine ? 'Вы' : x.who)} · ${esc(dueText(x.ts, false))} ${hhmm(x.ts)}${x.queued ? ' · ждёт отправки' : x.sending ? ' · отправляю…' : ''}</div>
        ${text(x) ? `<div style="margin-top:2px">${esc(text(x))}</div>` : ''}${x.localPhoto ? draftThumb(x.localPhoto, 'noop') : thumbs(x.photos)}
        ${!worker && !mine && !x.sending ? `<a class="link-btn to-task" href="#/new?text=${encodeURIComponent(text(x) || 'Фото по заказу ' + code)}&order=${encodeURIComponent(code)}">${icon.plus(14)} В задачу</a>` : ''}</div>`;
    }).join('') : `<div class="small muted" style="padding:0 4px">${worker ? 'Вопрос по заказу — пишите сюда: мастер получит уведомление.' : 'Здесь пишут все, кто работает над заказом. Рабочим придёт уведомление.'}</div>`}
    ${draftThumb(store.ui.chatPhoto)}
    <div class="input-row">
      <button class="icon-btn" data-act="ch-photo" aria-label="Приложить фото">${icon.camera(20)}</button>
      <label class="sr" for="cmt">Сообщение по заказу</label>
      <input id="cmt" type="text" placeholder="Написать по заказу…" enterkeyhint="send" autocomplete="off">
      <button class="icon-btn green" data-act="ch-send" aria-label="Отправить">${icon.send(18)}</button>
    </div>
  </section>`;
}

export function render(params) {
  const code = decodeURIComponent(params[0] || '');
  const st = (store.ui.orderInfo || {})[code] || {};
  const worker = store.me && store.me.role === 'worker';
  const back = worker ? '#/shift' : '#/plan';
  const p = st.passport || {};
  const has = FIELDS.filter((k) => p[k]);
  return `<main class="screen no-tabs">
    <div class="topbar"><a class="link-btn" href="${back}" data-act="back">${icon.back(20)} Назад</a></div>
    <header><div class="eyebrow">Заказ</div>
      <h1 class="order-big" style="margin:4px 0 0;${code.length > 8 ? 'font-size:26px' : ''}">${esc(code)}</h1>
      ${st.name ? `<div class="sub" style="margin-top:6px">${esc(st.name)}</div>` : ''}</header>
    ${st.error ? `<div class="info red">${icon.alert(20)}<span>${esc(st.error)} <button class="link-btn" data-act="oi-reload" style="padding:0 4px;color:inherit;text-decoration:underline">Повторить</button></span></div>` : ''}
    ${!st.at && !st.error ? `<div class="status-line">${icon.refresh(16).replace('<svg', '<svg class="spin"')} Загружаю из реестра…</div>` : ''}
    ${st.at && !st.error ? `
      <section style="display:flex;flex-direction:column;gap:8px">
        <h2 class="section-title">Документы</h2>
        ${(st.docs || []).length ? `<div class="list">${st.docs.map((d) => `<a class="kv" href="${esc(d.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
          ${icon.doc(22)}<div style="flex:1;min-width:0"><div class="strong">${esc(d.title || d.kind)}</div><div class="small muted">${esc(d.kind)}</div></div>${icon.link(18)}</a>`).join('')}</div>`
          : `<div class="card empty" style="padding:14px">К заказу нет документов. Владелец добавляет их в реестре планировщика: паспорт заказа → «Документы».</div>`}
      </section>
      <section style="display:flex;flex-direction:column;gap:8px">
        <h2 class="section-title">Технология и наладка</h2>
        ${has.length ? `<div class="list">${has.map((k) => `<div class="pass-row"><div class="small muted strong">${esc(k)}</div><div class="pass-v">${esc(p[k])}</div></div>`).join('')}</div>`
          : `<div class="card empty" style="padding:14px">В паспорте заказа пока ничего не записано.</div>`}
      </section>
      ${(st.earlier || []).length ? `<section style="display:flex;flex-direction:column;gap:8px">
        <h2 class="section-title">Эту деталь уже делали</h2>
        <div class="list">${st.earlier.map((e) => `<a class="kv" href="#/order/${encodeURIComponent(e.order)}" style="text-decoration:none;color:inherit">
          <div style="flex:1"><div class="strong">${esc(e.order)}</div><div class="small muted">${esc(e.name || '')}${e.finished ? ' · выполнен ' + esc(e.finished.split('-').reverse().join('.')) : ''}${e.docs ? ' · документов: ' + e.docs : ''}</div></div>${icon.next(18)}</a>`).join('')}</div>
      </section>` : ''}
      ${chatBlock(code, st, worker)}
      ${worker ? '' : `<a class="btn" href="#/route/${encodeURIComponent(code)}" style="align-self:flex-start">${icon.doc(20)} Маршрутный лист с QR</a>`}` : ''}
  </main>`;
}

export function mount(root, params) {
  load(decodeURIComponent(params[0] || ''), false);
  const input = root.querySelector('#cmt');
  if (input) input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="ch-send"]').click(); } };
}

export const on = {
  'oi-reload': () => { const code = decodeURIComponent(location.hash.split('/')[2] || ''); load(code, true); },
  'ch-photo': async () => { const d = await pickPhoto(); if (d) { store.ui.chatPhoto = d; store.emit(); } },
  'ph-drop': () => { store.ui.chatPhoto = null; store.emit(); },
  'noop': () => {},
  'ch-send': async () => {
    const code = decodeURIComponent(location.hash.split('/')[2] || '');
    const input = document.querySelector('#cmt');
    const text = ((input && input.value) || '').trim();
    const photo = store.ui.chatPhoto || null;
    if (!text && !photo) { input && input.focus(); return; }
    input.value = '';
    store.ui.chatPhoto = null;
    const st = (store.ui.orderInfo || {})[code];
    const msg = { ts: new Date().toISOString(), who: store.me && store.me.name, text: text || 'фото', localPhoto: photo, sending: true };
    if (st) (st.chat || (st.chat = [])).push(msg);
    store.emit();
    const payload = { order: code, text };
    if (photo) payload.photo = photo;
    const r = await store.act('orderSay', payload, null, photo ? 'Фото отправлено' : '');
    const cur = (store.ui.orderInfo || {})[code];
    if (r && r.chat && cur) cur.chat = r.chat;
    else if (r && r.queued) { msg.sending = false; msg.queued = true; }
    else if (cur && cur.chat) cur.chat = cur.chat.filter((x) => x !== msg);
    store.emit();
  },
  'back': (el, e) => { if (history.length > 1) { e.preventDefault(); history.back(); } },
};
