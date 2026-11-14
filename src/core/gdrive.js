// Zapis gry na Google Drive gracza (docs/google-drive.md). Logowanie zawsze rozpoczyna gracz przyciskiem;
// Google Identity Services daje krótkotrwały token dostępu, trzymany tylko w pamięci (bez localStorage).
// Zakres drive.file: gra widzi i zmienia wyłącznie pliki, które sama utworzyła na Dysku gracza.

import { GOOGLE_CLIENT_ID } from '../config/cloud.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
let gisPromise = null;
let token = null;
let tokenExp = 0;
let account = null; // { file, at } ostatniego zapisu w tej sesji

export const driveConfigured = () => !!GOOGLE_CLIENT_ID;
export const driveSignedIn = () => !!token && Date.now() < tokenExp;
export const driveLastSave = () => account;

function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Nie udało się wczytać logowania Google. Sprawdź połączenie z internetem.')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/** Logowanie (okno Google). Rozpoczyna je wyłącznie gracz. */
export async function driveSignIn() {
  if (!driveConfigured()) throw new Error('Zapis na Google Drive nie jest skonfigurowany w tej wersji gry.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r?.error || !r?.access_token) { reject(new Error('Logowanie do Google Drive nie powiodło się.')); return; }
        token = r.access_token;
        tokenExp = Date.now() + Math.max(60, Number(r.expires_in) - 60) * 1000;
        resolve();
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Okno logowania Google zostało zamknięte.' : 'Logowanie do Google Drive nie powiodło się.')),
    });
    client.requestAccessToken();
  });
}

/** Wylogowanie: unieważnia token u Google i zapomina go. */
export function driveSignOut() {
  if (token && globalThis.google?.accounts?.oauth2) globalThis.google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0; account = null;
}

const fileKey = (slot) => `ligapl27.drive.slot${slot}`;
const getId = (slot) => { try { return localStorage.getItem(fileKey(slot)); } catch { return null; } };
const setId = (slot, id) => { try { if (id) localStorage.setItem(fileKey(slot), id); else localStorage.removeItem(fileKey(slot)); } catch { /* bez pamięci przeglądarki: nowy plik przy każdym zapisie */ } };

/** Treść żądania multipart (metadane i plik JSON). Eksport do testów. */
export function multipartBody(meta, json, boundary) {
  return `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
    + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
}

/**
 * Zapisuje plik zapisu slotu na Dysku: aktualizuje plik utworzony wcześniej dla tego slotu albo tworzy nowy.
 * Zwraca { id, name, modifiedTime }.
 */
export async function driveSave(slot, name, json, { retry = true } = {}) {
  if (!driveSignedIn()) throw new Error('Najpierw zaloguj się do Google Drive.');
  const id = getId(slot);
  const boundary = `ligapl27${Math.random().toString(36).slice(2)}`;
  const meta = id ? { name } : { name, mimeType: 'application/json' };
  const url = `${id ? `${UPLOAD}/${encodeURIComponent(id)}` : UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime`;
  const res = await fetch(url, {
    method: id ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody(meta, json, boundary),
  });
  if (id && res.status === 404 && retry) { setId(slot, null); return driveSave(slot, name, json, { retry: false }); } // plik usunięty z Dysku
  if (res.status === 401) { token = null; tokenExp = 0; throw new Error('Sesja Google wygasła. Zaloguj się ponownie.'); }
  if (!res.ok) throw new Error(`Google Drive odrzucił zapis (kod ${res.status}).`);
  const f = await res.json();
  setId(slot, f.id);
  account = { file: f.name, at: f.modifiedTime ?? new Date().toISOString() };
  return f;
}
