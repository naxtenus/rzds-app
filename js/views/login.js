/* Вход и установка на телефон. */

import { esc, icon } from '../util.js';
import { store } from '../store.js';
import { session, hasServer, backend } from '../api.js';
import { isIOS, isStandalone } from '../push.js';

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; store.emit(); });

const shareIcon = `<span class="ios-share">${icon.share(20)}</span>`;

export const needInstallHint = () => isIOS() && !isStandalone();

export function renderLogin() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code') || store.ui.code || '';
  return `<main class="login">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="icons/icon-192.png" alt="" width="64" height="64" style="border-radius:16px">
      <div><div class="eyebrow">РЗДС</div><h1 class="title" style="font-size:24px;margin-top:2px">План производства</h1></div>
    </div>
    ${needInstallHint() ? `<a class="info bronze" href="#/install" style="text-decoration:none">${icon.addBox(20)}<span>Сначала добавьте приложение на экран «Домой» — иначе на айфоне не придут уведомления. <u>Как это сделать</u></span></a>` : ''}
    ${hasServer() ? `
      <form data-form="login" style="display:flex;flex-direction:column;gap:12px">
        <label class="strong" for="code">Код входа</label>
        <input id="code" class="code-input" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" maxlength="12" value="${esc(code)}" placeholder="••••••">
        <div class="small muted">Владелец берёт код в Google Таблице: меню «Планировщик» → «Вход в приложение на телефон». Рабочим коды выдаёт владелец в приложении. Код вводится один раз на этом телефоне.</div>
        <button class="btn primary tall" type="submit">Войти</button>
      </form>` : `
      <div class="info bronze">${icon.alert(20)}<span>Сервер ещё не подключён. Можно посмотреть приложение на демо-данных — в настоящий план ничего не попадёт.</span></div>`}
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn${hasServer() ? '' : ' primary'} tall" data-act="demo" data-r="owner">Демо: вид владельца</button>
      <button class="btn tall" data-act="demo" data-r="worker">Демо: вид рабочего</button>
    </div>
  </main>`;
}

export function renderInstall() {
  const ios = isIOS();
  return `<main class="screen no-tabs">
    <div class="topbar"><a class="link-btn" href="#/">${icon.back(20)} Назад</a></div>
    <h1 class="title" style="font-size:24px;margin:0">Установка на телефон</h1>
    ${isStandalone() ? `<div class="info">${icon.check(20)}<span>Готово — приложение уже открыто с экрана «Домой».</span></div>` : ''}
    ${ios ? `<div class="list">
      <div class="install-step"><span class="n">1</span><div>Откройте эту страницу в <b>Safari</b> (не в Телеграме и не в другом браузере).</div></div>
      <div class="install-step"><span class="n">2</span><div>Нажмите кнопку «Поделиться» ${shareIcon} внизу экрана.</div></div>
      <div class="install-step"><span class="n">3</span><div>Прокрутите вниз и выберите <b>«На экран „Домой“»</b>, затем «Добавить».</div></div>
      <div class="install-step"><span class="n">4</span><div>Откройте <b>РЗДС</b> с появившейся иконки, войдите и нажмите «Включить уведомления».</div></div>
    </div>
    <div class="small muted">Нужен iOS 16.4 или новее: Настройки → Основные → Об этом устройстве.</div>`
    : deferredPrompt ? `<button class="btn primary tall" data-act="install">${icon.addBox(22)} Установить приложение</button>`
    : `<div class="list">
      <div class="install-step"><span class="n">1</span><div>Откройте страницу в <b>Chrome</b>.</div></div>
      <div class="install-step"><span class="n">2</span><div>Меню <b>⋮</b> справа вверху → <b>«Добавить на главный экран»</b> или «Установить приложение».</div></div>
      <div class="install-step"><span class="n">3</span><div>Откройте <b>РЗДС</b> с иконки и включите уведомления.</div></div>
    </div>`}
  </main>`;
}

export const on = {
  'demo': (el) => {
    const role = el.dataset.r;
    session.set({ demo: true, role, me: role === 'worker' ? { role: 'worker', name: 'Оператор фре1360', id: 'w1' } : { role: 'owner', name: 'Павел', id: 'owner' } });
    store.data = null;
    store.ui = {};
    location.hash = role === 'worker' ? '#/shift' : '#/today';
    store.refresh();
  },
  'install': async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null; store.emit();
  },
};

export const onSubmit = {
  'login': async (form) => {
    const code = (form.querySelector('#code').value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (code.length < 4) { store.say('Введите код целиком', 'error'); return; }
    store.ui.code = code;
    try {
      const res = await backend().call('login', { code, ua: navigator.userAgent.slice(0, 160) }, {});
      session.set({ token: res.token, me: res.me });
      store.data = null; store.ui = {};
      location.hash = res.me.role === 'worker' ? '#/shift' : '#/today';
      await store.refresh();
      store.say('Добро пожаловать, ' + res.me.name);
    } catch (e) {
      store.say(e.message || 'Не удалось войти', 'error');
    }
  },
};
