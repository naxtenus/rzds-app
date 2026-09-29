import { parseLine, repeatText } from '../js/parse.js';
const people = [{ id: 'Слесарь', name: 'Слесарь' }, { id: 'Игошев', name: 'Игошев' }, { id: 'w1', name: 'Оператор фре1360' }];
const orders = [{ code: 'ФДЗ' }, { code: 'ВР-300' }, { code: 'ФД 4' }];
const now = new Date(2026, 8, 30, 10, 0); // ср 30.09.2026 10:00
let bad = 0;
const t = (line, exp) => {
  const r = parseLine(line, { people, orders, now });
  const got = { text: r.text, to: r.to, weight: r.weight, order: r.order, repeat: r.repeat,
    due: r.due ? r.due.getDate() + '.' + (r.due.getMonth() + 1) + ' ' + r.due.getHours() + ':' + String(r.due.getMinutes()).padStart(2, '0') : undefined };
  const diff = Object.keys(exp).filter((k) => String(exp[k]) !== String(got[k]));
  if (diff.length) { bad++; console.log('  ✗', line, '→', JSON.stringify(got), 'ждал', JSON.stringify(exp)); }
  else console.log('  ✓', line, '→', JSON.stringify(got));
};
t('заказать электроды завтра 15:00 слесарю срочно', { text: 'Заказать электроды', to: 'Слесарь', due: '1.10 15:00', weight: 'срочно' });
t('Проверить вылет фрезы по заказу ФДЗ в пятницу', { text: 'Проверить вылет фрезы', order: 'ФДЗ', due: '2.10 17:00' });
t('заточка каждый понедельник Игошеву', { text: 'Заточка', to: 'Игошев', repeat: 'нед:1' });
t('убрать стружку по пн и чт в 16', { text: 'Убрать стружку', repeat: 'нед:1,4', due: '1.10 16:00' });
t('отчёт каждое 15 число важно', { text: 'Отчёт', repeat: 'мес:15', weight: 'важно' });
t('позвонить заказчику вр-300 через 3 дня', { text: 'Позвонить заказчику', order: 'ВР-300', due: '3.10 17:00' });
t('купить перчатки 5.10 себе потом', { text: 'Купить перчатки', to: '', due: '5.10 17:00', weight: 'потом' });
t('сверить чертёж фд 4 к 9:30', { text: 'Сверить чертёж', order: 'ФД 4', due: '1.10 9:30' });
t('наладка оператору фре1360 сегодня в 14', { text: 'Наладка', to: 'w1', due: '30.9 14:00' });
t('просто задача без ничего', { text: 'Просто задача без ничего', to: undefined, due: undefined });
t('полить цветы ежедневно', { text: 'Полить цветы', repeat: 'день' });
t('проверить 12 сентября', { text: 'Проверить', due: '12.9 17:00' });
console.log(repeatText('нед:1,4'), '|', repeatText('мес:15'));
console.log(bad ? 'Упало: ' + bad : 'Всё сходится');
process.exit(bad ? 1 : 0);
