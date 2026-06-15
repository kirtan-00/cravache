// CravAche — chaos meter 0-100. Rises on failures, decays only when everything
// is on-track. 100 = office on fire = game over.
(function(){
  'use strict';
  window.G = window.G || {};

  G.chaos = {
    add: function(n){
      var s = G.state;
      s.chaos = Math.max(0, Math.min(100, s.chaos + n));
      if(n > 0) G.hud.poke('chaos');
      if(s.chaos >= 100 && !s.gameOver){
        G.main.loseGame('chaos');
      }
    },

    update: function(dt){
      var s = G.state;
      // arcade cabinet: people sneak away to play. A tiny, constant distraction tax.
      // (MINOR — the +20% idle recovery it grants is the trade-off.)
      if(s.upgrades.arcade) s.chaos = Math.min(100, s.chaos + G.BAL.ARCADE_CHAOS_PER_SEC * dt);
      if(s.chaos <= 0) return;
      // decay only when all briefs on-track and nobody about to snap
      var onTrack = s.briefs.every(function(b){
        if(b.status !== 'tray' && b.status !== 'assigned') return true;
        return b.deadlineLeft > b.deadlineTotal * 0.15;
      });
      var calmStaff = s.staff.every(function(st){ return st.burnout < 85; });
      if(onTrack && calmStaff){
        // the office TV: background noise calms the room 15% faster
        var rate = G.BAL.CHAOS_DECAY_PER_SEC * (s.upgrades.tv ? 1.15 : 1);
        s.chaos = Math.max(0, s.chaos - rate * dt);
      } else {
        // off-track (a brief gone critical or someone about to snap): chaos
        // doesn't just stall, it CLIMBS — the room gets worse on its own and
        // snowballs toward the wall. This makes hitting max a real threat.
        s.chaos = Math.min(100, s.chaos + (G.BAL.CHAOS_CREEP_OFFTRACK || 1.2) * dt);
        if(s.chaos >= 100 && !s.gameOver) G.main.loseGame('chaos');
      }
    }
  };
})();
