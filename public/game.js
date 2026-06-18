'use strict';

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function hideScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
}

function createBreakoutGame(canvas) {
  // ── Canvas & layout ──────────────────────────────────────────────────────
  const GAME_W   = 700;
  const GAME_H   = 600;
  const PANEL_W  = 200;

  canvas.width  = GAME_W + PANEL_W;
  canvas.height = GAME_H;
  const ctx = canvas.getContext('2d');

  // ── Gameplay constants ───────────────────────────────────────────────────
  const PADDLE_H        = 14;
  const PADDLE_Y        = GAME_H - 60;
  const BALL_R          = 8;
  const BRICK_COLS      = 8;
  const BRICK_PAD       = 6;
  const BRICK_TOP       = 80;
  const BRICK_H         = 22;
  const BRICK_W         = (GAME_W - BRICK_PAD * (BRICK_COLS + 1)) / BRICK_COLS;
  const BRICK_ROWS_BASE = 5;
  const SPEED_BASE      = 5;
  const SPEED_INC       = 0.35;
  const MAX_LIVES       = 3;
  const LS_KEY          = 'breakout_highscores';
  const ALLOWED_URL_RE  = /^\/uploads\/bg_[0-9a-f]{32}\.[a-z0-9]+$/;

  // ── Brick colour palette (gradient pairs) ────────────────────────────────
  const BRICK_COLORS = [
    ['#ff2d78', '#bf00ff'],
    ['#ff6a00', '#ee0979'],
    ['#00f7ff', '#0050ff'],
    ['#7fff00', '#00ff88'],
    ['#ffdd00', '#ff6a00'],
    ['#ff00cc', '#333399'],
    ['#00ffcc', '#00a0ff'],
    ['#ff4444', '#ffaa00'],
    ['#aa44ff', '#ff44aa'],
    ['#44ffdd', '#44aaff'],
  ];

  // ── Mutable state ────────────────────────────────────────────────────────
  let gameState  = 'start';
  let score      = 0;
  let lives      = MAX_LIVES;
  let level      = 1;
  let bricks     = [];
  let particles  = [];
  let bgImageObj = null;
  let animId     = null;
  let keyLeft    = false;
  let keyRight   = false;
  let lastTime   = 0;

  const paddle = { x: GAME_W / 2 - 50, w: 100, speed: 480 };
  const ball   = { x: 0, y: 0, vx: 0, vy: 0, attached: true };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const _rndBuf = new Uint32Array(1);
  function rnd() {
    globalThis.crypto.getRandomValues(_rndBuf);
    return _rndBuf[0] / 0x100000000;
  }

  function ballSpeed()  { return SPEED_BASE + (level - 1) * SPEED_INC; }
  function resetPaddle() { paddle.x = GAME_W / 2 - paddle.w / 2; }
  function resetBall() {
    ball.x        = paddle.x + paddle.w / 2;
    ball.y        = PADDLE_Y - BALL_R - 1;
    ball.vx       = 0;
    ball.vy       = 0;
    ball.attached = true;
  }

  function launchBall() {
    const spd   = ballSpeed();
    const angle = (rnd() * 0.5 - 0.25) * Math.PI;
    ball.vx       = Math.sin(angle) * spd;
    ball.vy       = -Math.cos(angle) * spd;
    ball.attached = false;
  }

  // ── Bricks ───────────────────────────────────────────────────────────────
  function buildBricks() {
    bricks = [];
    const rows = Math.min(BRICK_ROWS_BASE + level - 1, 10);
    for (let r = 0; r < rows; r++) {
      const [c1, c2] = BRICK_COLORS[r % BRICK_COLORS.length];
      for (let c = 0; c < BRICK_COLS; c++) {
        bricks.push({
          x: BRICK_PAD + c * (BRICK_W + BRICK_PAD),
          y: BRICK_TOP + r * (BRICK_H + BRICK_PAD),
          w: BRICK_W,
          h: BRICK_H,
          alive: true,
          color1: c1,
          color2: c2,
        });
      }
    }
  }

  // ── Particles ────────────────────────────────────────────────────────────
  function spawnParticles(brick) {
    const count = 6 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) {
      const angle = rnd() * Math.PI * 2;
      const spd   = 1.5 + rnd() * 3;
      particles.push({
        x:       brick.x + brick.w / 2,
        y:       brick.y + brick.h / 2,
        vx:      Math.cos(angle) * spd,
        vy:      Math.sin(angle) * spd,
        life:    20,
        maxLife: 20,
        size:    2 + rnd() * 3,
        color:   brick.color1,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.12;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Drawing helpers ──────────────────────────────────────────────────────
  function withGlow(color, blur, fn) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = blur;
    fn();
    ctx.restore();
  }

  // ── Draw: background ─────────────────────────────────────────────────────
  function drawBackground() {
    if (bgImageObj) {
      ctx.drawImage(bgImageObj, 0, 0, GAME_W, GAME_H);
      ctx.fillStyle = 'rgba(5,5,20,0.55)';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
      grad.addColorStop(0, '#070718');
      grad.addColorStop(1, '#020208');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(0,200,255,0.04)';
    ctx.lineWidth   = 1;
    const gs = 50;
    for (let x = gs; x < GAME_W; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_H); ctx.stroke();
    }
    for (let y = gs; y < GAME_H; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_W, y); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Draw: paddle ─────────────────────────────────────────────────────────
  function drawPaddle() {
    const grad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    grad.addColorStop(0, '#00f7ff');
    grad.addColorStop(1, '#0050ff');
    withGlow('#00f7ff', 18, () => {
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(paddle.x, PADDLE_Y, paddle.w, PADDLE_H, 7);
      ctx.fill();
    });
  }

  // ── Draw: ball ───────────────────────────────────────────────────────────
  function drawBall() {
    withGlow('#00f7ff', 20, () => {
      const grad = ctx.createRadialGradient(
        ball.x - 2, ball.y - 2, 1,
        ball.x,     ball.y,     BALL_R
      );
      grad.addColorStop(0,   '#ffffff');
      grad.addColorStop(0.4, '#aaffff');
      grad.addColorStop(1,   '#0088ff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Draw: bricks ─────────────────────────────────────────────────────────
  function drawBricks() {
    for (const brick of bricks) {
      if (!brick.alive) continue;
      const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.w, brick.y + brick.h);
      grad.addColorStop(0, brick.color1);
      grad.addColorStop(1, brick.color2);

      withGlow(brick.color1, 12, () => {
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4);
        ctx.fill();
      });

      ctx.save();
      ctx.globalAlpha   = 0.35;
      ctx.strokeStyle   = '#ffffff';
      ctx.lineWidth     = 1;
      ctx.beginPath();
      ctx.moveTo(brick.x + 5, brick.y + 2);
      ctx.lineTo(brick.x + brick.w - 5, brick.y + 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Draw: particles ──────────────────────────────────────────────────────
  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Draw: HUD ────────────────────────────────────────────────────────────
  function drawHUD() {
    ctx.save();
    ctx.font      = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f7ff';
    ctx.fillText(`SCORE: ${score}`, 10, 22);

    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#bf00ff';
    ctx.shadowColor = '#bf00ff';
    ctx.shadowBlur  = 6;
    ctx.fillText(`LEVEL ${level}`, GAME_W / 2, 22);
    ctx.shadowBlur  = 0;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff2d78';
    const hearts  = '♥'.repeat(lives) + '♡'.repeat(MAX_LIVES - lives);
    ctx.fillText(hearts, GAME_W - 10, 22);
    ctx.restore();
  }

  // ── Draw: right panel ────────────────────────────────────────────────────
  function drawPanel() {
    const px = GAME_W;
    const pw = PANEL_W;

    const bg = ctx.createLinearGradient(px, 0, px + pw, GAME_H);
    bg.addColorStop(0, '#060614');
    bg.addColorStop(1, '#03030c');
    ctx.fillStyle = bg;
    ctx.fillRect(px, 0, pw, GAME_H);

    ctx.save();
    ctx.strokeStyle = 'rgba(0,200,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, GAME_H);
    ctx.stroke();

    ctx.font        = 'bold 11px "Courier New", monospace';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#bf00ff';
    ctx.shadowColor = '#bf00ff';
    ctx.shadowBlur  = 8;
    ctx.fillText('HIGH SCORES', px + pw / 2, 30);
    ctx.shadowBlur  = 0;

    ctx.strokeStyle = 'rgba(191,0,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(px + 14, 38);
    ctx.lineTo(px + pw - 14, 38);
    ctx.stroke();

    const scores = loadHighScores();
    ctx.font = '10px "Courier New", monospace';

    for (let i = 0; i < scores.length; i++) {
      const entry = scores[i];
      const y     = 58 + i * 48;
      const isTop = i === 0;

      ctx.globalAlpha = Math.max(0.35, 1 - i * 0.08);
      ctx.fillStyle   = isTop ? '#ffdd00' : '#a0a0cc';
      ctx.shadowColor = isTop ? '#ffdd00' : 'transparent';
      ctx.shadowBlur  = isTop ? 6 : 0;

      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${entry.name}`, px + 12, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(entry.score), px + pw - 12, y);

      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(150,150,200,0.5)';
      ctx.globalAlpha = 0.6;
      ctx.textAlign   = 'left';
      ctx.fillText(`LVL ${entry.level}`, px + 12, y + 14);
    }
    ctx.restore();
  }

  // ── Collision detection ───────────────────────────────────────────────────
  function circleHitsRect(bx, by, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(bx, rx + rw));
    const nearY = Math.max(ry, Math.min(by, ry + rh));
    const dx = bx - nearX;
    const dy = by - nearY;
    return dx * dx + dy * dy < BALL_R * BALL_R;
  }

  function resolveBrickSide(brick) {
    const overlapX = brick.w / 2 + BALL_R - Math.abs(ball.x - (brick.x + brick.w / 2));
    const overlapY = brick.h / 2 + BALL_R - Math.abs(ball.y - (brick.y + brick.h / 2));
    if (overlapX < overlapY) {
      ball.vx = -ball.vx;
    } else {
      ball.vy = -ball.vy;
    }
  }

  function checkBrickCollisions() {
    let alive = 0;
    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (circleHitsRect(ball.x, ball.y, brick.x, brick.y, brick.w, brick.h)) {
        brick.alive = false;
        resolveBrickSide(brick);
        score += 10 * level;
        spawnParticles(brick);
      } else {
        alive++;
      }
    }
    return alive;
  }

  // ── Physics update ────────────────────────────────────────────────────────
  function updatePhysics(dt) {
    if (ball.attached) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = PADDLE_Y - BALL_R - 1;
      return;
    }

    ball.x += ball.vx * dt * 60;
    ball.y += ball.vy * dt * 60;

    if (ball.x - BALL_R < 0)       { ball.x = BALL_R;          ball.vx =  Math.abs(ball.vx); }
    if (ball.x + BALL_R > GAME_W)  { ball.x = GAME_W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BALL_R < 0)       { ball.y = BALL_R;           ball.vy =  Math.abs(ball.vy); }

    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 6 &&
      ball.x >= paddle.x - BALL_R &&
      ball.x <= paddle.x + paddle.w + BALL_R
    ) {
      const hit   = (ball.x - paddle.x) / paddle.w;
      const angle = (hit - 0.5) * (Math.PI * 0.65);
      const spd   = ballSpeed();
      ball.vx = Math.sin(angle) * spd;
      ball.vy = -Math.cos(angle) * spd;
      ball.y  = PADDLE_Y - BALL_R - 1;
    }

    if (ball.y - BALL_R > GAME_H) {
      lives--;
      if (lives <= 0) {
        endGame();
        return;
      }
      resetPaddle();
      resetBall();
    }

    const remaining = checkBrickCollisions();
    if (remaining === 0) nextLevel();
  }

  function updatePaddle(dt) {
    if (keyLeft)  paddle.x -= paddle.speed * dt;
    if (keyRight) paddle.x += paddle.speed * dt;
    paddle.x = Math.max(0, Math.min(GAME_W - paddle.w, paddle.x));
  }

  // ── Level / game-flow ─────────────────────────────────────────────────────
  function nextLevel() {
    level++;
    buildBricks();
    resetPaddle();
    resetBall();
  }

  function endGame() {
    gameState = 'gameover';
    cancelAnimationFrame(animId);
    animId = null;
    showScreen('screen-gameover');
    const el = document.getElementById('score-display');
    if (el) el.textContent = `SCORE: ${score}`;
  }

  function startGame() {
    gameState = 'playing';
    score     = 0;
    lives     = MAX_LIVES;
    level     = 1;
    particles = [];
    buildBricks();
    resetPaddle();
    resetBall();
    hideScreens();
    document.getElementById('pause-banner').style.display = 'none';
    lastTime = performance.now();
    animId   = requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (gameState === 'playing') {
      gameState = 'paused';
      cancelAnimationFrame(animId);
      animId = null;
      document.getElementById('pause-banner').style.display = 'block';
    } else if (gameState === 'paused') {
      gameState = 'playing';
      document.getElementById('pause-banner').style.display = 'none';
      lastTime = performance.now();
      animId   = requestAnimationFrame(loop);
    }
  }

  function abortToStart() {
    if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
    gameState = 'start';
    particles = [];
    document.getElementById('pause-banner').style.display = 'none';
    showScreen('screen-start');
    drawBackground();
    drawPanel();
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    updatePaddle(dt);
    updatePhysics(dt);
    updateParticles();

    drawBackground();
    drawBricks();
    drawParticles();
    drawPaddle();
    drawBall();
    drawHUD();
    drawPanel();

    animId = requestAnimationFrame(loop);
  }

  // ── High-score persistence ────────────────────────────────────────────────
  function loadHighScores() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(e =>
          e !== null &&
          typeof e === 'object' &&
          !Array.isArray(e) &&
          Object.hasOwn(e, 'name') &&
          typeof e.name  === 'string' &&
          typeof e.score === 'number' &&
          typeof e.level === 'number'
        )
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  function saveHighScore(name, sc, lv) {
    const sanitized = String(name).replaceAll(/[<>&"'`]/g, '').trim().slice(0, 12) || 'PLAYER';
    const scores    = loadHighScores();
    scores.push({ name: sanitized, score: sc, level: lv });
    scores.sort((a, b) => b.score - a.score);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(scores.slice(0, 10)));
    } catch {
      // localStorage unavailable — scores not persisted
    }
  }

  // ── Input handlers ────────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.code === 'ArrowLeft')  { keyLeft  = true; e.preventDefault(); return; }
    if (e.code === 'ArrowRight') { keyRight = true; e.preventDefault(); return; }

    if (e.code === 'Space') {
      e.preventDefault();
      if (gameState === 'start') {
        startGame();
      } else if (gameState === 'playing') {
        if (ball.attached) {
          launchBall();
        } else {
          pauseGame();
        }
      } else if (gameState === 'paused') {
        pauseGame();
      }
      return;
    }

    if (e.code === 'Escape' && (gameState === 'playing' || gameState === 'paused')) {
      abortToStart();
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'ArrowLeft')  keyLeft  = false;
    if (e.code === 'ArrowRight') keyRight = false;
  }

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);
    paddle.x   = mx - paddle.w / 2;
    paddle.x   = Math.max(0, Math.min(GAME_W - paddle.w, paddle.x));
  }

  function handleSave() {
    const input = document.getElementById('name-input');
    const name  = input ? input.value : '';
    saveHighScore(name, score, level);
    if (input) input.value = '';
    showScreen('screen-start');
    gameState = 'start';
    drawBackground();
    drawPanel();
  }

  function handleNameInputKey(e) {
    if (e.code === 'Enter') handleSave();
  }

  function handleFileUpload(e) {
    const file   = e.target.files?.[0];
    const status = document.getElementById('upload-status');
    if (!file) return;

    const form = new FormData();
    form.append('background', file);

    fetch('/api/upload-bg', { method: 'POST', body: form })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Upload failed'); });
        return r.json();
      })
      .then(data => {
        if (typeof data.url !== 'string' || !ALLOWED_URL_RE.test(data.url)) {
          throw new Error('Invalid image URL returned from server');
        }
        const img    = new Image();
        img.onload  = () => { bgImageObj = img; if (status) status.textContent = 'BG LOADED'; };
        img.onerror = () => { if (status) status.textContent = 'LOAD ERR'; };
        img.src = data.url;
      })
      .catch(err => {
        if (status) status.textContent = err.message ? err.message.slice(0, 20) : 'ERR';
      });
  }

  // ── Event listener wiring ─────────────────────────────────────────────────
  function setupEventListeners() {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', () => {
      if (gameState === 'playing' && ball.attached) launchBall();
    });
    canvas.addEventListener('mousemove', handleMouseMove);

    const btnStart  = document.getElementById('btn-start');
    if (btnStart)  btnStart.addEventListener('click', startGame);

    const btnSave   = document.getElementById('btn-save');
    if (btnSave)   btnSave.addEventListener('click', handleSave);

    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.addEventListener('keydown', handleNameInputKey);

    const uploadFile = document.getElementById('upload-file');
    if (uploadFile) uploadFile.addEventListener('change', handleFileUpload);
  }

  setupEventListeners();
  abortToStart();

  function destroy() {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
  }

  // ── Public API (also used by tests) ──────────────────────────────────────
  return {
    startGame, pauseGame, abortToStart, launchBall, destroy,
    buildBricks, resetBall, resetPaddle, ballSpeed, rnd,
    spawnParticles, updateParticles,
    circleHitsRect, resolveBrickSide, checkBrickCollisions,
    updatePhysics, updatePaddle, nextLevel, endGame,
    loadHighScores, saveHighScore,
    drawBackground, drawPaddle, drawBall, drawBricks,
    drawParticles, drawHUD, drawPanel, withGlow, loop,
    handleKeyDown, handleKeyUp, handleMouseMove,
    handleSave, handleNameInputKey, handleFileUpload,
    showScreen, hideScreens,
    // State accessors
    getGameState:  () => gameState,
    getBall:       () => ball,
    getPaddle:     () => paddle,
    getBricks:     () => bricks,
    getParticles:  () => particles,
    getLives:      () => lives,
    getScore:      () => score,
    getLevel:      () => level,
    getAnimId:     () => animId,
    // State mutators for test setup
    setGameState:    s   => { gameState  = s;   },
    setLives:        v   => { lives      = v;   },
    setScore:        v   => { score      = v;   },
    setLevel:        v   => { level      = v;   },
    setBgImage:      img => { bgImageObj = img; },
    setBallAttached: v   => { ball.attached = v; },
    setAnimId:       v   => { animId     = v;   },
    setKeyLeft:      v   => { keyLeft    = v;   },
    setKeyRight:     v   => { keyRight   = v;   },
    setLastTime:     v   => { lastTime   = v;   },
  };
}

// ── CommonJS export ───────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createBreakoutGame, showScreen, hideScreens };
}

// ── Browser auto-init ─────────────────────────────────────────────────────────
/* istanbul ignore next */
if (typeof module === 'undefined' && typeof document !== 'undefined') {
  const _canvas = document.getElementById('game-canvas');
  if (_canvas) createBreakoutGame(_canvas);
}
