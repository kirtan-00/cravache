// CravAche — boot, fixed-timestep loop, input wiring, stage scaling,
// screen shake, win/lose. Everything else lives in systems/ and render/.
(function(){
  'use strict';
  window.G = window.G || {};

  var canvas, ctx, stageEl;
  var last = 0;
  var SIM_STEP = 1 / 60;
  var acc = 0;
  var saveT = 0;

  G.main = {
    init: function(){
      canvas = document.getElementById('game');
      ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      stageEl = document.getElementById('stage');

      fitStage();
      window.addEventListener('resize', fitStage);

      G.hud.init();
      G.dock.init();
      G.modals.init();

      // canvas clicks (quotes wall, staffers) in logical coords — routed to the
      // active scene (office or production studio).
      canvas.addEventListener('click', function(e){
        if(!G.state || !G.state.running || G.state.paused) return;
        var r = canvas.getBoundingClientRect();
        var s = r.width / 1280;
        var lx = (e.clientX - r.left) / s, ly = (e.clientY - r.top) / s;
        if(G.state.scene === 'studio' && G.render.studio){ G.render.studio.handleClick(lx, ly); }
        else { G.render.office.handleClick(lx, ly); }
      });

      // hover tracking: leaning in to a desk (drives the ambient audio boost)
      canvas.addEventListener('pointermove', function(e){
        var r = canvas.getBoundingClientRect();
        var s = r.width / 1280;
        if(G.state && G.state.scene === 'studio') return; // studio uses tap, not hover
        G.render.office.setHover((e.clientX - r.left) / s, (e.clientY - r.top) / s);
      });
      canvas.addEventListener('pointerleave', function(){
        G.render.office.hoverDesk = -1;
      });

      var startBtn = document.getElementById('btn-start');
      startBtn.addEventListener('click', function(){
        G.audio.unlock();
        G.audio.accept();
        G.save.clear();
        document.getElementById('start-screen').classList.add('hidden');
        G.main.start();
      });

      // resume a saved shift
      var contBtn = document.getElementById('btn-continue');
      if(G.save.exists()){
        contBtn.classList.remove('hidden');
        contBtn.addEventListener('click', function(){
          var loaded = G.save.load();
          G.audio.unlock();
          if(!loaded){ G.main.start(); }
          else {
            G.state = loaded;
            G.state.running = true;
            G.hud._painted = false; // repaint chips for the swapped-in state
            G.dock.refreshTray();
            G.dock.refreshCollect();
            G.dock.infoToast('WELCOME BACK', 'The chaos kept your seat warm. ' + G.fmtMoney(G.state.money) + ' in the account.', 'good');
          }
          G.audio.accept();
          document.getElementById('start-screen').classList.add('hidden');
        });
      }

      document.getElementById('btn-letsgo').addEventListener('click', function(){
        G.main.letsGo();
      });

      // pause menu: the chip or ESC (only when actually playing, no modal up)
      function openPause(){
        if(!G.state || !G.state.running || G.state.gameOver) return;
        if(G.modals.anyOpen()) return;
        G.audio.click();
        G.modals.showPauseMenu();
      }
      document.getElementById('btn-pause').addEventListener('click', openPause);
      window.addEventListener('keydown', function(e){
        if(e.key === 'Escape') openPause();
      });
    },

    start: function(){
      G.state = G.initialState();
      G.state.running = true;
      G.hud._painted = false;
      G.state.staff.forEach(function(st){ G.staff.seat(st); });
      G.briefs.init();
      G.dock.refreshTray();
      G.dock.refreshCollect();
      G.hud.flashDayBanner();
      // welcome nudge: encourage players to poke around the office (the props,
      // the people, the studio are all tappable). Lands just after the day banner.
      setTimeout(function(){
        if(G.dock && G.dock.infoToast){
          G.dock.infoToast('BE CURIOUS', 'Tap things — the people, the chai, the speaker, the screen. Poke around.', '');
        }
      }, 2600);
    },

    screenShake: function(){
      stageEl.classList.remove('shake');
      void stageEl.offsetWidth; // restart css animation
      stageEl.classList.add('shake');
    },

    // investor bailout: cash injection, slate half-cleaned, restructure mode
    investorBailout: function(){
      var s = G.state;
      s.bailouts++;
      var cash = s.bailouts === 1 ? 100000 : 175000; // scaled to the tighter economy
      s.money = Math.max(s.money, 0) + cash; // moneyShown counts up to it on screen
      s.chaos = Math.min(s.chaos, 45);
      s.strikes = 0;
      s.rep = Math.max(0, s.rep - 5 * s.bailouts);
      s.gameOver = null;
      s.running = true;
      s.restructure = true;
      document.getElementById('restructure').classList.remove('hidden');
      G.audio.chaChing();
      G.dock.infoToast('INVESTOR ON BOARD', G.fmtMoney(cash) + ' wired. They said "last time" in a way that sounded legal.', 'good');
      G.save.store();
    },

    // restructure done: back to the grind
    letsGo: function(){
      G.state.restructure = false;
      document.getElementById('restructure').classList.add('hidden');
      G.audio.accept();
      G.hud.flashDayBanner();
    },

    // OVERTIME: endless mode past Q1. The curves in state.js keep tightening.
    enterEndless: function(){
      var s = G.state;
      s.endless = true;
      s.gameOver = null;
      s.running = true;
      G.time.advanceToMonday();
      G.dock.infoToast('OVERTIME', 'No more quarters. No more finish line. Just briefs. RETIRE button lives on the Friday report.', 'good');
    },

    winGame: function(){
      var s = G.state;
      if(s.gameOver) return;
      s.gameOver = { type: 'win' };
      s.running = false;
      G.audio.win();
      G.modals.showWin();
    },

    loseGame: function(type){
      var s = G.state;
      if(s.gameOver) return;
      s.gameOver = { type: type };
      s.running = false;
      G.audio.gameOver();
      G.modals.showLose(type);
    }
  };

  // letterbox-fit the fixed 1280x720 stage to the window
  function fitStage(){
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.min(w / 1280, h / 720);
    stageEl.style.transform = 'scale(' + s + ')';
    // publish the live scale so shake/juice animations can COMPOSE with it
    // instead of overwriting transform (which made the viral burst snap size).
    stageEl.style.setProperty('--stage-scale', s);
    stageEl.style.left = Math.round((w - 1280 * s) / 2) + 'px';
    stageEl.style.top = Math.round((h - 720 * s) / 2) + 'px';
  }

  function simTick(dt){
    G.time.update(dt);
    if(G.state.gameOver) return;
    G.briefs.update(dt);
    G.staff.update(dt);
    G.economy.update(dt);
    G.growth.update(dt);
    G.chaos.update(dt);
    G.events.update(dt);
    if(G.wander) G.wander.update(dt);
  }

  function frame(ts){
    requestAnimationFrame(frame);
    var rdt = Math.min(0.1, (ts - last) / 1000 || 0);
    last = ts;
    if(!G.state) return;

    var s = G.state;
    // medFreeze is its OWN flag, written only by meditation — so the lifeline /
    // WhatsApp code that pokes G.state.paused directly can never thaw a meditation.
    var simActive = s.running && !s.paused && !s.medFreeze && !s.gameOver && !s.restructure;

    // autosave every ~5s while playing
    saveT += rdt;
    if(saveT > 5 && simActive){
      saveT = 0;
      G.save.store();
    }

    // fixed-step sim so balance is framerate-independent
    if(simActive){
      acc += rdt;
      var guard = 0;
      while(acc >= SIM_STEP && guard < 8){
        simTick(SIM_STEP);
        acc -= SIM_STEP;
        guard++;
      }
    }

    if(s.scene === 'studio' && G.render.studio){
      G.render.studio.draw(ctx, simActive ? rdt : 0);
    } else {
      G.render.office.draw(ctx, simActive ? rdt : 0);
    }
    G.hud.update(rdt);
    G.dock.update(simActive ? rdt : 0, rdt);
    G.modals.update(rdt);
    if(simActive) G.audio.ambient.update(rdt);
  }

  window.addEventListener('DOMContentLoaded', function(){
    G.data.load().then(function(){
      G.state = G.initialState(); // pre-start state so HUD has numbers behind the start screen
      G.main.init();
      requestAnimationFrame(function(ts){ last = ts; requestAnimationFrame(frame); });
    });
  });
})();
