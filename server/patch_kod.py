"""Вставляет в живой Код.gs три крючка приложения. Каждый — одна-две строки,
ничего из существующего не меняется. Повторный запуск ничего не удваивает.

  1. doPost: запросы приложения (…/exec?app=1) уходят в Прил_doPost_.
  2. Уведомить_: всё, что уходит владельцу в Телеграм, дублируется push.
  3. Меню таблицы: пункт «Вход в приложение на телефон».
  4. doGet: …/exec?appcode=1 — страница с кодом владельцу (с телефона).
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()

PATCHES = [
    ("function doPost(e) {\n  var p = (e && e.parameter) || {};\n",
     "function doPost(e) {\n  var p = (e && e.parameter) || {};\n"
     "  /* Приложение на телефон — свой вход, свой замок (сессия). См. App.gs. */\n"
     "  if (s_(p.app) === '1') return Прил_doPost_(e);\n",
     "if (s_(p.app) === '1') return Прил_doPost_(e);"),
    ("function Уведомить_(text, kind, кнопки) {\n  var t = s_(text);\n  if (!t) return 'пустое сообщение';\n",
     "function Уведомить_(text, kind, кнопки) {\n  var t = s_(text);\n  if (!t) return 'пустое сообщение';\n"
     "  /* Дубль push-уведомлением на телефон (App.gs) — ДО проверки токена бота:\n"
     "     push нужен и тогда, когда Телеграм не подключён или недоступен. */\n"
     "  try { Прил_пушВладельцу_(t, kind); } catch (err) { Logger.log('push владельцу: %s', err); }\n",
     "Прил_пушВладельцу_(t, kind)"),
    ("    .addItem('Мои задачи', 'Меню_задачи')\n",
     "    .addItem('Мои задачи', 'Меню_задачи')\n    .addItem('Вход в приложение на телефон', 'Меню_вход_в_приложение')\n",
     "Меню_вход_в_приложение'"),
]

PATCHES.append((
    "  var t = HtmlService.createTemplateFromFile('Index');\n",
    "  /* Код входа в приложение на телефон — владельцу, прямо с телефона (App.gs). */\n"
    "  if (p.appcode) return Прил_кодСтраница_(role);\n\n"
    "  var t = HtmlService.createTemplateFromFile('Index');\n",
    "Прил_кодСтраница_(role)"))

for anchor, repl, marker in PATCHES:
    if marker in s:
        print('уже есть:', marker)
        continue
    n = s.count(anchor)
    if n != 1:
        sys.exit('якорь найден %d раз(а): %r' % (n, anchor[:60]))
    s = s.replace(anchor, repl)
    print('вставлено:', marker)

open(dst, 'w', encoding='utf-8').write(s)
