// System dnia „kibice” (etap 11): po systemie kariery (order 50, bilety liczone z attendanceModifier),
// przed regeneracją (order 90). Przetwarza mecze rozegrane do dziś i jeszcze nieoznaczone (f.fans),
// 1. dnia miesiąca ocenia miejsce w tabeli wobec oczekiwań kibiców. Logika: src/career/fans.js.
import { registerDailySystem } from '../core/gameLoop.js';
import { fansDay } from './fans.js';

registerDailySystem({
  id: 'fans', order: 55,
  run(game, date) {
    if (!game.season || !game.fixtures) return {};
    return { messages: fansDay(game, date) };
  },
});
