// CravAche — autosave to localStorage. Come back anytime, the chaos waited.
// Brief defs are stored as ids and rehydrated on load (content can be big).
(function(){
  'use strict';
  window.G = window.G || {};

  var KEY = 'cravache_save_v1';
  var VERSION = 5; // bump when the state shape changes; old saves are discarded

  function defById(id){
    var i;
    for(i = 0; i < G.data.briefs.length; i++) if(G.data.briefs[i].id === id) return G.data.briefs[i];
    for(i = 0; i < G.INTERNAL_BRIEFS.length; i++) if(G.INTERNAL_BRIEFS[i].id === id) return G.INTERNAL_BRIEFS[i];
    return null;
  }

  G.save = {
    exists: function(){
      try {
        var raw = localStorage.getItem(KEY);
        if(!raw) return false;
        var box = JSON.parse(raw);
        return box.v === VERSION && box.state && !box.state.gameOver;
      } catch(e){ return false; }
    },

    store: function(){
      var s = G.state;
      if(!s || !s.running) return;
      try {
        var copy = JSON.parse(JSON.stringify(s, function(k, v){
          if(k === 'def' && v && v.id) return { __defId: v.id };
          if(k === 'away') return undefined; // cooler trips are transient theatre
          return v;
        }));
        // transient things do not survive a reload
        copy.pendingToasts = 0;
        copy.activeCall = null;
        copy.paused = false;
        localStorage.setItem(KEY, JSON.stringify({ v: VERSION, t: 1, state: copy }));
      } catch(e){ /* quota or private mode: play on without saves */ }
    },

    load: function(){
      try {
        var box = JSON.parse(localStorage.getItem(KEY));
        if(!box || box.v !== VERSION) return null;
        var s = box.state;
        // rehydrate brief defs
        s.briefs = (s.briefs || []).filter(function(b){
          if(b.def && b.def.__defId){ b.def = defById(b.def.__defId); }
          return !!b.def;
        });
        s.briefDeck = (s.briefDeck || []).map(function(d){
          return d && d.__defId ? defById(d.__defId) : d;
        }).filter(Boolean);
        // older saves predate the IG/craanes/clickables fields: fill defaults
        if(s.followers === undefined) s.followers = G.BAL.START_FOLLOWERS;
        s.trophies = s.trophies || [];
        s.craanesDone = s.craanesDone || {};
        if(s.chaiDay === undefined) s.chaiDay = -1;
        s.printerJammed = !!s.printerJammed;
        // upgrades + their fields added after VERSION 4
        s.upgrades = s.upgrades || {};
        if(s.upgrades.tv === undefined) s.upgrades.tv = false;
        if(s.upgrades.cooler === undefined) s.upgrades.cooler = false;
        if(s.neonText === undefined) s.neonText = 'CRAVACHE';
        if(s.tvChannel === undefined) s.tvChannel = 0;
        s.staff.forEach(function(st){ if(st.away) st.away = null; }); // drop stale trips
        s.stats.weekViral = s.stats.weekViral || 0;
        s.stats.weekFollowers = s.stats.weekFollowers || 0;
        s.staff.forEach(function(st){ st.shippedWeek = st.shippedWeek || 0; });
        return s;
      } catch(e){ return null; }
    },

    clear: function(){
      try { localStorage.removeItem(KEY); } catch(e){}
    }
  };
})();
