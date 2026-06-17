// CravAche — DOM modals: verdict slot machine, 6PM call (hold to survive),
// generic events, Friday report card + shop, quote frames, win/lose screens,
// confetti. Modals stack; only the top one is visible. Pausing modals bump a
// refcount so nested modals never unpause the sim early. The 6PM call does NOT
// pause: deadlines keep burning while the client talks. That is the point.
(function(){
  'use strict';
  window.G = window.G || {};

  var rootEl, dimEl, stageEl;
  var stack = [];          // {el, pausing, onClose}
  var pauseCount = 0;
  var callCtx = null;      // {call, entry, fillEl, holding, btnEl}
  var counters = [];       // live count-up animations {el, from, to, t, dur, fmt}

  function esc(str){
    return String(str).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }

  // ---- shop iconography (local to modals; keyed by G.BAL.SHOP keys) ----
  var SHOP_ICONS = {
    plant: '🪴', plant_big: '🌳', string_lights: '✨', cooler: '💧',
    aquarium: '🐟', tv: '📺', arcade: '🕹️', coffee: '☕', neon: '🪧',
    cat: '🐈', foosball: '⚽', tabletennis: '🏓'
  };
  var DEPT_ICONS = { designer: '🎨', editor: '✂️', content: '✍️', production: '🎬' };
  function shopIcon(key){ return SHOP_ICONS[key] || '🛍️'; }
  function deptIcon(dept){ return DEPT_ICONS[dept] || '🛍️'; }

  // module counter for IDs (Date.now() may be stubbed in some contexts)
  var customSeq = 0;

  function setPaused(){
    G.state.paused = pauseCount > 0;
  }

  function push(el, opts){
    opts = opts || {};
    // hide previous top
    if(stack.length) stack[stack.length - 1].el.style.display = 'none';
    var entry = { el: el, pausing: !!opts.pausing, onClose: opts.onClose || null };
    stack.push(entry);
    if(entry.pausing){ pauseCount++; setPaused(); }
    rootEl.appendChild(el);
    rootEl.classList.remove('hidden');
    return entry;
  }

  function close(entry){
    var idx = stack.indexOf(entry);
    if(idx < 0) return;
    stack.splice(idx, 1);
    entry.el.remove();
    if(entry.pausing){ pauseCount = Math.max(0, pauseCount - 1); setPaused(); }
    if(stack.length){
      stack[stack.length - 1].el.style.display = '';
    } else {
      rootEl.classList.add('hidden');
    }
    if(entry.onClose) entry.onClose();
  }

  function modalShell(opts){
    var el = document.createElement('div');
    el.className = 'modal' + (opts.cls ? ' ' + opts.cls : '');
    var html = '';
    if(opts.kicker) html += '<div class="modal-kicker">' + esc(opts.kicker) + '</div>';
    if(opts.title) html += '<div class="modal-title">' + esc(opts.title) + '</div>';
    html += opts.bodyHTML || '';
    el.innerHTML = html;
    return el;
  }

  function addButtons(el, buttons){
    var row = document.createElement('div');
    row.className = 'modal-btns';
    buttons.forEach(function(b){
      var btn = document.createElement('button');
      btn.className = 'px-btn' + (b.cls ? ' ' + b.cls : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      row.appendChild(btn);
    });
    el.appendChild(row);
    return row;
  }

  // chunky count-up on a DOM node
  function countUp(el, to, fmt, dur){
    counters.push({ el: el, from: 0, to: to, t: 0, dur: dur || 0.8, fmt: fmt });
  }

  G.modals = {
    init: function(){
      rootEl = document.getElementById('modal-root');
      dimEl = document.getElementById('dim');
      stageEl = document.getElementById('stage');
      rootEl.classList.add('hidden');
      dimEl.classList.add('hidden');
    },

    anyOpen: function(){ return stack.length > 0; },

    // a bare pause lock for non-modal overlays (MONDAY dread, etc). Bumps the
    // same refcount the modals use, so nothing unpauses the sim early.
    acquirePause: function(){ pauseCount++; setPaused(); },
    releasePause: function(){ pauseCount = Math.max(0, pauseCount - 1); setPaused(); },

    // driven from main loop with REAL dt (call hold + count-ups run even when sim paused)
    update: function(rdt){
      // count-ups
      for(var i = counters.length - 1; i >= 0; i--){
        var c = counters[i];
        c.t += rdt;
        var f = Math.min(1, c.t / c.dur);
        f = 1 - (1 - f) * (1 - f); // ease-out, still steps visually via fmt rounding
        var v = c.from + (c.to - c.from) * f;
        c.el.textContent = c.fmt(v);
        if(f >= 1) counters.splice(i, 1);
      }
      // 6PM call: hold-to-listen fill + auto ring-out
      if(callCtx){
        callCtx.ring += rdt;
        if(callCtx.holding){
          callCtx.call.held += rdt;
          var frac = Math.min(1, callCtx.call.held / (G.BAL.CALL_HOLD_REAL_SECONDS || 5));
          callCtx.fillEl.style.width = (frac * 100) + '%';
          if(frac >= 1){ this._resolveCall(true); return; }
        }
        // ring-out: client gives up if you ignore it long enough
        if(callCtx.ring >= callCtx.ringOut){ this._resolveCall(false, false); }
      }
    },

    // ---------- generic event modal (scope creep, office, burnout) ----------
    // spec: {kicker, title, text, options:[{label, cls, onPick}]}
    showEvent: function(spec){
      var el = modalShell({
        kicker: spec.kicker, title: spec.title,
        bodyHTML: '<div class="modal-body">' + esc(spec.text) + '</div>'
      });
      var entry = push(el, { pausing: true });
      addButtons(el, spec.options.map(function(opt){
        return {
          label: opt.label, cls: opt.cls,
          onClick: function(){
            G.audio.click();
            close(entry);
            if(opt.onPick) opt.onPick();
          }
        };
      }));
    },

    // ---------- client signing dossier (first meeting, sim paused) ----------
    showClientIntro: function(client, onAccept){
      var their = G.data.briefs.filter(function(b){ return b.clientId === client.id; });
      var fees = their.map(function(b){ return b.fee; });
      var lo = Math.min.apply(null, fees), hi = Math.max.apply(null, fees);
      var pat = '';
      for(var i = 0; i < 5; i++) pat += i < client.patience ? '★' : '☆';

      var el = modalShell({
        cls: 'modal-green',
        kicker: 'NEW CLIENT SIGNING · READ BEFORE YOU REGRET',
        title: client.name,
        bodyHTML:
          '<div class="report-grid">' +
            '<div class="rg-k">Business</div><div class="rg-v">' + esc(client.industry) + '</div>' +
            '<div class="rg-k">Vibe</div><div class="rg-v">' + esc(client.personality) + '</div>' +
            '<div class="rg-k">Patience</div><div class="rg-v">' + pat + '</div>' +
            '<div class="rg-k">Sends this quarter</div><div class="rg-v">~' + their.length + ' briefs</div>' +
            '<div class="rg-k">Fee range</div><div class="rg-v pos">' + G.fmtMoney(lo) + ' – ' + G.fmtMoney(hi) + '</div>' +
          '</div>' +
          (client.quotes && client.quotes.length
            ? '<div class="quote-of-week">"' + esc(client.quotes[0]) + '"</div>' : '') +
          '<div class="modal-fine">Patience runs out, they leave forever and take their live briefs along. No pressure.</div>'
      });
      var entry = push(el, { pausing: true, onClose: onAccept });
      addButtons(el, [{
        label: 'ACCEPT. YOUR SLEEP IS GOING AWAY.',
        onClick: function(){ G.audio.accept(); close(entry); }
      }]);
    },

    // ---------- verdict slot machine ----------
    // info: {brief, staffer, outcome, payout, conflict}; applyCb fires on landing
    showVerdict: function(info, applyCb){
      var client = G.data.clientById(info.brief.clientId);
      var el = modalShell({
        cls: 'modal-' + (info.outcome === 'scrapped' ? 'red' : (info.outcome === 'viral' || info.outcome === 'approve' ? 'green' : '')),
        kicker: (client ? client.name : '???') + ' · ' + info.brief.title,
        title: 'THE CLIENT HAS SEEN IT',
        bodyHTML:
          '<div class="modal-body">' + esc(info.staffer ? info.staffer.name + ' hits send. Everyone pretends not to refresh.' : 'It has been sent.') + '</div>' +
          '<div class="slot-box"><div class="slot-word" data-slot>...</div>' +
          '<div class="slot-payout" data-payout></div></div>' +
          '<div class="modal-fine" data-fine style="display:none"></div>'
      });
      var entry = push(el, { pausing: true });
      var slotEl = el.querySelector('[data-slot]');
      var payEl = el.querySelector('[data-payout]');
      var fineEl = el.querySelector('[data-fine]');

      var words = ['approve', 'small', 'viral', 'scrapped'];
      var spins = 14 + Math.floor(Math.random() * 4);
      var i = 0, delay = 70;

      function spin(){
        if(i < spins){
          var w = words[i % words.length];
          slotEl.textContent = G.verdict.labelFor(w);
          slotEl.className = 'slot-word';
          G.audio.slotTick();
          i++;
          delay = 70 + Math.pow(i / spins, 2) * 220; // ease out, slot machine style
          setTimeout(spin, delay);
          return;
        }
        land();
      }

      function land(){
        slotEl.textContent = G.verdict.labelFor(info.outcome);
        slotEl.className = 'slot-word v-' + info.outcome;
        applyCb(); // applies money/rep/chaos + sfx + confetti/shake

        if(info.payout > 0){
          countUp(payEl, info.payout, function(v){ return '+' + G.fmtMoney(v) + ' INVOICED'; }, 0.9);
          payEl.title = 'approved is not paid. CALL to collect.';
        } else if(info.outcome === 'small'){
          payEl.textContent = '+₹0 · same deadline · 40% more work';
          payEl.style.color = '#ff9a56';
        } else if(info.outcome === 'scrapped'){
          payEl.textContent = '"' + G.rage() + '" · penalty ' + G.fmtMoney(Math.round(info.brief.fee * G.BAL.CLAWBACK_SCRAPPED));
          payEl.style.color = '#ff5c5c';
        }

        if(info.conflict && info.brief.finePrint.length){
          fineEl.style.display = '';
          fineEl.textContent = 'The fine print said: "' + info.brief.finePrint.join(' ') + '" You assigned ' +
            (info.staffer ? info.staffer.name : 'someone') + ' anyway. Bold.';
        }

        addButtons(el, [{
          label: 'CONTINUE',
          onClick: function(){ G.audio.click(); close(entry); }
        }]);
      }
      setTimeout(spin, 350);
    },

    // ---------- 6PM call: small ringing LANDLINE, bottom-left ----------
    // Does NOT dim the screen, does NOT pause the sim, does NOT join the modal
    // stack (so it can't hide other modals or unpause anything). Hold LISTEN to
    // fill the bar over CALL_HOLD_REAL_SECONDS = survive. Hang up BEFORE full =
    // +1 chaos, -0.5 rep, then callIgnored. Ring-out (~14s untouched) = callIgnored.
    showCall: function(call){
      // a previous call should never linger
      if(callCtx) this._resolveCall(false, false);

      var el = document.createElement('div');
      el.id = 'call-phone';
      el.className = 'ringing';
      el.innerHTML =
        '<div class="cp-kick">📞 INCOMING · ' + esc(call.client.name) + ' · ' + esc(call.client.industry || '') + '</div>' +
        '<div class="cp-title">THE 6PM CALL</div>' +
        '<div class="cp-quote">"' + esc(call.quote) + '"</div>' +
        '<div class="hold-track"><div class="hold-fill"></div></div>' +
        '<div class="cp-fine">Hold LISTEN to survive. Hang up early and they REALLY notice. Work continues without you.</div>' +
        '<div class="cp-btns">' +
          '<button class="px-btn" data-listen>LISTEN (HOLD)</button>' +
          '<button class="px-btn px-btn-red" data-hangup>HANG UP</button>' +
        '</div>';
      stageEl.appendChild(el);

      callCtx = {
        call: call, el: el,
        fillEl: el.querySelector('.hold-fill'),
        holding: false,
        ring: 0,
        ringOut: 14   // seconds before the client gives up
      };

      var listenBtn = el.querySelector('[data-listen]');
      var hangBtn = el.querySelector('[data-hangup]');

      function startHold(e){
        if(e) e.preventDefault();
        if(!callCtx) return;
        callCtx.holding = true;
        el.classList.remove('ringing'); // stop the wobble once they engage
      }
      function releaseHold(){ if(callCtx) callCtx.holding = false; }

      listenBtn.addEventListener('pointerdown', startHold);
      listenBtn.addEventListener('pointerup', releaseHold);
      listenBtn.addEventListener('pointerleave', releaseHold);
      window.addEventListener('pointerup', releaseHold);
      callCtx.release = releaseHold;

      hangBtn.addEventListener('click', function(){
        // early hang-up if the bar isn't full yet
        var frac = call.held / (G.BAL.CALL_HOLD_REAL_SECONDS || 5);
        G.modals._resolveCall(false, frac < 1);
      });
    },

    // survived = held to full; earlyHangup = manual hang-up before the bar filled
    _resolveCall: function(survived, earlyHangup){
      if(!callCtx) return;
      var ctx = callCtx;
      callCtx = null;
      window.removeEventListener('pointerup', ctx.release);
      if(ctx.el && ctx.el.parentNode) ctx.el.remove();

      if(survived){
        G.events.callSurvived(ctx.call);
        return;
      }
      // a MISSED call (hung up early OR rung out) leaves the client stewing:
      // +3 chaos and -1 rep, on top of the normal ignore effects.
      try { G.chaos.add(3); } catch(e){}
      if(G.state) G.state.rep = Math.max(0, G.state.rep - 1);
      try { G.hud.poke('rep'); } catch(e){}
      G.events.callIgnored(ctx.call);
    },

    // ---------- Friday report card + one-purchase shop ----------
    showReportCard: function(info){
      // if a call is still live when Friday ends, the client gets voicemail
      if(G.state.activeCall && callCtx) this._resolveCall(false);

      var s = G.state;
      var st = s.stats;
      var picksMax = G.BAL.SHOP_PICKS_PER_WEEK || 2;
      var boughtCount = 0;

      var rows =
        row('Earned this week', '+' + G.fmtMoney(st.weekEarned), 'pos') +
        row('Spent this week', '-' + G.fmtMoney(st.weekSpent), 'neg') +
        row('Payroll', '-' + G.fmtMoney(info.payroll), info.cleared ? '' : 'neg') +
        row('Rent + light bill + Adobe', '-' + G.fmtMoney(info.overhead || 0), info.cleared ? '' : 'neg') +
        row('Briefs shipped', st.weekShipped, st.weekShipped > 0 ? 'pos' : '') +
        row('Briefs scrapped', st.weekScrapped, st.weekScrapped > 0 ? 'neg' : '') +
        row('Cash on hand', G.fmtMoney(s.money), s.money < 0 ? 'neg' : '');

      function row(k, v, cls){
        return '<div class="rg-k">' + k + '</div><div class="rg-v ' + (cls || '') + '">' + v + '</div>';
      }

      var stamp = info.cleared
        ? '<div class="stamp">PAYROLL CLEARED ✔</div>'
        : '<div class="stamp fail">PAYROLL BOUNCED · STRIKE ' + info.strikes + '/3</div>' +
          '<div class="modal-fine" style="color:#ff5c5c">The team group chat right now: "' + esc(G.rage()) + '"</div>';

      var quote = s.quotesWall.length
        ? '<div class="quote-of-week">"' + esc(s.quotesWall[s.quotesWall.length - 1].text) + '" — ' +
          esc(s.quotesWall[s.quotesWall.length - 1].client) + '</div>'
        : '';

      var burned = s.staff.filter(function(x){ return x.burnout >= 60; });
      var warn = burned.length
        ? '<div class="modal-fine" style="color:#ff5c5c">⚠ ' +
          burned.map(function(x){ return esc(x.name) + ' (' + Math.round(x.burnout) + '%)'; }).join(', ') +
          ' running hot. Monday will collect.</div>'
        : '';

      var el = modalShell({
        cls: info.cleared ? 'modal-green' : 'modal-red',
        kicker: 'FRIDAY 6PM · WEEK ' + s.week + ' OF ' + G.BAL.WEEKS,
        title: 'WEEKLY REPORT CARD',
        bodyHTML: stamp + '<div class="report-grid">' + rows + '</div>' + quote + warn +
          '<div class="modal-kicker" style="margin-top:8px" data-shop-kicker>' +
            picksMax + ' PICKS THIS WEEK · ' + picksMax + ' LEFT (choose wisely)</div>' +
          '<div class="shop-scroll-hint">▼ scroll for the full shop ▼</div>' +
          '<div data-shop></div>'
      });
      var entry = push(el, {
        pausing: true,
        onClose: function(){
          st.weekEarned = 0; st.weekSpent = 0; st.weekShipped = 0; st.weekScrapped = 0;
          st.weekViral = 0; st.weekFollowers = 0;
          s.staff.forEach(function(x){ x.shippedWeek = 0; });
          // every 4th friday: the industry gathers to applaud itself
          if(!s.gameOver && s.week % G.BAL.CRAANES_EVERY_WEEKS === 0 && !s.craanesDone[s.week]){
            G.modals.showCraanes(function(){ G.time.advanceToMonday(); });
            return;
          }
          G.time.advanceToMonday();
        }
      });

      // shop: upgrades not owned + the next candidate from EACH department
      G.staff.refillPool();
      var shopEl = el.querySelector('[data-shop]');
      var items = [];
      Object.keys(G.BAL.SHOP).forEach(function(key){
        var it = G.BAL.SHOP[key];
        if(s.upgrades[key]) return;
        items.push({ name: it.name, desc: it.desc, price: it.price, icon: shopIcon(key),
          freebie: (key === 'plant'),   // plant is always buyable; never uses a weekly pick
          buy: function(){
            var ok = G.economy.buyUpgrade(key);
            // the neon comes blank: ask the player what it should say
            if(ok && key === 'neon') G.modals.showNeonSetup();
            return ok;
          } });
      });
      ['designer', 'editor', 'content', 'production'].forEach(function(dept){
        var cand = null;
        for(var i = 0; i < s.hirePool.length; i++)
          if(s.hirePool[i].dept === dept){ cand = s.hirePool[i]; break; }
        if(!cand) return;
        if(!G.staff.deptUnlocked(dept)){
          items.push({ name: dept.toUpperCase() + ': locked', desc: 'Opens week ' + G.BAL.PRODUCTION_UNLOCK_WEEK + '.', price: 0, icon: deptIcon(dept), locked: true, buy: function(){ return false; } });
          return;
        }
        if(G.staff.deptCount(dept) >= G.BAL.DEPT_CAPS[dept]) return;
        var advance = Math.round(cand.salaryMonthly / 4);
        var badges = (cand.badges || []).map(function(b){ return b.icon + ' ' + b.label; }).join(' · ');
        items.push({
          name: 'HIRE ' + cand.name + ' · ' + dept.toUpperCase() + ' ★' + cand.skill,
          desc: badges + ' — ' + cand.trait + ' · ' + G.fmtMoney(cand.salaryMonthly) + '/mo',
          price: advance, icon: deptIcon(dept),
          buy: function(){
            if(s.money < advance) return false;
            var idx = s.hirePool.indexOf(cand);
            if(!G.staff.canHire(cand)) return false;
            G.economy.spend(advance); // signing advance = one week's pay
            return G.staff.hire(idx);
          }
        });
      });

      var kickerEl = el.querySelector('[data-shop-kicker]');
      var btns = [];
      var grid = document.createElement('div');
      grid.className = 'shop-grid';
      items.forEach(function(it){
        var cardEl = document.createElement('div');
        cardEl.className = 'shop-card' + (it.locked ? ' is-locked' : '');
        var affordable = !it.locked && s.money >= it.price;
        if(!affordable && !it.locked) cardEl.classList.add('cant-afford');

        var b = document.createElement('button');
        b.className = 'px-btn sc-buy';
        b.textContent = it.locked ? 'LOCKED' : G.fmtMoney(it.price);
        b.disabled = it.locked || s.money < it.price;
        b.dataset.freebie = it.freebie ? '1' : '';

        cardEl.innerHTML =
          '<div class="sc-icon">' + esc(it.icon || '🛍️') + '</div>' +
          '<div class="sc-name">' + esc(it.name) + '</div>' +
          '<div class="sc-desc">' + esc(it.desc) + '</div>';
        if(it.freebie){
          var tag = document.createElement('div');
          tag.className = 'sc-tag';
          tag.textContent = 'FREE PICK';
          cardEl.appendChild(tag);
        }

        b.addEventListener('click', function(){
          if(b.disabled) return;
          if(!it.freebie && boughtCount >= picksMax) return;
          if(it.buy()){
            b.disabled = true;
            b.textContent = 'DONE ✔';
            cardEl.classList.add('is-owned');
            if(!it.freebie){
              boughtCount += 1;
              var left = picksMax - boughtCount;
              if(kickerEl) kickerEl.textContent = left > 0
                ? picksMax + ' PICKS THIS WEEK · ' + left + ' LEFT (choose wisely)'
                : picksMax + ' PICKS THIS WEEK · DONE FOR THE WEEK';
              // out of picks? lock everything still buyable — except freebies (e.g. plant).
              btns.forEach(function(x){
                if(boughtCount >= picksMax){ if(x.textContent !== 'DONE ✔' && x.dataset.freebie !== '1') x.disabled = true; }
              });
            }
          } else {
            G.audio.decline();
          }
        });
        btns.push(b);
        cardEl.appendChild(b);
        grid.appendChild(cardEl);
      });
      if(!items.length) shopEl.innerHTML = '<div class="modal-fine">Nothing left to buy. The office is complete. The work is not.</div>';
      else shopEl.appendChild(grid);

      var rcBtns = [{
        label: 'START MONDAY',
        onClick: function(){ G.audio.click(); close(entry); }
      }];
      if(s.endless){
        rcBtns.push({
          label: 'RETIRE', cls: 'px-btn-dim',
          onClick: function(){
            // leave without re-triggering advanceToMonday side effects
            entry.onClose = null;
            close(entry);
            G.state.running = false;
            G.modals.showRetire();
          }
        });
      }
      addButtons(el, rcBtns);
    },

    // ---------- EMPLOYEES: roster (with FIRE) + hireables + custom hire ----------
    showHire: function(){
      var s = G.state;
      var CUSTOM_FEE = 60000;
      G.staff.refillPool(); // walk-in CVs keep the pool stocked

      var el = modalShell({
        kicker: 'EMPLOYEES · PAYROLL NOW ' + G.fmtMoney(G.economy.payrollTotal()) + '/WK',
        title: 'THE PEOPLE WHO MAKE THE CHAOS',
        bodyHTML:
          '<div class="modal-fine">Signing advance = one week of pay, upfront. Salaries hit every Friday whether clients pay or not.</div>' +
          '<div data-roster></div>' +
          '<div class="modal-kicker" style="margin-top:12px">OPEN POSITIONS</div>' +
          '<div data-hires></div>'
      });
      var entry = push(el, { pausing: true });

      // ---- (a) ROSTER of current staff, grouped by dept, each with FIRE ----
      function fireStaffer(st){
        // return their live brief to the tray (returnToTray nulls staffId + refreshes)
        if(st.briefId){
          var b = G.briefs.byId(st.briefId);
          if(b) G.briefs.returnToTray(b, 1);
          else { st.briefId = null; }
        } else {
          // belt-and-suspenders: any brief that thinks it's theirs goes back too
          s.briefs.forEach(function(br){
            if(br.staffId === st.id && br.status !== 'done' && br.status !== 'scrapped'){
              G.briefs.returnToTray(br, 1);
            }
          });
        }
        // free their desk + remove from roster (no rage-quit chaos: this is deliberate)
        st.desk = -1;
        var idx = s.staff.indexOf(st);
        if(idx >= 0) s.staff.splice(idx, 1);
        try { G.dock.refreshTray(); } catch(e){}
        G.audio.decline();
        G.dock.infoToast('LET GO', st.name + ' has been let go. The desk is already cold.', 'bad');
      }

      function renderRoster(){
        var rosterEl = el.querySelector('[data-roster]');
        rosterEl.innerHTML = '';
        var depts = ['designer', 'editor', 'content', 'production'];
        var anyStaff = false;
        depts.forEach(function(dept){
          var crew = s.staff.filter(function(st){ return st.dept === dept; });
          if(!crew.length) return;
          anyStaff = true;
          var head = document.createElement('div');
          head.className = 'modal-kicker';
          head.style.marginTop = '8px';
          head.textContent = deptIcon(dept) + ' ' + dept.toUpperCase() + ' · ' + crew.length + '/' + G.BAL.DEPT_CAPS[dept];
          rosterEl.appendChild(head);

          crew.forEach(function(st){
            var rowEl = document.createElement('div');
            rowEl.className = 'roster-row';
            rowEl.innerHTML =
              '<div class="rr-info"><span class="sr-name">' + esc(st.name) + ' ' +
                '<span class="rr-stars">' + '★'.repeat(Math.max(0, st.skill || 0)) + '</span>' +
                ' <span style="color:#9fe8ff">' + esc(st.level || '') + '</span></span>' +
              '<span class="sr-desc">' + esc(st.trait || '') + ' · ' + G.fmtMoney(st.salaryMonthly) + '/mo</span></div>';
            var fb = document.createElement('button');
            fb.className = 'px-btn px-btn-red rr-fire';
            fb.textContent = 'FIRE';
            var armed = false;
            fb.addEventListener('click', function(){
              if(!armed){ armed = true; fb.textContent = 'SURE?'; return; }
              fireStaffer(st);
              renderRoster();
              renderHires();
            });
            rowEl.appendChild(fb);
            rosterEl.appendChild(rowEl);
          });
        });
        if(!anyStaff){
          rosterEl.innerHTML = '<div class="modal-fine">Nobody on payroll. An office full of empty desks and ambition.</div>';
        }
      }

      // ---- (b) hireable candidates + (c) custom hire action ----
      function renderHires(){
        var listEl = el.querySelector('[data-hires]');
        listEl.innerHTML = '';
        var any = false;

        ['designer', 'editor', 'content', 'production'].forEach(function(dept){
          var cap = G.BAL.DEPT_CAPS[dept];
          var head = document.createElement('div');
          head.className = 'modal-kicker';
          head.style.marginTop = '8px';
          head.textContent = dept.toUpperCase() + ' · ' + G.staff.deptCount(dept) + '/' + cap +
            (!G.staff.deptUnlocked(dept) ? ' · LOCKED UNTIL WK ' + G.BAL.PRODUCTION_UNLOCK_WEEK : '');
          listEl.appendChild(head);

          // CVs arrive in weekly waves; tease the queue instead of dumping it
          var deptPool = s.hirePool.filter(function(c){ return c.dept === dept; });
          var incoming = deptPool.filter(function(c){ return !G.staff.candidateVisible(c); }).length;

          deptPool.filter(G.staff.candidateVisible).forEach(function(cand){
            any = true;
            var advance = Math.round(cand.salaryMonthly / 4);
            var badges = (cand.badges || []).map(function(b){ return b.icon + ' ' + b.label; }).join(' · ');
            var rowEl = document.createElement('div');
            rowEl.className = 'shop-row';
            rowEl.innerHTML = '<div><span class="sr-name">' + esc(cand.name) + ' ' + '★'.repeat(cand.skill) +
              ' <span style="color:#9fe8ff">' + esc(cand.level) + '</span></span>' +
              '<span class="sr-desc">' + esc(badges) + '</span>' +
              '<span class="sr-desc">' + esc(cand.trait) + ' · ' + G.fmtMoney(cand.salaryMonthly) + '/mo</span></div>';
            var b = document.createElement('button');
            b.className = 'px-btn';
            b.textContent = G.fmtMoney(advance);
            b.disabled = !G.staff.deptUnlocked(dept) ||
                         G.staff.deptCount(dept) >= cap ||
                         s.money < advance;
            b.addEventListener('click', function(){
              var idx = s.hirePool.indexOf(cand);
              if(s.money >= advance && G.staff.canHire(cand)){
                G.economy.spend(advance);
                if(G.staff.hire(idx)){
                  b.textContent = 'HIRED ✔';
                  rowEl.querySelectorAll('button').forEach(function(x){ x.disabled = true; });
                  renderRoster();
                  renderHires();
                  return;
                }
              }
              G.audio.decline();
            });
            rowEl.appendChild(b);
            listEl.appendChild(rowEl);
          });

          if(incoming > 0 && G.staff.deptUnlocked(dept)){
            var tease = document.createElement('div');
            tease.className = 'modal-fine';
            tease.textContent = '+ ' + incoming + ' more CV' + (incoming > 1 ? 's' : '') + ' in the pipeline. Good people take time.';
            listEl.appendChild(tease);
          }
        });
        if(!any) listEl.innerHTML += '<div class="modal-fine">Pool empty. Everyone employable in Ahmedabad already works here.</div>';

        // ---- (c) CUSTOM HIRE action ----
        var customBtn = document.createElement('button');
        customBtn.className = 'px-btn custom-hire-btn';
        customBtn.style.marginTop = '10px';
        customBtn.textContent = '+ CUSTOM HIRE (' + G.fmtMoney(CUSTOM_FEE) + ')';
        customBtn.addEventListener('click', function(){
          G.audio.click();
          G.modals.showCustomHire(function(){ renderRoster(); renderHires(); });
        });
        listEl.appendChild(customBtn);
      }

      renderRoster();
      renderHires();

      addButtons(el, [{ label: 'DONE', onClick: function(){ G.audio.click(); close(entry); } }]);
    },

    // ---------- CUSTOM HIRE form: pay a creation fee to insert any employee ----------
    showCustomHire: function(onHired){
      var s = G.state;
      var CUSTOM_FEE = 60000;
      var DEPTS = ['designer', 'editor', 'content', 'production'];
      var picked = 'designer';

      var el = modalShell({
        cls: 'modal-green',
        kicker: 'CUSTOM HIRE · CREATION FEE ' + G.fmtMoney(CUSTOM_FEE),
        title: 'BUILD AN EMPLOYEE',
        bodyHTML:
          '<div class="modal-fine">Put yourself, a friend, or a fictional legend on the actual payroll. Salary must be more than ' + G.fmtMoney(CUSTOM_FEE) + '/mo. They start as a junior who can do real work.</div>' +
          '<input id="ch-name" class="px-input" maxlength="22" placeholder="NAME" autocomplete="off" spellcheck="false">' +
          '<div class="modal-fine" style="margin-top:8px">Department (decides what work they can pick up)</div>' +
          '<div class="ch-depts" data-depts></div>' +
          '<input id="ch-title" class="px-input" maxlength="28" placeholder="DESIGNATION (OPTIONAL)" autocomplete="off" spellcheck="false">' +
          '<div class="modal-fine" style="margin-top:8px">Salary / month (must be &gt; ' + G.fmtMoney(CUSTOM_FEE) + ')</div>' +
          '<input id="ch-salary" class="px-input" type="number" min="0" step="1000" placeholder="75000" autocomplete="off">'
      });
      var entry = push(el, { pausing: true });

      var deptsEl = el.querySelector('[data-depts]');
      var deptBtns = [];
      function paintDepts(){
        deptBtns.forEach(function(b){
          var unlocked = G.staff.deptUnlocked(b.dataset.dept);
          b.className = 'px-btn' + (b.dataset.dept === picked ? '' : ' px-btn-dim');
          b.disabled = !unlocked;
        });
      }
      DEPTS.forEach(function(dept){
        var b = document.createElement('button');
        b.dataset.dept = dept;
        b.textContent = deptIcon(dept) + ' ' + dept.toUpperCase();
        b.addEventListener('click', function(){
          if(!G.staff.deptUnlocked(dept)){ G.audio.decline(); return; }
          picked = dept; paintDepts(); G.audio.click();
        });
        deptBtns.push(b);
        deptsEl.appendChild(b);
      });
      paintDepts();

      setTimeout(function(){ try { el.querySelector('#ch-name').focus(); } catch(e){} }, 60);

      addButtons(el, [
        {
          label: 'HIRE THEM (' + G.fmtMoney(CUSTOM_FEE) + ')',
          onClick: function(){
            var name = (el.querySelector('#ch-name').value || '').trim().slice(0, 22);
            var title = (el.querySelector('#ch-title').value || '').trim();
            var salary = Math.round(parseFloat(el.querySelector('#ch-salary').value) || 0);
            var dept = picked;

            if(!name){
              G.audio.decline();
              G.dock.infoToast('NEEDS A NAME', 'Even the chaos needs to know who to blame.', 'bad');
              return;
            }
            if(!(salary > CUSTOM_FEE)){
              G.audio.decline();
              G.dock.infoToast('SALARY TOO LOW', 'Pay them more than ' + G.fmtMoney(CUSTOM_FEE) + '/mo or nobody real takes the seat.', 'bad');
              return;
            }
            // dept must have open cap + a free desk
            if(!G.staff.deptUnlocked(dept) ||
               G.staff.deptCount(dept) >= G.BAL.DEPT_CAPS[dept] ||
               G.staff.freeDesk(dept) < 0){
              G.audio.decline();
              G.dock.infoToast('NO ROOM', dept.toUpperCase() + ' is full. No open seat for ' + esc(name) + '.', 'bad');
              return;
            }
            if(s.money < CUSTOM_FEE){
              G.audio.decline();
              G.dock.infoToast('CANT AFFORD', 'The ' + G.fmtMoney(CUSTOM_FEE) + ' creation fee is out of reach right now.', 'bad');
              return;
            }

            // spend the creation fee, then build + seat the staffer (mirror G.staff.hire)
            G.economy.spend(CUSTOM_FEE);
            customSeq += 1;
            var st = G.makeStaffer({
              id: 'custom_' + customSeq,
              name: name,
              dept: dept,
              level: 'junior',
              skill: 3,
              salaryMonthly: salary,
              trait: title || 'Custom hire',
              traitTag: '',
              universal: false,
              badges: [],
              portraitKey: 'char1'
            });
            st.burnout = 0;
            if(!G.staff.seat(st)){
              // extremely unlikely (we checked freeDesk), refund and bail
              s.money += CUSTOM_FEE; s.stats.weekSpent -= CUSTOM_FEE; G.hud.poke('money');
              G.audio.decline();
              G.dock.infoToast('NO DESK', 'The seat vanished. Fee refunded.', 'bad');
              return;
            }
            s.staff.push(st);
            try { G.dock.refreshTray(); } catch(e){}
            G.audio.accept();
            G.dock.infoToast('NEW HIRE · ' + dept.toUpperCase(),
              name + ' joined as ' + (title || 'Custom hire') + '. ' + G.fmtMoney(salary) + '/mo.', 'good');
            close(entry);
            if(onHired) onHired();
          }
        },
        { label: 'CANCEL', cls: 'px-btn-dim', onClick: function(){ G.audio.click(); close(entry); } }
      ]);
    },

    // ---------- GROWTH: spend money or staff time for leads ----------
    showGrowth: function(){
      var s = G.state;
      var el = modalShell({
        kicker: 'BUSINESS DEVELOPMENT · LEADS BREWING: ' + s.leads.length +
          (s.growthBonus ? ' · CLOSE BONUS +' + Math.round(s.growthBonus * 100) + '%' : ''),
        title: 'GROW THE AGENCY',
        bodyHTML: '<div class="modal-fine">New clients cost money or staff time. Staff doing growth work are not doing client work. That is the whole game.</div><div data-gshop></div>'
      });
      var entry = push(el, { pausing: true });
      var shopEl = el.querySelector('[data-gshop]');

      function row(name, desc, btnLabel, disabled, onBuy){
        var rowEl = document.createElement('div');
        rowEl.className = 'shop-row';
        rowEl.innerHTML = '<div><span class="sr-name">' + esc(name) + '</span>' +
          '<span class="sr-desc">' + esc(desc) + '</span></div>';
        var b = document.createElement('button');
        b.className = 'px-btn';
        b.textContent = btnLabel;
        b.disabled = disabled;
        b.addEventListener('click', function(){
          if(onBuy()){ b.textContent = 'DONE ✔'; b.disabled = true; }
          else G.audio.decline();
        });
        rowEl.appendChild(b);
        shopEl.appendChild(rowEl);
      }

      Object.keys(G.GROWTH_ACTIONS).forEach(function(key){
        var a = G.GROWTH_ACTIONS[key];
        var owned = a.oneTime && s.growthOwned[a.oneTime];
        row(a.name, a.desc, owned ? 'OWNED' : G.fmtMoney(a.price),
            owned || s.money < a.price,
            function(){ return G.growth.buy(key); });
      });
      G.INTERNAL_BRIEFS.forEach(function(def){
        var live = s.briefs.some(function(b){ return b.def && b.def.id === def.id && (b.status === 'tray' || b.status === 'assigned'); });
        row(def.title + ' (staff time)', def.ask, live ? 'IN PROGRESS' : 'ADD TO TRAY', live,
            function(){ return G.growth.startInternal(def.id); });
      });

      addButtons(el, [{ label: 'BACK TO THE GRIND', onClick: function(){ G.audio.click(); close(entry); } }]);
    },

    // ---------- COLLECT: hold the call through the excuses to get paid ----------
    showCollect: function(){
      var s = G.state;
      var total = s.receivables.reduce(function(sum, i){ return sum + i.amount; }, 0);
      var el = modalShell({
        kicker: 'RECEIVABLES · ' + s.receivables.length + ' INVOICES · ' + G.fmtMoney(total) + ' STUCK',
        title: 'COLLECTION CALLS',
        bodyHTML: s.receivables.length
          ? '<div class="modal-fine">Hold CALL and survive the excuses. Release early and the money stays theirs. Unchased invoices pay by themselves, eventually, painfully late.</div><div data-invoices></div>'
          : '<div class="modal-body">Nothing to collect. Either you are paid up or you have shipped nothing. Both are suspicious.</div>'
      });
      var entry = push(el, { pausing: true });
      var invEl = el.querySelector('[data-invoices]');

      var EXCUSES = [
        'processing hai, system me hai',
        'finance person is at a wedding',
        'GST portal is down (it is not)',
        'CEO has to personally approve (he is golfing)',
        'can you resend the invoice? 4th time lucky',
        'next week pakka. PAKKA.',
        'we pay on the 32nd of every month'
      ];

      if(invEl) s.receivables.slice().forEach(function(inv){
        var c = G.data.clientById(inv.clientId);
        var rowEl = document.createElement('div');
        rowEl.className = 'shop-row';
        rowEl.innerHTML = '<div><span class="sr-name">' + esc(c ? c.name : '???') + ' · ' + G.fmtMoney(inv.amount) + '</span>' +
          '<span class="sr-desc" data-excuse>"' + esc(inv.title) + '" · invoice aging</span>' +
          '<div class="hold-track" style="width:160px"><div class="hold-fill"></div></div></div>';
        var b = document.createElement('button');
        b.className = 'px-btn';
        b.textContent = 'CALL (HOLD)';
        var fill = rowEl.querySelector('.hold-fill');
        var exEl = rowEl.querySelector('[data-excuse]');
        var held = 0, holding = false, raf = null, exIdx = -1, paid = false;

        function tick(){
          if(paid) return;
          if(holding){
            held += 1 / 60;
            var frac = Math.min(1, held / G.BAL.INVOICE_CALL_HOLD);
            fill.style.width = (frac * 100) + '%';
            var ex = Math.min(EXCUSES.length - 1, Math.floor(frac * 2.999));
            if(ex !== exIdx){
              exIdx = ex;
              exEl.textContent = '"' + EXCUSES[Math.floor(Math.random() * EXCUSES.length)] + '"';
            }
            if(frac >= 1){
              paid = true;
              G.economy.collect(inv);
              exEl.textContent = '"theek hai theek hai, transferred. happy?"';
              b.textContent = 'PAID ✔';
              b.disabled = true;
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        }
        b.addEventListener('pointerdown', function(e){
          e.preventDefault();
          if(paid) return;
          holding = true;
          G.audio.phoneRing();
          if(!raf) raf = requestAnimationFrame(tick);
        });
        window.addEventListener('pointerup', function(){
          holding = false;
          if(!paid && held > 0){
            held = 0;
            fill.style.width = '0%';
            exEl.textContent = '"hello? hello? network..." They hung up.';
          }
        });
        rowEl.appendChild(b);
        invEl.appendChild(rowEl);
      });

      addButtons(el, [{ label: 'CLOSE', onClick: function(){ G.audio.click(); close(entry); } }]);
    },

    // ---------- friday IG recap reel: @cravache.agency weekly wrap ----------
    // a phone-frame story. Tap through, then the report card lands.
    showWeeklyReel: function(info){
      var s = G.state, st = s.stats;
      var fmtK = function(n){
        n = Math.round(n);
        return n >= 100000 ? (n / 100000).toFixed(1) + 'L' : (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n);
      };

      // MVP: who shipped the most this week
      var mvp = null;
      s.staff.forEach(function(x){
        if((x.shippedWeek || 0) > 0 && (!mvp || x.shippedWeek > mvp.shippedWeek)) mvp = x;
      });

      var slides = [];
      slides.push(
        '<div class="ig-big">WK ' + s.week + '<br>WRAPPED 🎬</div>' +
        '<div class="ig-sub">another week at the agency<br>nobody slept. everybody posted.</div>'
      );
      var delta = st.weekFollowers;
      slides.push(
        '<div class="ig-label">THE ALGORITHM SAYS</div>' +
        '<div class="ig-big" data-count-followers>' + fmtK(s.followers) + '</div>' +
        '<div class="ig-sub">followers</div>' +
        '<div class="ig-delta ' + (delta >= 0 ? 'pos' : 'neg') + '">' +
          (delta >= 0 ? '+' : '') + fmtK(delta) + ' this week</div>'
      );
      slides.push(
        '<div class="ig-label">SHIPPED</div>' +
        '<div class="ig-big">' + st.weekShipped + '</div>' +
        '<div class="ig-sub">brief' + (st.weekShipped === 1 ? '' : 's') + ' out the door</div>' +
        '<div class="ig-delta pos">' + G.fmtMoney(Math.round(st.weekEarned)) + ' billed</div>' +
        (st.weekScrapped ? '<div class="ig-delta neg">' + st.weekScrapped + ' scrapped (we do not talk about those)</div>' : '')
      );
      if(mvp){
        var sp = G.data.sprite(mvp.portraitKey);
        var img = sp && sp.meta && sp.meta.file
          ? '<div class="ig-mvp-wrap"><img class="ig-mvp" src="art/' + sp.meta.file + '" alt=""></div>'
          : '<div class="ig-big">👑</div>';
        slides.push(
          '<div class="ig-label">MVP OF THE WEEK</div>' + img +
          '<div class="ig-big" style="font-size:26px">' + esc(mvp.name.split(' ')[0].toUpperCase()) + '</div>' +
          '<div class="ig-sub">' + mvp.shippedWeek + ' brief' + (mvp.shippedWeek === 1 ? '' : 's') + ' shipped · ' +
          esc(mvp.dept) + '</div>'
        );
      }
      if(st.weekViral > 0){
        slides.push(
          '<div class="ig-big" style="color:#ffe066">WE WENT<br>VIRAL 🔥</div>' +
          '<div class="ig-sub">' + st.weekViral + ' post' + (st.weekViral === 1 ? '' : 's') + ' escaped containment.<br>the client is taking credit.</div>'
        );
      } else if(st.weekShipped === 0){
        slides.push(
          '<div class="ig-big" style="color:#ff5c5c">0 POSTS</div>' +
          '<div class="ig-sub">the algorithm has forgotten us.<br>the algorithm is lucky.</div>'
        );
      }
      slides.push(
        '<div class="ig-big" style="font-size:24px">SAME TIME<br>NEXT WEEK</div>' +
        '<div class="ig-sub">follow @cravache.agency<br>(the interns run this account)</div>'
      );

      var bars = slides.map(function(_, i){
        return '<div class="ig-bar" data-bar="' + i + '"><div></div></div>';
      }).join('');

      var el = modalShell({
        cls: 'modal-reel',
        bodyHTML:
          '<div class="ig-phone" data-phone>' +
            '<div class="ig-bars">' + bars + '</div>' +
            '<div class="ig-head"><span class="ig-avatar">C</span>cravache.agency <span class="ig-dim">· weekly recap</span></div>' +
            '<div class="ig-slide" data-slide></div>' +
            '<div class="ig-foot">♡ &nbsp; 💬 &nbsp; ✈ <span class="ig-dim" style="float:right">tap to continue</span></div>' +
          '</div>'
      });
      var entry = push(el, {
        pausing: true,
        onClose: function(){ G.modals.showReportCard(info); }
      });

      var idx = 0;
      var slideEl = el.querySelector('[data-slide]');
      function paint(){
        slideEl.innerHTML = slides[idx];
        for(var i = 0; i < slides.length; i++){
          var b = el.querySelector('[data-bar="' + i + '"] > div');
          if(b) b.style.width = i < idx ? '100%' : (i === idx ? '100%' : '0%');
        }
        // follower slide gets the count-up treatment
        var cEl = slideEl.querySelector('[data-count-followers]');
        if(cEl) countUp(cEl, s.followers, fmtK, 1.1);
        G.audio.click();
      }
      el.querySelector('[data-phone]').addEventListener('click', function(){
        idx++;
        if(idx >= slides.length){ close(entry); return; }
        paint();
      });
      paint();
    },

    // ---------- the Craanes: award night parody. You pay. They clap. ----------
    showCraanes: function(onDone){
      var s = G.state;
      s.craanesDone[s.week] = true;

      var cats = [
        { key: 'reel', label: 'BEST REEL UNDER DURESS',
          desc: 'For work shipped while the deadline was actively on fire.',
          chance: Math.min(0.85, 0.25 + s.stats.totalViral * 0.15) },
        { key: 'tantrum', label: 'EXCELLENCE IN CLIENT TANTRUM MANAGEMENT',
          desc: 'Judged on the wall of "just one small thing".',
          chance: Math.min(0.85, 0.2 + s.quotesWall.length * 0.08) },
        { key: 'agency', label: 'BREAKTHROUGH AGENCY OF THE EVENING',
          desc: 'Sponsored. The sponsor also has an agency. Unrelated.',
          chance: Math.min(0.8, 0.15 + s.rep * 0.005) }
      ];
      var entered = {};

      var el = modalShell({
        cls: 'modal-craanes',
        kicker: 'FRIDAY NIGHT · A HOTEL BALLROOM WITH BAD ACOUSTICS',
        title: '🏆 THE CRAANES',
        bodyHTML:
          '<div class="modal-fine">Indian advertising\'s biggest night of applauding itself. ' +
          'Entry is ' + G.fmtMoney(G.BAL.CRAANES_ENTRY) + ' per category. Yes, you pay to maybe win. ' +
          'That part is not satire.</div><div data-cats></div>'
      });
      var entry = push(el, { pausing: true, onClose: onDone || null });

      var catsEl = el.querySelector('[data-cats]');
      cats.forEach(function(cat){
        var rowEl = document.createElement('div');
        rowEl.className = 'shop-row';
        rowEl.innerHTML = '<div><span class="sr-name">' + cat.label + '</span>' +
          '<span class="sr-desc">' + cat.desc + '</span></div>';
        var b = document.createElement('button');
        b.className = 'px-btn';
        b.textContent = 'ENTER ' + G.fmtMoney(G.BAL.CRAANES_ENTRY);
        b.addEventListener('click', function(){
          if(entered[cat.key]){
            entered[cat.key] = false;
            s.money += G.BAL.CRAANES_ENTRY; // straight refund, not "earnings"
            s.stats.weekSpent -= G.BAL.CRAANES_ENTRY;
            G.hud.poke('money');
            b.textContent = 'ENTER ' + G.fmtMoney(G.BAL.CRAANES_ENTRY);
            b.classList.add('px-btn');
            b.classList.remove('px-btn-dim');
            G.audio.click();
            return;
          }
          if(s.money < G.BAL.CRAANES_ENTRY){ G.audio.decline(); return; }
          entered[cat.key] = true;
          G.economy.spend(G.BAL.CRAANES_ENTRY);
          b.textContent = 'ENTERED ✔ (undo)';
          b.classList.add('px-btn-dim');
          G.audio.accept();
        });
        rowEl.appendChild(b);
        catsEl.appendChild(rowEl);
      });

      addButtons(el, [
        { label: 'ATTEND CEREMONY', onClick: function(){
            G.audio.click();
            var picked = cats.filter(function(c){ return entered[c.key]; });
            if(!picked.length){
              G.dock.infoToast('THE CRAANES', 'You sat at the back, ate the buffet, entered nothing. Honestly? Power move.', '');
              close(entry);
              return;
            }
            entry.onClose = null; // ceremony takes over the chain
            close(entry);
            ceremony(picked, onDone);
          } },
        { label: 'SKIP (SLEEP)', cls: 'px-btn-dim', onClick: function(){
            G.audio.click();
            // refund anything entered, then bail
            cats.forEach(function(c){
              if(entered[c.key]){
                s.money += G.BAL.CRAANES_ENTRY;
                s.stats.weekSpent -= G.BAL.CRAANES_ENTRY;
              }
            });
            G.hud.poke('money');
            G.dock.infoToast('THE CRAANES', 'You slept. Somewhere, a jury wept into its lanyards.', '');
            close(entry);
          } }
      ]);

      // envelope-by-envelope reveal
      function ceremony(picked, done){
        var results = picked.map(function(c){
          return { cat: c, won: Math.random() < c.chance };
        });
        var el2 = modalShell({
          cls: 'modal-craanes',
          kicker: 'THE LIGHTS DIM · A DRUM ROLL FROM A LAPTOP SPEAKER',
          title: 'AND THE CRAANE GOES TO...',
          bodyHTML: '<div data-envelopes></div>'
        });
        var entry2 = push(el2, { pausing: true, onClose: done || null });
        var envEl = el2.querySelector('[data-envelopes]');
        var ri = 0, wins = 0;

        var btnRow = addButtons(el2, [{ label: 'OPEN ENVELOPE', onClick: openNext }]);
        var openBtn = btnRow.querySelector('button');

        function openNext(){
          if(ri >= results.length) return;
          var r = results[ri];
          var rowEl = document.createElement('div');
          rowEl.className = 'craanes-result ' + (r.won ? 'won' : 'lost');
          if(r.won){
            wins++;
            s.trophies.push({ label: r.cat.label, week: s.week });
            s.rep += G.BAL.CRAANES_WIN_REP;
            G.verdict.gainFollowers(G.BAL.CRAANES_WIN_FOLLOWERS);
            rowEl.innerHTML = '<div class="cr-cat">' + r.cat.label + '</div>' +
              '<div class="cr-verdict">🏆 CRAVACHE! <span class="ig-dim">+' + G.BAL.CRAANES_WIN_REP + ' rep · +' +
              G.BAL.CRAANES_WIN_FOLLOWERS + ' followers</span></div>';
            G.audio.win();
            G.modals.confetti();
          } else {
            rowEl.innerHTML = '<div class="cr-cat">' + r.cat.label + '</div>' +
              '<div class="cr-verdict">went to the sponsor\'s nephew\'s agency. <span class="ig-dim">the jury avoided eye contact.</span></div>';
            G.audio.decline();
          }
          envEl.appendChild(rowEl);
          ri++;
          if(ri >= results.length){
            openBtn.textContent = wins ? 'CARRY THE TROPHIES HOME' : 'LONG DRIVE HOME';
            openBtn.onclick = null;
            openBtn.addEventListener('click', function(){
              G.audio.click();
              if(wins) G.dock.infoToast('AWARD SHELF', wins + ' Craane' + (wins > 1 ? 's' : '') + ' now living on the office wall. Clients will pretend not to notice.', 'good');
              close(entry2);
            }, { once: true });
            openBtn.removeEventListener('click', openNext);
          }
        }
      }
    },

    // ---------- pause / settings (ESC or the ⏸ chip) ----------
    showPauseMenu: function(){
      var s = G.state;
      var el = modalShell({
        kicker: 'PAUSED · THE BRIEFS ARE FROZEN. THE BRIEFS WILL REMEMBER.',
        title: '⏸ BREATHER',
        bodyHTML:
          '<div class="modal-fine">Volume</div><div data-vol class="vol-row"></div>' +
          '<div class="modal-fine" style="margin-top:14px">Danger zone</div><div data-danger></div>'
      });
      var entry = push(el, { pausing: true });

      // volume: three fixed steps, persisted
      var volEl = el.querySelector('[data-vol]');
      var STEPS = [{ label: 'FULL', v: 1 }, { label: 'LOW', v: 0.35 }, { label: 'OFF', v: 0 }];
      var volBtns = [];
      function paintVol(){
        volBtns.forEach(function(b, i){
          b.className = 'px-btn' + (Math.abs(G.audio.getVolume() - STEPS[i].v) < 0.01 ? '' : ' px-btn-dim');
        });
      }
      STEPS.forEach(function(st){
        var b = document.createElement('button');
        b.textContent = st.label;
        b.addEventListener('click', function(){
          G.audio.setVolume(st.v);
          if(st.v > 0) G.audio.click();
          paintVol();
        });
        volBtns.push(b);
        volEl.appendChild(b);
      });
      paintVol();

      // restart: two clicks, because rage is temporary but saves are not
      var dangerEl = el.querySelector('[data-danger]');
      var rb = document.createElement('button');
      rb.className = 'px-btn px-btn-red';
      rb.textContent = 'RESTART RUN';
      var armed = false;
      rb.addEventListener('click', function(){
        if(!armed){
          armed = true;
          rb.textContent = 'SURE? EVERYTHING GOES. CLICK AGAIN';
          return;
        }
        G.audio.decline();
        entry.onClose = null;
        close(entry);
        G.save.clear();
        G.main.start();
        G.dock.infoToast('FRESH MONDAY', 'New agency. Same city. The briefs never knew you.', 'good');
      });
      dangerEl.appendChild(rb);

      addButtons(el, [{ label: 'RESUME', onClick: function(){ G.audio.click(); close(entry); } }]);
    },

    // ---------- quotes wall ----------
    showQuote: function(q){
      var el = modalShell({
        kicker: 'FRAMED · ' + q.client,
        title: 'WALL OF "JUST ONE SMALL THING"',
        bodyHTML: '<div class="modal-body"><span class="q">"' + esc(q.text) + '"</span></div>' +
          '<div class="modal-fine">Survived. Framed. Invoiced (emotionally).</div>'
      });
      var entry = push(el, { pausing: true });
      addButtons(el, [{ label: 'BACK TO WORK', onClick: function(){ G.audio.click(); close(entry); } }]);
    },

    // ---------- neon sign naming (fires when the sign is bought) ----------
    showNeonSetup: function(){
      var s = G.state;
      var el = modalShell({
        cls: 'modal-green',
        kicker: 'NEON SIGN · NOW MAKE IT YOURS',
        title: 'WHAT SHOULD IT SAY?',
        bodyHTML:
          '<div class="modal-fine">16 characters. It buzzes on the wall forever. Choose something the landlord will not question.</div>' +
          '<input id="neon-input" class="px-input" maxlength="16" value="' + esc(s.neonText || 'CRAVACHE') + '" autocomplete="off" spellcheck="false">' +
          '<div class="neon-preview"><span data-neon-prev>~ ' + esc(s.neonText || 'CRAVACHE') + ' ~</span></div>'
      });
      var entry = push(el, { pausing: true });
      var input = el.querySelector('#neon-input');
      var prev = el.querySelector('[data-neon-prev]');

      function clean(v){
        return (v || '').toUpperCase().replace(/\s+/g, ' ').slice(0, 16).trim();
      }
      function sync(){
        var v = clean(input.value) || 'CRAVACHE';
        prev.textContent = '~ ' + v + ' ~';
      }
      input.addEventListener('input', sync);
      // focus after the modal animates in
      setTimeout(function(){ try { input.focus(); input.select(); } catch(e){} }, 60);

      addButtons(el, [{
        label: 'LIGHT IT UP',
        onClick: function(){
          s.neonText = clean(input.value) || 'CRAVACHE';
          G.audio.accept();
          close(entry);
          G.dock.infoToast('NEON LIT', '"' + s.neonText + '" now glows over the floor. Tasteful. Loud. Both.', 'good');
        }
      }]);
    },

    // ---------- end screens ----------
    showWin: function(){
      var st = G.state.stats;
      var el = modalShell({
        cls: 'modal-green',
        bodyHTML:
          '<div class="end-big">Q1 SURVIVED</div>' +
          '<div class="report-grid">' +
            '<div class="rg-k">Total billed</div><div class="rg-v pos">' + G.fmtMoney(st.totalEarned) + '</div>' +
            '<div class="rg-k">Briefs shipped</div><div class="rg-v">' + st.totalShipped + '</div>' +
            '<div class="rg-k">Went viral</div><div class="rg-v pos">' + st.totalViral + '</div>' +
            '<div class="rg-k">Quotes framed</div><div class="rg-v">' + st.quotesSurvived + '</div>' +
            '<div class="rg-k">Staff still employed</div><div class="rg-v">' + G.state.staff.length + '</div>' +
            '<div class="rg-k">Cash on hand</div><div class="rg-v pos">' + G.fmtMoney(G.state.money) + '</div>' +
          '</div>' +
          '<div class="modal-fine">From here it only gets faster. Briefs come quicker, decisions get shorter, the phone never stops. You can always walk away. Can you?</div>'
      });
      var entry = push(el, { pausing: true });
      addButtons(el, [
        { label: 'KEEP GOING — OVERTIME', onClick: function(){
            G.audio.accept();
            close(entry);
            G.main.enterEndless();
          } },
        { label: 'WALK AWAY', cls: 'px-btn-dim', onClick: function(){
            close(entry);
            G.modals.showRetire();
          } }
      ]);
      this.confetti();
    },

    // ---------- retirement (endless exit). Endings are placeholders for now. ----------
    showRetire: function(){
      var st = G.state.stats;
      var weeks = G.state.week;
      var endings = {
        hills: { label: 'RETIRE TO THE HILLS',
          text: 'You bought a small place near a big mountain. Your phone gets no signal. You checked. Twice. (full ending coming soon)' },
        agency: { label: 'START YOUR OWN AGENCY',
          text: 'You become the client-servicing person AND the client. There is no one left to blame. (full ending coming soon)' },
        field: { label: 'CHANGE FIELDS ENTIRELY',
          text: 'You now do something calm. Every time someone says "small change" you flinch. They do not know why. (full ending coming soon)' }
      };

      var el = modalShell({
        kicker: 'AFTER ' + weeks + ' WEEK' + (weeks > 1 ? 'S' : '') + ' · ' + st.totalShipped + ' BRIEFS SHIPPED',
        title: 'HOW DOES THIS END?',
        bodyHTML: '<div class="modal-body">The agency will survive without you. That is either comforting or insulting. Pick a door.</div>'
      });
      var entry = push(el, { pausing: true });
      addButtons(el, Object.keys(endings).map(function(k){
        return {
          label: endings[k].label,
          onClick: function(){
            close(entry);
            var e2 = modalShell({
              cls: 'modal-green',
              bodyHTML: '<div class="end-big">' + esc(endings[k].label) + '</div>' +
                '<div class="modal-body">' + esc(endings[k].text) + '</div>' +
                '<div class="report-grid">' +
                  '<div class="rg-k">Weeks survived</div><div class="rg-v">' + weeks + '</div>' +
                  '<div class="rg-k">Total billed</div><div class="rg-v pos">' + G.fmtMoney(st.totalEarned) + '</div>' +
                  '<div class="rg-k">Quotes framed</div><div class="rg-v">' + st.quotesSurvived + '</div>' +
                '</div>'
            });
            var entry2 = push(e2, { pausing: true });
            addButtons(e2, [{ label: 'PUNCH IN AGAIN', onClick: function(){ location.reload(); } }]);
            G.modals.confetti();
          }
        };
      }));
    },

    showLose: function(type){
      var heads = {
        payroll: 'THE AGENCY IS BANKRUPT',
        chaos: 'THE OFFICE IS ON FIRE'
      };
      var subs = {
        payroll: 'Three missed payrolls. The team left as a group. They started their own agency. It is doing well.',
        chaos: 'Not metaphorically. The chaos meter hit 100 and so did the curtains. The client still wants the files by EOD.'
      };
      var el = modalShell({
        cls: 'modal-red',
        bodyHTML:
          '<div class="end-big lose">' + (heads[type] || 'GAME OVER') + '</div>' +
          '<div class="modal-body">' + (subs[type] || '') + '</div>' +
          '<div class="report-grid">' +
            '<div class="rg-k">Survived until</div><div class="rg-v">Week ' + G.state.week + ', day ' + G.state.day + '</div>' +
            '<div class="rg-k">Briefs shipped</div><div class="rg-v">' + G.state.stats.totalShipped + '</div>' +
            '<div class="rg-k">Total billed</div><div class="rg-v">' + G.fmtMoney(G.state.stats.totalEarned) + '</div>' +
          '</div>'
      });
      var entry = push(el, { pausing: true });
      var loseBtns = [];
      if(G.state.bailouts < 2){
        loseBtns.push({
          label: G.state.bailouts === 0 ? '📞 CALL THE INVESTOR (+₹1.5L)' : '📞 BEG THE INVESTOR (+₹2.5L)',
          onClick: function(){
            close(entry);
            G.main.investorBailout();
          }
        });
      }
      loseBtns.push({ label: 'TRY AGAIN FROM ZERO', cls: 'px-btn-dim', onClick: function(){ G.save.clear(); location.reload(); } });
      addButtons(el, loseBtns);
      if(G.state.bailouts < 2){
        var fine = document.createElement('div');
        fine.className = 'modal-fine';
        fine.textContent = 'The investor takes 5 rep, resets your strikes, calms the fire to 45%, and will absolutely bring this up at every dinner.';
        el.appendChild(fine);
      }
    },

    // ---------- confetti ----------
    confetti: function(){
      var colors = ['#ffe066', '#ff9a56', '#9fe8ff', '#7ee08a', '#d35d6e', '#f4e8cf'];
      for(var i = 0; i < 46; i++){
        var p = document.createElement('div');
        p.className = 'confetti';
        p.style.left = Math.floor(Math.random() * 1280) + 'px';
        p.style.top = '-10px';
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.4) + 's';
        stageEl.appendChild(p);
        (function(node){ setTimeout(function(){ node.remove(); }, 2200); })(p);
      }
    }
  };
})();
