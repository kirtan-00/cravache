// CravAche — DOM HUD: top chips. Every number change animates (count-up).
(function(){
  'use strict';
  window.G = window.G || {};

  var el = {};
  var lastRepShown = null;

  function fmtMoney(n){
    // Indian grouping: ₹2,00,000
    n = Math.round(n);
    var neg = n < 0; n = Math.abs(n);
    var str = String(n);
    if(str.length > 3){
      var last3 = str.slice(-3);
      var rest = str.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      str = rest + ',' + last3;
    }
    return (neg ? '-₹' : '₹') + str;
  }
  G.fmtMoney = fmtMoney;

  G.hud = {
    init: function(){
      el.money = document.getElementById('hud-money');
      el.rep = document.getElementById('hud-rep');
      el.chaos = document.getElementById('hud-chaos');
      el.chaosFill = document.getElementById('hud-chaos-fill');
      el.clock = document.getElementById('hud-clock');
      el.week = document.getElementById('hud-week');
      el.mute = document.getElementById('btn-mute');

      el.mute.addEventListener('click', function(){
        var s = G.state;
        s.muted = !s.muted;
        G.audio.setMuted(s.muted);
        el.mute.textContent = s.muted ? 'SND OFF' : 'SND ON';
        if(!s.muted) G.audio.click();
      });
    },

    update: function(dt){
      var s = G.state;

      // first frame: paint real starting values (HTML placeholder says ₹0)
      if(!this._painted){
        this._painted = true;
        el.money.textContent = fmtMoney(s.moneyShown);
        el.rep.textContent = Math.round(s.rep);
      }

      // money count-up: shown value chases real value in chunky steps
      var diff = s.money - s.moneyShown;
      if(Math.abs(diff) > 0.5){
        var step = diff * Math.min(1, dt * 6);
        if(Math.abs(step) < 1) step = Math.sign(diff);
        s.moneyShown += step;
        el.money.textContent = fmtMoney(s.moneyShown);
        el.money.classList.toggle('flash-up', diff > 0);
        el.money.classList.toggle('flash-down', diff < 0);
      } else if(s.moneyShown !== s.money){
        s.moneyShown = s.money;
        el.money.textContent = fmtMoney(s.money);
        el.money.classList.remove('flash-up', 'flash-down');
      }

      if(lastRepShown !== s.rep){
        lastRepShown = s.rep;
        el.rep.textContent = Math.round(s.rep);
      }

      var c = Math.round(s.chaos);
      el.chaos.textContent = c + '%';
      el.chaosFill.style.width = c + '%';
      el.chaosFill.classList.toggle('hot', c >= 60);

      el.clock.textContent = G.time.clockString();
      el.week.textContent = 'WK ' + s.week + (s.endless ? ' · OVERTIME' : ' · Q1');
    },

    // bump animation on a chip
    poke: function(which){
      var id = { money: 'chip-money', rep: 'chip-rep', chaos: 'chip-chaos' }[which];
      if(!id) return;
      var chip = document.getElementById(id);
      if(!chip) return;
      chip.classList.remove('bump');
      void chip.offsetWidth; // restart animation
      chip.classList.add('bump');
    },

    flashDayBanner: function(){
      var s = G.state;
      var names = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
      G.dock.infoToast('WK ' + s.week, names[s.day - 1] + '. The briefs do not know it is morning.', '');
    }
  };
})();
