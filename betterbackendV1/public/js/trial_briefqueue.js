/* CravAche — brief OFFERS now live in a compact top-right STACK.
   --------------------------------------------------------------------------
   The old behaviour here held new offers, info toasts, and the client phone
   call while you HOVERED an offer card (dock.js used to mark the hovered card
   `.reading` and pause everyone's clock). That hover-pause model is gone: every
   incoming offer is now shown at once as its own card in the top-right stack,
   each with its own draining timer (see js/render/dock.js → showBriefToast /
   renderOffers). The stack caps itself at 3 visible cards and queues the rest
   behind a "+N more" pill, so there is nothing left for this file to hold back.

   We therefore no longer queue/hold brief offers here — they pass straight
   through to the stack. We keep the engine contract intact: dock.js's
   showBriefToast(def, cb) still drives G.briefs.accept / the decline penalty via
   cb, and briefs.js's pendingToasts counter stays balanced (the cb fires exactly
   once per offer, on SIGN / PASS / timeout).

   This file is now effectively a no-op kept in place so index.html's script tag
   still resolves; the small guard below documents intent and leaves room to
   reattach hold logic to the new stack later if ever wanted.
   -------------------------------------------------------------------------- */
(function(){
  if(!window.G || !G.dock) return;
  // No wrapping of showBriefToast / infoToast / showCall: the top-right stack in
  // dock.js owns offer presentation, capping, and timing now. Holding offers
  // here would queue cards that never drain (there is no longer a "reading"
  // hover state to release them), so we intentionally do nothing.
})();
