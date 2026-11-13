# Odprawy dopasowane do meczu

Opis kontekstu odpraw: co trener mówi przed meczem, w przerwie i po meczu, zależnie od rodzaju meczu, stawki, rywala i dwumeczu.
Kod: `src/match/briefings.js` (`briefingContext`, `toneQuote`, `toneQuotes`, pule tekstów), `src/match/matchday.js` (`talkContext`, `talkQuotes`, `talkContextText`), `src/match/studio.js` (`boardExpectation`, `hasPoints`). Testy: `tests/briefingContext.test.mjs`.

## 1. Problem

Każda przemowa miała jeden stały cytat, a zdanie nad przemowami brało oczekiwanie zarządu liczone jak w lidze. Skutek: w Pucharze Polski, Superpucharze, dwumeczu UEFA i w sparingu gracz czytał „Zarząd liczy na trzy punkty”, a nagłówki dnia potrafiły zapowiadać „Trzy punkty w grze” przed meczem pucharowym. Sparing miał etykietę „Mecz ligowy”.

Przykład przed i po (Puchar Polski, 1/16 finału, rywal z III ligi):

| | Przed | Po |
|---|---|---|
| Zdanie nad przemowami | Mecz pucharowy. Zarząd liczy na trzy punkty. | Puchar Polski, 1/16 finału. Rywal wyraźnie słabszy. Zarząd oczekuje awansu do kolejnej rundy. |
| Wymagam więcej | „Stać was na dużo więcej. Chcę to zobaczyć na boisku.” | „W pucharze nie ma drugiej szansy. Kto przegrywa, odpada, więc chcę maksimum od pierwszej minuty. Nie ma słabych rywali. Kto zlekceważy przeciwnika, usiądzie na ławce.” |
| Bez presji | „Nie macie nic do stracenia. Wyjdźcie i cieszcie się grą.” (faworyt!) | „Wszyscy oczekują naszego awansu. Zapomnijcie o tym i grajcie swobodnie.” |

Efekty przemów (tabela 5.2, morale, liczby dla silnika) są bez zmian. Kontekst zmienia tylko teksty: cytat przemowy, uzasadnienie asystenta, odpowiedzi zawodników, reakcje po meczu, oczekiwanie zarządu i filtr nagłówków.

## 2. Konteksty

`briefingContext` dostaje zwykłe dane z dnia meczowego i zwraca:

| Pole | Wartości | Skąd |
|---|---|---|
| `kind` | `friendly`, `league`, `cupEarly` (runda wstępna do 1/8), `cupQF`, `cupSemi`, `cupFinal`, `supercup`, `uefaQual`, `uefaLeague`, `uefaKO`, `uefaSemi`, `uefaFinal`, `uefaSuper` (Superpuchar Europy), `playoffSemi`, `playoffFinal` | `compInfo(f)`: typ, runda, `ucomp`, baraże `playoff-*` |
| `stake` | `title`, `relegation` (z `six`: bezpośredni rywal), `promotion`, `deadRubber`, `null` | tabela ligi: miejsce, punkty, kolejki do końca |
| `gap` | `muchStronger`, `stronger`, `even`, `weaker`, `muchWeaker` | szanse 1X2 ze studia (z perspektywy gracza) |
| `rival` | `derby`, `rival`, `null` | tag `derby` z `matchRank` (ten sam region), `rivalry()` z `fans.js` (intensywność 2 i więcej) albo tag `klasyk` |
| `leg` | `{ n: 1 }`, `{ n: 2, first: [nasze, rywala], state: ahead/level/behind }` | `f.leg`, `f.knockout.firstLeg` (dwumecze UEFA) |
| `venue` | `home`, `away`, `neutral` | strona gracza, `f.neutral` |
| `points` | `true` tylko liga i faza ligowa UEFA | |
| `et` | `et` (dogrywka), `pens` (od razu karne: oba Superpuchary), `null` | |
| `form` | `run` (seria), `crisis`, `null` | 5 ostatnich wyników |
| `last` | ostatnia kolejka | |

Progi [SZAC]:

- różnica sił: `muchStronger` gdy szansa porażki co najmniej 58 % albo wygranej najwyżej 15 %; `muchWeaker` gdy szansa wygranej co najmniej 62 %; `stronger` i `weaker` przy 45 % porażki i 50 % wygranej;
- mistrzostwo (Ekstraklasa): po połowie sezonu, gdy studio oznaczy hit dwóch czołowych drużyn, albo na 8 kolejek przed końcem przy stracie do lidera (lub przewadze nad drugim) najwyżej 6 punktów i miejscu 1 do 3;
- awans (1 i 2 Liga): 10 kolejek przed końcem, miejsce barażowe albo strata do niego najwyżej 3 punkty i realna do odrobienia;
- utrzymanie: 12 kolejek przed końcem, miejsce spadkowe (w 2 Lidze także baraż o utrzymanie) albo do 3 miejsc nad kreską i najwyżej 4 punkty przewagi; „mecz o sześć punktów”, gdy rywal jest w tej samej strefie;
- mecz bez stawki: 5 kolejek przed końcem, gdy ani utrzymanie, ani cel w górze tabeli (puchary albo baraże) nie są już do zmienienia;
- lider po 2 kolejkach nie gra „o mistrzostwo”: stawka wymaga drugiej połowy sezonu.

## 3. Zasady doboru tekstów

1. Klucz główny to najbardziej szczegółowa sytuacja: sparing, finał (każdy rodzaj osobno), rewanż według wyniku dwumeczu, półfinał, stawka w lidze, derby albo wielki rywal w lidze, runda pucharu lub faza UEFA, zwykła kolejka.
2. Gdy klucz nie ma tekstu dla danego tonu, kod szuka w kluczu ogólniejszym (na przykład `cupSemi`, potem `cup`, potem `any`). Klucz `any` jest neutralny: bez punktów, ligi, pucharu, trofeum i rywala. Sparing nigdy nie korzysta z `any`.
3. Drugie zdanie dokłada rywal (derby albo wielki rywal, gdy klucz główny o nim nie mówi) albo duża różnica sił. W sparingu tylko różnica sił, w wersji „sparingowej”.
4. Linie mogą mieć znaczniki warunków (`[home]`, `[away]`, `[under]`, `[fav]`, `[run]`, `[crisis]`, `[six]`, `[last]`, `[notlast]`, `[leg1]`, `[et]`, `[pens]`, `[b1]`, `[b2]`, `[l1]`). Linia ze znacznikiem `[under]` lub `[fav]` już mówi o różnicy sił, więc nie dostaje drugiego zdania o tym samym.
5. Wybór jest deterministyczny: ziarno meczu i fazy (to samo co odprawa), więc ekran i wynik odprawy pokazują ten sam cytat.
6. Przerwa: grupa meczu (sparing, liga, puchar z dogrywką, finał, finał baraży, 1. mecz dwumeczu, rewanż) i stan wyniku; w rewanżu liczy się stan dwumeczu.
7. Po meczu: rozstrzygnięcie (awans, odpadnięcie, trofeum, przegrany finał, awans do finału baraży, awans do wyższej ligi, koniec sezonu w barażach), 1. mecz dwumeczu, liga z punktami, sparing.

Liczba tekstów: 173 linie główne przed meczem, 36 drugich zdań, 87 linii w przerwie, 70 po meczu, 29 odpowiedzi zawodników zależnych od kontekstu i fazy, 12 reakcji po meczu. Złożonych cytatów przedmeczowych w testowanych kontekstach: ponad 200.

## 4. Przykłady

| Kontekst | Ton | Cytat |
|---|---|---|
| Sparing | Spokój | „Najważniejsze, żeby każdy złapał minuty w nogach i zszedł z boiska zdrowy.” |
| Sparing, silny rywal | Bez presji | „To tylko sparing. Bawcie się piłką i próbujcie odważnych zagrań. Silny rywal, zero presji. Uczcie się z każdej akcji.” |
| Liga, 3. kolejka | Wymagam więcej | „Dziś chcę trzech punktów i pełnego zaangażowania. Mniej nie przyjmuję.” |
| Mecz o mistrzostwo | Skupienie na obronie | „Mistrzów buduje obrona. Zero z tyłu i cierpliwie czekamy na swoją szansę.” |
| Mecz o sześć punktów | Wymagam więcej | „To mecz o sześć punktów. Wygrana pozwala odskoczyć, porażka wciąga nas głębiej.” |
| Mecz bez stawki | Krzyk | „Nie obchodzi mnie, że w tabeli nic się nie zmieni! Gracie w koszulce tego klubu, więc ją szanujcie!” |
| Derby w lidze | Spokój | „Chłodna głowa wygrywa derby. Nie dajcie się sprowokować.” |
| Puchar, półfinał, derby | Krzyk | „Jesteście o krok od finału i chcecie to zmarnować?! Do boju! To są derby! Ogień w sercu, lód w głowie!” |
| Finał Pucharu Polski | Wymagam więcej | „Finału się nie gra, finał się wygrywa. Wszystko, co macie, zostawcie dziś na boisku.” |
| Superpuchar | Spokój | „Pamiętajcie: przy remisie od razu rzuty karne, bez dogrywki. Spokojnie, liczy się każda minuta.” |
| Eliminacje UEFA, 1. mecz na wyjeździe | Skupienie na obronie | „Na wyjeździe najpierw obrona. Wynik bez straty gola da nam spokój przed rewanżem.” |
| Rewanż, strata 0:1 | Bez presji | „Musimy gonić, więc nie mamy nic do stracenia. Grajcie odważnie.” |
| Wyraźnie słabszy rywal | Krzyk (drugie zdanie) | „Jeśli ktoś myśli, że ten mecz wygra się sam, to grubo się myli!” |
| Wyraźnie silniejszy rywal | Spokój (drugie zdanie) | „Rywal jest faworytem, ale faworyci też się mylą.” |
| Przerwa, finał baraży, przegrywamy | Krzyk | „Awans ucieka nam sprzed nosa! Tego chcecie?!” |
| Po meczu, odpadnięcie | Skupienie na kolejnym meczu | „Przygoda w tych rozgrywkach się skończyła. Teraz cała energia na kolejne mecze.” |
| Po meczu, przegrane baraże | Skupienie na kolejnym meczu | „Sezon się skończył. Odpocznijcie, a potem wracamy silniejsi.” |

Oczekiwania zarządu (`boardExpectation`): sparing „Zarząd nie rozlicza sparingów z wyniku”, puchar „awansu do kolejnej rundy” albo „do finału”, finał i Superpuchar „zdobycia trofeum” albo „walkę o trofeum”, finał baraży „awansu do wyższej ligi”, 1. mecz dwumeczu „zaliczkę przed rewanżem”, faza ligowa UEFA „punkty w fazie ligowej”. Liga bez zmian. Nagłówki z „punkt” albo „kolejk” nie pojawiają się w meczach bez punktów.

## 5. Panel: trener, ekspert, redaktor

- Trener: przed finałem i derbami więcej studzenia niż nakręcania; w sparingu mowa o minutach, założeniach i zdrowiu; przy faworycie przestroga przed lekceważeniem, przy outsiderze dyscyplina i brak presji. Krzyk przed meczem nie może brzmieć jak reakcja na zły wynik, którego jeszcze nie ma (dlatego „Co to ma być?!” zostało tylko w przerwie, a przed meczem krzyk o kryzysie wymaga serii słabych wyników).
- Ekspert: Superpuchar Polski i Superpuchar Europy przy remisie od razu kończą się karnymi; Puchar Polski i baraże mają dogrywkę; w dwumeczach UEFA nie ma już zasady goli wyjazdowych, więc tekst nie sugeruje, że gol stracony u siebie „liczy się podwójnie”; faza ligowa UEFA ma punkty, eliminacje i faza pucharowa nie.
- Redaktor: usunięte powtórzenia w złożonych cytatach (dwa razy „niech zostanie w szatni”, dwa razy „zero z tyłu”, „emocje” w obu zdaniach), „kolejny mecz ligowy” w 1. kolejce, „maraton” w ostatniej kolejce, „Doszliśmy tu” w pierwszej rundzie pucharu, „całą drogę” w Superpucharze, „rządzi w mieście” w derbach regionu (Górnik i Piast to różne miasta), „Nie zawiodę, trenerze” po końcowym gwizdku, „gotowy do gry” i „poprawia ochraniacze” w reakcjach po meczu.

## 6. Lista kontrolna redaktora

Przy każdym nowym tekście:

1. Brak „punkt”, „trzy punkty”, „kolejka” w pucharze, finale, Superpucharze, barażu, eliminacjach i fazie pucharowej UEFA oraz w sparingu.
2. Brak „puchar”, „trofeum”, „finał”, „awans”, „mistrzostwo”, „spadek” w zwykłej kolejce ligowej bez stawki.
3. „Trofeum” tylko w finałach i Superpucharach; finał baraży to awans, nie trofeum.
4. „Rewanż”, „dwumecz”, „pierwszy mecz” tylko w dwumeczu; rewanż mówi o wyniku dwumeczu, nie o dzisiejszym.
5. „Derby” tylko przy derbach; „ten rywal” w sensie wielkiego rywala tylko przy rywalizacji; bez „miasta”, bo derby regionu łączą różne miasta.
6. „Nic do stracenia” tylko u outsidera albo przy stracie; faworyt słyszy o koncentracji i szacunku dla rywala.
7. „Dogrywka” tylko tam, gdzie jest; w Superpucharach „od razu karne”.
8. Brak nazw klubów i odmiany przez przypadki (cytat działa dla każdego rywala).
9. Dwa zdania złożonego cytatu nie powtarzają tego samego słowa kluczowego ani polecenia.
10. Bez myślników, bez cyfr w reakcjach i odpowiedziach zawodników, cudzysłów „ ”.
11. Odpowiedzi po meczu pasują do pochwały albo krytyki, nie do sytuacji przed meczem.

Test `tests/briefingContext.test.mjs` sprawdza punkty 1 do 7 i 10 automatycznie dla 21 meczów wzorcowych, wszystkich tonów, 30 ziaren i wszystkich stanów wyniku.

## 7. Inspiracje i niepewne założenia

Teksty są oryginalne. Inspiracją były publiczne wypowiedzi trenerów polskich klubów (konferencje przed finałami Pucharu Polski, derbami i meczami o utrzymanie, wypowiedzi po sparingach): motywy „chłodnej głowy” w derbach, „stawka derbów to coś więcej niż punkty”, „być nad kreską na koniec sezonu”, „najważniejsze, że nikt nie zgłosił urazu” po sparingu. Źródła: flashscore.pl, soccerway.com, meczyki.pl, rmf24.pl, lodzkisport.pl, radiokrakow.pl (wyniki wyszukiwania z Nov 13, 2026; bez weryfikacji pełnych tekstów).

Niepewne [SZAC]:

- progi różnicy sił i stawki w tabeli (rozdz. 2);
- „Superpuchar to pierwsze trofeum sezonu”: zgodne z terminem w `calendar2026.js` (lipiec, przed ligą), ale data jest oznaczona jako niepotwierdzona;
- intensywność rywalizacji 2 jako „wielki rywal” (lista w `src/data/kibice.js`, część par oznaczona [SZAC]);
- region jako wyznacznik derbów (`matchRank`), także dla klubów z różnych miast tego samego regionu;
- konferencja przedmeczowa (`src/match/press.js`) ma odpowiedź „Gramy o trzy punkty i wygramy ten mecz” także przed meczem pucharowym; poza zakresem tej zmiany.
