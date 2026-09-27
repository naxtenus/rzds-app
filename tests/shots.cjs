// Снимки экранов приложения в настоящем Chromium, размер iPhone 14.
const chromium = require('/tmp/jt/node_modules/@sparticuz/chromium');
const puppeteer = require('/tmp/jt/node_modules/puppeteer-core');
const OUT = process.argv[2] || '/tmp/shots';
const BASE = 'http://127.0.0.1:8765/';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.concat(['--no-sandbox']),
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const shot = async (name) => { await new Promise((r) => setTimeout(r, 450)); await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const click = async (sel) => { await page.click(sel); await new Promise((r) => setTimeout(r, 350)); };
  const go = async (h) => { await page.evaluate((h) => { location.hash = h; }, h); await new Promise((r) => setTimeout(r, 400)); };

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await shot('00-login');
  await click('[data-act="demo"][data-r="owner"]');
  await shot('01-today');
  await page.evaluate(() => window.scrollTo(0, 600)); await shot('01b-today-scrolled');
  await go('#/plan'); await shot('02-plan');
  await click('.lane .blk.problem'); await shot('02b-plan-sheet');
  await go('#/tasks'); await shot('03-tasks');
  await go('#/new');
  await page.type('[data-bind="text"]', 'Подготовить заготовки для ФДЗ');
  await click('[data-act="set"][data-k="to"][data-v="w3"]');
  await shot('04-new');
  await go('#/task/4'); await shot('05-card');
  await go('#/replies'); await shot('06-replies');
  await go('#/notify'); await shot('07-notify');
  await page.evaluate(() => { localStorage.removeItem('rzds-session'); });
  await go('#/'); await click('[data-act="demo"][data-r="worker"]');
  await shot('08-shift');
  await click('[data-act="mark"][data-w="finish"]').catch(() => {});
  await shot('08b-shift-after');
  await go('#/install'); await shot('09-install');
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await browser.close();
})().catch((e) => { console.log('CRASH', e.stack); process.exit(2); });
