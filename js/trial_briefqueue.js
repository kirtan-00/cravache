/* CravAche — nothing disturbs you while you read a brief offer.
   --------------------------------------------------------------------------
   While you are READING an offer (hovering one — dock.js marks that card with
   the `.reading` class), HOLD everything that would pop on screen: new brief
   offers, info toasts, AND the client phone call. They release the moment you
   stop hovering or SIGN / PASS the current offer. So the screen stays calm while
   you read, and nothing reflows the card you're on. Important client/office
   interrupts are also routed to WhatsApp (non-blocking), so holding here loses
   nothing critical.

   Hover is read from the game's OWN `.reading` class (robust no matter how many
   toasts exist or whether the "+N more" chip is present). Loads after
   trial_uxfixes.js, so it wraps that file's batched infoToast.

   Safe: the scheduler self-limits (activeCount + pendingToasts < cap) and a held
   offer keeps pendingToasts high, so the offer queue can't grow past the cap;
   held offers keep their callback so pendingToasts stays balanced. Info toasts
   are transient, so the held info queue is capped. The call is only DEFERRED a
   moment (until you stop reading), not dropped.
   -------------------------------------------------------------------------- */
(function(){
  if(!window.G || !G.dock) return;
  var toastsEl = document.getElementById('toasts');
  if(!toastsEl || typeof G.dock.showBriefToast !== 'function') return;

  var origBrief = G.dock.showBriefToast.bind(G.dock);
  var origInfo  = (typeof G.dock.infoToast === 'function') ? G.dock.infoToast.bind(G.dock) : null;
  var briefQ = [];
  var infoQ  = [];
  var INFO_CAP = 6;

  // dock.js toggles `.reading` on the brief offer card currently hovered
  function isReading(){ return !!toastsEl.querySelector('.brief-toast.reading'); }

  G.dock.showBriefToast = function(def, cb){
    if(isReading()){ briefQ.push({ def: def, cb: cb }); return; }
    origBrief(def, cb);
  };

  if(origInfo){
    G.dock.infoToast = function(head, body, cls){
      if(isReading()){
        infoQ.push([head, body, cls]);
        while(infoQ.length > INFO_CAP) infoQ.shift();
        return;
      }
      origInfo(head, body, cls);
    };
  }

  // hold the client phone call too: defer the modal until the player stops
  // reading the brief (the call is queued, never lost)
  if(G.modals && typeof G.modals.showCall === 'function'){
    var origCall = G.modals.showCall.bind(G.modals);
    G.modals.showCall = function(call){
      if(isReading()){
        var waitThenShow = function(){
          if(isReading()) return requestAnimationFrame(waitThenShow);
          origCall(call);
        };
        requestAnimationFrame(waitThenShow);
        return;
      }
      origCall(call);
    };
  }

  function drain(){
    if(!isReading()){
      if(briefQ.length){ var b = briefQ.shift(); origBrief(b.def, b.cb); }
      else if(origInfo && infoQ.length){ var it = infoQ.shift(); origInfo(it[0], it[1], it[2]); }
    }
    requestAnimationFrame(drain);
  }
  requestAnimationFrame(drain);
})();
