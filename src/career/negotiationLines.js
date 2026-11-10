// Biblioteka krótkich kwestii do negocjacji kontraktów.
// Wpis: [klucz, kto, tagi, tekst]
//   kto: 'A' mówi agent (o zawodniku w 3. osobie), 'P' mówi sam zawodnik (gdy nie ma agenta), '*' obaj.
//   tagi (spacje): rekin | rozsadny | rodzinny (tylko ten typ agenta); low | mid | high (nastrój);
//   ego | temper | calm | greedy | loyal | young | vet (cecha lub wiek). Tagi nastroju i cech tylko zwiększają wagę.
// Szablony: {imie} {zawodnik} {klub} {kwota} {premia} {lata} {rola} {klauzula} {prowizja} {data} {rywal} {tygodnie}

export const LINES = [
  // ---------------------------------------------------------------- otwarcie
  ['opening', 'A', 'rekin', 'Mój klient ma wielu chętnych. Słucham, co {klub} ma do zaproponowania.'],
  ['opening', 'A', 'rozsadny', 'Dzień dobry. {imie} jest otwarty na rozmowę, przejdźmy do konkretów.'],
  ['opening', 'A', 'rodzinny', 'Dla nas najważniejsze, żeby {imie} był szczęśliwy. Posłuchamy chętnie.'],
  ['opening', 'P', '', 'Dzień dobry, trenerze. Chętnie posłucham, co pan proponuje.'],
  ['opening', 'P', 'ego', 'Wiem, ile jestem wart. Proszę o poważną ofertę.'],
  ['opening', 'A', 'low', 'Nie ukrywam, że {imie} podchodzi do tych rozmów z dystansem.'],

  // ---------------------------------------------------------------- akceptacja
  ['accept', 'A', '', 'Mamy porozumienie. {imie} podpisze kontrakt na {lata}.'],
  ['accept', 'A', 'rekin', 'Dobrze. Przygotujcie dokumenty, zanim zmienię zdanie.'],
  ['accept', 'A', 'rozsadny', 'To uczciwa oferta. {imie} ją przyjmuje.'],
  ['accept', 'A', 'rodzinny', 'Cała rodzina się cieszy. {imie} zostaje u was na {lata}.'],
  ['accept', 'P', '', 'Zgoda, podpisuję. Nie zawiodę pana.'],
  ['accept', 'P', 'high', 'Świetnie! Nie mogę się doczekać treningu z drużyną.'],
  ['accept', 'P', 'low', 'Niech będzie. Podpiszę, choć łatwo nie było.'],
  ['accept', 'A', 'low', 'Zgoda, ale zapamiętamy, jak przebiegały te rozmowy.'],
  ['accept', '*', 'loyal', '{imie} zawsze marzył o tym klubie. Podpisujemy.'],
  ['accept', 'P', 'vet', 'Dobrze. Jeszcze pokażę, ile jestem wart.'],
  ['accept', 'P', 'young', 'Dziękuję za zaufanie! To dla mnie wielka szansa.'],

  // ---------------------------------------------------------------- kontroferta
  ['counter', 'A', '', 'Nasza propozycja: {kwota} tygodniowo, {lata}, rola: {rola}.'],
  ['counterSignOn', 'A', 'rekin', '{kwota} tygodniowo i {premia} za podpis. Poniżej nie schodzimy.'],
  ['counter', 'A', 'rekin', 'Mój klient jest wart więcej. {kwota} tygodniowo, wtedy porozmawiamy.'],
  ['counter', 'A', 'rozsadny', 'Jesteśmy blisko. Przy {kwota} tygodniowo podpisujemy umowę na {lata}.'],
  ['counter', 'A', 'rozsadny', 'Proponuję kompromis: {kwota} tygodniowo, reszta bez zmian.'],
  ['counter', 'A', 'rodzinny', 'Rodzina liczyła na {kwota} tygodniowo. Czy da się to zrobić?'],
  ['counter', 'P', '', 'Myślałem raczej o {kwota} tygodniowo.'],
  ['counter', 'P', 'calm', 'Rozumiem budżet klubu, ale {kwota} tygodniowo to dla mnie uczciwa kwota.'],
  ['counter', 'P', 'ego', 'Za {kwota} tygodniowo mogę rozmawiać. Za mniej nie.'],
  ['counter', 'A', 'high', 'Rozmowy idą dobrze. Zamknijmy temat przy {kwota} tygodniowo.'],
  ['counter', 'A', 'low', 'Zaczynam tracić cierpliwość. {kwota} tygodniowo i kończymy.'],
  ['counterSignOn', '*', 'greedy', 'Pieniądze mają znaczenie: {kwota} tygodniowo i {premia} na start.'],
  ['counterSignOn', 'A', '', 'Proponujemy {kwota} tygodniowo i premię za podpis {premia}, umowa na {lata}.'],
  ['counterSignOn', 'P', '', 'Zgodzę się na {kwota} tygodniowo, jeśli dostanę {premia} za podpis.'],
  ['counterSignOn', 'A', 'rodzinny', 'Rodzina prosi o {kwota} tygodniowo i {premia} na start, na {lata}.'],

  // ---------------------------------------------------------------- żądanie zmiany jednego elementu
  ['demand_role', 'A', '', 'Kwota nam pasuje. {imie} chce jednak gwarancji roli: {rola}.'],
  ['demand_role', 'P', '', 'Pieniądze są w porządku, ale chcę grać. Proszę wpisać rolę: {rola}.'],
  ['demand_role', 'A', 'rekin', 'Bez zapisu roli w kontrakcie nie podpiszemy. {rola} i mamy umowę.'],
  ['demand_role', 'P', 'ego', 'Nie przychodzę tu grzać ławki. Chcę roli: {rola}.'],
  ['demand_years', 'A', '', 'Zmieńmy tylko długość: {lata} i jesteśmy dogadani.'],
  ['demand_years', 'P', '', 'Wolałbym umowę na {lata}. Reszta mi odpowiada.'],
  ['demand_years', 'A', 'rodzinny', 'Rodzina potrzebuje stabilności. Prosimy o kontrakt na {lata}.'],
  ['demand_years', 'P', 'vet', 'W moim wieku liczy się każdy sezon. Chcę umowy na {lata}.'],
  ['demand_clause', 'A', '', 'Potrzebujemy klauzuli odstępnego: {klauzula}. To warunek.'],
  ['demand_clause', 'P', '', 'Chcę mieć furtkę na wyjazd. Klauzula {klauzula} i podpisuję.'],
  ['demand_clause', 'A', 'rekin', 'Klauzula {klauzula} albo szukamy innego klubu.'],
  ['demand_signOn', 'A', '', 'Prawie się zgadzamy. Brakuje premii za podpis: {premia}.'],
  ['demand_signOn', 'P', '', 'Dorzućcie {premia} za podpis i mamy umowę.'],
  ['demand_signOn', 'A', 'greedy', 'Pensja w porządku, ale premia za podpis musi wynieść {premia}.'],
  ['demand_agentFee', 'A', '', 'Zostaje kwestia mojej prowizji: {prowizja}.'],
  ['demand_agentFee', 'A', 'rekin', 'Ja też muszę z czegoś żyć. Prowizja {prowizja} i podpisujemy.'],
  ['demand_agentFee', 'A', 'rozsadny', 'Standardowa prowizja to {prowizja}. Proszę ją uwzględnić.'],
  ['demand_relegation', 'A', '', 'Klauzula obniżki po spadku jest dla nas nie do przyjęcia. Proszę ją złagodzić.'],
  ['demand_relegation', 'P', '', 'Nie chcę tracić połowy pensji przez spadek. Proszę zmienić ten zapis.'],

  // ---------------------------------------------------------------- ultimatum
  ['ultimatum', 'A', '', 'Ostatnia propozycja: {kwota} tygodniowo, {lata}. Tak albo nie.'],
  ['ultimatum', 'A', 'rekin', 'Koniec zabawy. {kwota} tygodniowo albo wychodzimy.'],
  ['ultimatum', 'A', 'rodzinny', 'Bardzo prosimy, to nasze ostatnie słowo: {kwota} tygodniowo.'],
  ['ultimatum', 'P', '', 'Mam dość przeciągania. {kwota} tygodniowo i podpisuję, inaczej koniec.'],
  ['ultimatum', 'P', 'temper', 'Ostatni raz: {kwota} tygodniowo. Następnej rozmowy nie będzie.'],
  ['ultimatum', 'A', 'rozsadny', 'Zrobiliśmy, co się dało. {kwota} tygodniowo to nasza granica.'],

  // ---------------------------------------------------------------- zerwanie
  ['breakoff', 'A', '', 'Nie widzę sensu dalszych rozmów. Do widzenia.'],
  ['breakoff', 'A', 'rekin', 'Tracimy czas. Mamy lepsze opcje. Dziękuję.'],
  ['breakoff', 'A', 'rozsadny', 'Przykro mi, ale nie dojdziemy do porozumienia.'],
  ['breakoff', 'A', 'rodzinny', 'Rodzina jest rozczarowana. Kończymy rozmowy.'],
  ['breakoff', 'P', '', 'Szkoda. Nie tak to sobie wyobrażałem.'],
  ['breakoff', 'P', 'temper', 'Dość! Nie będę dłużej tego słuchał.'],
  ['breakoff', 'P', 'ego', 'Nie pozwolę się tak traktować. Wychodzę.'],
  ['breakoff', 'P', 'calm', 'Rozumiem, że się nie dogadamy. Życzę powodzenia.'],

  // ---------------------------------------------------------------- reakcje na ofertę
  ['insult', 'A', '', 'To ma być oferta? Mój klient czuje się urażony.'],
  ['insult', 'A', 'rekin', 'Proszę nie żartować. Za takie pieniądze to mogę znaleźć juniora.'],
  ['insult', 'A', 'rodzinny', 'Szczerze mówiąc, jest nam przykro. Liczyliśmy na więcej szacunku.'],
  ['insult', 'P', '', 'Słucham? To dla mnie obraźliwe.'],
  ['insult', 'P', 'ego', 'Czy pan wie, z kim rozmawia? To jest kpina.'],
  ['insult', 'P', 'temper', 'Taką ofertą to możecie sobie... Lepiej nic nie powiem.'],
  ['insult', 'P', 'calm', 'Spodziewałem się czegoś zupełnie innego.'],
  ['insult', 'A', 'rozsadny', 'Ta kwota jest daleko od rynkowych realiów.'],
  ['irritated', 'A', '', 'Tymi drobnymi krokami do niczego nie dojdziemy.'],
  ['irritated', 'A', 'rekin', 'Sto złotych w tę czy w tę? Nie marnujmy czasu.'],
  ['irritated', 'P', '', 'Naprawdę? Tyle samo co poprzednio?'],
  ['irritated', 'P', 'temper', 'Zaczyna mnie to denerwować.'],
  ['irritated', 'A', 'rodzinny', 'Liczyliśmy na wyraźniejszy ruch z waszej strony.'],
  ['irritated', 'P', 'calm', 'Rozumiem, ale to wciąż za mało.'],
  ['regress', 'A', '', 'Teraz oferujecie mniej niż przed chwilą? Poważnie?'],
  ['regress', 'P', '', 'Poprzednia oferta była lepsza. Co się zmieniło?'],
  ['regress', 'A', 'rekin', 'Cofanie się w ofercie to najgorszy pomysł. Zapamiętam to.'],
  ['pleased', 'A', '', 'To już wygląda lepiej.'],
  ['pleased', 'A', 'rodzinny', 'Dziękujemy, to dobry krok.'],
  ['pleased', 'P', '', 'Widzę, że naprawdę wam na mnie zależy.'],
  ['pleased', 'P', 'high', 'Podoba mi się kierunek tych rozmów.'],
  ['pleased', 'A', 'rekin', 'No proszę, jednak się da.'],

  // ---------------------------------------------------------------- blef i konkurencja
  ['claim', 'A', '', 'Mamy na stole ofertę z innego klubu. Lepszą.'],
  ['claim', 'A', 'rekin', 'Dzwoniono do mnie dziś trzy razy. Inny klub da więcej.'],
  ['claim', 'A', 'rozsadny', 'Uczciwie mówię: jest inna oferta i musimy ją rozważyć.'],
  ['claim', 'A', 'rodzinny', 'Odezwał się też inny klub. Rodzina się zastanawia.'],
  ['claim', 'P', '', 'Mój telefon nie milknie. Inne kluby też pytają.'],
  ['claim', 'P', 'ego', 'Mam ofertę z lepszego klubu, żeby było jasne.'],
  ['bluffExposed', 'A', '', 'Dobrze, nie ma innej oferty. Wróćmy do rozmów.'],
  ['bluffExposed', 'A', 'rekin', 'Sprawdził pan. Niech będzie, gramy w otwarte karty.'],
  ['bluffExposed', 'P', '', 'No dobrze, przesadziłem. Rozmawiajmy dalej.'],
  ['bluffTrue', 'A', '', 'Oferta jest prawdziwa, klub {rywal} czeka. Brak zaufania nas zabolał.'],
  ['bluffTrue', 'P', '', 'Nie wierzy mi pan? {rywal} naprawdę dzwonił.'],
  ['bluffTrue', 'A', 'rekin', 'Proszę, oto dokumenty. Klub {rywal} nie żartuje. Następnym razem proszę mi wierzyć.'],
  ['rivalPressure', 'A', '', '{rywal} czeka na odpowiedź. Czas gra na naszą korzyść.'],
  ['rivalPressure', 'P', '', '{rywal} chce mnie od zaraz. Proszę się pospieszyć.'],
  ['rivalPressure', 'A', 'rekin', '{rywal} płaci więcej. Albo się zbliżycie, albo żegnamy się.'],

  // ---------------------------------------------------------------- brak rozmów i odmowy
  ['locked', 'A', '', 'Na razie nie chcemy rozmawiać. Wróćmy do tematu po {data}.'],
  ['locked', 'P', '', 'Nie mam ochoty teraz o tym rozmawiać. Może po {data}.'],
  ['locked', 'A', 'rekin', 'Po tym, co było, nie odbieram od was telefonów do {data}.'],
  ['tooEarly', 'A', '', 'Kontrakt obowiązuje jeszcze długo. Porozmawiajmy bliżej jego końca.'],
  ['tooEarly', 'P', '', 'Mam jeszcze ważną umowę. Wróćmy do tematu później.'],
  ['tooEarly', 'A', 'rekin', 'Za wcześnie. Niech {imie} najpierw pokaże formę, wtedy pogadamy o pieniądzach.'],
  ['refuseRenew', 'A', '', '{imie} postanowił nie przedłużać kontraktu. Chce spróbować czegoś nowego.'],
  ['refuseRenew', 'P', '', 'Dziękuję za wszystko, ale nie przedłużę umowy.'],
  ['refuseRenew', 'P', 'ego', 'Ten klub jest dla mnie za mały. Nie przedłużę.'],
  ['refuseRenew', 'A', 'rekin', 'Nie będzie przedłużenia. Mamy inne plany.'],
  ['refuseRenew', 'P', 'loyal', 'Bardzo mi przykro, ale po tym wszystkim nie potrafię zostać.'],
  ['refusedAlready', '*', '', 'Decyzja zapadła. {imie} nie przedłuży kontraktu.'],
  ['refuseJoin', 'A', '', '{imie} nie rozważa przejścia. Klub {klub} to nie jest jego kierunek.'],
  ['refuseJoin', 'A', 'rekin', 'Z całym szacunkiem, to nie jest poziom mojego klienta.'],
  ['refuseJoin', 'P', '', 'Dziękuję, ale to nie jest kierunek dla mnie.'],
  ['refuseJoin', 'P', 'ego', '{klub}? Chyba pan żartuje.'],

  // ---------------------------------------------------------------- obietnice i ich skutki
  ['promiseWarning', 'P', '', 'Trenerze, obiecał pan mi rolę: {rola}. Na razie tego nie widzę.'],
  ['promiseWarning', 'A', '', 'Przypominam, że w kontrakcie {imie} ma zapisaną rolę: {rola}.'],
  ['promiseWarning', 'P', 'temper', 'Siedzę na ławce, a mieliśmy umowę. Długo tego nie zniosę.'],
  ['promiseBroken', 'P', '', 'Złamał pan obietnicę. Straciłem zaufanie.'],
  ['promiseBroken', 'A', '', 'Klub nie dotrzymał słowa. Zapamiętamy to przy kolejnych rozmowach.'],
  ['promiseBroken', 'P', 'ego', 'Nikt nie będzie mnie oszukiwał. Koniec z obietnicami.'],
  ['promiseKept', 'P', '', 'Dziękuję, trenerze. Klub dotrzymuje słowa.'],
  ['promiseKept', 'A', '', '{imie} jest zadowolony z roli w drużynie.'],
  ['transferRequest', 'P', '', 'Proszę o wystawienie mnie na listę transferową.'],
  ['transferRequest', 'A', '', 'Oficjalnie prosimy o zgodę na transfer.'],
];

const AGENT_TAGS = new Set(['rekin', 'rozsadny', 'rodzinny']);

function traitTag(tag, c) {
  const t = c.traits || {};
  switch (tag) {
    case 'ego': return t.ego >= 14;
    case 'temper': return t.temper >= 14;
    case 'calm': return t.temper <= 8;
    case 'greedy': return t.greed >= 14;
    case 'loyal': return t.loyalty >= 14;
    case 'young': return (c.age ?? 25) <= 22;
    case 'vet': return (c.age ?? 25) >= 31;
    default: return null;
  }
}

/** Wypełnia szablon: {nazwa} -> vars.nazwa (brak wartości daje pusty tekst). */
export function fillTemplate(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '') + '');
}

/**
 * Dobór kwestii: klucz, kto mówi (agent albo zawodnik), typ agenta, nastrój i cechy.
 * c: { agentType, moodTag 'low'|'mid'|'high', traits, age }. Zwraca { who, text }.
 */
export function pickLine(key, c, rng, vars) {
  const agentSpeaks = c.agentType && c.agentType !== 'brak';
  const cand = LINES.filter(([k, who, tags]) => {
    if (k !== key) return false;
    if (who === 'A' && !agentSpeaks) return false;
    if (who === 'P' && agentSpeaks) return false;
    for (const tag of tags.split(' ')) if (AGENT_TAGS.has(tag) && tag !== c.agentType) return false;
    return true;
  });
  if (!cand.length) return { who: agentSpeaks ? 'A' : 'P', text: '' };
  const line = rng.weighted(cand, ([, , tags]) => {
    let w = 1;
    for (const tag of tags.split(' ').filter(Boolean)) {
      if (AGENT_TAGS.has(tag)) w *= 2;
      else if (tag === 'low' || tag === 'mid' || tag === 'high') w *= tag === c.moodTag ? 3 : 0.05; // kwestia z innego nastroju prawie nigdy
      else w *= traitTag(tag, c) ? 3 : 0.3;
    }
    return w;
  });
  return { who: line[1] === '*' ? (agentSpeaks ? 'A' : 'P') : line[1], text: fillTemplate(line[3], vars) };
}
