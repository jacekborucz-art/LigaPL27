// Sponsorzy klubu (zakładka Klub > Sponsorzy). Wypełnia etap „Premie i sponsorzy”.
import { panel } from './transfersView.js';

export function sponsorsView() {
  return panel('Sponsorzy', 'info', '<p class="tf-p__txt">Umowy sponsorskie pojawią się wkrótce.</p>');
}
export function handleSponsorAction() { return { ui: {} }; }
