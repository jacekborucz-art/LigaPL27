// Menu systemowe gry (u dołu bocznego menu na PC, na telefonie przycisk w nagłówku): Opcje (motyw), Zapis (plik
// na urządzeniu albo Google Drive po zalogowaniu gracza), Wyjście (zapis i powrót do strony startowej).

import { esc, icon } from './dom.js';
import { THEMES } from './menuView.js';
import { driveConfigured, driveSignedIn, driveLastSave } from '../core/gdrive.js';

const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** Trzy przyciski u dołu bocznego menu (PC). */
export function sysNavHtml() {
  return `<div class="nav__sys" role="group" aria-label="Gra">
    ${[['sys-options', 'opcje', 'Opcje'], ['sys-save', 'zapis', 'Zapis'], ['sys-exit', 'wyjscie', 'Wyjście']].map(([act, ic, l]) => `<button class="nav__btn nav__btn--sys" data-act="${act}">${icon(ic)}<span>${l}</span></button>`).join('')}
  </div>`;
}

/** Przycisk menu w nagłówku (telefon i tablet). */
export const sysHeaderBtn = () => `<button class="hub__sys" data-act="sys-menu" aria-label="Menu gry: opcje, zapis, wyjście">${icon('menu')}</button>`;

/** Treść okna. kind: menu | options | save. ctx: { theme, slot, msg, busy } */
export function sysDialogHtml(kind, ctx = {}) {
  const close = '<button class="btn btn--quiet sysdlg__x" data-act="sys-close">Zamknij</button>';
  const msg = ctx.msg ? `<p class="sysdlg__msg" role="status">${esc(ctx.msg)}</p>` : '';
  if (kind === 'menu') {
    return `<h2 id="sysTitle">Menu gry</h2>
      <div class="sysdlg__list">
        <button class="btn" data-act="sys-options">${icon('opcje')}Opcje</button>
        <button class="btn" data-act="sys-save">${icon('zapis')}Zapis</button>
        <button class="btn" data-act="sys-exit">${icon('wyjscie')}Wyjście</button>
      </div>${close}`;
  }
  if (kind === 'options') {
    return `<h2 id="sysTitle">Opcje</h2>
      <fieldset class="sysdlg__themes"><legend>Jasność motywu</legend>
        ${Object.entries(THEMES).map(([k, l]) => `<label class="sysdlg__opt"><input type="radio" name="sysTheme" value="${k}" data-act="sys-theme" data-t="${k}" ${ctx.theme === k ? 'checked' : ''}><span>${esc(l)}${k === 'auto' ? '<small>jak w systemie</small>' : ''}</span></label>`).join('')}
      </fieldset>${close}`;
  }
  // Zapis
  let drive;
  if (!driveConfigured()) {
    drive = '<p class="sysdlg__note">Zapis na Google Drive nie jest jeszcze włączony w tej wersji gry: brakuje identyfikatora aplikacji Google (instrukcja dla właściciela gry w docs/google-drive.md). Zapis do pliku działa normalnie.</p>';
  } else if (!driveSignedIn()) {
    drive = `<p class="sysdlg__note">Gra nie loguje się sama. Kliknij, aby zalogować się do swojego konta Google. Gra będzie miała dostęp tylko do plików, które sama zapisze na twoim Dysku.</p>
      <button class="btn" data-act="sys-drive-login" ${ctx.busy ? 'disabled' : ''}>Zaloguj się do Google Drive</button>`;
  } else {
    const last = driveLastSave();
    drive = `<p class="sysdlg__note">Zalogowano do Google Drive.${last ? ` Ostatni zapis: ${esc(last.file)}, ${esc(fmtTime(last.at))}.` : ''}</p>
      <div class="sysdlg__row"><button class="btn btn--primary" data-act="sys-drive-save" ${ctx.busy ? 'disabled' : ''}>Zapisz na Google Drive</button>
      <button class="btn btn--quiet" data-act="sys-drive-logout">Wyloguj</button></div>`;
  }
  return `<h2 id="sysTitle">Zapis gry</h2>
    <p class="sysdlg__note">Gra zapisuje się sama w slocie ${esc(String(ctx.slot ?? ''))} w tej przeglądarce. Tutaj zrobisz kopię zapasową.</p>
    <section class="sysdlg__sec"><h3>Plik na tym urządzeniu</h3>
      <p class="sysdlg__note">Plik JSON, który wczytasz z ekranu startowego (Importuj).</p>
      <button class="btn btn--primary" data-act="sys-file" ${ctx.busy ? 'disabled' : ''}>Zapisz plik</button></section>
    <section class="sysdlg__sec"><h3>Google Drive</h3>${drive}</section>
    ${msg}${close}`;
}
