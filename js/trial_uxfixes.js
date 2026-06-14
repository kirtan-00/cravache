// CravAche TRIAL module: trial_uxfixes — runtime polish. Loaded only by trial.html.
// All work is done via ONE idempotent injected <style> + guarded monkey-patches.
// Touches nothing else; safe to load multiple times.
(function(){
  'use strict';
  if(!window.G) return;
  window.CRAVACHE_TRIAL = true;
  if(window.__CRAVACHE_UXFIXES__) return;   // idempotent guard
  window.__CRAVACHE_UXFIXES__ = true;

  // ---------------------------------------------------------------------------
  // (0) Inject one idempotent <style> covering fixes 1, 3, 4.
  // ---------------------------------------------------------------------------
  try {
    if(!document.getElementById('cravache-uxfixes-style')){
      var css = [
        /* (1) drop the redundant dock COLLECT button — the WhatsApp launcher + its */
        /*     unread/₹ badge already cover collection. */
        '#btn-collect{display:none !important;}',

        /* (3) HIRE modal: hide the personality/flavor joke line by default; reveal */
        /*     it only when the candidate card is hovered. Name/stars/role/salary/  */
        /*     advance stay visible (salary lives in its own .cv-salary span split   */
        /*     out by the showHire wrapper below). */
        '.shop-row .cv-flavor{display:none;}',
        '.shop-row:hover .cv-flavor{display:inline;}',
        /* graceful fallback for cards the wrapper could not split (e.g. art change):*/
        /* if a row has a flavor span it is hidden until hover regardless. */
        '.shop-row:hover{cursor:default;}',

        /* (4) light-touch text trims: keep the empty-tray hint + GROWTH panel copy  */
        /*     from overflowing. No layout changes — just clamp + ellipsis.          */
        '.dock-hint{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.modal .modal-fine{overflow-wrap:anywhere;word-break:break-word;}'
      ].join('\n');
      var style = document.createElement('style');
      style.id = 'cravache-uxfixes-style';
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  } catch(e){ /* never let CSS injection break the game */ }

  // ---------------------------------------------------------------------------
  // (2) BATCH HIRE TOASTS — coalesce a burst of "joined" info toasts into one.
  // ---------------------------------------------------------------------------
  try {
    if(G.dock && typeof G.dock.infoToast === 'function' && !G.dock.__uxHireBatch){
      var origInfoToast = G.dock.infoToast.bind(G.dock);
      G.dock.__uxHireBatch = true;

      var WINDOW_MS = 400;
      var batch = null;   // { count, names, cls, timer }

      function isHire(head, body){
        var h = String(head || '').toUpperCase();
        var b = String(body || '');
        return h.indexOf('NEW HIRE') !== -1 || /\bjoined\b/i.test(b) || /\bjoined\b/i.test(h);
      }

      function firstName(body){
        // "Maya Iyer joined. <trait>"  ->  "Maya"
        var m = String(body || '').match(/^([^.]+?)\s+joined/i);
        if(m) return m[1].trim().split(/\s+/)[0];
        return null;
      }

      function flushBatch(){
        if(!batch) return;
        var b = batch; batch = null;
        if(b.count <= 1){
          // single hire — pass through the original wording untouched
          origInfoToast(b.head, b.body, b.cls);
          return;
        }
        var head = b.count + ' JOINED';
        var named = b.names.filter(Boolean);
        var body;
        if(named.length === b.count && named.length <= 4){
          body = named.join(', ') + ' joined the chaos.';
        } else {
          body = b.count + ' joined the chaos. Payroll noticed.';
        }
        origInfoToast(head, body, b.cls || 'good');
      }

      G.dock.infoToast = function(head, body, cls){
        try {
          if(isHire(head, body)){
            if(!batch){
              batch = { count: 0, names: [], cls: cls, head: head, body: body, timer: null };
            }
            batch.count++;
            batch.names.push(firstName(body));
            if(batch.timer){ clearTimeout(batch.timer); }
            batch.timer = setTimeout(flushBatch, WINDOW_MS);
            return;
          }
        } catch(e){ /* fall through to original on any trouble */ }
        return origInfoToast(head, body, cls);
      };
    }
  } catch(e){ /* leave toasts as-is on failure */ }

  // ---------------------------------------------------------------------------
  // (3) HIRE MODAL — split the combined "trait · ₹salary/mo" line so the joke
  //     (flavor) can hide-until-hover while the salary stays always visible.
  //     CSS above does the hide/show; this wrapper just splits the node.
  // ---------------------------------------------------------------------------
  try {
    if(G.modals && typeof G.modals.showHire === 'function' && !G.modals.__uxHireSplit){
      var origShowHire = G.modals.showHire.bind(G.modals);
      G.modals.__uxHireSplit = true;

      function splitFlavorRows(){
        try {
          var rows = document.querySelectorAll('.modal .shop-row');
          for(var i = 0; i < rows.length; i++){
            var row = rows[i];
            if(row.getAttribute('data-ux-split')) continue;
            // the trait line is the LAST .sr-desc in the row ("<trait> · ₹x/mo").
            var descs = row.querySelectorAll('.sr-desc');
            if(!descs.length) continue;
            var traitEl = descs[descs.length - 1];
            var txt = traitEl.textContent || '';
            var sep = txt.lastIndexOf(' · ');
            if(sep === -1) continue;   // no salary suffix — leave untouched
            var flavor = txt.slice(0, sep);
            var salary = txt.slice(sep + 3);   // skip ' · '
            traitEl.textContent = '';
            var fl = document.createElement('span');
            fl.className = 'cv-flavor';
            fl.textContent = flavor + ' · ';
            var sal = document.createElement('span');
            sal.className = 'cv-salary';
            sal.textContent = salary;
            traitEl.appendChild(fl);
            traitEl.appendChild(sal);
            row.setAttribute('data-ux-split', '1');
          }
        } catch(e){ /* if DOM shape changed, skip silently */ }
      }

      G.modals.showHire = function(){
        var r = origShowHire.apply(this, arguments);
        // rows are built synchronously inside origShowHire; split right after.
        splitFlavorRows();
        // a microtask retry in case any row is appended async by another patch.
        if(typeof Promise !== 'undefined'){ Promise.resolve().then(splitFlavorRows); }
        return r;
      };
    }
  } catch(e){ /* leave the hire modal as-is on failure */ }
})();
