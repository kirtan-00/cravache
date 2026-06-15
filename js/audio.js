// CravAche — WebAudio oscillator SFX. No audio files (DESIGN.md engine rules).
(function(){
  'use strict';
  window.G = window.G || {};

  var ctx = null;
  var muted = false;
  var master = null;
  var volume = 1;
  try { volume = parseFloat(localStorage.getItem('cravache_vol')); } catch(e){}
  if(isNaN(volume) || volume === null) volume = 1;

  function ac(){
    if(!ctx){
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function out(){ return master; } // everything routes through the master gain

  // one beep: type, freq start->end, duration, gain
  function beep(type, f0, f1, dur, gain, when){
    if(muted) return;
    var c = ac(); if(!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if(f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out());
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseHit(dur, gain, when){
    if(muted) return;
    var c = ac(); if(!c) return;
    var t = c.currentTime + (when || 0);
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
    var src = c.createBufferSource(); src.buffer = buf;
    var g = c.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g); g.connect(out());
    src.start(t);
  }

  G.audio = {
    unlock: function(){ ac(); },
    setMuted: function(m){ muted = m; },
    isMuted: function(){ return muted; },

    // master volume 0..1, persisted (pause menu: FULL / LOW / OFF)
    setVolume: function(v){
      volume = Math.max(0, Math.min(1, v));
      if(master) master.gain.value = volume;
      try { localStorage.setItem('cravache_vol', String(volume)); } catch(e){}
    },
    getVolume: function(){ return volume; },

    click: function(){ beep('square', 660, 660, 0.05, 0.10); },
    accept: function(){ beep('square', 440, 660, 0.08, 0.12); beep('square', 660, 880, 0.08, 0.12, 0.07); },
    decline: function(){ beep('square', 330, 180, 0.14, 0.12); },
    drop: function(){ beep('triangle', 220, 160, 0.09, 0.18); noiseHit(0.06, 0.10); },
    chaChing: function(){ // money
      beep('square', 988, 988, 0.07, 0.12);
      beep('square', 1319, 1319, 0.18, 0.14, 0.08);
    },
    tickMoney: function(){ beep('square', 1175, 1175, 0.03, 0.035); },
    phoneRing: function(){
      beep('square', 880, 880, 0.09, 0.10);
      beep('square', 740, 740, 0.09, 0.10, 0.11);
      beep('square', 880, 880, 0.09, 0.10, 0.22);
      beep('square', 740, 740, 0.09, 0.10, 0.33);
    },
    alarm: function(){
      beep('sawtooth', 520, 320, 0.22, 0.14);
      beep('sawtooth', 520, 320, 0.22, 0.14, 0.26);
    },
    scrapped: function(){
      beep('sawtooth', 300, 90, 0.4, 0.16);
      noiseHit(0.25, 0.12, 0.05);
    },
    viral: function(){ // arpeggio up + sparkle
      var seq = [523, 659, 784, 1047, 1319, 1568];
      for(var i=0;i<seq.length;i++) beep('square', seq[i], seq[i], 0.10, 0.13, i*0.07);
      noiseHit(0.3, 0.06, 0.4);
    },
    payday: function(){
      beep('triangle', 392, 392, 0.12, 0.14);
      beep('triangle', 494, 494, 0.12, 0.14, 0.12);
      beep('triangle', 587, 587, 0.2, 0.15, 0.24);
    },
    quit: function(){ // door slam
      beep('sawtooth', 200, 60, 0.3, 0.18);
      noiseHit(0.18, 0.2, 0.04);
    },
    slotTick: function(){ beep('square', 1568, 1568, 0.025, 0.05); },

    // water cooler pour: a soft falling-pitch glug + a faint splash of noise.
    waterPour: function(){
      if(muted) return;
      var c = ac(); if(!c) return;
      // descending bubbly "glug-glug" (sine drops in pitch like a draining jug)
      beep('sine', 540, 300, 0.22, 0.10);
      beep('sine', 460, 260, 0.20, 0.08, 0.10);
      beep('sine', 400, 220, 0.18, 0.06, 0.20);
      // faint water hiss / splash on top
      noiseHit(0.18, 0.05, 0.02);
      noiseHit(0.12, 0.035, 0.16);
    },

    // ---------- ambient layer: editors at work ----------
    // 50% earphones (faint hi-hat leak), 25% playing edit music (lo-fi square
    // bassline), 25% Premiere Pro (razor clicks + scrub). Whisper-quiet by
    // default; hovering a desk = leaning in = that editor gets 5x louder.
    ambient: {
      update: function(dt){
        if(muted || !G.state || !G.state.running || G.state.paused) return;
        var s = G.state;
        var hoverIdx = G.render && G.render.office ? G.render.office.hoverDesk : -1;
        var DESKS = G.render && G.render.office ? G.render.office.DESKS : [];
        for(var i = 0; i < s.staff.length; i++){
          var st = s.staff[i];
          if(st.dept !== 'editor' || !st.briefId || !G.time.onClock(st)) continue;
          if(!st._amb) st._amb = { mode: null, modeT: 0, sfxT: 0, note: 0 };
          var a = st._amb;

          a.modeT -= dt;
          if(a.modeT <= 0){
            // 50/25/25 split, holds for 8-16s
            var r = Math.random();
            a.mode = r < 0.5 ? 'phones' : (r < 0.75 ? 'music' : 'premiere');
            a.modeT = 8 + Math.random() * 8;
          }

          var boost = (hoverIdx >= 0 && hoverIdx === st.desk) ? 5 : 1;
          a.sfxT -= dt;
          if(a.sfxT > 0) continue;

          if(a.mode === 'phones'){
            // hi-hat leak from the earphones: tss... tss...
            noiseHit(0.03, 0.006 * boost);
            a.sfxT = 0.42 + Math.random() * 0.2;
          } else if(a.mode === 'music'){
            // 4-note lo-fi bassline, loops
            var bass = [110, 110, 147, 131];
            beep('square', bass[a.note % 4], bass[a.note % 4], 0.16, 0.009 * boost);
            a.note++;
            a.sfxT = 0.38;
          } else {
            // premiere: razor click-click, occasional scrub
            beep('square', 1250, 1250, 0.018, 0.012 * boost);
            beep('square', 980, 980, 0.018, 0.010 * boost, 0.07);
            if(Math.random() < 0.25) noiseHit(0.08, 0.008 * boost, 0.16);
            a.sfxT = 0.9 + Math.random() * 0.9;
          }
        }
      }
    },
    gameOver: function(){
      beep('sawtooth', 440, 110, 0.7, 0.16);
      beep('sawtooth', 330, 82, 0.9, 0.14, 0.3);
    },
    win: function(){
      var seq = [523, 659, 784, 659, 784, 1047];
      for(var i=0;i<seq.length;i++) beep('triangle', seq[i], seq[i], 0.16, 0.15, i*0.13);
    }
  };
})();
