// CravAche — ambient lo-fi music engine. Diegetically the little Alexa-style
// smart speaker on the windowsill. Generative chiptune via WebAudio only (no
// audio files — must work offline in the PWA). Cozy late-night loop: warm pad
// chords + soft plucky arp + gentle kick/hat, lowpassed for warmth, low gain so
// it can play forever without getting annoying. Public API on G.music.
(function(){
  'use strict';
  window.G = window.G || {};

  // ---- config ----
  var MASTER_GAIN = 0.115;     // low: this plays all the time
  var LOWPASS_HZ  = 1800;      // gentle warmth, kills harsh chiptune top end
  var BPM         = 74;        // slow, cozy
  var BEAT        = 60 / BPM;  // seconds per beat
  var STEP        = BEAT / 2;  // 8th-note grid
  var STEPS       = 16;        // one bar = 16 steps (one chord per bar)

  // Am9 → Dm7 → G → Cmaj7  (i–iv–VII–III warm progression)
  // pad voicings (Hz), low dissonance, close voicing
  var CHORDS = [
    { pad: [220.00, 261.63, 329.63, 493.88], arp: [440.00, 523.25, 659.25, 587.33] }, // Am9
    { pad: [146.83, 220.00, 261.63, 349.23], arp: [293.66, 349.23, 440.00, 523.25] }, // Dm7
    { pad: [196.00, 246.94, 293.66, 392.00], arp: [392.00, 493.88, 587.33, 493.88] }, // G
    { pad: [130.81, 196.00, 246.94, 329.63], arp: [392.00, 523.25, 659.25, 493.88] }  // Cmaj7
  ];
  // arp 8th pattern over the bar (indexes into the chord's arp array; -1 = rest)
  var ARP_SEQ = [0, 2, 1, 3, 0, 2, 3, 1, 0, 2, 1, 3, 2, 0, 3, 1];

  // ---- state ----
  var ctx = null, master = null, lp = null, delay = null, delayGain = null;
  var started = false, muted = false, globalMuted = false;
  var schedTimer = null;
  var nextStepTime = 0;     // ctx time of the next step to schedule
  var stepIndex = 0;        // running step counter (mod STEPS for bar position)
  var barIndex = 0;         // which chord
  var SCHED_AHEAD = 0.2;    // seconds to schedule ahead
  var LOOKAHEAD = 40;       // ms timer interval

  // honor persisted mute preference
  try { muted = (localStorage.getItem('cravache_music_off') === '1'); } catch(e){}

  function applyGain(ramp){
    if(!master || !ctx) return;
    var target = (muted || globalMuted) ? 0.0001 : MASTER_GAIN;
    var now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), now + (ramp || 0.4));
    } catch(e){ try { master.gain.value = target; } catch(e2){} }
  }

  // detect a global "mute everything" from audio.js if it exists
  function detectGlobalMute(){
    try {
      if(window.G && G.audio && typeof G.audio.isMuted === 'function'){
        globalMuted = !!G.audio.isMuted();
      }
    } catch(e){}
  }

  function ensureCtx(){
    if(ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.0001;          // start silent, ramp up on start

    lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = LOWPASS_HZ;
    lp.Q.value = 0.4;

    // subtle feedback delay for a little space
    delay = ctx.createDelay(1.0);
    delay.delayTime.value = BEAT * 0.75;
    delayGain = ctx.createGain();
    delayGain.gain.value = 0.22;

    // routing: voices -> lp -> master -> destination
    //          lp also feeds delay -> delayGain -> back into lp (gentle feedback)
    lp.connect(master);
    lp.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(delay);   // feedback
    delayGain.connect(master);  // wet into master
    master.connect(ctx.destination);
    return ctx;
  }

  // ---- voices ----
  function padVoice(freqs, time){
    // warm sustained chord: triangle+sine pair per note, slow attack/release
    var dur = BEAT * 4;       // a whole bar
    for(var n = 0; n < freqs.length; n++){
      var f = freqs[n];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.06 / freqs.length + 0.02, time + 0.6);  // slow attack
      g.gain.setValueAtTime(0.06 / freqs.length + 0.02, time + dur - 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);                       // slow release
      g.connect(lp);

      var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'sine';     o2.frequency.value = f * 2;
      var g2 = ctx.createGain(); g2.gain.value = 0.4;          // softer upper octave
      o1.connect(g); o2.connect(g2); g2.connect(g);
      o1.start(time); o1.stop(time + dur + 0.05);
      o2.start(time); o2.stop(time + dur + 0.05);
    }
  }

  function arpVoice(freq, time, vel){
    var dur = STEP * 0.9;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.07 * vel, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    g.connect(lp);
    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(g);
    o.start(time); o.stop(time + dur + 0.02);
  }

  function kick(time){
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.11, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    g.connect(master);   // kick bypasses lowpass for a bit of body
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(46, time + 0.12);
    o.connect(g);
    o.start(time); o.stop(time + 0.18);
  }

  function hat(time, vel){
    // short filtered noise burst
    var len = Math.floor(ctx.sampleRate * 0.03);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for(var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    var g = ctx.createGain(); g.gain.value = 0.03 * vel;
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(time);
  }

  // schedule a single 8th-note step
  function scheduleStep(barPos, time){
    if(barPos === 0){
      // new bar: advance chord + lay down the pad
      padVoice(CHORDS[barIndex % CHORDS.length].pad, time);
    }
    var chord = CHORDS[barIndex % CHORDS.length];

    // arp: occasionally drop a note + vary velocity so it isn't robotic
    var ai = ARP_SEQ[barPos];
    if(ai >= 0 && Math.random() > 0.14){
      var vel = 0.7 + Math.random() * 0.45;
      arpVoice(chord.arp[ai], time, vel);
    }

    // soft kick on beats (every 2 steps = quarter notes); skip the odd one sometimes
    if(barPos % 4 === 0){
      kick(time);
    } else if(barPos % 4 === 2 && Math.random() > 0.4){
      kick(time);
    }

    // quiet closed hat on the offbeat 8ths
    if(barPos % 2 === 1){
      hat(time, 0.7 + Math.random() * 0.5);
    }
  }

  function scheduler(){
    if(!ctx) return;
    while(nextStepTime < ctx.currentTime + SCHED_AHEAD){
      var barPos = stepIndex % STEPS;
      scheduleStep(barPos, nextStepTime);
      nextStepTime += STEP;
      stepIndex++;
      if(stepIndex % STEPS === 0) barIndex++;   // next chord at each bar boundary
    }
  }

  function startLoop(){
    if(schedTimer) return;
    nextStepTime = ctx.currentTime + 0.08;
    stepIndex = 0;
    barIndex = 0;
    scheduler();
    schedTimer = setInterval(scheduler, LOOKAHEAD);
  }

  function start(){
    try {
      if(started) return;
      var c = ensureCtx();
      if(!c) return;                 // no WebAudio: no-op gracefully
      if(c.state === 'suspended'){ try { c.resume(); } catch(e){} }
      detectGlobalMute();
      started = true;
      startLoop();
      applyGain(0.8);                // gentle fade in (respects mute flags)
    } catch(e){ /* never break the game */ }
  }

  function toggle(){
    try {
      muted = !muted;
      try { localStorage.setItem('cravache_music_off', muted ? '1' : '0'); } catch(e){}
      if(!started && !muted){ start(); return muted; }
      if(ctx && ctx.state === 'suspended'){ try { ctx.resume(); } catch(e){} }
      applyGain(0.5);
    } catch(e){}
    return muted;
  }

  function syncFromGlobal(){
    // re-read the global mute (HUD #btn-mute) and ramp music accordingly
    var prev = globalMuted;
    detectGlobalMute();
    if(globalMuted !== prev) applyGain(0.4);
  }

  // ---- autoplay-safe boot: first user gesture creates/resumes the context ----
  function firstGesture(){
    document.removeEventListener('pointerdown', firstGesture, true);
    var btn = document.getElementById('btn-start');
    if(btn) btn.removeEventListener('click', firstGesture);
    start();
  }
  try {
    document.addEventListener('pointerdown', firstGesture, true);
    var bootHook = function(){
      var btn = document.getElementById('btn-start');
      if(btn) btn.addEventListener('click', firstGesture);
      // keep in sync with the game's global mute button if present
      var mb = document.getElementById('btn-mute');
      if(mb) mb.addEventListener('click', function(){ setTimeout(syncFromGlobal, 0); });
    };
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', bootHook);
    } else {
      bootHook();
    }
  } catch(e){}

  // ---- public API ----
  G.music = {
    start: start,
    toggle: toggle,
    isMuted: function(){ return !!(muted || globalMuted); },
    sync: syncFromGlobal,
    get started(){ return started; }
  };
})();
