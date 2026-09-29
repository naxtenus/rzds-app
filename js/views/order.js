/* Заказ у станка: чертёж, карта наладки, технология — всё, что владелец
   завёл в реестре к этому заказу, и как ту же деталь делали раньше.

   Документы в реестре — ссылки (обычно на Google Диск): открываются в
   браузере телефона. Паспорт (технология, заготовки, режимы, инструмент)
   показывается прямо здесь, крупно, чтобы читать у станка. */

import { esc, icon } from '../util.js';
import { store } from '../store.js';
import { api } from '../api.js';

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
      </section>` : ''}` : ''}
  </main>`;
}

export function mount(root, params) { load(decodeURIComponent(params[0] || ''), false); }

export const on = {
  'oi-reload': () => { const code = decodeURIComponent(location.hash.split('/')[2] || ''); load(code, true); },
  'back': (el, e) => { if (history.length > 1) { e.preventDefault(); history.back(); } },
};
