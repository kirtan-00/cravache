// CravAche — Howler audio layer for the in-game Alexa speaker.
//
// Diegetically this is the little smart speaker on the windowsill. It does NOT
// play on game launch — silent until the player TAPS the Alexa. The first tap
// starts the queue; each further tap skips to the NEXT song; the queue
// (public/songs/01.mp3 … 04.mp3) loops forever. The generative lo-fi
// (window.G.music) is kept silenced — only our songs play. (Use the HUD mute to
// silence everything.)
//
// Exposes `window.CravacheAlexa` so the canvas renderer can drive the speaker:
//   - next()      -> tap: start the queue, or skip to the next song if playing
//   - isPlaying() -> true while audio is sounding (drives the speaker light ring)

import { Howl, Howler } from 'howler';

interface GMusic {
  start?: () => void;
  toggle?: () => boolean;
  isMuted?: () => boolean;
}
interface GAudio {
  isMuted?: () => boolean;
}
interface GGlobal {
  music?: GMusic;
  audio?: GAudio;
}
interface AlexaController {
  toggle: () => void;
  next: () => void; // alias of toggle (tap = on/off)
  isPlaying: () => boolean;
  hasSongs: () => boolean;
}
declare global {
  interface Window {
    G?: GGlobal;
    CravacheAlexa?: AlexaController;
  }
}

// ---- playlist config ----------------------------------------------------------
// Relative URLs (no leading slash) so they resolve against the deploy base —
// works at localhost root AND under a subpath like /cravache/ on GitHub Pages.
// An absolute "/songs/.." would 404 on a project-page subpath and the speaker
// would silently never start. Matches how content/ and art/ are loaded.
const PLAYLIST: ReadonlyArray<{ title: string; url: string }> = [
  { title: 'Track 1', url: 'songs/01.mp3' },
  { title: 'Track 2', url: 'songs/02.mp3' },
  { title: 'Track 3', url: 'songs/03.mp3' },
  { title: 'Track 4', url: 'songs/04.mp3' },
];

// base 0.5, +20% -> 0.6, then -10% -> 0.54 (clamped to 0..1).
const VOLUME = Math.min(1, 0.5 * 1.2 * 0.9); // = 0.54

let initialized = false;
let howls: Howl[] = [];
let current = 0;
let songsActive = false;

function isGloballyMuted(): boolean {
  try {
    return !!window.G?.audio?.isMuted?.();
  } catch {
    return false;
  }
}

/** Silence the generative windowsill speaker so nothing plays on launch. */
function silenceGenerativeMusic(): void {
  const mute = (): void => {
    try {
      const music = window.G?.music;
      if (!music || typeof music.toggle !== 'function') return;
      const muted = typeof music.isMuted === 'function' ? music.isMuted() : false;
      if (!muted) music.toggle();
    } catch {
      /* never let audio housekeeping break the game */
    }
  };
  mute();
  setTimeout(mute, 250); // catch the engine starting on the same first gesture
}

function anyPlaying(): boolean {
  return howls.some((h) => h.playing());
}

/** Play track `i` (wrapping), stopping any other track first so skips don't overlap. */
function playIndex(i: number): void {
  const n = PLAYLIST.length;
  current = ((i % n) + n) % n;
  howls.forEach((h, idx) => {
    if (idx !== current && h.playing()) h.stop();
  });
  const howl = howls[current];
  if (howl && !howl.playing()) howl.play();
}

/** Build the Howler playlist WITHOUT playing — playback waits for the first tap. */
function buildPlaylist(): void {
  Howler.volume(VOLUME);
  Howler.mute(isGloballyMuted());
  howls = PLAYLIST.map(
    (track, i) =>
      new Howl({
        src: [track.url],
        html5: true,
        volume: 1, // global Howler.volume() applies the level
        onend: () => playIndex((i + 1) % PLAYLIST.length), // queue loops once started
        onloaderror: (_id, err) => {
          console.warn(`[cravache audio] failed to load "${track.title}" (${track.url})`, err);
          if (i === current && anyPlaying()) playIndex((i + 1) % PLAYLIST.length);
        },
      })
  );
  songsActive = true;
}

/** Expose the speaker controls to the canvas renderer (tap = start/skip + light). */
function exposeController(): void {
  // Tap starts the queue (if silent) or skips to the next song (if already
  // playing). Songs also auto-advance on end, and the queue loops.
  const next = (): void => {
    if (!songsActive) return; // only our songs; never the lo-fi engine
    Howler.mute(isGloballyMuted());
    if (!anyPlaying()) {
      playIndex(current); // first tap (or after a stop): start the current track
    } else {
      playIndex(current + 1); // skip to the next song
    }
  };
  window.CravacheAlexa = {
    toggle: next,
    next,
    isPlaying: () => {
      if (songsActive) {
        try {
          return anyPlaying();
        } catch {
          return false;
        }
      }
      try {
        return !window.G?.music?.isMuted?.();
      } catch {
        return false;
      }
    },
    hasSongs: () => songsActive,
  };
}

async function anySongExists(): Promise<boolean> {
  const checks = PLAYLIST.map(async (track) => {
    try {
      const res = await fetch(track.url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  });
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/**
 * Entry point — called once on the first user gesture. It only PREPARES audio
 * (and silences anything that would auto-play); actual playback starts when the
 * player taps the Alexa (window.CravacheAlexa.next()).
 */
export function initAudio(): void {
  if (initialized) return;
  initialized = true;

  // Nothing should play on launch — hush the generative engine immediately.
  silenceGenerativeMusic();

  void anySongExists()
    .then((hasSongs) => {
      if (hasSongs) {
        buildPlaylist(); // ready, but silent until the first Alexa tap
      } else {
        console.info(
          '[cravache audio] no song files found; Alexa tap will toggle the generative speaker. ' +
            'Drop public/songs/01.mp3 … 04.mp3 to play real tracks.'
        );
      }
      exposeController();
    })
    .catch((err) => {
      console.warn('[cravache audio] song probe failed.', err);
      exposeController();
    });
}
