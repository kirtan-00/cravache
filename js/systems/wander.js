// CravAche — the water cooler. Owned only. Every ~20-30 real seconds during
// the day it pulls up to 2 genuinely idle staffers off their desks; they walk
// over (straight-line lerp), gossip for a few seconds (burnout drains faster),
// then walk back. Assign a brief to one mid-trip and they snap home instantly.
//
// Trip state lives on the staffer as st.away = {x,y,fx,fy,tx,ty,mode,t,slot}.
// office.js drawDesks reads st.away and draws them at st.away.{x,y} instead of
// at the desk. It is plain serializable data, but trips are transient theatre,
// so save.js strips st.away on store(): a reload starts everyone seated.
(function(){
  'use strict';
  window.G = window.G || {};

  var WALK_DUR = 2.5;          // seconds desk -> cooler (and back)
  var CHAT_MIN = 4, CHAT_MAX = 6;
  var COOLDOWN_MIN = 20, COOLDOWN_MAX = 30;
  var BURNOUT_FLOOR = 10;      // only people with something to recover bother

  var cooldown = 8;            // first gathering can happen fairly soon

  // agency-flavored gossip, no em dashes. Paired turns between two staffers.
  var GOSSIP = [
    'client approved v1. then asked for v1 back.',
    'heard finance is "looking into" the chai budget.',
    'the CEO replied "interesting" to my idea. we are doomed.',
    'someone booked a 4pm friday call. on purpose.',
    'i told them it goes viral. i have no idea what that means.',
    'new intern thinks revisions are optional. adorable.',
    'they want it minimal AND they want everything on it.',
    'my mouse double clicks now. like my will to live.',
    'apparently the deck is "almost there". it is not there.',
    'i said yes to a brief in my sleep. it is on the tray.'
  ];
  var QUIPS = ['...', '😂', 'fr', 'lol', 'haan', 'arre', 'no way', 'said that'];

  function coolerSpots(){
    // two standing spots flanking the cooler (feet line), turned toward it
    var p = G.render.coolerPoint(); // bottom-centre of the unit
    return [
      { x: p.x - 46, y: p.y + 16 },
      { x: p.x + 34, y: p.y + 16 }
    ];
  }

  // a staffer's home position = where office.js would draw them at their desk.
  function homePos(st){
    var DESKS = G.render.office.DESKS;
    var d = DESKS[st.desk];
    if(!d) return null;
    return { x: d.x, y: d.y - 32 }; // roughly the sprite's torso anchor
  }

  // is this staffer free to wander right now?
  function eligible(st){
    return !st.briefId &&                 // not on a task
           !st.away &&                    // not already out
           G.time.onClock(st) &&          // physically in the office
           st.burnout > BURNOUT_FLOOR;    // has something to gossip off
  }

  G.wander = {
    // pull up to `n` idle staffers to the cooler. Returns how many left their
    // desk. Exposed so tests / debug can trigger a gathering directly.
    gather: function(n){
      var s = G.state;
      if(!s.upgrades.cooler) return 0;
      var pool = s.staff.filter(eligible);
      if(pool.length < 1) return 0;
      // shuffle-ish pick
      pool.sort(function(){ return Math.random() - 0.5; });
      var take = pool.slice(0, Math.min(n || 2, 2, pool.length));
      var spots = coolerSpots();
      take.forEach(function(st, i){
        var home = homePos(st);
        if(!home) return;
        var spot = spots[i] || spots[0];
        st.away = {
          x: home.x, y: home.y,
          fx: home.x, fy: home.y,        // from (desk)
          tx: spot.x, ty: spot.y,        // to (cooler)
          mode: 'going', t: 0,
          chatDur: CHAT_MIN + Math.random() * (CHAT_MAX - CHAT_MIN),
          slot: i
        };
      });
      return take.length;
    },

    update: function(dt){
      var s = G.state;

      // schedule new gatherings (day only, owned only)
      if(s.upgrades.cooler && !s.night){
        cooldown -= dt;
        if(cooldown <= 0){
          cooldown = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
          this.gather(1 + Math.floor(Math.random() * 2)); // 1 or 2
        }
      }

      // advance everyone currently away
      for(var i = 0; i < s.staff.length; i++){
        var st = s.staff[i];
        var a = st.away;
        if(!a) continue;

        // assigned a brief mid-trip, or sent home by night: snap back, cancel
        if(st.briefId || !G.time.onClock(st)){
          st.away = null;
          continue;
        }

        a.t += dt;
        // a tapped one-line gripe (set in office handleClick) fades on its own
        // while they walk; the chatting branch manages its own bubble timing.
        if(a.mode !== 'chatting' && a.bubble){
          a.bubbleT -= dt;
          if(a.bubbleT <= 0) a.bubble = null;
        }
        if(a.mode === 'going' || a.mode === 'returning'){
          var f = Math.min(1, a.t / WALK_DUR);
          // ease nothing; pixel people march. slight vertical bob while walking.
          a.x = a.fx + (a.tx - a.fx) * f;
          a.y = a.fy + (a.ty - a.fy) * f + (f < 1 ? Math.sin(a.t * 12) * 2 : 0);
          if(f >= 1){
            if(a.mode === 'going'){
              a.mode = 'chatting'; a.t = 0;
              a.bubble = pickGossip(); a.bubbleT = 1.6;
            } else {
              st.away = null; // home at last
            }
          }
        } else if(a.mode === 'chatting'){
          // drain burnout 3x the idle rate while chatting
          st.burnout = Math.max(0, st.burnout - G.BAL.BURNOUT_IDLE_RECOVER * 3 * dt);
          // alternate bubbles between the two
          a.bubbleT -= dt;
          if(a.bubbleT <= 0){
            a.bubble = pickQuip(a);
            a.bubbleT = 1.2 + Math.random() * 1.4;
          }
          if(a.t >= a.chatDur){
            // walk home: flip from/to
            a.fx = a.x; a.fy = a.ty;
            var home = homePos(st);
            a.tx = home ? home.x : a.x;
            a.ty = home ? home.y : a.y;
            a.mode = 'returning'; a.t = 0; a.bubble = null;
          }
        }
      }
    }
  };

  function pickGossip(){ return GOSSIP[Math.floor(Math.random() * GOSSIP.length)]; }
  function pickQuip(a){
    // first slot leans gossip lines, second leans short reactions: a back-and-forth
    if(a.slot === 0 && Math.random() < 0.6) return pickGossip();
    return QUIPS[Math.floor(Math.random() * QUIPS.length)];
  }
})();
