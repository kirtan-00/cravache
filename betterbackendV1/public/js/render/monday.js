// CravAche — MONDAY dread. Fires on every week transition (advanceToMonday),
// never on game start. A 4-second full-stage overlay: the letters slam in one
// by one, scanlines flicker, "again." fades. Sim freezes (modals pause lock),
// clicking does not skip. Pure DOM + CSS steps() animation.
(function(){
  'use strict';
  window.G = window.G || {};

  var el = null;
  var timer = null;
  var paused = false;

  G.monday = {
    // show the dread. duration is fixed at 4s; clicks do nothing.
    show: function(){
      if(el) this._teardown(); // never stack two

      var stage = document.getElementById('stage');
      var letters = 'MONDAY'.split('').map(function(ch, i){
        return '<span class="md-ch" style="animation-delay:' + (0.12 + i * 0.16) + 's">' + ch + '</span>';
      }).join('');

      el = document.createElement('div');
      el.id = 'monday-dread';
      el.innerHTML =
        '<div class="md-scan"></div>' +
        '<div class="md-word">' + letters + '</div>' +
        '<div class="md-sub">again.</div>' +
        '<div class="md-tag">the briefs woke up first</div>';
      stage.appendChild(el);

      // freeze the sim through the modals refcount
      if(G.modals && G.modals.acquirePause){ G.modals.acquirePause(); paused = true; }

      var self = this;
      timer = setTimeout(function(){ self._teardown(); }, 4000);
    },

    _teardown: function(){
      if(timer){ clearTimeout(timer); timer = null; }
      if(el){ el.remove(); el = null; }
      if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); paused = false; }
    }
  };
})();
