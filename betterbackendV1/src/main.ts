// CravAche betterbackend — bundled entry (the one piece Vite/TS actually own).
//
// The proven game (public/js/*) loads first as classic scripts and is fully
// running by the time this module executes. This layer adds the modern bits:
// Howler-driven audio for the in-game Alexa speaker. Anything migrated out of
// public/js/ into typed modules will be wired here.
import { initAudio } from './audio';

// WebAudio/Howler needs a user gesture to start. Arm it on first interaction.
function boot(): void {
  initAudio();
  window.removeEventListener('pointerdown', boot);
  window.removeEventListener('keydown', boot);
}
window.addEventListener('pointerdown', boot);
window.addEventListener('keydown', boot);
