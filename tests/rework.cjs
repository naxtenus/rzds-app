// Доработки за поставщиков в приложении (11.10.2026): блок на «Сегодня»,
// счётчик «Начать / Закончить», экран #/rework — ручной ввод, правка,
// удаление. Только у владельца. Настоящий Chromium, размер телефона, демо.
//
// Запуск: python3 -m http.server 8765 (в корне rzds-app) и
//   node tests/rework.cjs
const { chromium } = require(process.env.PW_MODULE || '/home/claude/prodplan/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0, good = 0;
const expect = (cond, msg) => { if (cond) { good++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/app-rework-' + n + '.png', fullPage: true }); };
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-act="demo"][data-r="owner"]');
  await sleep(500);
  const text = () => page.evaluate(() => document.getElementById('app').textContent.replace(/\s+/g, ' '));

  console.log('Сегодня');
  expect(/Доработки за поставщиков/.test(await text()), 'блок «Доработки за поставщиков» на «Сегодня»');
  await page.click('[data-act="rw-open"][data-mode="start"]');
  await sleep(300);
  expect(await page.isVisible('.rwform'), 'форма начала открылась');
  await page.fill('#rw-what', 'зачистка облоя');
  await page.click('[data-act="rw-chip"][data-k="sup"][data-v="ООО Литейщик"]');
  await sleep(200);
  await page.click('[data-act="rw-chip"][data-k="where"][data-v="эро7745"]');
  await sleep(200);
  expect(await page.inputValue('#rw-what') === 'зачистка облоя', 'набранное «что» пережило нажатия на кнопки');
  expect(await page.getAttribute('[data-act="rw-chip"][data-k="sup"][data-v="ООО Литейщик"]', 'aria-pressed') === 'true', 'поставщик выбран кнопкой');
  await shot('1-форма');
  await page.click('[data-act="rw-save"]');
  await sleep(500);
  expect(await page.isVisible('.rw-run'), 'карточка идущей доработки');
  const run = await page.textContent('.rw-run');
  expect(/ООО Литейщик/.test(run) && /зачистка облоя/.test(run) && /эро7745/.test(run), 'в карточке поставщик, что и где: ' + run.replace(/\s+/g, ' ').slice(0, 90));
  await shot('2-идёт');

  console.log('Второй счётчик на том же месте — понятный отказ');
  await page.click('[data-act="rw-open"][data-mode="start"]');
  await sleep(200);
  await page.fill('#rw-sup', 'Другой');
  await page.click('[data-act="rw-chip"][data-k="where"][data-v="эро7745"]');
  await sleep(200);
  await page.click('[data-act="rw-save"]');
  await sleep(500);
  expect(/уже идёт/.test(await text()), 'отказ «уже идёт»');
  expect(await page.locator('.rw-run').count() === 1, 'идущая одна');

  console.log('Закончить');
  await page.click('.rw-run [data-act="rw-stop"]');
  await sleep(500);
  expect(!(await page.isVisible('.rw-run')), 'карточка ушла');
  expect(/За эту неделю: \d+/.test(await text()), 'итог недели');

  console.log('Экран #/rework');
  await page.click('a[href="#/rework"]');
  await sleep(400);
  expect(/зачистка облоя/.test(await text()), 'законченная — в списке');
  await page.click('[data-act="rw-open"][data-mode="manual"]');
  await sleep(300);
  await page.fill('#rw-sup', 'ИП Сварной');
  const p2 = (n) => String(n).padStart(2, '0');
  const d = new Date(Date.now() - 3 * 3600e3);
  await page.fill('#rw-start', `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`);
  await page.fill('#rw-h', '1'); await page.fill('#rw-m', '30');
  await shot('3-вручную');
  await page.click('[data-act="rw-save"]');
  await sleep(500);
  const t2 = await text();
  expect(/ИП Сварной/.test(t2) && /1 ч 30 мин/.test(t2), 'ручная запись: 1 ч 30 мин');
  expect(/Эта неделя по поставщикам/.test(t2), 'итоги недели по поставщикам');

  console.log('Правка постфактум');
  await page.click('.rw-row:has-text("ИП Сварной")');
  await sleep(300);
  expect(await page.isVisible('.rwform') && /Доработка №/.test(await page.textContent('.rwform')), 'форма правки');
  await page.fill('#rw-qty', '5');
  await page.fill('#rw-h', ''); await page.fill('#rw-m', '');
  await page.click('[data-act="rw-save"]');
  await sleep(500);
  expect(/5 шт/.test(await page.textContent('.rw-row:has-text("ИП Сварной")')), 'штуки поправлены');

  console.log('Убрать');
  await page.click('.rw-row:has-text("ИП Сварной")');
  await sleep(300);
  await page.click('[data-act="rw-drop"]');
  await sleep(500);
  expect(!/ИП Сварной/.test(await text()), 'запись убрана');
  await shot('4-список');

  console.log('Рабочему доработок не видно');
  await page.evaluate(() => { localStorage.removeItem('rzds-session'); location.hash = '#/'; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-act="demo"][data-r="worker"]');
  await sleep(500);
  expect(!/Доработки за поставщиков/.test(await text()), 'у рабочего блока нет');
  await page.evaluate(() => { location.hash = '#/rework'; });
  await sleep(300);
  expect(!/Доработки за поставщиков/.test(await text()), 'и экрана нет');

  expect(!errs.length, 'ошибок на странице нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\nИТОГ: успешно ${good}, с замечаниями ${bad}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
