/* CravAche — read a brief offer without it getting bumped.
   --------------------------------------------------------------------------
   reflowToasts() (dock.js) only keeps the NEWEST TOAST_CAP offer cards visible;
   older ones collapse into a "+N more" chip. So when a new notification arrived
   while you were reading an offer, it shoved the card you were on past the cap
   and it vanished ("skipped"), even though hovering had paused its countdown.

   Fix: while you are READING an offer (hovering one), HOLD new offers (and new
   info toasts) in a queue instead of showing them. Release them the moment you
   stop hovering, or when you SIGN / PASS the current offer.

   Safe by construction: the brief scheduler self-limits (activeCount +
   pendingToasts < cap, see briefs.js) and a held offer keeps pendingToasts
   high, so the offer queue can never grow past the cap. Held offers still carry
   their original callback, so pendingToasts stays balanced when they resolve.
   Loads AFTER trial_uxfixes.js so it wraps that file's batched infoToast.
   -------------------------------------------------------------------------- */
(function(){
  if(!window.G || !G.dock) return;
  var toastsEl = document.getElementById('toasts');
  if(!toastsEl || typeof G.dock.showBriefToast !== 'function') return;

  var origBrief = G.dock.showBriefToast.bind(G.dock);
  var origInfo  = (typeof G.dock.infoToast === 'function') ? G.dock.infoToast.bind(G.dock) : null;

  var briefQ = [];
  var infoQ  = [];
  var overBrief = false;
  var INFO_HOLD_CAP = 5; // info toasts are transient; drop the stalest if they pile up

  // track hover on each offer card directly (immediate, no DOM polling race)
  function attachHover(el){
    if(!el) return;
    el.addEventListener('pointerenter', function(){ overBrief = true; });
    el.addEventListener('pointerleave', function(){ overBrief = false; });
  }

  G.dock.showBriefToast = function(def, cb){
    if(overBrief){ briefQ.push({ def: def, cb: cb }); return; }
    origBrief(def, cb);
    attachHover(toastsEl.lastElementChild);
  };

  if(origInfo){
    G.dock.infoToast = function(head, body, cls){
      if(overBrief){
        infoQ.push([head, body, cls]);
        while(infoQ.length > INFO_HOLD_CAP) infoQ.shift();
        return;
      }
      origInfo(head, body, cls);
    };
  }

  function drain(){
    // self-heal: if no offer card is on screen, nothing is being read
    if(!toastsEl.querySelector('.brief-toast')) overBrief = false;
    if(!overBrief){
      if(briefQ.length){
        var b = briefQ.shift();
        origBrief(b.def, b.cb);
        attachHover(toastsEl.lastElementChild);
      } else if(origInfo && infoQ.length){
        var it = infoQ.shift();
        origInfo(it[0], it[1], it[2]);
      }
    }
    requestAnimationFrame(drain);
  }
  requestAnimationFrame(drain);
})();
