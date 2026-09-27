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
    ['weekly', 'Недельный отчёт', 'Понедельник, 08:00'],
  ]],
  ['Задачи', [
    ['taskDue', 'Срок моей задачи', 'За 1 час до срока'],
    ['taskReply', 'Исполнитель ответил или выполнил', 'Сразу'],
    ['taskUnread', 'Поручение не прочитано', 'Повторить исполнителю через 30 мин и сказать мне'],
  ]],
  ['Рабочим', [
    ['workerNew', 'Новое задание или поручение', 'Сразу, со звуком'],
    ['workerReport', 'Отчитаться по смене', 'За 5 минут до конца смены'],
  ]],
  ['Общее', [
    ['quiet', 'Тихие часы 22:00–07:00', 'Кроме проблем на станке'],
    ['telegram', 'Дублировать в Телеграм', 'Запасной канал через @rzds_prod_bot'],
  ]],
];

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
        <button class="switch" role="switch" aria-checked="${s[k] !== false}" aria-label="${esc(l)}" data-act="toggle" data-k="${k}"><i></i></button>
      </div>`).join('')}</div></section>`).join('')}
    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="section-title">Приложение</h2>
      <div class="list">
        <div class="kv"><span class="k">Вход</span><span class="v">${esc((store.me && store.me.name) || '')}${store.isDemo ? ' · демо' : ''}</span></div>
        <div class="kv"><span class="k">Версия</span><span class="v">${CONFIG.version}${isIOS() ? (isStandalone() ? ' · с экрана «Домой»' : ' · в Safari') : ''}</span></div>
        ${store.isDemo ? `<button class="kv" data-act="demo-reset" style="width:100%;border:none;background:none;text-align:left">${icon.refresh(20)}<span class="v">Сбросить демо-данные</span></button>` : ''}
        <button class="kv" data-act="logout" style="width:100%;border:none;background:none;text-align:left;color:#B3261E">${icon.logout(20)}<span class="v">Выйти на этом телефоне</span></button>
      </div>
    </section>
  </main>`;
}

export const on = {
  'push-on': async () => {
    try { await enablePush(); store.say('Уведомления включены'); } catch (e) { store.say(e.message, 'error'); }
    store.emit();
  },
  'push-test': async () => {
    try { await testPush(); store.say('Пробное отправлено'); } catch (e) { store.say(e.message, 'error'); }
  },
  'toggle': (el) => {
    const k = el.dataset.k;
    const cur = ((store.data && store.data.settings) || {})[k] !== false;
    store.act('settingsSave', { settings: { [k]: !cur } }, (d) => { d.settings = d.settings || {}; d.settings[k] = !cur; });
  },
  'demo-reset': async () => { await store.act('reset', {}); store.say('Демо начато заново'); },
  'logout': () => { if (confirm('Выйти на этом телефоне? Для входа понадобится новый код.')) store.logout(); },
};
