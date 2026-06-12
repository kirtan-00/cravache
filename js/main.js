// CravAche — boot, fixed-timestep loop, input wiring, stage scaling,
// screen shake, win/lose. Everything else lives in systems/ and render/.
(function(){
  'use strict';
  window.G = window.G || {};

  var canvas, ctx, stageEl;
  var last = 0;
  var SIM_STEP = 1 / 60;
  var acc = 0;

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

      // canvas clicks (quotes wall, staffers) in logical coords
      canvas.addEventListener('click', function(e){
        if(!G.state || !G.state.running || G.state.paused) return;
        var r = canvas.getBoundingClientRect();
        var s = r.width / 1280;
        G.render.office.handleClick((e.clientX - r.left) / s, (e.clientY - r.top) / s);
      });

      var startBtn = document.getElementById('btn-start');
      startBtn.addEventListener('click', function(){
        G.audio.unlock();
        G.audio.accept();
        document.getElementById('start-screen').classList.add('hidden');
        G.main.start();
      });
    },

    start: function(){
      G.state = G.initialState();
      G.state.running = true;
      G.state.staff.forEach(function(st){ G.staff.seat(st); });
      G.briefs.init();
      G.dock.refreshTray();
      G.dock.refreshCollect();
      G.hud.flashDayBanner();
    },

    screenShake: function(){
      stageEl.classList.remove('shake');
      void stageEl.offsetWidth; // restart css animation
      stageEl.classList.add('shake');
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
  }

  function frame(ts){
    requestAnimationFrame(frame);
    var rdt = Math.min(0.1, (ts - last) / 1000 || 0);
    last = ts;
    if(!G.state) return;

    var s = G.state;
    var simActive = s.running && !s.paused && !s.gameOver;

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

    G.render.office.draw(ctx, simActive ? rdt : 0);
    G.hud.update(rdt);
    G.dock.update(simActive ? rdt : 0, rdt);
    G.modals.update(rdt);
  }

  window.addEventListener('DOMContentLoaded', function(){
    G.data.load().then(function(){
      G.state = G.initialState(); // pre-start state so HUD has numbers behind the start screen
      G.main.init();
      requestAnimationFrame(function(ts){ last = ts; requestAnimationFrame(frame); });
    });
  });
})();
