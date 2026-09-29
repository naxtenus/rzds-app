/* Уведомления и настройки. Сверху — включены ли push на этом телефоне
   (на айфоне это главное, что может не сработать), ниже — что присылать. */

import { esc, icon } from '../util.js';
import { store } from '../store.js';
import { pushState, enablePush, testPush, isIOS, isStandalone } from '../push.js';
import { CONFIG } from '../../config.js';

const ROWS = [
  ['Цех — мне', [
    ['problem', 'Проблема на станке', 'Сразу, со звуком, даже в тихие часы'],
    ['answers', 'Ответ со смены', 'Сразу — если нужно ваше решение'],
    ['morning', 'Утренняя сводка', 'Каждый день в 07:45'],
    ['weekly', 'Недельный отчёт', 'Понедельник утром'],
  ]],
  ['Задачи', [
    ['taskDue', 'Срок задачи', 'За час до срока — исполнителю; без времени — в 16:00'],
    ['taskReply', 'Исполнитель ответил или выполнил', 'Сразу'],
    ['taskUnread', 'Поручение не прочитано', 'Через 30 мин — повторить исполнителю и сказать мне'],
  ]],
  ['Рабочим', [
    ['workerNew', 'Новое задание или поручение', 'Сразу, со звуком'],
    ['workerReport', 'Отчитаться по смене', 'За 5–15 минут до конца смены'],
  ]],
  ['Общее', [
    ['quiet', 'Тихие часы 22:00–07:00', 'Кроме проблем на станке'],
    ['telegram', 'Дублировать в Телеграм', 'Запасной канал через @rzds_prod_bot. Если уведомление не дошло до телефона — скажу там всегда'],
  ]],
];

/* Тихие часы включаются только явно: иначе первый же ночной тест
   уведомлений молча ничего не покажет. Остальное включено по умолчанию. */
const isOn = (s, k) => (k === 'quiet' ? s[k] === true : s[k] !== false);

export function pushBlock() {
  const st = pushState();
  if (st === 'granted') return `<div class="info">${icon.check(20)}<span>Уведомления на этом телефоне включены.
    <button class="link-btn" data-act="push-test" style="padding:0 0 0 4px;font-size:14px;color:inherit;text-decoration:underline">Прислать пробное</button></span></div>`;
  if (st === 'need-install') return `<div class="info bronze">${icon.addBox(20)}<span>На айфоне уведомления работают, только если открыть приложение с экрана «Домой».
    <a href="#/install" style="color:inherit">Как добавить</a></span></div>`;
  if (st === 'denied') return `<div class="info red">${icon.alert(20)}<span>Уведомления запрещены. Включите: Настройки телефона → Уведомления → РЗДС.</span></div>`;
  if (st === 'unsupported') return `<div class="info bronze">${icon.alert(20)}<span>Этот браузер не умеет push-уведомления. Откройте приложение в Safari на айфоне или в Chrome на Android.</span></div>`;
  return `<button class="btn primary tall" data-act="push-on">${icon.bell(22)} Включить уведомления</button>`;
}

export function render() {
  const d = store.data || {};
  const s = d.settings || {};
  const worker = store.me && store.me.role === 'worker';
  return `<main class="screen no-tabs">
    <div class="topbar"><a class="link-btn" href="${worker ? '#/shift' : '#/today'}">${icon.back(20)} Назад</a></div>
    <h1 class="title" style="font-size:24px;margin:0">Уведомления</h1>
    ${pushBlock()}
    <section class="push-preview" aria-label="Как выглядит">
      <div class="lbl">Так придёт на экран блокировки</div>
      <div class="push"><img src="icons/icon-192.png" alt=""><div style="flex:1;min-width:0">
        <div class="row-between small muted"><b>РЗДС</b><span>сейчас</span></div>
        <div class="strong" style="font-size:15px">${worker ? 'Новое задание: ФДЗ' : 'Проблема: эро7745 стоит'}</div>
        <div class="small" style="color:#2B2F2C">${worker ? 'Фрезеровка, 1-я установка · с 14:30' : 'ВР-300 · электрод изношен. Нажмите, чтобы решить.'}</div></div></div>
    </section>
    ${worker ? '' : ROWS.map(([title, rows]) => `<section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title">${title}</h2>
      <div class="list">${rows.map(([k, l, h]) => `<div class="switch-row">
        <div class="t"><div class="strong" style="font-size:15px;font-weight:600">${l}</div><div class="small muted">${h}</div></div>
        <button class="switch" role="switch" aria-checked="${isOn(s, k)}" aria-label="${esc(l)}" data-act="toggle" data-k="${k}"><i></i></button>
      </div>`).join('')}</div></section>`).join('')}
    ${worker ? '' : accessBlock(d)}
    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title">Приложение</h2>
      <div class="list">
        <div class="kv"><span class="k">Вход</span><span class="v">${esc((store.me && store.me.name) || '')}${store.isDemo ? ' · демо' : ''}</span></div>
        <div class="kv"><span class="k">Версия</span><span class="v">${CONFIG.version}${isIOS() ? (isStandalone() ? ' · с экрана «Домой»' : ' · в Safari') : ''}</span></div>
        ${store.isDemo ? `<button class="kv" data-act="demo-reset" style="width:100%;border:none;background:none;text-align:left">${icon.refresh(20)}<span class="v">Сбросить демо-данные</span></button>` : ''}
        ${worker ? `<a class="kv" href="#/sessions" style="text-decoration:none;color:inherit">${icon.phone(20)}<span class="v">Мои входы</span>${icon.next(18)}</a>` : ''}
        <button class="kv" data-act="logout" style="width:100%;border:none;background:none;text-align:left;color:#B3261E">${icon.logout(20)}<span class="v">Выйти на этом телефоне</span></button>
      </div>
    </section>
  </main>`;
}

function accessBlock(d) {
  const iss = store.ui.issued;
  const people = [{ name: (store.me && store.me.name) || 'Павел', role: 'owner', label: 'Себе — ещё один телефон' }]
    .concat((d.people || []).map((p) => ({ name: p.name, role: 'worker', label: p.name })));
  return `<section style="display:flex;flex-direction:column;gap:8px" aria-label="Вход на телефоны">
    <h2 class="section-title">Вход на телефоны</h2>
    ${iss ? `<div class="card" style="display:flex;flex-direction:column;gap:10px;border-color:var(--green)">
      <div class="small muted strong">Код для: ${esc(iss.name)}</div>
      <div style="font-family:Unbounded,Onest,sans-serif;font-size:34px;font-weight:700;letter-spacing:.18em;text-align:center">${esc(iss.code)}</div>
      <div class="small">Действует сутки, годится на три входа. На телефоне: открыть <b>${esc(location.origin + location.pathname)}</b> в Safari → «Поделиться» → «На экран „Домой“» → открыть РЗДС с иконки → ввести код.</div>
      <div class="btns"><button class="btn primary" data-act="share-code">Отправить</button><button class="btn" data-act="hide-code">Готово</button></div>
    </div>` : ''}
    <div class="list">${people.map((p) => `<div class="kv">
      <span class="avatar${p.role === 'owner' ? ' me' : ''}">${p.role === 'owner' ? 'Я' : esc((p.name[0] || '?').toUpperCase())}</span>
      <span class="v">${esc(p.label)}</span>
      <button class="btn ghost" data-act="issue" data-name="${esc(p.name)}" data-role="${p.role}" style="height:40px;padding:0 6px">Выдать вход</button>
    </div>`).join('')}</div>
    <a class="kv" href="#/sessions" style="text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:16px;background:var(--card)">${icon.phone(20)}<span class="v">Все входы — посмотреть и отключить</span>${icon.next(18)}</a>
  </section>`;
}

export const on = {
  'issue': async (el) => {
    const r = await store.act('issueCode', { name: el.dataset.name, role: el.dataset.role });
    if (r && r.code) { store.ui.issued = r; store.emit(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  },
  'hide-code': () => { store.ui.issued = null; store.emit(); },
  'share-code': async () => {
    const r = store.ui.issued; if (!r) return;
    const text = `Вход в приложение РЗДС: ${location.origin + location.pathname}\nКод: ${r.code} (действует сутки)`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); store.say('Скопировано'); }
    } catch (e) {}
  },
  'push-on': async () => {
    try { await enablePush(); store.say('Уведомления включены'); } catch (e) { store.say(e.message, 'error'); }
    store.emit();
  },
  'push-test': async () => {
    try { await testPush(); store.say('Пробное отправлено'); } catch (e) { store.say(e.message, 'error'); }
  },
  'toggle': (el) => {
    const k = el.dataset.k;
    const cur = isOn((store.data && store.data.settings) || {}, k);
    store.act('settingsSave', { settings: { [k]: !cur } }, (d) => { d.settings = d.settings || {}; d.settings[k] = !cur; });
  },
  'demo-reset': async () => { await store.act('reset', {}); store.say('Демо начато заново'); },
  'logout': () => { if (confirm('Выйти на этом телефоне? Для входа понадобится новый код.')) store.logout(); },
};
