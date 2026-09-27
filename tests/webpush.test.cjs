// Проверка WebPush.gs в Node: независимая расшифровка средствами node:crypto.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => b & 255));
const props = {};
const ctx = {
  BigInt, Date, Math, JSON, String, Number, Array, Error, console,
  Utilities: {
    newBlob: (s) => ({ getBytes: () => signed(Buffer.from(s, 'utf8')) }),
    base64EncodeWebSafe: (a) => unsigned(a).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64Decode: (s) => signed(Buffer.from(s, 'base64')),
    computeDigest: (_alg, a) => signed(crypto.createHash('sha256').update(unsigned(a)).digest()),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', unsigned(k)).update(unsigned(v)).digest()),
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../server/WebPush.gs', 'utf8') + '\nthis.WP = WP; this.keys = ВебПуш_ключи_;', ctx);
const WP = ctx.WP;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };

// 1. AES-128-GCM против node:crypto
for (const len of [0, 1, 15, 16, 17, 100, 3000]) {
  const key = crypto.randomBytes(16), iv = crypto.randomBytes(12), pt = crypto.randomBytes(len);
  const c = crypto.createCipheriv('aes-128-gcm', key, iv);
  const ref = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  const mine = Buffer.from(WP._test.gcmEncrypt(Array.from(key), Array.from(iv), Array.from(pt)));
  ok(ref.equals(mine), `AES-128-GCM совпадает с эталоном, ${len} байт`);
}

// 2. Точка на кривой: наш публичный ключ = ключ node для того же секрета
const k = WP.newKeys();
const ecdh = crypto.createECDH('prime256v1');
ecdh.setPrivateKey(Buffer.from(WP.unb64u(k.d)));
ok(ecdh.getPublicKey().equals(Buffer.from(WP.unb64u(k.pub))), 'умножение на кривой P-256 совпадает с node');

// 3. ECDSA-подпись (VAPID) проверяется node:crypto
const jwt = WP.vapidJwt('https://web.push.apple.com', k, 'mailto:test@example.com');
const [h, p, s] = jwt.split('.');
const jwk = { kty: 'EC', crv: 'P-256', x: Buffer.from(WP.unb64u(k.pub).slice(1, 33)).toString('base64url'), y: Buffer.from(WP.unb64u(k.pub).slice(33)).toString('base64url') };
const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
const verified = crypto.verify('sha256', Buffer.from(h + '.' + p), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
ok(verified, 'подпись VAPID (ES256) проверена node:crypto');
ok(JSON.parse(Buffer.from(p, 'base64url')).aud === 'https://web.push.apple.com', 'aud в JWT верный');

// 4. Полный цикл: шифруем на «подписку», расшифровываем как браузер (RFC 8291)
function decrypt(body, uaEcdh, auth) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const shared = uaEcdh.computeSecret(asPub);
  const hm = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const prkKey = hm(auth, shared);
  const ikm = hm(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaEcdh.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hm(salt, ikm);
  const cek = hm(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hm(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  if (pt[pt.length - 1] !== 2) throw new Error('нет разделителя последней записи');
  return { rs, text: pt.subarray(0, pt.length - 1).toString('utf8') };
}
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
const msg = JSON.stringify({ title: 'Проблема: эро7745 стоит', body: 'ВР-300 · электрод изношен. Нажмите, чтобы решить.', url: '#/replies', kind: 'problem' });
const t0 = Date.now();
const body = Buffer.from(WP.encrypt(sub, msg));
const dt = Date.now() - t0;
const out = decrypt(body, ua, auth);
ok(out.text === msg, 'браузер расшифровал уведомление, текст совпал (кириллица цела)');
ok(out.rs === 4096, 'размер записи 4096');
console.log(`  шифрование одного уведомления: ${dt} мс (в Node; в Apps Script медленнее в несколько раз)`);

// 5. Чужая подписка не расшифрует
try { const other = crypto.createECDH('prime256v1'); other.generateKeys(); decrypt(body, other, auth); ok(false, 'чужой ключ не должен расшифровать'); }
catch (e) { ok(true, 'чужой ключ расшифровать не может'); }

// 6. Ключи VAPID создаются один раз
const a = ctx.keys(), b = ctx.keys();
ok(a.pub === b.pub && a.pub.length === 87, 'ключи VAPID постоянные, публичный — 65 байт');

console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nВсё сходится');
process.exit(fails ? 1 : 0);
