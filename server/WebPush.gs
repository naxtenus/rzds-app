/* =========================================================================
   PUSH-УВЕДОМЛЕНИЯ НА ТЕЛЕФОН (Web Push) — прямо из Apps Script.

   Зачем своё: чтобы не держать отдельный сервер (деньги, продления, ещё
   одно место, где может сломаться). Стандарт Web Push требует двух вещей,
   которых в Apps Script нет готовыми:
   — подпись VAPID (ECDSA на кривой P-256) — ей Apple и Google проверяют,
     что уведомление шлём именно мы;
   — шифрование содержимого (ECDH P-256 + HKDF + AES-128-GCM, RFC 8291),
     чтобы текст уведомления не читал никто по дороге.
   Всё это ниже на чистом JavaScript: кривая — на BigInt, AES — таблицами.
   Проверено в Node против эталонной расшифровки (tests/webpush.test.cjs).

   Снаружи нужны только три функции:
     ВебПуш_ключи_()           — пара ключей VAPID, создаётся один раз;
     ВебПуш_отправить_(sub, p) — отправить объект p на подписку sub;
     ВебПуш_публичный_()       — публичный ключ для приложения.
   ========================================================================= */

var WP = (function () {
  /* ------------------------------------------------ байты и кодировки */
  function u8(a) { var r = []; for (var i = 0; i < a.length; i++) r.push(a[i] & 255); return r; }
  function s8(a) { return a.map(function (x) { return x > 127 ? x - 256 : x; }); }
  function utf8(s) { return u8(Utilities.newBlob(s).getBytes()); }
  function concat() { var r = []; for (var i = 0; i < arguments.length; i++) r = r.concat(arguments[i]); return r; }
  function b64u(bytes) { return Utilities.base64EncodeWebSafe(s8(bytes)).replace(/=+$/, ''); }
  function unb64u(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return u8(Utilities.base64Decode(s));
  }
  function sha256(bytes) { return u8(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s8(bytes))); }
  function hmac(key, data) { return u8(Utilities.computeHmacSha256Signature(s8(data), s8(key))); }
  /* Случайность: Apps Script не даёт криптографического генератора,
     поэтому смешиваем несколько UUID (они из SecureRandom) через SHA-256. */
  function random(n) {
    var out = [];
    while (out.length < n) {
      out = out.concat(sha256(utf8(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random())));
    }
    return out.slice(0, n);
  }
  function toBig(bytes) { var x = 0n; for (var i = 0; i < bytes.length; i++) x = (x << 8n) | BigInt(bytes[i]); return x; }
  function fromBig(x, len) { var r = []; for (var i = 0; i < len; i++) { r.unshift(Number(x & 255n)); x >>= 8n; } return r; }

  /* --------------------------------------------------- кривая P-256 */
  var P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
  var N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  var A = P - 3n;
  var B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
  var G = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
           0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];
  function mod(a, m) { a %= m; return a < 0n ? a + m : a; }
  function inv(a, m) {
    var lm = 1n, hm = 0n, low = mod(a, m), high = m;
    while (low > 1n) { var r = high / low; var nm = hm - lm * r, nw = high - low * r; hm = lm; lm = nm; high = low; low = nw; }
    return mod(lm, m);
  }
  /* Якобиевы координаты: без деления на каждом шаге — в разы быстрее. */
  function jDouble(p) {
    if (p[1] === 0n) return [0n, 0n, 0n];
    var X = p[0], Y = p[1], Z = p[2];
    var ysq = mod(Y * Y, P), S = mod(4n * X * ysq, P);
    var Z2 = mod(Z * Z, P), M = mod(3n * (X - Z2) * (X + Z2), P);
    var nx = mod(M * M - 2n * S, P);
    var ny = mod(M * (S - nx) - 8n * ysq * ysq, P);
    return [nx, ny, mod(2n * Y * Z, P)];
  }
  function jAdd(p, q) {
    if (p[2] === 0n) return q; if (q[2] === 0n) return p;
    var Z1s = mod(p[2] * p[2], P), Z2s = mod(q[2] * q[2], P);
    var U1 = mod(p[0] * Z2s, P), U2 = mod(q[0] * Z1s, P);
    var S1 = mod(p[1] * Z2s * q[2], P), S2 = mod(q[1] * Z1s * p[2], P);
    if (U1 === U2) return S1 === S2 ? jDouble(p) : [0n, 1n, 0n];
    var H = mod(U2 - U1, P), R = mod(S2 - S1, P);
    var H2 = mod(H * H, P), H3 = mod(H * H2, P), U1H2 = mod(U1 * H2, P);
    var nx = mod(R * R - H3 - 2n * U1H2, P);
    var ny = mod(R * (U1H2 - nx) - S1 * H3, P);
    return [nx, ny, mod(H * p[2] * q[2], P)];
  }
  function mul(pt, k) {
    var R = [0n, 1n, 0n], Q = [pt[0], pt[1], 1n];
    while (k > 0n) { if (k & 1n) R = jAdd(R, Q); Q = jDouble(Q); k >>= 1n; }
    if (R[2] === 0n) throw new Error('точка на бесконечности');
    var zi = inv(R[2], P), zi2 = mod(zi * zi, P);
    return [mod(R[0] * zi2, P), mod(R[1] * zi2 * zi, P)];
  }
  function onCurve(pt) { return mod(pt[1] * pt[1] - (pt[0] * pt[0] * pt[0] + A * pt[0] + B), P) === 0n; }
  function pubBytes(pt) { return concat([4], fromBig(pt[0], 32), fromBig(pt[1], 32)); }
  function parsePub(bytes) {
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('ключ подписки неверного вида');
    var pt = [toBig(bytes.slice(1, 33)), toBig(bytes.slice(33))];
    if (!onCurve(pt)) throw new Error('ключ подписки не лежит на кривой P-256');
    return pt;
  }
  function newKey() {
    var d;
    do { d = mod(toBig(random(32)), N); } while (d === 0n);
    return { d: d, pub: pubBytes(mul(G, d)) };
  }

  /* ECDSA с детерминированным nonce (RFC 6979): не зависит от качества
     случайных чисел — плохая случайность при подписи выдаёт ключ. */
  function sign(msg, d) {
    var h = sha256(msg), e = mod(toBig(h), N);
    var x = fromBig(d, 32), hb = fromBig(e, 32);
    var V = [], K = [];
    for (var i = 0; i < 32; i++) { V.push(1); K.push(0); }
    K = hmac(K, concat(V, [0], x, hb)); V = hmac(K, V);
    K = hmac(K, concat(V, [1], x, hb)); V = hmac(K, V);
    for (;;) {
      V = hmac(K, V);
      var k = toBig(V);
      if (k > 0n && k < N) {
        var r = mod(mul(G, k)[0], N);
        if (r !== 0n) {
          var s = mod(inv(k, N) * (e + r * d), N);
          if (s !== 0n) return concat(fromBig(r, 32), fromBig(s, 32));
        }
      }
      K = hmac(K, concat(V, [0])); V = hmac(K, V);
    }
  }

  /* ----------------------------------------------------------- AES-128 */
  var SBOX = (function () {
    var s = new Array(256), p = 1, q = 1;
    do {
      p = p ^ ((p << 1) & 255) ^ (p & 0x80 ? 0x1b : 0);
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 0x80) q ^= 0x09;
      var x = q ^ ((q << 1 | q >> 7) & 255) ^ ((q << 2 | q >> 6) & 255) ^ ((q << 3 | q >> 5) & 255) ^ ((q << 4 | q >> 4) & 255);
      s[p] = (x ^ 0x63) & 255;
    } while (p !== 1);
    s[0] = 0x63;
    return s;
  })();
  function xt(b) { return ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 255; }
  function expand(key) {
    var w = key.slice(), rcon = 1;
    for (var i = 16; i < 176; i += 4) {
      var t = w.slice(i - 4, i);
      if (i % 16 === 0) { t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]; rcon = xt(rcon); }
      for (var j = 0; j < 4; j++) w.push(w[i - 16 + j] ^ t[j]);
    }
    return w;
  }
  function aesBlock(w, inp) {
    var s = inp.map(function (b, i) { return b ^ w[i]; });
    for (var round = 1; round <= 10; round++) {
      var t = new Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) t[c * 4 + r] = SBOX[s[((c + r) % 4) * 4 + r]];
      if (round < 10) {
        for (c = 0; c < 4; c++) {
          var a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3], all = a0 ^ a1 ^ a2 ^ a3;
          t[c * 4] ^= all ^ xt(a0 ^ a1); t[c * 4 + 1] ^= all ^ xt(a1 ^ a2);
          t[c * 4 + 2] ^= all ^ xt(a2 ^ a3); t[c * 4 + 3] ^= all ^ xt(a3 ^ a0);
        }
      }
      for (var i = 0; i < 16; i++) t[i] ^= w[round * 16 + i];
      s = t;
    }
    return s;
  }
  /* GCM: счётчик для шифрования, GHASH для печати подлинности. */
  function gmul(X, Y) {
    var Z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], V = Y.slice();
    for (var i = 0; i < 128; i++) {
      if ((X[i >> 3] >> (7 - (i & 7))) & 1) for (var j = 0; j < 16; j++) Z[j] ^= V[j];
      var lsb = V[15] & 1;
      for (j = 15; j > 0; j--) V[j] = (V[j] >> 1) | ((V[j - 1] & 1) << 7);
      V[0] >>= 1;
      if (lsb) V[0] ^= 0xe1;
    }
    return Z;
  }
  function gcmEncrypt(key, iv, plain) {
    var w = expand(key), H = aesBlock(w, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    var J0 = concat(iv, [0, 0, 0, 1]);
    var ct = [], ctr = J0.slice();
    for (var off = 0; off < plain.length; off += 16) {
      for (var k = 15; k >= 12; k--) { ctr[k] = (ctr[k] + 1) & 255; if (ctr[k]) break; }
      var ks = aesBlock(w, ctr);
      for (var i = 0; i < 16 && off + i < plain.length; i++) ct.push(plain[off + i] ^ ks[i]);
    }
    var Y = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (off = 0; off < ct.length; off += 16) {
      var blk = ct.slice(off, off + 16); while (blk.length < 16) blk.push(0);
      for (i = 0; i < 16; i++) Y[i] ^= blk[i];
      Y = gmul(Y, H);
    }
    var lenBlk = concat([0, 0, 0, 0, 0, 0, 0, 0], fromBig(BigInt(ct.length * 8), 8));
    for (i = 0; i < 16; i++) Y[i] ^= lenBlk[i];
    Y = gmul(Y, H);
    var ek = aesBlock(w, J0);
    return concat(ct, Y.map(function (b, i) { return b ^ ek[i]; }));
  }

  /* ------------------------------------------- шифрование RFC 8291 */
  function encrypt(sub, text) {
    var ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
    var uaPt = parsePub(ua);
    var eph = newKey(), salt = random(16);
    var shared = fromBig(mul(uaPt, eph.d)[0], 32);
    var prkKey = hmac(auth, shared);
    var ikm = hmac(prkKey, concat(utf8('WebPush: info'), [0], ua, eph.pub, [1]));
    var prk = hmac(salt, ikm);
    var cek = hmac(prk, concat(utf8('Content-Encoding: aes128gcm'), [0], [1])).slice(0, 16);
    var nonce = hmac(prk, concat(utf8('Content-Encoding: nonce'), [0], [1])).slice(0, 12);
    var body = gcmEncrypt(cek, nonce, concat(utf8(text), [2]));
    var header = concat(salt, [0, 0, 16, 0], [65], eph.pub); // rs = 4096
    return concat(header, body);
  }

  function vapidJwt(aud, keys, subject) {
    var head = b64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    var claims = b64u(utf8(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
    var unsigned = head + '.' + claims;
    return unsigned + '.' + b64u(sign(utf8(unsigned), toBig(unb64u(keys.d))));
  }

  return {
    newKeys: function () { var k = newKey(); return { d: b64u(fromBig(k.d, 32)), pub: b64u(k.pub) }; },
    encrypt: encrypt, vapidJwt: vapidJwt, b64u: b64u, unb64u: unb64u,
    _test: { mul: mul, G: G, sign: sign, gcmEncrypt: gcmEncrypt, sha256: sha256, toBig: toBig, fromBig: fromBig },
  };
})();

/* -------------------------------------------------------------- снаружи */

/* Ключи VAPID создаются один раз и живут в свойствах скрипта. Сменить их —
   значит отписать все телефоны: каждому придётся снова нажать «Включить
   уведомления». Поэтому сами по себе они не меняются никогда. */
function ВебПуш_ключи_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('VAPID_KEYS');
  if (raw) return JSON.parse(raw);
  var k = WP.newKeys();
  props.setProperty('VAPID_KEYS', JSON.stringify(k));
  return k;
}

function ВебПуш_публичный_() { return ВебПуш_ключи_().pub; }

/* Отправить одно уведомление. p = { title, body, url, tag, kind, badge }.
   Возвращает 'ok', 'gone' (подписка умерла — удалить) или текст ошибки. */
function ВебПуш_отправить_(sub, p, опции) {
  опции = опции || {};
  var endpoint = String(sub.endpoint || '');
  var m = endpoint.match(/^https:\/\/[^\/]+/);
  if (!m) return 'нет адреса подписки';
  var keys = ВебПуш_ключи_();
  var jwtCache = CacheService.getScriptCache();
  var cacheKey = 'vapid:' + m[0];
  var jwt = jwtCache.get(cacheKey);
  if (!jwt) {
    jwt = WP.vapidJwt(m[0], keys, 'mailto:' + (опции.почта || 'naxtenus@gmail.com'));
    jwtCache.put(cacheKey, jwt, 6 * 3600);
  }
  var body = WP.encrypt(sub, JSON.stringify(p));
  var headers = {
    'Authorization': 'vapid t=' + jwt + ', k=' + keys.pub,
    'Content-Encoding': 'aes128gcm',
    'TTL': String(опции.ttl || 24 * 3600),
    'Urgency': p.kind === 'problem' ? 'high' : 'normal',
  };
  /* Topic: новое уведомление с тем же ярлыком заменяет старое в очереди,
     пока телефон был без связи, — не копим десять «план изменился». */
  var topic = p.tag ? String(p.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : '';
  if (topic) headers['Topic'] = topic;
  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/octet-stream',
    payload: body.map(function (x) { return x > 127 ? x - 256 : x; }),
    headers: headers,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 200 && code < 300) return 'ok';
  if (code === 404 || code === 410) return 'gone';
  return 'ошибка ' + code + ': ' + String(res.getContentText()).slice(0, 200);
}
