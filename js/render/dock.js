// CravAche — DOM bottom tray + toasts + drag-drop of brief cards onto canvas
// desk hitboxes. Brief toasts auto-decline; tray cards show live deadlines and
// the fine print (skimming it is how you lose, so it is right there).
(function(){
  'use strict';
  window.G = window.G || {};

  var trayEl, toastsEl, countEl, hintEl, ghostEl, stageEl;
  var briefToasts = [];   // {el, fill, t, total, done, cb}
  var infoToasts = [];    // {el, t}

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
      // brief toasts tick down on sim time; hovering pauses (reading is free)
      for(var i = briefToasts.length - 1; i >= 0; i--){
        var tt = briefToasts[i];
        if(!tt.hover) tt.t -= simDt;
        tt.fill.style.width = Math.max(0, (tt.t / tt.total) * 100) + '%';
        tt.el.classList.toggle('reading', !!tt.hover);
        if(tt.t <= 0) resolveToast(tt, false);
      }
      // info toasts expire on real time
      for(var j = infoToasts.length - 1; j >= 0; j--){
        var it = infoToasts[j];
        it.t -= rdt;
        if(it.t <= 0){
          it.el.remove();
          infoToasts.splice(j, 1);
        }
      }
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

    // brief offer toast: SIGN / PASS, auto-pass on timeout
    showBriefToast: function(def, cb){
      var c = G.data.clientById(def.clientId);
      var u = urgency(def);
      var el = document.createElement('div');
      el.className = 'toast brief-toast';
      el.innerHTML =
        '<div class="toast-head">NEW BRIEF · ' + esc(c ? c.name : '???') + ' · ' + diffPips(def.difficulty) +
          '<span class="toast-urgency ' + u.cls + '">' + u.label + '</span></div>' +
        '<div class="toast-title">' + esc(def.title) + '</div>' +
        '<div class="toast-sub">' + esc(def.ask) + '</div>' +
        '<div class="toast-sub">' + roleChip(def.role) + ' <span class="toast-fee">' + G.fmtMoney(def.fee) + '</span> · ' +
          def.deadlineDays + ' day' + (def.deadlineDays > 1 ? 's' : '') + '</div>' +
        ((def.finePrint && def.finePrint.length)
          ? '<div class="bc-fine">' + esc(def.finePrint.join(' ')) + '</div>' : '') +
        '<div class="toast-btns">' +
          '<button class="px-btn" data-yes>SIGN IT</button>' +
          '<button class="px-btn px-btn-dim" data-no>PASS (−rep)</button>' +
        '</div>' +
        '<div class="toast-timer"><div></div></div>' +
        '<div class="toast-read-hint">hovering pauses the clock. read.</div>';
      toastsEl.appendChild(el);
      el.addEventListener('pointerenter', function(){ tt.hover = true; });
      el.addEventListener('pointerleave', function(){ tt.hover = false; });
      G.audio.click();

      // decide-time: very first brief is unhurried, then the week curve takes over
      var secs = G.curve.toastSeconds(G.state.week);
      if(!G.state._firstToastShown){
        G.state._firstToastShown = true;
        secs = G.BAL.FIRST_TOAST_SECONDS;
      }
      var tt = {
        el: el,
        fill: el.querySelector('.toast-timer > div'),
        t: secs,
        total: secs,
        done: false,
        cb: cb
      };
      briefToasts.push(tt);
      el.querySelector('[data-yes]').addEventListener('click', function(){ resolveToast(tt, true); });
      el.querySelector('[data-no]').addEventListener('click', function(){ resolveToast(tt, false); });
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
      while(infoToasts.length > 4){ // never wall the screen
        var old = infoToasts.shift();
        old.el.remove();
      }
    }
  };

  function resolveToast(tt, accepted){
    if(tt.done) return;
    tt.done = true;
    tt.el.remove();
    var idx = briefToasts.indexOf(tt);
    if(idx >= 0) briefToasts.splice(idx, 1);
    tt.cb(accepted);
  }

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
