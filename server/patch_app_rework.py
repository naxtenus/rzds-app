"""Доработки за поставщиков (11.10.2026): четыре вставки в живой App.gs.
Логика — в Код.gs планировщика (gas/Rework.gs): Прил_доработка_,
Прил_доработкиЧасть_. Повторный запуск ничего не удваивает.

  1. ПРИЛ_ПРАВКИ: rework — повтор нажатия по cid второй раз не выполняется;
  2. ЧАСТИ: rework — данных приложения (отметки, задачи) не трогает;
  3. действие 'rework' — только владельцу;
  4. вид владельца: rework — идущие, за две недели, поставщики.
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
PATCHES = [
    ("var ПРИЛ_ПРАВКИ = { downtime: 1,", "var ПРИЛ_ПРАВКИ = { downtime: 1, rework: 1,", "rework: 1,"),
    ("var ЧАСТИ = { downtime: '-',", "var ЧАСТИ = { downtime: '-', rework: '-',", "rework: '-',"),
    ("    case 'downtime': if (!вл) break; Прил_простой_(me, p); return сделано();\n",
     "    case 'downtime': if (!вл) break; Прил_простой_(me, p); return сделано();\n"
     "    case 'rework': if (!вл) break; Прил_доработка_(me, p); return сделано();\n",
     "Прил_доработка_(me, p)"),
    ("settings: Прил_настройкиВсе_(), checklists: чек, stops: часть.stops || [],\n",
     "settings: Прил_настройкиВсе_(), checklists: чек, stops: часть.stops || [],\n"
     "    rework: typeof Прил_доработкиЧасть_ === 'function' ? Прил_доработкиЧасть_() : null,\n",
     "Прил_доработкиЧасть_()"),
]
for anchor, repl, marker in PATCHES:
    if marker in s:
        print('уже есть:', marker); continue
    if s.count(anchor) != 1:
        raise SystemExit('якорь не найден ровно один раз: ' + anchor[:60])
    s = s.replace(anchor, repl)
    print('вставлено:', marker)
open(dst, 'w', encoding='utf-8').write(s)
