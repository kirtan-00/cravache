// CravAche — DOM bottom tray + toasts + drag-drop of brief cards onto canvas
// desk hitboxes. Brief toasts auto-decline; tray cards show live deadlines and
// the fine print (skimming it is how you lose, so it is right there).
(function(){
  'use strict';
  window.G = window.G || {};

  var trayEl, toastsEl, countEl, hintEl, ghostEl, stageEl;
  // brief OFFERS are now a compact vertical stack in the top-right corner
  // (#brief-offers), one card on top of another, each with its own draining
  // timer. See showBriefToast / renderOffers below.
  var offersEl = null;    // #brief-offers container (created at runtime)
  var briefOffers = [];   // {def, cb, t, total, done, key, el?, fill?, leaving?}
  var offerKey = 0;
  var OFFER_CAP = 3;      // max visible cards; the rest wait behind a "+N more" pill

  var infoToasts = [];    // {el, t}  (bottom toast column, unchanged)
  var moreChip = null;    // the info "+N more" collapse chip
  var TOAST_CAP = 3;      // max visible info toasts; rest collapse

  // cap the visible info-toast column at TOAST_CAP, newest on top. Older toasts
  // past the cap are hidden and summarised by a single "+N more" chip.
  function reflowToasts(){
    if(!toastsEl) return;
    var nodes = [];
    for(var i = 0; i < toastsEl.children.length; i++){
      var c = toastsEl.children[i];
      if(c !== moreChip) nodes.push(c);
    }
    var hidden = 0;
    for(var j = 0; j < nodes.length; j++){
      var keep = j >= nodes.length - TOAST_CAP;
      nodes[j].classList.toggle('hidden', !keep);
      if(!keep) hidden++;
    }
    if(hidden > 0){
      if(!moreChip){
        moreChip = document.createElement('div');
        moreChip.className = 'toast-more';
      }
      moreChip.textContent = '+' + hidden + ' more';
      toastsEl.appendChild(moreChip); // stays at the bottom
    } else if(moreChip && moreChip.parentNode){
      moreChip.remove();
    }
  }

  // ---- brief OFFER stack (top-right) ---------------------------------------
  // The card markup for a single offer. Compact: header (NEW BRIEF · client ·
  // pips + urgency), title, sub-line (role · fee · N days), optional fine print,
  // SIGN/PASS buttons, and a thin timer bar.
  function offerCardHTML(def){
    var c = G.data.clientById(def.clientId);
    var u = urgency(def);
    return '<div class="bo-head">NEW BRIEF · ' + esc(c ? c.name : '???') + ' · ' + diffPips(def.difficulty) +
        '<span class="bo-urgency ' + u.cls + '">' + u.label + '</span></div>' +
      '<div class="bo-title">' + esc(def.title) + '</div>' +
      '<div class="bo-sub">' + roleChip(def.role) +
        ' <span class="bo-fee">' + G.fmtMoney(def.fee) + '</span> · ' +
        def.deadlineDays + ' day' + (def.deadlineDays > 1 ? 's' : '') + '</div>' +
      ((def.finePrint && def.finePrint.length)
        ? '<div class="bo-fine">' + esc(def.finePrint.join(' ')) + '</div>' : '') +
      '<div class="bo-btns">' +
        '<button class="px-btn" data-yes>SIGN IT</button>' +
        '<button class="px-btn px-btn-dim pass" data-no>PASS (−rep)</button>' +
      '</div>' +
      '<div class="bo-timer"><div></div></div>';
  }

  // (Re)build the visible part of the stack. Only the most-recent OFFER_CAP
  // offers get a card; the rest wait behind a single "+N more" pill at the top
  // and stay frozen (their timer doesn't tick) until a visible slot frees up.
  function renderOffers(){
    if(!offersEl) return;
    // drop any DOM for offers that are no longer in the model
    offersEl.innerHTML = '';
    var hidden = Math.max(0, briefOffers.length - OFFER_CAP);
    if(hidden > 0){
      var pill = document.createElement('div');
      pill.className = 'bo-more';
      pill.textContent = '+' + hidden + ' more queued · waiting their turn';
      offersEl.appendChild(pill);
    }
    var visible = briefOffers.slice(-OFFER_CAP);
    visible.forEach(function(o){
      var el = document.createElement('div');
      el.className = 'bo-card' + (o.leaving ? ' leaving' : '');
      el.innerHTML = offerCardHTML(o.def);
      o.el = el;
      o.fill = el.querySelector('.bo-timer > div');
      o.fill.style.width = Math.max(0, (o.t / o.total) * 100) + '%';
      el.querySelector('[data-yes]').addEventListener('click', function(){ resolveOffer(o, true); });
      el.querySelector('[data-no]').addEventListener('click', function(){ resolveOffer(o, false); });
      offersEl.appendChild(el);
    });
  }

  function resolveOffer(o, accepted){
    if(o.done) return;
    o.done = true;
    o.leaving = true;   // so a mid-animation re-render keeps the slide-out
    G.audio.click();
    var cb = o.cb;
    // slide the card out, then drop it from the model and reflow the rest
    if(o.el){
      o.el.classList.add('leaving');
    }
    setTimeout(function(){
      var idx = briefOffers.indexOf(o);
      if(idx >= 0) briefOffers.splice(idx, 1);
      renderOffers();
    }, 170);
    // hand the decision back to the engine (cb(true)=sign → accept,
    // cb(false)=pass/timeout → decline penalty). pendingToasts is balanced here.
    try { if(cb) cb(accepted); } catch(e){ console.error('[offer resolve]', e); }
  }

  function esc(str){
    return String(str).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }

  function logicalXY(e){
    var r = stageEl.getBoundingClientRect();
    var s = r.width / 1280;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  function daysLabel(realSec){
    var d = realSec / G.BAL.DAY_REAL_SECONDS;
    if(d >= 1) return d.toFixed(1) + 'd left';
    return Math.max(0, Math.round(d * 24 * 10)) / 10 + 'h left'; // sub-day = game hours
  }

  function diffPips(n){
    var out = '';
    for(var i = 0; i < n; i++) out += '◆';
    return out;
  }

  var ROLE_CHIP = {
    designer:   { icon: '🎨', label: 'DESIGN' },
    editor:     { icon: '🎬', label: 'EDIT' },
    content:    { icon: '✍️', label: 'CONTENT' },
    production: { icon: '📷', label: 'SHOOT' },
    any:        { icon: '🔁', label: 'ANYONE' }
  };
  function roleChip(role){
    var r = ROLE_CHIP[role] || ROLE_CHIP.any;
    return '<span class="bc-role bc-role-' + (role || 'any') + '">' + r.icon + ' ' + r.label + '</span>';
  }

  // how scary is this brief, really
  function urgency(def){
    var score = def.difficulty - def.deadlineDays; // 5★ in 1d = 4, 1★ in 3d = -2
    if(score >= 3) return { label: 'INSANE', cls: 'u-insane' };
    if(score >= 1) return { label: 'TIGHT', cls: 'u-tight' };
    return { label: 'CHILL', cls: 'u-chill' };
  }

  function cardHTML(b){
    var c = G.data.clientById(b.clientId);
    return '<div class="bc-client">' + esc(c ? c.name : '???') + '</div>' +
      '<div class="bc-diff">' + diffPips(b.difficulty) + '</div>' +
      '<div class="bc-title">' + esc(b.title) + '</div>' +
      '<div class="bc-row">' + roleChip(b.role) +
      '<span class="bc-dl" data-dl>' + daysLabel(b.deadlineLeft) + '</span></div>' +
      '<div class="bc-row"><span class="bc-fee">' + G.fmtMoney(b.fee) + '</span></div>' +
      (b.finePrint.length ? '<div class="bc-fine">' + esc(b.finePrint.join(' ')) + '</div>' : '');
  }

  G.dock = {
    dragging: null,       // live brief being dragged (office.js reads this)
    dragHoverDesk: -1,    // desk index under cursor while dragging

    init: function(){
      trayEl = document.getElementById('tray');
      toastsEl = document.getElementById('toasts');
      countEl = document.getElementById('tray-count');
      hintEl = document.getElementById('dock-hint');
      ghostEl = document.getElementById('drag-ghost');
      stageEl = document.getElementById('stage');

      // top-right compact offer stack. index.html has no element for it, so we
      // mount it into #stage at runtime (styled in css/briefs.css).
      offersEl = document.getElementById('brief-offers');
      if(!offersEl){
        offersEl = document.createElement('div');
        offersEl.id = 'brief-offers';
        stageEl.appendChild(offersEl);
      }

      document.getElementById('btn-growth').addEventListener('click', function(){
        if(!G.state.running || G.state.paused) return;
        if(!G.growth.unlocked()){
          G.dock.infoToast('NOT YET', 'Growth unlocks on day 4. Survive the week first.', 'bad');
          return;
        }
        G.audio.click();
        G.modals.showGrowth();
      });
      document.getElementById('btn-collect').addEventListener('click', function(){
        if(!G.state.running || G.state.paused) return;
        G.audio.click();
        G.modals.showCollect();
      });
      document.getElementById('btn-hire').addEventListener('click', function(){
        if(!G.state.running || G.state.paused) return;
        G.audio.click();
        G.modals.showHire();
      });
      document.getElementById('btn-skipnight').addEventListener('click', function(){
        G.time.skipNight();
      });

      // ----- drag start (delegated) -----
      trayEl.addEventListener('pointerdown', function(e){
        var card = e.target.closest('.brief-card');
        if(!card) return;
        var brief = G.briefs.byId(card.getAttribute('data-id'));
        if(!brief || brief.status !== 'tray') return;
        e.preventDefault();
        G.dock.dragging = brief;
        G.dock.dragHoverDesk = -1;
        card.style.opacity = '0.35';
        ghostEl.innerHTML = '<div class="brief-card">' + cardHTML(brief) + '</div>';
        ghostEl.classList.remove('hidden');
        moveGhost(e);
        G.audio.click();
      });

      window.addEventListener('pointermove', function(e){
        if(!G.dock.dragging) return;
        moveGhost(e);
      });

      window.addEventListener('pointerup', function(e){
        if(!G.dock.dragging) return;
        var brief = G.dock.dragging;
        var d = G.dock.dragHoverDesk;
        G.dock.dragging = null;
        G.dock.dragHoverDesk = -1;
        ghostEl.classList.add('hidden');
        ghostEl.innerHTML = '';

        // STUDIO scene: drop a brief onto the set and an idle crew shoots it
        if(G.state && G.state.scene === 'studio' && G.render.studio){
          var p = logicalXY(e);
          if(G.render.studio.isOverSet(p.x, p.y)) G.render.studio.assignDrop(brief);
          G.dock.refreshTray();
          return;
        }

        if(d >= 0){
          var st = G.staff.atDesk(d);
          if(!st){
            G.dock.infoToast('EMPTY DESK', 'Nobody sits there. Briefs cannot type.', 'bad');
          } else if(st.briefId){
            G.dock.infoToast('BUSY', st.name + ' is mid-brief. Interrupting costs lives.', 'bad');
          } else {
            G.briefs.assign(brief, st);
          }
        }
        G.dock.refreshTray();
      });
    },

    // simDt freezes with the sim (pause), rdt is real for info toasts
    update: function(simDt, rdt){
      // skip-night button: visible at night when no owl is mid-task
      var s = G.state;
      var skipBtn = document.getElementById('btn-skipnight');
      if(skipBtn){
        var canSkip = s.night && !s.staff.some(function(st){ return G.BAL.NIGHT_OWLS[st.id] && st.briefId; });
        skipBtn.classList.toggle('hidden', !canSkip);
      }
      // brief offers tick down on SIM time (simDt is 0 while the sim is paused /
      // a modal is open / game-over / restructure — see main.js — so the
      // countdowns freeze automatically then). Only the visible cards (most
      // recent OFFER_CAP) drain; queued ones behind the "+N more" pill wait.
      var firstVisible = Math.max(0, briefOffers.length - OFFER_CAP);
      for(var i = briefOffers.length - 1; i >= 0; i--){
        var o = briefOffers[i];
        if(o.done) continue;
        if(i >= firstVisible){
          o.t -= simDt;
          if(o.fill) o.fill.style.width = Math.max(0, (o.t / o.total) * 100) + '%';
          if(o.t <= 0){ resolveOffer(o, false); } // timeout = pass
        }
      }
      // info toasts expire on real time
      var removed = false;
      for(var j = infoToasts.length - 1; j >= 0; j--){
        var it = infoToasts[j];
        it.t -= rdt;
        if(it.t <= 0){
          it.el.remove();
          infoToasts.splice(j, 1);
          removed = true;
        }
      }
      if(removed) reflowToasts();
      // live deadline labels on tray cards
      var cards = trayEl.children;
      for(var k = 0; k < cards.length; k++){
        var b = G.briefs.byId(cards[k].getAttribute('data-id'));
        var dl = cards[k].querySelector('[data-dl]');
        if(b && dl){
          dl.textContent = daysLabel(b.deadlineLeft);
          dl.classList.toggle('late', b.deadlineLeft < b.deadlineTotal * 0.25);
        }
      }
    },

    // outstanding-invoice badge on the COLLECT button
    refreshCollect: function(){
      var el = document.getElementById('collect-badge');
      if(!el) return;
      var r = G.state.receivables;
      var total = r.reduce(function(s, i){ return s + i.amount; }, 0);
      el.textContent = r.length ? '(' + r.length + ' · ' + G.fmtMoney(total) + ')' : '(0)';
      document.getElementById('btn-collect').classList.toggle('has-money', r.length > 0);
    },

    refreshTray: function(){
      var briefs = G.briefs.trayBriefs();
      trayEl.innerHTML = '';
      briefs.forEach(function(b){
        var card = document.createElement('div');
        card.className = 'brief-card';
        card.setAttribute('data-id', b.id);
        card.innerHTML = cardHTML(b);
        trayEl.appendChild(card);
      });
      countEl.textContent = briefs.length ? '(' + briefs.length + ')' : '';
      hintEl.textContent = briefs.length ? 'drag a brief onto a desk' : 'tray empty. enjoy it. it will not last.';
    },

    // brief offer: append a compact card to the top-right stack. SIGN / PASS in
    // place, auto-pass on timeout. Same name + (def, cb) signature the engine
    // (briefs.js) calls, so the engine contract is unchanged — only what it
    // renders changed.
    showBriefToast: function(def, cb){
      // decide-time: very first brief is unhurried, then the week curve takes over
      var secs = G.curve.toastSeconds(G.state.week);
      if(!G.state._firstToastShown){
        G.state._firstToastShown = true;
        secs = G.BAL.FIRST_TOAST_SECONDS;
      }
      var o = {
        key: offerKey++,
        def: def,
        cb: cb,
        t: secs,
        total: secs,
        done: false,
        leaving: false,
        el: null,
        fill: null
      };
      briefOffers.push(o);
      G.audio.click();
      renderOffers();
    },

    // transient info toast. cls: '' | 'good' | 'bad'
    infoToast: function(head, body, cls){
      var el = document.createElement('div');
      el.className = 'toast info-toast' + (cls ? ' ' + cls : '');
      el.innerHTML =
        '<div class="toast-head">' + esc(head) + '</div>' +
        '<div class="toast-title">' + esc(body) + '</div>';
      toastsEl.appendChild(el);
      infoToasts.push({ el: el, t: 7 });
      while(infoToasts.length > 1){ // single-slot: a new toast replaces the old one (no queue)
        var old = infoToasts.shift();
        old.el.remove();
      }
      reflowToasts();
    }
  };

  function moveGhost(e){
    var p = logicalXY(e);
    ghostEl.style.left = (p.x - 109) + 'px';
    ghostEl.style.top = (p.y - 30) + 'px';

    // desk hover detection
    G.dock.dragHoverDesk = -1;
    var DESKS = G.render.office.DESKS;
    for(var d = 0; d < DESKS.length; d++){
      if(!G.staff.deptUnlocked(DESKS[d].dept)) continue;
      var hb = G.render.office.deskHitbox(d);
      if(p.x >= hb.x && p.x <= hb.x + hb.w && p.y >= hb.y && p.y <= hb.y + hb.h){
        G.dock.dragHoverDesk = d;
        break;
      }
    }
  }
})();
