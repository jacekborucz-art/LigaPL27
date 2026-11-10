// Ruchy na ekranie składu: przeciąganie i wybór dwoma dotknięciami korzystają z tych samych reguł.
// Miejsce (loc) to { zone, idx?, id? }:
//   xi (idx slotu), bench (idx na ławce), out (id zawodnika spoza kadry meczowej),
//   benchAdd (wolne miejsce na końcu ławki), outZone (lista spoza kadry, czyli „zdejmij z ławki”).
// Czyste funkcje bez DOM, testowane w tests/tacticsMoves.test.mjs.
import { assign, removeFromBench } from '../engine/lineup.js';
import { isAvailable } from '../career/squad.js';

/** Tekst do atrybutów data-loc / data-drag: „xi:3”, „bench:0”, „out:<id>”, „benchAdd”, „outZone”. */
export function locKey(loc) {
  if (!loc) return '';
  if (loc.zone === 'xi' || loc.zone === 'bench') return `${loc.zone}:${loc.idx}`;
  if (loc.zone === 'out') return `out:${loc.id}`;
  return loc.zone;
}

export function parseLoc(key) {
  if (!key) return null;
  const i = key.indexOf(':');
  const zone = i < 0 ? key : key.slice(0, i);
  const rest = i < 0 ? '' : key.slice(i + 1);
  if (zone === 'xi' || zone === 'bench') {
    const idx = Number(rest);
    return Number.isInteger(idx) && idx >= 0 ? { zone, idx } : null;
  }
  if (zone === 'out') return rest ? { zone, id: rest } : null;
  if (zone === 'benchAdd' || zone === 'outZone') return { zone };
  return null;
}

export const sameLoc = (a, b) => !!a && !!b && locKey(a) === locKey(b);

/** Id zawodnika na danym miejscu albo null (puste miejsce, strefa). */
export function playerAt(tactics, loc) {
  if (!loc) return null;
  if (loc.zone === 'xi') return tactics.xi[loc.idx] ?? null;
  if (loc.zone === 'bench') return tactics.bench[loc.idx] ?? null;
  if (loc.zone === 'out') return loc.id;
  return null;
}

const offReason = (p) => (p.injuryDays > 0 ? 'kontuzja' : p.suspended > 0 ? 'zawieszenie' : p.callUp ? 'zgrupowanie reprezentacji' : p.onLoanOut ? 'wypożyczenie' : 'niedostępny');
const fail = (reason) => ({ ok: false, reason });

/**
 * Wynik przeniesienia zawodnika z miejsca src na miejsce dst.
 * Zwraca { ok: true, tactics, moved: [ids] } albo { ok: false, reason } (reason może być pusty,
 * gdy ruch po prostu nic nie zmienia). ctx: { byId: Map, benchSize }.
 */
export function resolveMove(tactics, src, dst, { byId, benchSize = 12 } = {}) {
  if (!src || !dst || sameLoc(src, dst)) return fail('');
  if (!['xi', 'bench', 'out'].includes(src.zone)) return fail('');
  const pid = playerAt(tactics, src);
  if (!pid) return fail('');
  const p = byId?.get(pid);
  if (!p) return fail('');
  const needAvailable = (pl) => (isAvailable(pl) ? null : fail(`${pl.name} nie może być w kadrze meczowej (${offReason(pl)}).`));
  const ok = (t, moved) => ({ ok: true, tactics: t, moved });

  if (dst.zone === 'xi') {
    if (dst.idx < 0 || dst.idx >= tactics.xi.length) return fail('');
    const other = tactics.xi[dst.idx] ?? null;
    if (src.zone === 'out') { const e = needAvailable(p); if (e) return e; }
    return ok(assign(tactics, { type: 'xi', idx: dst.idx }, pid), [pid, other].filter(Boolean));
  }

  if (dst.zone === 'bench') {
    const other = tactics.bench[dst.idx] ?? null;
    if (!other) return fail('');
    if (src.zone === 'out') { const e = needAvailable(p); if (e) return e; }
    if (src.zone === 'xi') { const o = byId.get(other); if (o && !isAvailable(o)) return fail(`${o.name} nie może wejść do jedenastki (${offReason(o)}).`); }
    return ok(assign(tactics, { type: 'bench', idx: dst.idx }, pid), [pid, other]);
  }

  if (dst.zone === 'out') {
    // Upuszczenie na zawodnika spoza kadry: on zajmuje miejsce przeciąganego.
    if (src.zone === 'out') return fail('');
    const o = byId.get(dst.id);
    if (!o) return fail('');
    const e = needAvailable(o); if (e) return e;
    const target = src.zone === 'xi' ? { type: 'xi', idx: src.idx } : { type: 'bench', idx: src.idx };
    return ok(assign(tactics, target, o.id), [o.id, pid]);
  }

  if (dst.zone === 'benchAdd') {
    if (src.zone === 'bench') return fail('');
    if (src.zone === 'xi') return fail('Miejsce w jedenastce zostałoby puste. Upuść zawodnika na kogoś z ławki, żeby ich zamienić.');
    const e = needAvailable(p); if (e) return e;
    if (tactics.bench.length >= benchSize) return fail(`Ławka jest pełna (${benchSize}). Upuść zawodnika na kogoś z ławki, żeby ich zamienić.`);
    return ok(assign(tactics, { type: 'bench', idx: tactics.bench.length }, pid), [pid]);
  }

  if (dst.zone === 'outZone') {
    if (src.zone === 'bench') return ok(removeFromBench(tactics, pid), [pid]);
    if (src.zone === 'xi') return fail('Miejsce w jedenastce zostałoby puste. Upuść na wybranego zawodnika, żeby go wstawić.');
    return fail('');
  }
  return fail('');
}

/**
 * Wybór dwoma dotknięciami: pierwsze miejsce (sel), potem drugie (loc). Próbuje ruchu sel -> loc,
 * a gdy ten nic nie daje, odwrotnego (np. puste miejsce w jedenastce, potem zawodnik z listy).
 */
export function resolveTap(tactics, sel, loc, ctx) {
  const a = resolveMove(tactics, sel, loc, ctx);
  if (a.ok) return a;
  const b = resolveMove(tactics, loc, sel, ctx);
  if (b.ok) return b;
  return a.reason ? a : b;
}
