// Deterministyczny generator liczb losowych (mulberry32) z zapisywalnym stanem.
// Ta sama wartość ziarna daje zawsze ten sam przebieg gry, więc restart nie "przewija" wyniku.

export function hashString(str) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    this._spare = null;
  }

  /** Liczba z przedziału [0, 1). */
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Liczba całkowita z przedziału [min, max]. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Zdarzenie o prawdopodobieństwie p. */
  chance(p) {
    return this.next() < p;
  }

  /** Rozkład normalny (Box-Muller). */
  gauss(mean = 0, sd = 1) {
    if (this._spare !== null) {
      const v = this._spare;
      this._spare = null;
      return mean + sd * v;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this._spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  }

  /** Rozkład Poissona (metoda Knutha, wystarczająca dla małych lambda jak gole). */
  poisson(lambda) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Wybór ważony: items to tablica, weightFn zwraca wagę >= 0. */
  weighted(items, weightFn) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Niezależny strumień, np. dla kadry klubu zagranicznego: rng.fork('real-madryt:2026'). */
  fork(label) {
    return new Rng((hashString(label) ^ this.state) >>> 0);
  }

  toJSON() {
    return { state: this.state };
  }

  static fromJSON(data) {
    const r = new Rng(0);
    r.state = data.state >>> 0;
    return r;
  }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
