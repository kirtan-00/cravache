// CravAche — TRIAL overrides. Loaded by BOTH index.html and trial.html (this
// IS the shipping experience now). Everything here is a runtime monkey-patch +
// injected DOM/CSS. Safe to delete to fall back to the bare committed build.
//
// What this does:
//   1) Payments 80/20 — big invoices mostly auto-pay (UPI), only ~20% chase.
//   2) Non-blocking verdict — no slot machine; outcomes arrive as WhatsApp
//      messages + a top-right slide-in notification. Game never pauses.
//   3) A WhatsApp-style client panel: scrollable chat list + threads, one-tap
//      "REMIND" collection of receivables. Replaces the pausing COLLECT modal.
(function(){
  'use strict';
  if(!window.G || !G.verdict) return;
  window.CRAVACHE_TRIAL = true;

  // ----------------------------------------------------------------- store
  // in-memory only; no persistence needed.
  // threads: { clientKey -> { id, name, msgs:[{from:'them'|'me', text, t}], unread } }
  var threads = {};
  var notes = [];          // active notification entries {el, timer, clientKey}

  // sentinel id for the non-client "Office / Team" thread (office events land here)
  var OFFICE_ID = '__office__';

  function clientKey(id){ return id == null ? '__unknown__' : String(id); }

  function clientMeta(id){
    if(id === OFFICE_ID) return { id: OFFICE_ID, name: 'Office / Team' };
    var c = G.data.clientById(id);
    if(c) return { id: id, name: c.name || '???' };
    return { id: id, name: '???' };
  }

  function thread(id){
    var k = clientKey(id);
    if(!threads[k]){
      var m = clientMeta(id);
      threads[k] = { id: id, key: k, name: m.name, msgs: [], unread: 0 };
    }
    return threads[k];
  }

  function pushMsg(id, from, text){
    var t = thread(id);
    t.msgs.push({ from: from, text: text, t: Date.now() });
    if(from === 'them' && !isThreadOpen(t.key)) t.unread++;
    return t;
  }

  // a "them" message that carries N tappable quick-reply buttons. Tapping a
  // button runs that option's onPick (the real gameplay effect), locks the
  // buttons, and appends a "You: <label>" sent message. Until tapped the choice
  // just sits in the thread — ignoring it = no effect (dodging the decision).
  function pushChoice(id, text, options){
    var t = thread(id);
    var msg = {
      from: 'them', text: text, t: Date.now(),
      kind: 'choice', options: options || [], answered: false, pickedLabel: null
    };
    t.msgs.push(msg);
    if(!isThreadOpen(t.key)) t.unread++;
    return { thread: t, msg: msg };
  }

  function pulseLauncher(){
    if(!launcherEl) return;
    launcherEl.classList.remove('wa-attn');
    // force reflow so the animation restarts even on back-to-back decisions
    void launcherEl.offsetWidth;
    launcherEl.classList.add('wa-attn');
  }

  function totalUnread(){
    var n = 0;
    for(var k in threads) if(threads.hasOwnProperty(k)) n += threads[k].unread;
    return n;
  }

  function dueFor(id){
    var s = G.state, sum = 0;
    for(var i=0;i<s.receivables.length;i++){
      if(clientKey(s.receivables[i].clientId) === clientKey(id)) sum += s.receivables[i].amount;
    }
    return sum;
  }

  function receivablesFor(id){
    return G.state.receivables.filter(function(inv){
      return clientKey(inv.clientId) === clientKey(id);
    });
  }

  // deterministic hash colour for avatars
  function hashColor(str){
    var h = 0; str = str || '?';
    for(var i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) & 0xffffffff; }
    var hue = Math.abs(h) % 360;
    return 'hsl(' + hue + ',45%,42%)';
  }
  function firstLetter(name){
    var c = (name||'?').trim().charAt(0);
    return c ? c.toUpperCase() : '?';
  }
  function blip(fn){ try{ if(G.audio && G.audio[fn]) G.audio[fn](); }catch(e){} }

  // ------------------------------------------------------------------- css
  function injectCSS(){
    if(document.getElementById('wa-style')) return;
    var st = document.createElement('style');
    st.id = 'wa-style';
    st.textContent = [
      // launcher
      // lower-right, lifted above the night-only SKIP NIGHT button (which sits at
      // right:14 just above the dock) so the two never overlap
      '#wa-launcher{position:absolute;right:14px;bottom:172px;z-index:70;',
        'width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;',
        'background:#25d366;color:#073b2a;font-size:26px;line-height:1;display:flex;',
        'align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.4);}',
      '#wa-launcher:hover{filter:brightness(1.07);}',
      '#wa-launcher .wa-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;',
        'padding:0 5px;border-radius:10px;background:#ff3b30;color:#fff;font:700 12px/20px system-ui,sans-serif;',
        'text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.4);}',
      '#wa-launcher .wa-badge.empty{display:none;}',
      // notifications — anchored bottom-right just above the WhatsApp launcher
      // so they never collide with the brief-offer toasts in the TOP-right.
      '#wa-notes{position:absolute;bottom:172px;right:14px;z-index:80;display:flex;flex-direction:column-reverse;',
        'gap:8px;width:300px;pointer-events:none;}',
      '.wa-note{pointer-events:auto;cursor:pointer;background:#1f2c33;color:#e9edef;',
        'border-left:4px solid #25d366;border-radius:8px;padding:9px 11px;',
        'box-shadow:0 6px 18px rgba(0,0,0,.45);font:13px/1.35 system-ui,sans-serif;',
        'transform:translateX(120%);opacity:0;transition:transform .32s cubic-bezier(.2,.8,.2,1),opacity .32s;}',
      '.wa-note.in{transform:translateX(0);opacity:1;}',
      '.wa-note .wa-note-head{display:flex;align-items:center;gap:8px;margin-bottom:3px;}',
      '.wa-note .wa-av{width:24px;height:24px;border-radius:50%;flex:0 0 auto;color:#fff;',
        'font:700 12px/24px system-ui,sans-serif;text-align:center;}',
      '.wa-note .wa-note-name{font-weight:700;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.wa-note .wa-note-body{color:#d4dce0;}',
      // panel
      '#wa-panel{position:absolute;top:0;right:0;bottom:0;width:360px;max-width:92%;z-index:75;',
        'background:#0b141a;color:#e9edef;display:flex;flex-direction:column;',
        'box-shadow:-8px 0 26px rgba(0,0,0,.5);transform:translateX(105%);',
        'transition:transform .28s cubic-bezier(.2,.8,.2,1);font-family:system-ui,sans-serif;}',
      '#wa-panel.open{transform:translateX(0);}',
      '#wa-panel .wa-header{flex:0 0 auto;display:flex;align-items:center;gap:10px;',
        'background:#1f2c33;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.06);}',
      '#wa-panel .wa-back{background:none;border:none;color:#aebac1;font-size:20px;cursor:pointer;',
        'width:28px;line-height:1;display:none;}',
      '#wa-panel.in-thread .wa-back{display:block;}',
      '#wa-panel .wa-title{flex:1;font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#wa-panel .wa-sub{font-weight:400;font-size:11px;color:#8696a0;}',
      '#wa-panel .wa-close{background:none;border:none;color:#aebac1;font-size:20px;cursor:pointer;width:30px;line-height:1;}',
      '#wa-panel .wa-header .wa-av{width:34px;height:34px;border-radius:50%;color:#fff;font:700 15px/34px system-ui,sans-serif;text-align:center;flex:0 0 auto;}',
      // chat list (scrollable)
      '#wa-list{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;}',
      '.wa-row{display:flex;align-items:center;gap:11px;padding:10px 12px;cursor:pointer;',
        'border-bottom:1px solid rgba(255,255,255,.04);}',
      '.wa-row:hover{background:#111d25;}',
      '.wa-row .wa-av{width:42px;height:42px;border-radius:50%;color:#fff;font:700 18px/42px system-ui,sans-serif;text-align:center;flex:0 0 auto;}',
      '.wa-row .wa-rmain{flex:1;min-width:0;}',
      '.wa-row .wa-rname{font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.wa-row .wa-rprev{font-size:12px;color:#8696a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.wa-row .wa-rmeta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:0 0 auto;}',
      '.wa-row .wa-due{font-size:10px;font-weight:700;color:#f4c430;background:rgba(244,196,48,.12);padding:1px 6px;border-radius:8px;}',
      '.wa-row .wa-unread{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#25d366;',
        'color:#06291d;font:700 11px/18px system-ui,sans-serif;text-align:center;}',
      '.wa-empty{padding:30px 18px;color:#6b7a82;text-align:center;font-size:13px;line-height:1.5;}',
      // tabs (ALL / UNPAID) + a paused banner + a total-due banner
      '#wa-tabs{flex:0 0 auto;display:flex;background:#0b141a;border-bottom:1px solid rgba(255,255,255,.06);}',
      '#wa-panel.in-thread #wa-tabs{display:none;}',
      '#wa-tabs .wa-tab{flex:1;background:none;border:none;color:#8696a0;cursor:pointer;',
        'font:700 12px system-ui,sans-serif;padding:11px 8px;border-bottom:3px solid transparent;}',
      '#wa-tabs .wa-tab.active{color:#25d366;border-bottom-color:#25d366;}',
      '#wa-pausebar{flex:0 0 auto;background:#142a1f;color:#7ee0c0;font:700 11px system-ui,sans-serif;',
        'text-align:center;padding:6px 8px;letter-spacing:.3px;}',
      '#wa-duebar{flex:0 0 auto;background:rgba(244,196,48,.10);color:#f4c430;',
        'font:700 12px system-ui,sans-serif;text-align:center;padding:8px;}',
      // thread (scrollable)
      '#wa-thread{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;display:none;flex-direction:column;',
        'gap:7px;padding:14px 12px;background:#0b141a;}',
      '#wa-panel.in-thread #wa-list{display:none;}',
      '#wa-panel.in-thread #wa-thread{display:flex;}',
      '.wa-b{max-width:80%;padding:7px 10px;border-radius:9px;font-size:13px;line-height:1.4;word-wrap:break-word;position:relative;}',
      '.wa-b.them{align-self:flex-start;background:#1f2c33;border-top-left-radius:2px;}',
      '.wa-b.me{align-self:flex-end;background:#005c4b;border-top-right-radius:2px;}',
      '.wa-inv{align-self:stretch;background:#111d25;border:1px solid rgba(244,196,48,.35);',
        'border-radius:9px;padding:9px 11px;display:flex;align-items:center;gap:10px;}',
      '.wa-inv .wa-inv-main{flex:1;min-width:0;}',
      '.wa-inv .wa-inv-t{font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.wa-inv .wa-inv-a{font-size:11px;color:#f4c430;}',
      '.wa-remind{background:#25d366;color:#06291d;border:none;border-radius:7px;padding:6px 10px;',
        'font:700 12px system-ui,sans-serif;cursor:pointer;flex:0 0 auto;}',
      '.wa-remind:hover{filter:brightness(1.07);}',
      '.wa-remind:disabled{background:#3a4a52;color:#8696a0;cursor:default;}',
      // choice message: a "them" bubble carrying tappable quick-reply buttons
      '.wa-choice{align-self:flex-start;max-width:88%;display:flex;flex-direction:column;gap:6px;}',
      '.wa-choice .wa-b{align-self:stretch;max-width:100%;}',
      '.wa-choice .wa-choice-btns{display:flex;flex-direction:column;gap:5px;}',
      '.wa-choice .wa-reply{background:#1f2c33;color:#7ee0c0;border:1px solid rgba(37,211,102,.4);',
        'border-radius:9px;padding:8px 11px;font:700 13px system-ui,sans-serif;cursor:pointer;',
        'text-align:center;transition:background .12s;}',
      '.wa-choice .wa-reply:hover{background:#26343c;}',
      '.wa-choice .wa-reply:disabled{opacity:.45;cursor:default;border-color:rgba(255,255,255,.08);color:#8696a0;}',
      '.wa-choice .wa-choice-hint{font-size:10px;color:#8696a0;text-align:center;}',
      // launcher attention pulse when a decision is waiting
      '@keyframes wa-pulse{0%{box-shadow:0 4px 14px rgba(0,0,0,.4),0 0 0 0 rgba(37,211,102,.6);}',
        '70%{box-shadow:0 4px 14px rgba(0,0,0,.4),0 0 0 14px rgba(37,211,102,0);}',
        '100%{box-shadow:0 4px 14px rgba(0,0,0,.4),0 0 0 0 rgba(37,211,102,0);}}',
      '#wa-launcher.wa-attn{animation:wa-pulse 1.1s ease-out 4;}'
    ].join('');
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------- DOM build
  var panelEl, listEl, threadEl, titleEl, subEl, headAvEl, backBtn, launcherEl, notesEl, tabsEl;
  var openClientKey = null;   // null = list view; else thread view key
  var listFilter = 'all';     // 'all' | 'unpaid'
  var waPausedByUs = false;   // we paused the sim because the panel is open

  // total money owed to you across every client (sum of all receivables)
  function totalDue(){
    var s = G.state, t = 0;
    if(s && s.receivables) for(var i=0;i<s.receivables.length;i++) t += s.receivables[i].amount;
    return t;
  }
  // clients with money outstanding (count)
  function owedCount(){
    var s = G.state, seen = {}, n = 0;
    if(s && s.receivables) for(var i=0;i<s.receivables.length;i++){
      var k = clientKey(s.receivables[i].clientId); if(!seen[k]){ seen[k]=1; n++; }
    }
    return n;
  }

  function isThreadOpen(key){
    return panelEl && panelEl.classList.contains('open') && openClientKey === key;
  }

  function stage(){ return document.getElementById('stage') || document.body; }

  function buildLauncher(){
    if(launcherEl) return;
    launcherEl = document.createElement('button');
    launcherEl.id = 'wa-launcher';
    launcherEl.title = 'client messages';
    launcherEl.innerHTML = '💬<span class="wa-badge empty">0</span>';
    launcherEl.addEventListener('click', function(){ openPanel(); });
    stage().appendChild(launcherEl);
  }

  function buildNotes(){
    if(notesEl) return;
    notesEl = document.createElement('div');
    notesEl.id = 'wa-notes';
    stage().appendChild(notesEl);
  }

  function buildPanel(){
    if(panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'wa-panel';
    panelEl.innerHTML =
      '<div class="wa-header">' +
        '<button class="wa-back" title="back">‹</button>' +
        '<span class="wa-av" data-headav></span>' +
        '<div class="wa-title" data-title>Clients<div class="wa-sub" data-sub>WhatsApp Business</div></div>' +
        '<button class="wa-close" title="close">✕</button>' +
      '</div>' +
      '<div id="wa-pausebar">⏸ GAME PAUSED while you handle messages</div>' +
      '<div id="wa-tabs">' +
        '<button class="wa-tab active" data-f="all">ALL CHATS</button>' +
        '<button class="wa-tab" data-f="unpaid">UNPAID</button>' +
      '</div>' +
      '<div id="wa-list"></div>' +
      '<div id="wa-thread"></div>';
    stage().appendChild(panelEl);
    listEl = panelEl.querySelector('#wa-list');
    threadEl = panelEl.querySelector('#wa-thread');
    titleEl = panelEl.querySelector('[data-title]');
    subEl = panelEl.querySelector('[data-sub]');
    headAvEl = panelEl.querySelector('[data-headav]');
    backBtn = panelEl.querySelector('.wa-back');
    tabsEl = panelEl.querySelector('#wa-tabs');
    backBtn.addEventListener('click', function(){ showList(); });
    panelEl.querySelector('.wa-close').addEventListener('click', function(){ closePanel(); });
    tabsEl.querySelectorAll('.wa-tab').forEach(function(btn){
      btn.addEventListener('click', function(){
        listFilter = btn.getAttribute('data-f');
        showList();
      });
    });
  }

  function ensureDOM(){ injectCSS(); buildNotes(); buildLauncher(); buildPanel(); }

  // -------------------------------------------------------------- badges
  function refreshBadge(){
    if(!launcherEl) return;
    var b = launcherEl.querySelector('.wa-badge');
    var n = totalUnread();
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('empty', n === 0);
  }

  // ----------------------------------------------------------- list view
  function paintTabs(){
    if(!tabsEl) return;
    var due = totalDue();
    tabsEl.querySelectorAll('.wa-tab').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-f') === listFilter);
      if(b.getAttribute('data-f') === 'unpaid'){
        b.textContent = due > 0 ? ('UNPAID · ' + G.fmtMoney(due)) : 'UNPAID';
      }
    });
  }

  function renderList(){
    if(!listEl) return;
    paintTabs();
    listEl.innerHTML = '';

    // total-due banner: how much money is owed to you right now, across everyone
    var due = totalDue();
    if(due > 0){
      var bar = document.createElement('div');
      bar.id = 'wa-duebar';
      bar.textContent = G.fmtMoney(due) + ' to collect · ' + owedCount() + ' client' + (owedCount()===1?'':'s');
      listEl.appendChild(bar);
    }

    var keys;
    if(listFilter === 'unpaid'){
      // derive straight from who owes you — ensure a thread exists for each,
      // even if they've never messaged, so every debtor is collectable here.
      var seen = {}; keys = [];
      (G.state.receivables || []).forEach(function(inv){
        var t = thread(inv.clientId);
        if(!seen[t.key]){ seen[t.key] = 1; keys.push(t.key); }
      });
    } else {
      keys = Object.keys(threads).filter(function(k){ return threads[k].msgs.length; });
    }
    if(!keys.length){
      var e = document.createElement('div');
      e.className = 'wa-empty';
      e.textContent = listFilter === 'unpaid'
        ? 'Nobody owes you right now. Rare. Enjoy it.'
        : 'No client chats yet. Ship something and they will message you.';
      listEl.appendChild(e);
      return;
    }
    // unpaid: biggest debt first; all: most-recent first
    keys.sort(function(a,b){
      if(listFilter === 'unpaid') return dueFor(threads[b].id) - dueFor(threads[a].id);
      var ma = threads[a].msgs, mb = threads[b].msgs;
      return mb[mb.length-1].t - ma[ma.length-1].t;
    });
    keys.forEach(function(k){
      var t = threads[k];
      var last = t.msgs.length ? t.msgs[t.msgs.length-1] : null;
      var due = dueFor(t.id);
      var row = document.createElement('div');
      row.className = 'wa-row';
      var prev = last ? ((last.from === 'me' ? 'You: ' : '') + last.text)
                      : 'Payment pending — tap to remind';
      row.innerHTML =
        '<span class="wa-av" style="background:' + hashColor(t.name) + '">' + esc(firstLetter(t.name)) + '</span>' +
        '<div class="wa-rmain"><div class="wa-rname">' + esc(t.name) + '</div>' +
          '<div class="wa-rprev">' + esc(prev) + '</div></div>' +
        '<div class="wa-rmeta">' +
          (due > 0 ? '<span class="wa-due">' + esc(G.fmtMoney(due)) + ' due</span>' : '') +
          (t.unread > 0 ? '<span class="wa-unread">' + t.unread + '</span>' : '') +
        '</div>';
      row.addEventListener('click', function(){ openThread(k); });
      listEl.appendChild(row);
    });
  }

  function showList(){
    openClientKey = null;
    panelEl.classList.remove('in-thread');
    titleEl.childNodes[0].nodeValue = 'Clients';
    var due = totalDue();
    subEl.textContent = due > 0 ? (G.fmtMoney(due) + ' to collect') : 'WhatsApp Business';
    headAvEl.style.background = '#25d366';
    headAvEl.textContent = '💬';
    renderList();
    refreshBadge();
  }

  // --------------------------------------------------------- thread view
  // a choice message: the event text bubble + a stack of quick-reply buttons.
  function renderChoice(key, t, m){
    var wrap = document.createElement('div');
    wrap.className = 'wa-choice';

    var bubble = document.createElement('div');
    bubble.className = 'wa-b them';
    bubble.textContent = m.text;
    wrap.appendChild(bubble);

    var btns = document.createElement('div');
    btns.className = 'wa-choice-btns';
    (m.options || []).forEach(function(opt){
      var b = document.createElement('button');
      b.className = 'wa-reply';
      b.textContent = opt.label;
      b.disabled = m.answered;
      b.addEventListener('click', function(){
        if(m.answered) return;
        m.answered = true;
        m.pickedLabel = opt.label;
        if(m._expireTimer){ clearTimeout(m._expireTimer); m._expireTimer = null; }
        // run the REAL outcome first, then lock + echo the reply
        try{ if(opt.onPick) opt.onPick(); }catch(e){ try{ console.error('[trial] choice onPick failed', e); }catch(_){} }
        blip('click');
        // append the player's sent reply as a normal "me" message
        t.msgs.push({ from: 'me', text: opt.label, t: Date.now() });
        renderThread(key);
        try{ if(G.dock && G.dock.refreshCollect) G.dock.refreshCollect(); }catch(e){}
        refreshBadge();
      });
      btns.appendChild(b);
    });
    wrap.appendChild(btns);

    if(!m.answered){
      var hint = document.createElement('div');
      hint.className = 'wa-choice-hint';
      hint.textContent = 'tap to reply · no reply = a NO';
      wrap.appendChild(hint);
    }
    threadEl.appendChild(wrap);
  }

  function renderThread(key){
    var t = threads[key];
    if(!t || !threadEl) return;
    threadEl.innerHTML = '';
    t.msgs.forEach(function(m){
      if(m.kind === 'choice'){ renderChoice(key, t, m); return; }
      var b = document.createElement('div');
      b.className = 'wa-b ' + (m.from === 'me' ? 'me' : 'them');
      b.textContent = m.text;
      threadEl.appendChild(b);
    });
    // pending receivables as remind rows
    receivablesFor(t.id).forEach(function(inv){
      var row = document.createElement('div');
      row.className = 'wa-inv';
      row.innerHTML =
        '<div class="wa-inv-main"><div class="wa-inv-t">' + esc(inv.title) + '</div>' +
          '<div class="wa-inv-a">' + esc(G.fmtMoney(inv.amount)) + ' pending</div></div>';
      var btn = document.createElement('button');
      btn.className = 'wa-remind';
      btn.textContent = 'REMIND ' + G.fmtMoney(inv.amount);
      btn.addEventListener('click', function(){
        if(G.state.receivables.indexOf(inv) < 0) return;
        G.economy.collect(inv);
        blip('chaChing');
        pushMsg(t.id, 'them', 'received ✅ ' + G.fmtMoney(inv.amount) + ' transferred. theek hai?');
        try{ if(G.dock && G.dock.refreshCollect) G.dock.refreshCollect(); }catch(e){}
        renderThread(key);
        refreshBadge();
      });
      row.appendChild(btn);
      threadEl.appendChild(row);
    });
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function openThread(key){
    var t = threads[key];
    if(!t) return;
    openClientKey = key;
    t.unread = 0;
    panelEl.classList.add('in-thread');
    titleEl.childNodes[0].nodeValue = t.name + ' ';
    var due = dueFor(t.id);
    subEl.textContent = due > 0 ? (G.fmtMoney(due) + ' due') : 'client';
    headAvEl.style.background = hashColor(t.name);
    headAvEl.textContent = firstLetter(t.name);
    renderThread(key);
    refreshBadge();
  }

  // ---------------------------------------------------------- open/close
  function openPanel(toKey){
    ensureDOM();
    blip('click');
    // OPENING WHATSAPP PAUSES THE GAME: time stops, briefs don't pile up or slip
    // away, worker animations freeze — you can read/collect in peace.
    if(G.state && G.state.running && !G.state.gameOver && !G.state.paused){
      G.state.paused = true; waPausedByUs = true;
    }
    panelEl.classList.add('open');
    if(toKey != null && threads[toKey]) openThread(toKey);
    else if(openClientKey != null && threads[openClientKey]) openThread(openClientKey);
    else showList();
  }
  function closePanel(){
    if(!panelEl) return;
    blip('click');
    panelEl.classList.remove('open');
    openClientKey = null;
    // resume the game only if WE paused it for the panel
    if(waPausedByUs && G.state){ G.state.paused = false; }
    waPausedByUs = false;
  }

  // -------------------------------------------------------- notifications
  function notify(clientId, name, bodyText){
    ensureDOM();
    var key = clientKey(clientId);
    var el = document.createElement('div');
    el.className = 'wa-note';
    el.innerHTML =
      '<div class="wa-note-head">' +
        '<span class="wa-av" style="background:' + hashColor(name) + '">' + esc(firstLetter(name)) + '</span>' +
        '<span class="wa-note-name">' + esc(name) + '</span></div>' +
      '<div class="wa-note-body">' + esc(bodyText) + '</div>';
    var entry = { el: el, timer: null, key: key };
    el.addEventListener('click', function(){
      dismiss(entry);
      openPanel(key);
    });
    notesEl.appendChild(el);
    notes.push(entry);
    // enter animation
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.add('in'); }); });
    entry.timer = setTimeout(function(){ dismiss(entry); }, 5500);
    blip('slotTick');
  }
  function dismiss(entry){
    if(entry._gone) return;
    entry._gone = true;
    if(entry.timer){ clearTimeout(entry.timer); entry.timer = null; }
    entry.el.classList.remove('in');
    var idx = notes.indexOf(entry);
    if(idx >= 0) notes.splice(idx, 1);
    setTimeout(function(){ if(entry.el.parentNode) entry.el.parentNode.removeChild(entry.el); }, 340);
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // ===================================================================
  // 1) PAYMENTS 80/20 — override instantPay
  // ===================================================================
  G.verdict.instantPay = function(brief, payout){
    if(payout <= 0){ brief._payNote = 'auto'; return true; } // nothing to collect
    var UNDER = G.BAL.INSTANT_PAY_UNDER || 10000;
    if(payout < UNDER){
      // small money lands instantly on UPI; clients do not chase petty sums.
      G.economy.earn(payout);
      brief._payNote = 'upi';
      return true;
    }
    // big invoice: ~80% auto-land straight in the account, only ~20% chase.
    if(Math.random() < 0.8){
      G.economy.earn(payout);
      brief._payNote = 'auto';
      return true;
    }
    brief._payNote = 'pending';
    return false; // becomes a receivable; caller pushes it
  };

  // ===================================================================
  // 2) NON-BLOCKING VERDICT — no slot machine, WhatsApp + notification
  // ===================================================================
  G.verdict.judge = function(brief, staffer){
    ensureDOM();
    var comp = this.computeOdds(brief, staffer);
    var outcome = this.roll(comp.odds);
    var payout = 0;
    if(outcome === 'approve') payout = Math.max(0, brief.fee - Math.round(brief.ticked));
    else if(outcome === 'viral') payout = brief.fee * G.BAL.VIRAL_FEE_MULT - Math.round(brief.ticked);

    // apply money/rep/chaos/sfx/receivable — sets brief._payNote via instantPay
    this.applyOutcome(brief, staffer, outcome, payout, comp.conflict);

    var meta = clientMeta(brief.clientId);
    var name = meta.name;
    var text;
    switch(outcome){
      case 'approve':
        text = '✅ Approved!' + (brief._payNote === 'pending'
          ? " Payment we'll process... soon."
          : ' Payment sent. ' + G.fmtMoney(payout));
        break;
      case 'small':
        text = '🟠 Loved it! Just one small change...';
        break;
      case 'scrapped':
        text = '🔴 ' + G.rage() + ' (rejected)';
        break;
      case 'viral':
        text = "🚀 This BLEW UP. We're taking full credit.";
        break;
      default:
        text = 'noted.';
    }

    // SILENT: messages just land in the client's WhatsApp thread + bump the
    // unread badge. No forced popup — if the player never opens WhatsApp the
    // game just keeps flowing. Payments are already in the account or the
    // collect/hold tab; we never shove a per-brief outcome in their face.
    pushMsg(brief.clientId, 'them', text);
    refreshBadge();
    if(isThreadOpen(clientKey(brief.clientId))) renderThread(clientKey(brief.clientId));
    else if(panelEl && panelEl.classList.contains('open') && openClientKey == null) renderList();
  };

  // ===================================================================
  // 3) COLLECT button opens the WhatsApp panel instead of pausing modal
  // ===================================================================
  G.modals.showCollect = function(){ openPanel(); };

  // ===================================================================
  // 3b) NON-BLOCKING EVENTS — scope creep + office decisions arrive as
  // WhatsApp choice messages, not a freezing center modal. The game never
  // pauses; the decision waits in the thread until the player taps a reply.
  // ===================================================================
  var origShowEvent = G.modals.showEvent ? G.modals.showEvent.bind(G.modals) : null;

  // Resolve which WhatsApp thread an event belongs to from its kicker.
  //   scope creep kicker = "<ClientName> · re: <brief>"  -> that client's thread
  //   office event kicker = "OFFICE" / "MEANWHILE..."     -> the Office/Team thread
  //   burnout kicker      = "<name> · burnout NN%"        -> Office/Team thread
  function threadIdForEvent(spec){
    var kicker = String(spec && spec.kicker || '');
    // office + burnout + anything non-client routes to the team thread
    if(/^OFFICE\b/i.test(kicker) || /burnout/i.test(kicker) || !kicker){
      return OFFICE_ID;
    }
    // scope creep: name sits before the " · " separator. Match it to a client.
    var name = kicker.split(' · ')[0].trim();
    if(name && G.data && G.data.clients){
      for(var i = 0; i < G.data.clients.length; i++){
        if(G.data.clients[i].name === name) return G.data.clients[i].id;
      }
    }
    // unknown source: drop it in the Office/Team thread rather than guessing.
    return OFFICE_ID;
  }

  G.modals.showEvent = function(spec){
    try{
      ensureDOM();
      if(!spec || !spec.options || !spec.options.length){
        // nothing tappable — fall back to the original modal so we never lose it
        if(origShowEvent) return origShowEvent(spec);
        return;
      }
      var id = threadIdForEvent(spec);
      var meta = clientMeta(id);
      // compose the chat text: title acts as a lead-in, then the ask
      var lead = spec.title ? (spec.title + ': ') : '';
      var body = lead + (spec.text || '');

      // preserve original onPick callbacks EXACTLY so all gameplay effects fire
      var opts = spec.options.map(function(o){
        return { label: o.label, onPick: o.onPick };
      });

      var res = pushChoice(id, body, opts);
      pulseLauncher();
      refreshBadge();

      // Ignoring a decision is NOT free: if you don't reply within the window,
      // the client reads it as a NO and the last option (the decline/refuse
      // path) auto-fires, so its authored consequence still lands. A retainer
      // "NOT NOW" is harmless; a scope-creep refuse applies its relationship/
      // chaos cost. This closes the "ignore everything for free" exploit.
      var IGNORE_SECS = 22;
      res.msg._expireTimer = setTimeout(function(){
        if(res.msg.answered) return;
        res.msg.answered = true;
        res.msg.pickedLabel = '(no reply)';
        res.msg._expireTimer = null;
        var last = opts[opts.length - 1];
        try{ if(last && last.onPick) last.onPick(); }catch(e){ try{ console.error('[trial] auto-decline failed', e); }catch(_){} }
        res.thread.msgs.push({ from: 'me', text: '(no reply)', t: Date.now() });
        try{ if(G.dock && G.dock.refreshCollect) G.dock.refreshCollect(); }catch(e){}
        if(isThreadOpen(clientKey(id))) renderThread(clientKey(id));
        refreshBadge();
      }, IGNORE_SECS * 1000);

      // if the relevant view is already open, paint it live
      if(isThreadOpen(clientKey(id))) renderThread(clientKey(id));
      else if(panelEl && panelEl.classList.contains('open') && openClientKey == null) renderList();
    }catch(e){
      try{ console.error('[trial] showEvent route failed, using original modal', e); }catch(_){}
      if(origShowEvent){ try{ return origShowEvent(spec); }catch(_2){} }
    }
  };

  // ===================================================================
  // 4) MODAL DISMISS — Esc + backdrop click (trial-only)
  // The committed modals only close via an in-modal button. Add Esc and a
  // click on the #modal-root backdrop. We close by clicking the topmost
  // modal's last .px-btn (its primary action). The 6PM call (.call-shake)
  // is intentionally hard to dismiss, so we never auto-close that one.
  // ===================================================================
  function topModal(root){
    // visible modals = display !== none; the topmost is the last such child
    var kids = root.children, top = null;
    for(var i = 0; i < kids.length; i++){
      var el = kids[i];
      if(!el.classList || !el.classList.contains('modal')) continue;
      if(el.style.display === 'none') continue;
      top = el; // later children sit on top
    }
    return top;
  }
  function dismissTopModal(){
    var root = document.getElementById('modal-root');
    if(!root || root.classList.contains('hidden')) return false;
    var m = topModal(root);
    if(!m) return false;
    // never auto-dismiss the 6PM call: it must be held / hung up deliberately
    if(m.classList.contains('call-shake')) return false;
    var btns = m.querySelectorAll('.modal-btns .px-btn');
    if(btns.length){
      // last button is the primary/confirm action in these modals
      btns[btns.length - 1].click();
      return true;
    }
    // no buttons to click (shouldn't happen for standard modals): hide root
    root.classList.add('hidden');
    return true;
  }

  // Registered on window in the CAPTURE phase so we run BEFORE main.js's
  // bubble-phase Escape listener (which would otherwise open the pause menu the
  // instant we close a modal). When we actually handle the key, we stop it from
  // reaching that listener; otherwise we let Esc fall through to open pause.
  window.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' && e.key !== 'Esc') return;
    // if the WhatsApp panel is open, Esc just closes that first
    if(panelEl && panelEl.classList.contains('open')){
      closePanel();
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if(dismissTopModal()){
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('click', function(e){
    // only a click on the backdrop itself (not on a modal or its children)
    if(e.target && e.target.id === 'modal-root') dismissTopModal();
  });

  // ===================================================================
  // 5) WhatsApp launcher present from game start (was built lazily)
  // ===================================================================
  try{ ensureDOM(); refreshBadge(); }catch(e){}

  console.log('[trial] WhatsApp client messaging active — 80/20 pay, non-blocking verdicts, panel #wa-panel / notes #wa-notes / launcher #wa-launcher');
})();
