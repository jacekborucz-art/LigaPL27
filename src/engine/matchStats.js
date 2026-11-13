// Statystyki meczu w pełnym silniku liczone WYŁĄCZNIE ze zdarzeń symulacji.
// Silnik minutowy dopisuje zdarzenia do dziennika; ekran statystyk, oceny i tabele
// czytają tylko wynik tej funkcji. Nie ma osobnych, "dekoracyjnych" liczników.

export const EVENT_TYPES = [
  'pass', 'passFail', 'keyPass', 'tackle', 'interception', 'clearance', 'throwIn', 'goalKick',
  'freeKick', 'corner', 'shotOff', 'shotBlocked', 'shotOn', 'save', 'goal', 'post', 'offside',
  'foul', 'yellow', 'red', 'penalty', 'varCheck', 'varOverturn', 'sub', 'injury', 'possessionMinute',
  // Zdarzenia sytuacyjne bez wpływu na liczniki statystyk (relacja, popupy UI, studio): docs/sytuacje-meczowe.md
  'gkSwitch', 'gkUp', 'tactic', 'shout', 'penaltyRetake', 'staffCard', 'coolingBreak', 'abandoned', 'shootoutKick',
  'addedTime', 'kickoff', 'half', 'end',
  'penaltyClaim', // protest w polu karnym bez gwizdka (VAR czasem analizuje)
  'defError', // błąd obrony (zmęczenie, gra poza pozycją); strzał po nim liczy się osobnym zdarzeniem
];

const empty = () => ({
  goals: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0, xg: 0,
  passes: 0, passesCompleted: 0, keyPasses: 0, tackles: 0, interceptions: 0, clearances: 0,
  throwIns: 0, goalKicks: 0, freeKicks: 0, corners: 0, offsides: 0, fouls: 0,
  yellow: 0, red: 0, saves: 0, penalties: 0, possessionMinutes: 0,
});

/**
 * events: [{ type, side: 0|1, xg?, share? }]
 *  - pass: udane podanie, passFail: nieudane (jedno zdarzenie = jedno podanie; silnik może
 *    zapisać pakiet { type:'pass', count:n } dla oszczędności pamięci)
 *  - possessionMinute: { side, share } udział posiadania w danej minucie (0-1) dla strony gospodarzy
 */
export function statsFromEvents(events) {
  const s = [empty(), empty()];
  let possH = 0;
  let possMinutes = 0;
  for (const e of events) {
    const t = s[e.side ?? 0];
    const n = e.count ?? 1;
    switch (e.type) {
      case 'pass': t.passes += n; t.passesCompleted += n; break;
      case 'passFail': t.passes += n; break;
      case 'keyPass': t.keyPasses += n; break;
      case 'tackle': t.tackles += n; break;
      case 'interception': t.interceptions += n; break;
      case 'clearance': t.clearances += n; break;
      case 'throwIn': t.throwIns += n; break;
      case 'goalKick': t.goalKicks += n; break;
      case 'freeKick': t.freeKicks += n; break;
      case 'corner': t.corners += n; break;
      case 'shotOff': t.shots++; t.offTarget++; t.xg += e.xg ?? 0; break;
      case 'post': t.shots++; t.offTarget++; t.woodwork++; t.xg += e.xg ?? 0; break;
      case 'shotBlocked': t.shots++; t.blocked++; t.xg += e.xg ?? 0; break;
      case 'shotOn': t.shots++; t.onTarget++; t.xg += e.xg ?? 0; break; // obroniony: osobne zdarzenie 'save' u rywala
      case 'goal': t.goals++; if (!e.ownGoal) { t.shots++; t.onTarget++; t.xg += e.xg ?? 0; } break;
      case 'save': t.saves++; break;
      case 'offside': t.offsides++; break;
      case 'foul': t.fouls++; break;
      case 'yellow': t.yellow++; break;
      case 'red': t.red++; break;
      case 'penalty': t.penalties++; break;
      case 'varOverturn':
        if (e.cancelGoal) { t.goals--; t.onTarget--; t.shots--; t.xg -= e.xg ?? 0; }
        break;
      case 'possessionMinute': possH += e.share; possMinutes++; break;
      default: break;
    }
  }
  const pH = possMinutes ? Math.round((possH / possMinutes) * 100) : 50;
  s[0].possession = pH;
  s[1].possession = 100 - pH;
  for (const t of s) {
    t.xg = Math.round(t.xg * 100) / 100;
    t.passAccuracy = t.passes ? Math.round((t.passesCompleted / t.passes) * 100) : 0;
  }
  return s;
}

/** Niezmienniki statystyk: używane w testach silnika (etap 3) dla każdego symulowanego meczu. */
export function checkStatsInvariants(s, score) {
  const errors = [];
  s.forEach((t, i) => {
    if (score && t.goals !== score[i]) errors.push(`Gole strony ${i} (${t.goals}) różnią się od wyniku (${score[i]})`);
    if (t.onTarget > t.shots) errors.push(`Strona ${i}: celnych więcej niż strzałów`);
    if (t.passesCompleted > t.passes) errors.push(`Strona ${i}: udanych podań więcej niż wszystkich`);
    if (t.onTarget - t.goals > s[1 - i].saves + 2) errors.push(`Strona ${i}: celne bez gola i bez obrony`);
  });
  if (s[0].possession + s[1].possession !== 100) errors.push('Posiadanie nie sumuje się do 100');
  return errors;
}
