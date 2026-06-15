/* arcade Breakout minigame — self-contained overlay. Attaches window.CravacheArcade.
   It owns its own DOM (backdrop + panel + canvas), runs its own rAF loop, and
   cleans everything up on close. Does NOT touch #modal-root or G.modals. */
(function(){
  'use strict';
  window.G = window.G || {};

  var W = 480, H = 360;            // logical canvas (matches CSS pixel size, no scaling needed)
  var instance = null;             // current open game (only one at a time)

  function audio(){ return (window.G && window.G.audio) ? window.G.audio : null; }

  function Game(){
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.raf = 0;
    this.last = 0;
    this.alive = true;

    // ---- game state ----
    this.lives = 3;
    this.score = 0;
    this.over = false;     // false | 'win' | 'lose'
    this.launched = false; // ball stuck to paddle until first move/click

    this.paddle = { w: 78, h: 12, x: (W - 78) / 2, y: H - 30 };
    this.ball = { x: W / 2, y: H - 42, r: 5, vx: 0, vy: 0, speed: 240 };

    this.bricks = [];
    this.keys = { left: false, right: false };

    // bound handlers (so we can removeEventListener on close)
    this._onMove = this._onMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onClick = this._onClick.bind(this);
    this._tick = this._tick.bind(this);
  }

  Game.prototype.buildBricks = function(){
    this.bricks = [];
    var cols = 9, rows = 5;
    var pad = 6, top = 46, side = 18;
    var bw = (W - side * 2 - pad * (cols - 1)) / cols;
    var bh = 16;
    var colors = ['#ff5c5c', '#ff9a56', '#ffe066', '#7ee08a', '#9fe8ff'];
    for(var r = 0; r < rows; r++){
      for(var c = 0; c < cols; c++){
        this.bricks.push({
          x: side + c * (bw + pad),
          y: top + r * (bh + pad),
          w: bw, h: bh,
          alive: true,
          color: colors[r % colors.length],
          pts: (rows - r) * 10
        });
      }
    }
  };

  Game.prototype.resetBall = function(){
    this.launched = false;
    this.ball.x = this.paddle.x + this.paddle.w / 2;
    this.ball.y = this.paddle.y - this.ball.r - 1;
    this.ball.vx = 0;
    this.ball.vy = 0;
  };

  Game.prototype.launch = function(){
    if(this.launched || this.over) return;
    this.launched = true;
    var ang = (-Math.PI / 2) + (Math.random() * 0.6 - 0.3); // mostly up, slight angle
    this.ball.vx = Math.cos(ang) * this.ball.speed;
    this.ball.vy = Math.sin(ang) * this.ball.speed;
  };

  Game.prototype.open = function(){
    var self = this;

    var root = document.createElement('div');
    root.className = 'arcade-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Breakout arcade');

    var backdrop = document.createElement('div');
    backdrop.className = 'arcade-backdrop';
    // clicking the dim backdrop (outside the panel) closes the game
    backdrop.addEventListener('click', function(){ self.close(); });

    var panel = document.createElement('div');
    panel.className = 'arcade-panel px-frame';

    var head = document.createElement('div');
    head.className = 'arcade-head';
    head.innerHTML =
      '<span class="arcade-title">BRICK BUSTER</span>' +
      '<span class="arcade-hud"><span class="arcade-score">SCORE 0</span>' +
      '<span class="arcade-lives">LIVES 3</span></span>';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'arcade-close px-btn px-btn-red';
    closeBtn.type = 'button';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', function(){ self.close(); });
    head.appendChild(closeBtn);

    var canvas = document.createElement('canvas');
    canvas.className = 'arcade-canvas';
    canvas.width = W; canvas.height = H;

    var hint = document.createElement('div');
    hint.className = 'arcade-hint';
    hint.textContent = 'MOVE: mouse / ← →   ·   LAUNCH: click / space   ·   QUIT: Esc';

    panel.appendChild(head);
    panel.appendChild(canvas);
    panel.appendChild(hint);
    root.appendChild(backdrop);
    root.appendChild(panel);
    document.body.appendChild(root);

    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.scoreEl = head.querySelector('.arcade-score');
    this.livesEl = head.querySelector('.arcade-lives');

    this.buildBricks();
    this.resetBall();

    // listeners (canvas-scoped move/click; document-scoped keys)
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('click', this._onClick);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    var a = audio(); if(a && a.unlock) a.unlock();

    this.last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.raf = requestAnimationFrame(this._tick);
  };

  Game.prototype._onMove = function(e){
    if(!this.canvas) return;
    var rect = this.canvas.getBoundingClientRect();
    // map client x -> logical canvas x (CSS size may differ from buffer size)
    var sx = this.canvas.width / rect.width;
    var lx = (e.clientX - rect.left) * sx;
    this.paddle.x = Math.max(0, Math.min(W - this.paddle.w, lx - this.paddle.w / 2));
    if(!this.launched){ this.ball.x = this.paddle.x + this.paddle.w / 2; }
  };

  Game.prototype._onClick = function(){
    if(this.over){ this.restart(); return; }
    this.launch();
  };

  Game.prototype._onKeyDown = function(e){
    if(e.key === 'Escape'){ e.preventDefault(); this.close(); return; }
    if(e.key === 'ArrowLeft'){ this.keys.left = true; e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ this.keys.right = true; e.preventDefault(); }
    else if(e.key === ' ' || e.key === 'Spacebar'){
      e.preventDefault();
      if(this.over) this.restart(); else this.launch();
    }
  };

  Game.prototype._onKeyUp = function(e){
    if(e.key === 'ArrowLeft') this.keys.left = false;
    else if(e.key === 'ArrowRight') this.keys.right = false;
  };

  Game.prototype.restart = function(){
    this.lives = 3;
    this.score = 0;
    this.over = false;
    this.buildBricks();
    this.resetBall();
    this.updateHud();
  };

  Game.prototype.updateHud = function(){
    if(this.scoreEl) this.scoreEl.textContent = 'SCORE ' + this.score;
    if(this.livesEl) this.livesEl.textContent = 'LIVES ' + this.lives;
  };

  Game.prototype._tick = function(now){
    if(!this.alive) return;
    var dt = (now - this.last) / 1000;
    if(dt > 0.05) dt = 0.05; // clamp big gaps (tab switch)
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this._tick);
  };

  Game.prototype.update = function(dt){
    if(this.over) return;
    var p = this.paddle, b = this.ball;

    // keyboard paddle movement
    var kspeed = 360;
    if(this.keys.left) p.x -= kspeed * dt;
    if(this.keys.right) p.x += kspeed * dt;
    p.x = Math.max(0, Math.min(W - p.w, p.x));

    if(!this.launched){
      b.x = p.x + p.w / 2;
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // walls
    if(b.x - b.r < 0){ b.x = b.r; b.vx = Math.abs(b.vx); this.blip(); }
    if(b.x + b.r > W){ b.x = W - b.r; b.vx = -Math.abs(b.vx); this.blip(); }
    if(b.y - b.r < 0){ b.y = b.r; b.vy = Math.abs(b.vy); this.blip(); }

    // paddle
    if(b.vy > 0 && b.y + b.r >= p.y && b.y + b.r <= p.y + p.h + 8 &&
       b.x >= p.x - b.r && b.x <= p.x + p.w + b.r){
      b.y = p.y - b.r;
      var hit = (b.x - (p.x + p.w / 2)) / (p.w / 2); // -1..1
      hit = Math.max(-1, Math.min(1, hit));
      var ang = (-Math.PI / 2) + hit * (Math.PI / 3); // steer with paddle
      var sp = b.speed;
      b.vx = Math.cos(ang) * sp;
      b.vy = Math.sin(ang) * sp;
      this.blip();
    }

    // bricks — resolve at most one collision this frame
    for(var i = 0; i < this.bricks.length; i++){
      var br = this.bricks[i];
      if(!br.alive) continue;
      if(b.x + b.r > br.x && b.x - b.r < br.x + br.w &&
         b.y + b.r > br.y && b.y - b.r < br.y + br.h){
        br.alive = false;
        this.score += br.pts;
        // bounce: pick axis by smaller overlap
        var ox = Math.min(b.x + b.r - br.x, br.x + br.w - (b.x - b.r));
        var oy = Math.min(b.y + b.r - br.y, br.y + br.h - (b.y - b.r));
        if(ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
        var a = audio(); if(a && a.drop) a.drop();
        this.updateHud();
        break; // one brick per frame keeps it clean
      }
    }

    // win ONLY when every brick is cleared. (Count a full pass — the old code
    // broke out of the loop early and miscounted, declaring a win after the
    // first brick, which is why the game ended midway.)
    var remaining = 0;
    for(var k = 0; k < this.bricks.length; k++){ if(this.bricks[k].alive) remaining++; }
    if(remaining === 0){
      this.over = 'win';
      var aw = audio(); if(aw && aw.win) aw.win();
      return;
    }

    // ball lost
    if(b.y - b.r > H){
      this.lives--;
      this.updateHud();
      var al = audio(); if(al && al.decline) al.decline();
      if(this.lives <= 0){
        this.over = 'lose';
        var ag = audio(); if(ag && ag.gameOver) ag.gameOver();
      } else {
        this.resetBall();
      }
    }
  };

  Game.prototype.blip = function(){
    var a = audio(); if(a && a.click) a.click();
  };

  Game.prototype.render = function(){
    var ctx = this.ctx; if(!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // background (navy void to match the office)
    ctx.fillStyle = '#0d1426'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16203a'; ctx.fillRect(0, 0, W, 6);

    // bricks
    for(var i = 0; i < this.bricks.length; i++){
      var br = this.bricks[i];
      if(!br.alive) continue;
      ctx.fillStyle = '#05070f';
      ctx.fillRect(br.x - 1, br.y - 1, br.w + 2, br.h + 2);
      ctx.fillStyle = br.color;
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(br.x, br.y, br.w, 3);
    }

    // paddle (brass)
    var p = this.paddle;
    ctx.fillStyle = '#05070f'; ctx.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
    ctx.fillStyle = '#ffe066'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(p.x, p.y, p.w, 3);

    // ball
    var b = this.ball;
    ctx.fillStyle = '#9fe8ff';
    ctx.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);

    if(!this.launched && !this.over){
      this.text(ctx, 'CLICK / SPACE TO LAUNCH', W / 2, H - 56, 11, '#9fe8ff');
    }

    if(this.over){
      ctx.fillStyle = 'rgba(5,7,15,0.78)';
      ctx.fillRect(0, 0, W, H);
      var msg = this.over === 'win' ? 'YOU CLEARED IT!' : 'GAME OVER';
      var col = this.over === 'win' ? '#7ee08a' : '#ff5c5c';
      this.text(ctx, msg, W / 2, H / 2 - 18, 22, col);
      this.text(ctx, 'SCORE ' + this.score, W / 2, H / 2 + 10, 14, '#f4e8cf');
      this.text(ctx, 'CLICK / SPACE TO PLAY AGAIN  ·  ESC TO QUIT', W / 2, H / 2 + 36, 10, '#9fe8ff');
    }
  };

  Game.prototype.text = function(ctx, str, x, y, size, color){
    ctx.fillStyle = color;
    ctx.font = size + "px 'Silkscreen', 'VT323', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  };

  Game.prototype.close = function(){
    if(!this.alive) return;
    this.alive = false;
    if(this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if(this.canvas){
      this.canvas.removeEventListener('mousemove', this._onMove);
      this.canvas.removeEventListener('click', this._onClick);
    }
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    if(this.root && this.root.parentNode){ this.root.parentNode.removeChild(this.root); }
    this.root = this.canvas = this.ctx = null;
    if(instance === this) instance = null;
  };

  window.CravacheArcade = {
    open: function(){
      // only one at a time; re-open is a no-op if already open
      if(instance && instance.alive) return;
      if(typeof document === 'undefined') return;
      instance = new Game();
      instance.open();
      var a = audio(); if(a && a.accept) a.accept();
    },
    close: function(){ if(instance) instance.close(); },
    isOpen: function(){ return !!(instance && instance.alive); }
  };
})();
