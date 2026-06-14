/* CravAche — read a brief offer without it getting bumped.
   --------------------------------------------------------------------------
   While you are READING an offer (hovering one), new brief OFFERS are HELD in a
   queue and released when you stop hovering or SIGN / PASS the current one, so a
   newly-arriving offer can't reflow the stack and shove the card you're reading
   past the "+N more" cap (the "skip"). Real notifications (payments/leads/calls)
   are NOT held.

   Hover is read from the game's OWN state: dock.js marks the offer card under the
   cursor with the `.reading` class every frame (it sets that from the toast's
   pointerenter/leave). Keying off that class is robust no matter how many toasts
   exist or whether the "+N more" chip is present — the previous version attached
   listeners to `lastElementChild`, which became the "+N more" chip once the stack
   overflowed, so hover was never detected and offers kept popping.

   Safe by construction: the scheduler self-limits (activeCount + pendingToasts <
   cap) and a held offer keeps pendingToasts high, so the queue can't grow past
   the cap; held offers keep their callback so pendingToasts stays balanced.
   -------------------------------------------------------------------------- */
(function(){
  if(!window.G || !G.dock) return;
  var toastsEl = document.getElementById('toasts');
  if(!toastsEl || typeof G.dock.showBriefToast !== 'function') return;

  var origBrief = G.dock.showBriefToast.bind(G.dock);
  var queue = [];

  // dock.js toggles `.reading` on the brief offer card currently hovered
  function isReading(){ return !!toastsEl.querySelector('.brief-toast.reading'); }

  G.dock.showBriefToast = function(def, cb){
    if(isReading()){ queue.push({ def: def, cb: cb }); return; }
    origBrief(def, cb);
  };

  function drain(){
    if(queue.length && !isReading()){
      var item = queue.shift();
      origBrief(item.def, item.cb);
    }
    requestAnimationFrame(drain);
  }
  requestAnimationFrame(drain);
})();
