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
      // call hold
      if(callCtx && callCtx.holding){
        callCtx.call.held += rdt;
        var frac = Math.min(1, callCtx.call.held / G.BAL.CALL_HOLD_REAL_SECONDS);
        callCtx.fillEl.style.width = (frac * 100) + '%';
        if(frac >= 1) this._resolveCall(true);
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

    // ---------- 6PM call: screen dims, sim keeps running ----------
    showCall: function(call){
      dimEl.classList.remove('hidden');
      var el = modalShell({
        cls: 'call-shake',
        kicker: 'INCOMING · ' + call.client.name + ' · ' + (call.client.industry || ''),
        title: 'THE 6PM CALL',
        bodyHTML:
          '<div class="modal-body"><span class="q">"' + esc(call.quote) + '"</span></div>' +
          '<div class="modal-fine">Hold LISTEN to survive the call. Release and they notice. Hang up and they REALLY notice. Work continues without you.</div>' +
          '<div class="hold-track"><div class="hold-fill"></div></div>'
      });
      var entry = push(el, { pausing: false });
      callCtx = { call: call, entry: entry, fillEl: el.querySelector('.hold-fill'), holding: false };

      var row = addButtons(el, [
        { label: 'LISTEN (HOLD)', onClick: function(){} },
        { label: 'HANG UP', cls: 'px-btn-red', onClick: function(){ G.modals._resolveCall(false); } }
      ]);
      var holdBtn = row.children[0];
      holdBtn.addEventListener('pointerdown', function(e){
        e.preventDefault();
        if(!callCtx) return;
        callCtx.holding = true;
        el.classList.remove('call-shake');
      });
      window.addEventListener('pointerup', releaseHold);
      callCtx.release = releaseHold;
      function releaseHold(){ if(callCtx) callCtx.holding = false; }
    },

    _resolveCall: function(survived){
      if(!callCtx) return;
      var ctx = callCtx;
      callCtx = null;
      window.removeEventListener('pointerup', ctx.release);
      dimEl.classList.add('hidden');
      close(ctx.entry);
      if(survived) G.events.callSurvived(ctx.call);
      else G.events.callIgnored(ctx.call);
    },

    // ---------- Friday report card + one-purchase shop ----------
    showReportCard: function(info){
      // if a call is still live when Friday ends, the client gets voicemail
      if(G.state.activeCall && callCtx) this._resolveCall(false);

      var s = G.state;
      var st = s.stats;
      var bought = false;

      var rows =
        row('Earned this week', '+' + G.fmtMoney(st.weekEarned), 'pos') +
        row('Spent this week', '-' + G.fmtMoney(st.weekSpent), 'neg') +
        row('Payroll', '-' + G.fmtMoney(info.payroll), info.cleared ? '' : 'neg') +
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
          '<div class="modal-kicker" style="margin-top:8px">ONE PURCHASE BEFORE MONDAY (choose wisely)</div>' +
          '<div data-shop></div>'
      });
      var entry = push(el, {
        pausing: true,
        onClose: function(){
          st.weekEarned = 0; st.weekSpent = 0; st.weekShipped = 0; st.weekScrapped = 0;
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
        items.push({ name: it.name, desc: it.desc, price: it.price,
          buy: function(){ return G.economy.buyUpgrade(key); } });
      });
      ['designer', 'editor', 'content', 'production'].forEach(function(dept){
        var cand = null;
        for(var i = 0; i < s.hirePool.length; i++)
          if(s.hirePool[i].dept === dept){ cand = s.hirePool[i]; break; }
        if(!cand) return;
        if(!G.staff.deptUnlocked(dept)){
          items.push({ name: dept.toUpperCase() + ': locked', desc: 'Opens week ' + G.BAL.PRODUCTION_UNLOCK_WEEK + '.', price: 0, locked: true, buy: function(){ return false; } });
          return;
        }
        if(G.staff.deptCount(dept) >= G.BAL.DEPT_CAPS[dept]) return;
        var advance = Math.round(cand.salaryMonthly / 4);
        var badges = (cand.badges || []).map(function(b){ return b.icon + ' ' + b.label; }).join(' · ');
        items.push({
          name: 'HIRE ' + cand.name + ' · ' + dept.toUpperCase() + ' ★' + cand.skill,
          desc: badges + ' — ' + cand.trait + ' · ' + G.fmtMoney(cand.salaryMonthly) + '/mo',
          price: advance,
          buy: function(){
            if(s.money < advance) return false;
            var idx = s.hirePool.indexOf(cand);
            if(!G.staff.canHire(cand)) return false;
            G.economy.spend(advance); // signing advance = one week's pay
            return G.staff.hire(idx);
          }
        });
      });

      var btns = [];
      items.forEach(function(it){
        var rowEl = document.createElement('div');
        rowEl.className = 'shop-row';
        rowEl.innerHTML = '<div><span class="sr-name">' + esc(it.name) + '</span>' +
          '<span class="sr-desc">' + esc(it.desc) + '</span></div>';
        var b = document.createElement('button');
        b.className = 'px-btn';
        b.textContent = it.locked ? 'LOCKED' : G.fmtMoney(it.price);
        b.disabled = it.locked || s.money < it.price;
        b.addEventListener('click', function(){
          if(bought) return;
          if(it.buy()){
            bought = true;
            btns.forEach(function(x){ x.disabled = true; });
            b.textContent = 'DONE ✔';
          } else {
            G.audio.decline();
          }
        });
        btns.push(b);
        rowEl.appendChild(b);
        shopEl.appendChild(rowEl);
      });
      if(!items.length) shopEl.innerHTML = '<div class="modal-fine">Nothing left to buy. The office is complete. The work is not.</div>';

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

    // ---------- HIRE: anytime, grouped by department ----------
    showHire: function(){
      var s = G.state;
      G.staff.refillPool(); // walk-in CVs keep the pool stocked
      var el = modalShell({
        kicker: 'HIRING · PAYROLL NOW ' + G.fmtMoney(G.economy.payrollTotal()) + '/WK',
        title: 'WHO JOINS THE CHAOS?',
        bodyHTML: '<div class="modal-fine">Signing advance = one week of pay, upfront. Salaries hit every Friday whether clients pay or not.</div><div data-hires></div>'
      });
      var entry = push(el, { pausing: true });
      var listEl = el.querySelector('[data-hires]');
      var any = false;

      ['designer', 'editor', 'content', 'production'].forEach(function(dept){
        var cap = G.BAL.DEPT_CAPS[dept];
        var head = document.createElement('div');
        head.className = 'modal-kicker';
        head.style.marginTop = '8px';
        head.textContent = dept.toUpperCase() + ' · ' + G.staff.deptCount(dept) + '/' + cap +
          (!G.staff.deptUnlocked(dept) ? ' · LOCKED UNTIL WK ' + G.BAL.PRODUCTION_UNLOCK_WEEK : '');
        listEl.appendChild(head);

        s.hirePool.filter(function(c){ return c.dept === dept; }).forEach(function(cand){
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
                head.textContent = dept.toUpperCase() + ' · ' + G.staff.deptCount(dept) + '/' + cap;
                return;
              }
            }
            G.audio.decline();
          });
          rowEl.appendChild(b);
          listEl.appendChild(rowEl);
        });
      });
      if(!any) listEl.innerHTML += '<div class="modal-fine">Pool empty. Everyone employable in Ahmedabad already works here.</div>';

      addButtons(el, [{ label: 'DONE', onClick: function(){ G.audio.click(); close(entry); } }]);
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
