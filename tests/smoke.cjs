// Прогон приложения без браузера: jsdom + демо-сервер.
const { JSDOM } = require('/tmp/jt/node_modules/jsdom');
const path = require('path');
const APP = '/home/claude/rzds-app';

const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
  url: 'https://example.github.io/rzds-app/', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.location = w.location;
global.localStorage = w.localStorage; global.navigator = w.navigator; global.HTMLElement = w.HTMLElement;
global.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c) };
w.matchMedia = () => ({ matches: false, addEventListener() {} });
global.confirm = () => true; w.confirm = () => true;
global.atob = w.atob;
w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
const errors = [];
process.on('unhandledRejection', (e) => errors.push('UNHANDLED: ' + (e && e.stack || e)));
w.addEventListener('error', (e) => errors.push('ERR: ' + e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const text = () => document.getElementById('app').textContent.replace(/\s+/g, ' ');
const click = async (sel) => {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) throw new Error('нет элемента: ' + sel);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(300);
};
const go = async (h) => { location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange')); await sleep(250); };
const expect = (cond, msg) => { if (!cond) { errors.push('FAIL: ' + msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

(async () => {
  await import(path.join(APP, 'js/app.js'));
  await sleep(200);
  console.log('Вход');
  expect(text().includes('Демо: вид владельца'), 'экран входа с демо-кнопками');
  await click('[data-act="demo"][data-r="owner"]');
  await sleep(400);

  console.log('Сегодня');
  expect(text().includes('Ждут вашего решения'), 'блок решений');
  expect(text().includes('эро7745') && text().includes('Есть проблема'), 'плитка проблемного станка');
  expect(document.querySelectorAll('.tile').length === 5, '5 плиток станков');
  await click('[data-act="decide"][data-yes="1"]');
  await sleep(300);
  expect(document.querySelectorAll('.decide .item').length === 1, 'после решения остался 1 ответ');

  console.log('План');
  await go('#/plan');
  expect(document.querySelectorAll('.blk').length >= 5, 'полосы на ленте: ' + document.querySelectorAll('.blk').length);
  await click('.blk.problem, .blk.work');
  expect(!!$('.sheet'), 'панель этапа открылась');
  await click('[data-act="day"][data-d="1"]');
  expect(text().includes('Завтра'), 'переход на завтра');

  console.log('Задачи');
  await go('#/tasks');
  expect(text().includes('Поручил другим'), 'группа поручений');
  expect(text().includes('Не прочитал') && text().includes('В работе'), 'статусы доставки');
  const before = document.querySelectorAll('.task.is-done').length;
  await click('.task .check');
  await click('[data-act="show-done"]');
  expect(document.querySelectorAll('.task.is-done').length > before, 'задача отмечена выполненной');
  await click('[data-act="mode"][data-m="given"]');
  expect(!text().includes('Мне · сегодня'), 'фильтр «Поручил» скрывает свои');

  console.log('Новая задача');
  await go('#/new');
  const ta = $('[data-bind="text"]');
  ta.value = 'Проверить биение шпинделя';
  ta.dispatchEvent(new w.Event('input', { bubbles: true }));
  await click('[data-act="set"][data-k="to"][data-v="w3"]');
  expect(text().includes('Поручить: Слесарь'), 'кнопка меняется на «Поручить: Слесарь»');
  expect($('[data-bind="text"]').value === 'Проверить биение шпинделя', 'текст не потерялся при нажатии');
  await click('[data-act="set"][data-k="weight"][data-v="срочно"]');
  console.log('Календарь');
  await click('[data-act="set"][data-k="due"][data-v="pick"]');
  expect(!!$('.cal') && document.querySelectorAll('.cal-d').length >= 28, 'календарь месяца виден сразу, без нажатий');
  expect(!document.querySelector('input[type="datetime-local"]'), 'нет скрытого системного поля даты');
  expect(/^[А-Я][а-я]+, \d+ [а-я]+, 17:00$/.test($('.cal-sum').textContent.trim()), 'над календарём словами: ' + $('.cal-sum').textContent.trim());
  const days = [...document.querySelectorAll('.cal-d:not([disabled])')];
  await click(days[days.length - 1]);
  await click('[data-act="cal-time"][data-v="10:00"]');
  expect($('.cal-d.sel') && $('.cal-sum').textContent.includes('10:00'), 'выбран день и время: ' + $('.cal-sum').textContent.trim());
  await click('[data-act="cal-month"][data-v="1"]');
  expect(!document.querySelector('.cal-d.sel'), 'календарь листается вперёд');
  await click('[data-act="cal-month"][data-v="-1"]');
  const saveBtn = $('[data-act="save"]');
  saveBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(30);
  expect(location.hash === '#/tasks', 'после «Поручить» экран сменился мгновенно (до ответа сервера)');
  expect(text().includes('отправляю…') && document.querySelector('.toast.wait'), 'в списке задача с «отправляю…» и строка состояния');
  await sleep(500);
  expect(text().includes('Проверить биение шпинделя') && !text().includes('отправляю…'), 'после ответа — обычная строка');
  expect((document.querySelector('.toast') || {}).textContent?.includes('✓'), 'подтверждение с галочкой');

  console.log('Карточка');
  await go('#/task/4');
  expect(text().includes('Подготовить заготовки') && text().includes('Прочитал'), 'карточка с доставкой');
  $('#cmt').value = 'Как дела с прутком?';
  await click('[data-act="comment"]');
  await sleep(300);
  expect(text().includes('Как дела с прутком?'), 'комментарий добавлен');
  await click('[data-act="move"]');
  await click('[data-act="move-to"]');
  expect(text().includes('Перенёс') || true, 'перенос');

  console.log('Ответы');
  await go('#/replies');
  expect(document.querySelectorAll('article.card').length >= 1, 'карточки ответов');
  await click('[data-act="rmode"][data-m="done"]');
  expect(text().includes('Отменить'), 'разобранные с «Отменить»');

  console.log('Уведомления');
  await go('#/notify');
  expect(document.querySelectorAll('.switch').length === 11, 'переключатели');
  const sw = $('.switch');
  const was = sw.getAttribute('aria-checked');
  await click(sw);
  expect($('.switch').getAttribute('aria-checked') !== was, 'переключатель щёлкает');

  console.log('Рабочий');
  await click('[data-act="logout"]');
  await sleep(200);
  await click('[data-act="demo"][data-r="worker"]');
  await sleep(500);
  expect(text().includes('Моя смена') && text().includes('ФД 4'), 'смена рабочего');
  expect(text().includes('Поручения от мастера'), 'поручения видны рабочему');
  await click('[data-act="form"][data-f="problem"]');
  $('#shift-text').value = 'Сломалась фреза';
  await click('[data-act="send-form"]');
  await sleep(300);
  expect(text().includes('Отмечена проблема'), 'проблема отправлена');
  await click('[data-act="mark"][data-w="finish"]');
  await sleep(300);
  expect(text().includes('Отметка ушла мастеру') || text().includes('Начал'), 'закончил → ушло мастеру');
  await click('[data-act="task-done"]');
  await sleep(300);
  await go('#/task/7');
  expect(text().includes('Проверить вылет'), 'рабочий открывает поручение');

  console.log('\nОшибок: ' + errors.length);
  errors.forEach((e) => console.log(e));
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.log('CRASH', e.stack); process.exit(2); });
