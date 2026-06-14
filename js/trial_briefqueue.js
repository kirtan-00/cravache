/* CravAche — read a brief offer without it getting bumped.
   --------------------------------------------------------------------------
   reflowToasts() (dock.js) keeps only the newest TOAST_CAP offer cards visible;
   older ones collapse into a "+N more" chip. So a new OFFER arriving while you
   read one shoved the card you were on past the cap and hid it ("skip"), even
   though hovering had paused its countdown.

   Fix: while you are READING an offer (hovering one), HOLD new brief OFFERS in a
   queue and release them when you un-hover or SIGN / PASS the current one.
   Regular notifications (payments, leads, calls) are NOT held anymore — they
   still come through, so the game never feels frozen while you read.

   Safe by construction: the brief scheduler self-limits (activeCount +
   pendingToasts < cap) and a held offer keeps pendingToasts high, so the queue
   can't grow past the cap; held offers keep their callback so pendingToasts
   stays balanced when they resolve.
   -------------------------------------------------------------------------- */
(function(){
  if(!window.G || !G.dock) return;
  var toastsEl = document.getElementById('toasts');
  if(!toastsEl || typeof G.dock.showBriefToast !== 'function') return;

  var origBrief = G.dock.showBriefToast.bind(G.dock);
  var queue = [];
  var overBrief = false;

  function attachHover(el){
    if(!el) return;
    el.addEventListener('pointerenter', function(){ overBrief = true; });
    el.addEventListener('pointerleave', function(){ overBrief = false; });
  }

  G.dock.showBriefToast = function(def, cb){
    if(overBrief){ queue.push({ def: def, cb: cb }); return; }
    origBrief(def, cb);
    attachHover(toastsEl.lastElementChild);
  };

  function drain(){
    // self-heal: if no offer card is on screen, nothing is being read
    if(!toastsEl.querySelector('.brief-toast')) overBrief = false;
    if(queue.length && !overBrief){
      var item = queue.shift();
      origBrief(item.def, item.cb);
      attachHover(toastsEl.lastElementChild);
    }
    requestAnimationFrame(drain);
  }
  requestAnimationFrame(drain);
})();
