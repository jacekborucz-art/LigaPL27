// Infrastruktura klubu (zakładka Klub > Infrastruktura): stadion, baza treningowa, akademia. Wypełnia etap „Infrastruktura”.
import { panel } from './transfersView.js';

export function infraView() {
  return panel('Infrastruktura', 'info', '<p class="tf-p__txt">Rozbudowa obiektów pojawi się wkrótce.</p>');
}
export function handleInfraAction() { return { ui: {} }; }
