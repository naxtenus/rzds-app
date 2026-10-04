/* «Исходящие» — нажатия, которые не дошли до сервера.

   В цеху связь пропадает: подвал, железный ангар, телефон в кармане
   переключился с Wi-Fi на сотовую. Раньше «Начал» без сети откатывался с
   надписью «Нет связи» — и рабочий либо жал ещё раз, либо забывал. Теперь
   нажатие остаётся на экране, ложится сюда, в память телефона, и уходит
   само, как только появится сеть: при возврате в приложение, раз в 20
   секунд и по событию «сеть появилась».

   У каждого нажатия свой номер (cid). Если ответ сервера потерялся уже
   ПОСЛЕ записи, повтор с тем же номером сервер узнаёт и второй раз дело
   не делает — второй задачи или второго «Начал» не будет.

   Отправляются строго по порядку: «Начал» раньше «Закончил». */

import { esc, icon, hhmm } from './util.js';

const KEY = 'rzds-outbox';

/* Что можно отложить. Вход, выдача кодов, подписка на уведомления —
   нельзя: их результат нужен сразу, на экране. */
export const QUEUEABLE = new Set(['mark', 'taskSave', 'taskUpdate', 'taskComment', 'taskRead',
  'decide', 'undecide', 'settingsSave', 'checklistSave', 'taskCheck', 'orderSay', 'downtime']);

export const outbox = {
  list() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } },
  save(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} },
  add(x) { const l = this.list(); l.push(x); this.save(l); },
  update(x) { this.save(this.list().map((y) => (y.cid === x.cid ? x : y))); },
  remove(cid) { this.save(this.list().filter((x) => x.cid !== cid)); },
  clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
  get size() { return this.list().length; },
};

export const newCid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

/* Подпись для списка: что это было, словами. */
export function describe(action, payload) {
  const p = payload || {};
  const W = { start: 'Начал', finish: 'Закончил', problem: 'Проблема', comment: 'Комментарий', pause: 'Пауза', resume: 'Продолжил' };
  switch (action) {
    case 'mark': return (W[p.what] || 'Отметка') + ' · ' + (p.op || '') + (p.text ? ' — «' + p.text + '»' : '') + (p.photo ? ' · фото' : '');
    case 'taskSave': return (p.task && p.task.to ? 'Поручение: ' : 'Задача: ') + ((p.task && p.task.text) || '');
    case 'taskUpdate':
      if (p.state === 'закрыта') return 'Задача №' + p.n + ' — выполнена';
      if (p.state === 'открыта') return 'Задача №' + p.n + ' — вернуть в работу';
      if (p.state === 'убрана') return 'Задача №' + p.n + ' — убрать';
      if (p.taken) return 'Поручение №' + p.n + ' — взял в работу';
      if (p.due !== undefined) return 'Задача №' + p.n + ' — новый срок';
      if (p.to !== undefined) return 'Задача №' + p.n + ' — другой исполнитель';
      if (p.items !== undefined) return 'Задача №' + p.n + ' — пункты';
      if (p.repeat !== undefined) return 'Задача №' + p.n + ' — повтор';
      return 'Задача №' + p.n + ' — правка';
    case 'taskComment': return 'Комментарий к №' + p.n + ': «' + (p.text || '') + '»';
    case 'taskCheck': return 'Пункт в №' + p.n + (p.done ? ' — отмечен' : ' — снят');
    case 'orderSay': return 'Заказ ' + (p.order || '') + ': «' + (p.text || 'фото') + '»';
    case 'taskRead': return 'Прочитал поручение №' + p.n;
    case 'downtime': return (p.on ? 'Станок стоит · ' : 'Станок снова работает · ') + (p.machine || '') + (p.on && p.reason ? ' — ' + p.reason : '');
    case 'decide': return (p.yes ? 'Принять' : 'Отклонить') + ' ответ со смены';
    case 'undecide': return 'Вернуть ответ на решение';
    case 'settingsSave': return 'Настройки уведомлений';
    case 'checklistSave': return 'Чек-лист: ' + (p.res === 'все' ? 'все станки' : p.res);
    default: return action;
  }
}

/* Плашка сверху: сколько ждёт. Нажатие — список. */
export function chip(n, sending) {
  if (!n) return '';
  return `<button class="outbox-chip" data-act="ob-open" aria-label="Ждут отправки: ${n}">
    ${sending ? '<i class="spinner" aria-hidden="true"></i>' : icon.clock(16)} Ждёт отправки: ${n}</button>`;
}

export function sheet(list, sending, err) {
  return `<div class="ob-back" data-act="ob-close"></div>
  <section class="ob-sheet" role="dialog" aria-label="Исходящие">
    <div class="row-between"><h2 class="h2" style="margin:0">Исходящие</h2>
      <button class="link-btn" data-act="ob-close">Закрыть</button></div>
    <p class="small muted" style="margin:0">Сохранено в телефоне. Уйдёт само, как появится связь${err ? ` · последний раз: ${esc(err)}` : ''}.</p>
    <div class="list">${list.map((x) => `<div class="ob-item">
      <div style="flex:1;min-width:0"><div class="strong">${esc(x.label)}</div>
        <div class="small muted">нажато в ${hhmm(x.at)}${x.tries ? ' · попыток ' + x.tries : ''}</div></div>
      <button class="link-btn" data-act="ob-drop" data-cid="${esc(x.cid)}" style="color:#B3261E">Убрать</button>
    </div>`).join('')}</div>
    <button class="btn primary tall" data-act="ob-send" ${sending ? 'disabled' : ''}>${sending ? '<i class="spinner"></i> Отправляю…' : 'Отправить сейчас'}</button>
  </section>`;
}
