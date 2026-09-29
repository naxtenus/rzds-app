// QR маршрутного листа: код → картинка → распознавание → код операции.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.location = { origin: 'https://naxtenus.github.io', pathname: '/rzds-app/', hash: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = globalThis;
const qrcode = require('../vendor/qrcode.js');
const jsQR = require('../vendor/jsQR.js');
const { opLink, codeFrom } = await import('../js/views/qr.js');

let bad = 0;
for (const code of ['ФДЗ-020', 'ВР300-040', 'РЗТ-02.00.000СБ/015', 'Op 7 №3']) {
  const q = qrcode(0, 'M'); q.addData(opLink(code)); q.make();
  const n = q.getModuleCount(), cell = 4, m = 16, size = n * cell + m * 2;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = ((m + r * cell + y) * size + (m + c * cell + x)) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  const got = jsQR(px, size, size);
  const back = got && codeFrom(got.data);
  const ok = back === code;
  if (!ok) bad++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + code + ' → ' + (got ? got.data : 'не распознан') + ' → ' + back + ' (версия QR ' + ((n - 17) / 4) + ')');
}
console.log(codeFrom('https://example.com/') === '' ? '  ✓ чужой код не принят' : (bad++, '  ✗ чужой код принят'));
console.log('Ошибок: ' + bad);
process.exit(bad ? 1 : 0);
