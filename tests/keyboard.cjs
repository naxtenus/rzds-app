// Быстрый набор в поле «Что сделать» (жалоба 11.10: «долгий отклик и путает
// буквы, если быстро печатать»). Причина была в том, что экран при каждой
// паузе в наборе перерисовывался целиком и поле пересоздавалось под пальцами.
// Проверка: настоящий Chromium, размер телефона, набор без задержек и с
// перерисовками посреди набора (фоновое обновление, всплывающая строка) —
// поле должно остаться ТЕМ ЖЕ узлом, без потери фокуса, текст — буква в букву.
//
// Запуск: python3 -m http.server 8765 (в корне rzds-app) и
//   node tests/keyboard.cjs
const { chromium } = require(process.env.PW_MODULE || '/home/claude/prodplan/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0, good = 0;
const expect = (cond, msg) => { if (cond) { good++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('[data-act="demo"][data-r="owner"]');
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/new'; });
  await sleep(400);

  console.log('Новая задача: быстрый набор');
  await page.focus('[data-bind="text"]');
  await page.evaluate(() => {
    const ta = document.querySelector('[data-bind="text"]');
    ta.__метка = 1;
    window.__blur = 0;
    ta.addEventListener('blur', () => { window.__blur++; });
  });
  const фраза = 'заказать электроды завтра 15:00 слесарю срочно и проверить фрезу Ø12 на эро7745';
  // Печатаем кусками с паузами чуть больше прежней задержки (120 мс) —
  // ровно тот режим, в котором экран раньше пересоздавал поле.
  const куски = фраза.match(/.{1,7}/g);
  for (const к of куски) { await page.keyboard.type(к, { delay: 5 }); await sleep(140); }
  await sleep(300);
  const r = await page.evaluate(() => {
    const ta = document.querySelector('[data-bind="text"]');
    return { same: ta.__метка === 1, value: ta.value, focus: document.activeElement === ta, blur: window.__blur,
      parsed: (document.querySelector('.parsed') || {}).textContent || '' };
  });
  expect(r.value === фраза, 'текст буква в букву: «' + r.value + '»');
  expect(r.same, 'поле — тот же узел, не пересоздано');
  expect(r.focus && r.blur === 0, 'фокус не терялся (blur: ' + r.blur + ')');
  expect(/Понял/.test(r.parsed), 'разбор строки работает: ' + r.parsed.slice(0, 60));
  const кнопки = await page.evaluate(() => [...document.querySelectorAll('[data-act="set"][aria-pressed="true"]')].map((b) => b.dataset.k + '=' + b.dataset.v));
  expect(кнопки.includes('weight=срочно'), 'кнопки встали по разбору: ' + кнопки.join(', '));

  console.log('Перерисовка посреди набора (фоновое обновление)');
  await page.evaluate(() => { document.querySelector('[data-bind="text"]').__метка = 2; });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.type('абв', { delay: 3 });
    await page.evaluate(() => import('./js/store.js').then((m) => m.store.say('проверка', 'ok')));
  }
  await sleep(300);
  const r2 = await page.evaluate(() => {
    const ta = document.querySelector('[data-bind="text"]');
    return { same: ta.__метка === 2, end: ta.value.slice(-18), focus: document.activeElement === ta, blur: window.__blur,
      caret: ta.selectionStart === ta.value.length };
  });
  expect(r2.end === 'абвабвабвабвабвабв', 'набранное при перерисовках на месте: «' + r2.end + '»');
  expect(r2.same && r2.focus && r2.blur === 0, 'поле то же, фокус на месте');
  expect(r2.caret, 'курсор в конце текста');

  console.log('Другие поля с набором тоже не пересоздаются');
  await page.evaluate(() => { location.hash = '#/task/4'; });
  await sleep(400);
  const есть = await page.$('#cmt');
  if (есть) {
    await page.focus('#cmt');
    await page.evaluate(() => { document.querySelector('#cmt').__метка = 3; });
    for (let i = 0; i < 4; i++) {
      await page.keyboard.type('где фреза ', { delay: 3 });
      await page.evaluate(() => import('./js/store.js').then((m) => m.store.emit()));
    }
    await sleep(200);
    const r3 = await page.evaluate(() => { const c = document.querySelector('#cmt'); return { same: c.__метка === 3, v: c.value }; });
    expect(r3.same && r3.v === 'где фреза где фреза где фреза где фреза ', 'комментарий к задаче: поле то же, текст цел');
  } else expect(false, 'на карточке задачи нет поля комментария #cmt');

  console.log('Поле переживает перерисовку — то, что очищалось само, очищается');
  await page.evaluate(() => { location.hash = '#/new'; });
  await sleep(400);
  await page.focus('#it-new');
  await page.keyboard.type('снять заусенцы', { delay: 3 });
  await page.keyboard.press('Enter');
  await sleep(300);
  await page.keyboard.type('промыть', { delay: 3 });
  await page.keyboard.press('Enter');
  await sleep(300);
  const r4 = await page.evaluate(() => ({ v: document.querySelector('#it-new').value,
    items: [...document.querySelectorAll('.list .kv .v')].map((x) => x.textContent) }));
  expect(r4.v === '' && r4.items.join('|') === 'снять заусенцы|промыть', 'пункты добавились по одному, поле чистое: ' + r4.items.join('|'));

  console.log('Кнопки «+» у количества меняют значение в поле с фокусом');
  await page.evaluate(() => { localStorage.removeItem('rzds-session'); location.hash = '#/'; });
  await sleep(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-act="demo"][data-r="worker"]');
  await sleep(500);
  const закончил = await page.$('[data-act="form"][data-f="finish"]');
  if (закончил) {
    await закончил.click(); await sleep(400);
    await page.focus('#fin-qty');
    await page.keyboard.press('Control+A'); await page.keyboard.type('3');
    /* На айфоне нажатие кнопки не забирает фокус у поля — так и жмём. */
    await page.evaluate(() => document.querySelector('[data-act="step"][data-k="qty"][data-v="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await sleep(300);
    const q = await page.evaluate(() => [document.querySelector('#fin-qty').value, document.activeElement && document.activeElement.id]);
    expect(q[0] === '4' && q[1] === 'fin-qty', 'набрали 3, нажали «+» (фокус в поле) — стало ' + q[0]);
  } else expect(false, 'у рабочего нет кнопки «Закончил»');

  expect(!errs.length, 'ошибок на странице нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\nИТОГ: успешно ${good}, с замечаниями ${bad}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
