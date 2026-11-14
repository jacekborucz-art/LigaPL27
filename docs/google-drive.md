# Zapis gry na Google Drive

Stan: Nov 14, 2026. Kod: `src/core/gdrive.js`, `src/ui/sysMenu.js`, konfiguracja `src/config/cloud.js`.

## Jak to działa

- Gracz otwiera **Zapis** (u dołu bocznego menu na PC, na telefonie przycisk menu w nagłówku). Ma do wyboru plik JSON na urządzeniu (wczytuje się go przyciskiem Importuj na ekranie startowym) albo Google Drive.
- **Gra nie loguje się sama.** Gracz klika „Zaloguj się do Google Drive”, a Google pokazuje własne okno logowania i zgody.
- Uprawnienie to tylko `drive.file`: gra widzi i zmienia wyłącznie pliki, które sama zapisała na Dysku gracza, nie resztę jego Dysku.
- Token dostępu (ważny ok. godziny) jest tylko w pamięci karty przeglądarki: nie trafia do localStorage ani do zapisu gry. Po zamknięciu karty trzeba zalogować się ponownie. „Wyloguj” unieważnia token u Google.
- Każdy slot ma na Dysku jeden plik (`LigaPL27-slot1-...json`), aktualizowany przy kolejnych zapisach. W localStorage zostaje tylko identyfikator tego pliku.

## Konfiguracja (jednorazowo, właściciel gry)

Google wymaga identyfikatora klienta OAuth przypisanego do adresu, pod którym działa gra. Bez niego okno Zapis pokazuje wyjaśnienie, a zapis do pliku działa normalnie.

1. Google Cloud Console (https://console.cloud.google.com/): utwórz projekt albo wybierz istniejący.
2. Interfejsy API i usługi, Biblioteka: włącz **Google Drive API**.
3. Ekran zgody OAuth: typ zewnętrzny, nazwa aplikacji, adres kontaktowy, zakres `https://www.googleapis.com/auth/drive.file`. Dopóki aplikacja jest w trybie testowym, dodaj konta testowe (gracze spoza listy nie zalogują się); publikacja aplikacji z zakresem `drive.file` nie wymaga weryfikacji zakresów wrażliwych.
4. Dane logowania, Utwórz dane logowania, **Identyfikator klienta OAuth**, typ **Aplikacja internetowa**. W „Autoryzowane źródła JavaScript” wpisz adres gry (np. `https://twoja-domena.pl`, a do testów `http://localhost:8080`). Adresy przekierowania nie są potrzebne.
5. Skopiuj identyfikator (kończy się na `.apps.googleusercontent.com`) do `GOOGLE_CLIENT_ID` w `src/config/cloud.js`. To nie jest sekret: jest widoczny w przeglądarce, a Google pozwala go używać tylko z wpisanych adresów.

Prywatność: gra wysyła na Dysk wyłącznie plik zapisu. Zapis nie zawiera haseł ani danych konta Google.
