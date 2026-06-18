'use strict';

const { createBreakoutGame, showScreen, hideScreens } = require('../public/game');

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

function makeMockCtx() {
  return {
    fillRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(),
    save: jest.fn(), restore: jest.fn(),
    roundRect: jest.fn(), fillText: jest.fn(), drawImage: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    shadowColor: '', shadowBlur: 0, fillStyle: '', strokeStyle: '',
    lineWidth: 1, font: '', textAlign: 'left', globalAlpha: 1,
  };
}

function buildDOM() {
  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="screen-start" class="screen active"></div>
    <div id="screen-gameover" class="screen"><div id="score-display"></div></div>
    <button id="btn-start">S</button>
    <button id="btn-save">S</button>
    <label for="name-input">N</label>
    <input id="name-input" type="text">
    <label>U<input id="upload-file" type="file" aria-label="Upload background image"></label>
    <div id="upload-status"></div>
    <div id="pause-banner"></div>`;
}

describe('showScreen / hideScreens (module-level)', () => {
  beforeEach(() => { buildDOM(); });

  test('showScreen activates target and removes active from others', () => {
    document.getElementById('screen-start').classList.add('active');
    showScreen('screen-gameover');
    expect(document.getElementById('screen-gameover').classList.contains('active')).toBe(true);
    expect(document.getElementById('screen-start').classList.contains('active')).toBe(false);
  });

  test('showScreen with unknown id is safe', () => {
    expect(() => showScreen('nonexistent')).not.toThrow();
  });

  test('hideScreens removes active from all', () => {
    document.getElementById('screen-start').classList.add('active');
    hideScreens();
    expect(document.getElementById('screen-start').classList.contains('active')).toBe(false);
  });
});

describe('createBreakoutGame', () => {
  let game, mockCtx, canvasEl;

  beforeAll(() => {
    buildDOM();
    mockCtx = makeMockCtx();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);
    HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() =>
      ({ left: 0, top: 0, width: 900, height: 600 }));
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 42);
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: jest.fn(arr => { arr[0] = 0x80000000; return arr; }) },
      writable: true, configurable: true,
    });
    canvasEl = document.getElementById('game-canvas');
    game = createBreakoutGame(canvasEl);
  });

  afterAll(() => { game.destroy(); localStorage.clear(); });

  beforeEach(() => {
    game.setGameState('start'); game.setAnimId(null);
    game.setLives(3); game.setScore(0); game.setLevel(1);
    game.setKeyLeft(false); game.setKeyRight(false);
    game.setBgImage(null); game.setBallAttached(true);
    game.resetBall(); game.resetPaddle();
    game.buildBricks();
    localStorage.clear();
    ['fillRect','fill','arc','fillText','save','restore','drawImage',
     'createLinearGradient','createRadialGradient','roundRect'].forEach(m => mockCtx[m].mockClear());
  });

  // ── rnd ──────────────────────────────────────────────────────────────────
  test('rnd uses crypto and returns [0,1)', () => {
    const v = game.rnd();
    expect(globalThis.crypto.getRandomValues).toHaveBeenCalled();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  // ── ballSpeed ────────────────────────────────────────────────────────────
  test('ballSpeed increases with level', () => {
    game.setLevel(1); const s1 = game.ballSpeed();
    game.setLevel(5); expect(game.ballSpeed()).toBeGreaterThan(s1);
  });

  // ── resetPaddle / resetBall ──────────────────────────────────────────────
  test('resetPaddle centres paddle', () => {
    game.getPaddle().x = 0;
    game.resetPaddle();
    expect(game.getPaddle().x).toBeCloseTo(300);
  });

  test('resetBall attaches ball above paddle centre', () => {
    game.resetBall();
    expect(game.getBall().attached).toBe(true);
    expect(game.getBall().x).toBeCloseTo(game.getPaddle().x + 50);
  });

  // ── launchBall ───────────────────────────────────────────────────────────
  test('launchBall detaches ball with upward velocity', () => {
    game.resetBall(); game.launchBall();
    expect(game.getBall().attached).toBe(false);
    expect(game.getBall().vy).toBeLessThan(0);
  });

  // ── buildBricks ──────────────────────────────────────────────────────────
  test('buildBricks at level 1 creates 40 bricks', () => {
    game.setLevel(1); game.buildBricks();
    expect(game.getBricks().filter(b => b.alive).length).toBe(40);
  });

  test('buildBricks caps rows at 10 (80 bricks)', () => {
    game.setLevel(20); game.buildBricks();
    expect(game.getBricks().filter(b => b.alive).length).toBe(80);
  });

  // ── particles ────────────────────────────────────────────────────────────
  test('spawnParticles adds 6-10 particles', () => {
    game.getParticles().length = 0;
    game.spawnParticles({ x: 100, y: 100, w: 80, h: 22, color1: '#f0f' });
    const n = game.getParticles().length;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(10);
  });

  test('updateParticles removes expired particles', () => {
    game.getParticles().length = 0;
    game.getParticles().push({ x:10,y:10,vx:1,vy:-1,life:1,maxLife:20,size:2,color:'#f00' });
    game.getParticles().push({ x:50,y:50,vx:0,vy:0, life:5,maxLife:20,size:3,color:'#0f0' });
    game.updateParticles();
    expect(game.getParticles().length).toBe(1);
    expect(game.getParticles()[0].life).toBe(4);
  });

  // ── draw helpers ─────────────────────────────────────────────────────────
  test('withGlow saves and restores ctx', () => {
    game.withGlow('#ff0', 10, jest.fn());
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  test('drawBackground without bgImage uses gradient', () => {
    game.setBgImage(null); game.drawBackground();
    expect(mockCtx.createLinearGradient).toHaveBeenCalled();
  });

  test('drawBackground with bgImage calls drawImage', () => {
    game.setBgImage({ _src: 'x' }); game.drawBackground();
    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  test('drawPaddle calls fill', () => { game.drawPaddle(); expect(mockCtx.fill).toHaveBeenCalled(); });
  test('drawBall calls arc', () => { game.drawBall(); expect(mockCtx.arc).toHaveBeenCalled(); });

  test('drawBricks skips dead bricks', () => {
    game.setLevel(1); game.buildBricks();
    game.getBricks().forEach(b => { b.alive = false; });
    mockCtx.fill.mockClear();
    game.drawBricks();
    expect(mockCtx.fill).not.toHaveBeenCalled();
  });

  test('drawBricks renders alive bricks', () => {
    game.setLevel(1); game.buildBricks();
    mockCtx.fill.mockClear();
    game.drawBricks();
    expect(mockCtx.fill).toHaveBeenCalled();
  });

  test('drawParticles renders particles', () => {
    game.getParticles().length = 0;
    game.getParticles().push({ x:10,y:10,vx:0,vy:0,life:10,maxLife:20,size:3,color:'#f00' });
    game.drawParticles(); expect(mockCtx.arc).toHaveBeenCalled();
  });

  test('drawHUD calls fillText', () => { game.drawHUD(); expect(mockCtx.fillText).toHaveBeenCalled(); });

  test('drawPanel renders HIGH SCORES header', () => {
    game.drawPanel();
    expect(mockCtx.fillText).toHaveBeenCalledWith('HIGH SCORES', expect.any(Number), expect.any(Number));
  });

  test('drawPanel renders stored scores with multiple entries', () => {
    localStorage.setItem('breakout_highscores', JSON.stringify([
      { name: 'Alice', score: 999, level: 5 },
      { name: 'Bob',   score: 400, level: 2 },
    ]));
    mockCtx.fillText.mockClear();
    game.drawPanel();
    const texts = mockCtx.fillText.mock.calls.map(c => String(c[0]));
    expect(texts.some(t => t.includes('Alice'))).toBe(true);
    expect(texts.some(t => t.includes('Bob'))).toBe(true);
  });

  // ── collision ─────────────────────────────────────────────────────────────
  test('circleHitsRect true on overlap', () => {
    expect(game.circleHitsRect(50, 50, 44, 44, 12, 12)).toBe(true);
  });

  test('circleHitsRect false when distant', () => {
    expect(game.circleHitsRect(0, 0, 500, 500, 80, 22)).toBe(false);
  });

  test('resolveBrickSide: side hit negates vx', () => {
    const b = game.getBall();
    b.x=108; b.y=111; b.vx=5; b.vy=3;
    game.resolveBrickSide({ x:100,y:100,w:80,h:22 });
    expect(b.vx).toBe(-5); expect(b.vy).toBe(3);
  });

  test('resolveBrickSide: top/bottom hit negates vy', () => {
    const b = game.getBall();
    b.x=140; b.y=103; b.vx=3; b.vy=5;
    game.resolveBrickSide({ x:100,y:100,w:80,h:22 });
    expect(b.vx).toBe(3); expect(b.vy).toBe(-5);
  });

  test('checkBrickCollisions breaks hit brick and returns alive count', () => {
    game.setLevel(1); game.buildBricks();
    const bricks = game.getBricks();
    const b = game.getBall();
    b.attached=false; b.x=bricks[0].x+5; b.y=bricks[0].y+5; b.vx=3; b.vy=-3;
    const total = bricks.filter(x => x.alive).length;
    expect(game.checkBrickCollisions()).toBe(total - 1);
    expect(bricks[0].alive).toBe(false);
  });

  test('checkBrickCollisions returns 0 when all dead', () => {
    game.getBricks().forEach(b => { b.alive=false; });
    expect(game.checkBrickCollisions()).toBe(0);
  });

  // ── updatePhysics ─────────────────────────────────────────────────────────
  test('updatePhysics: attached ball tracks paddle', () => {
    game.resetPaddle(); game.resetBall();
    game.updatePhysics(0.016);
    expect(game.getBall().x).toBeCloseTo(game.getPaddle().x + 50);
  });

  test('updatePhysics: left wall bounce', () => {
    const b = game.getBall();
    b.attached=false; b.x=5; b.y=300; b.vx=-20; b.vy=0;
    game.updatePhysics(0.016);
    expect(b.vx).toBeGreaterThan(0);
  });

  test('updatePhysics: right wall bounce', () => {
    const b = game.getBall();
    b.attached=false; b.x=695; b.y=300; b.vx=20; b.vy=0;
    game.updatePhysics(0.016);
    expect(b.vx).toBeLessThan(0);
  });

  test('updatePhysics: top wall bounce', () => {
    const b = game.getBall();
    b.attached=false; b.x=350; b.y=5; b.vx=0; b.vy=-20;
    game.updatePhysics(0.016);
    expect(b.vy).toBeGreaterThan(0);
  });

  test('updatePhysics: paddle bounce', () => {
    game.resetPaddle();
    const b = game.getBall(); const p = game.getPaddle();
    b.attached=false; b.x=p.x+p.w/2; b.y=532; b.vx=0; b.vy=10;
    game.updatePhysics(0.016);
    expect(b.vy).toBeLessThan(0);
  });

  test('updatePhysics: ball lost with lives remaining resets', () => {
    game.setLives(2); game.setLevel(1); game.buildBricks();
    const b = game.getBall();
    b.attached=false; b.x=350; b.y=610; b.vx=0; b.vy=5;
    game.updatePhysics(0.016);
    expect(game.getLives()).toBe(1);
    expect(game.getBall().attached).toBe(true);
  });

  test('updatePhysics: ball lost with 1 life triggers endGame', () => {
    game.setLives(1); game.setGameState('playing'); game.setAnimId(1);
    game.setLevel(1); game.buildBricks();
    const b = game.getBall();
    b.attached=false; b.x=350; b.y=610; b.vx=0; b.vy=5;
    game.updatePhysics(0.016);
    expect(game.getGameState()).toBe('gameover');
  });

  test('updatePhysics: all bricks cleared triggers nextLevel', () => {
    game.setLevel(1); game.buildBricks();
    const bricks = game.getBricks();
    bricks.slice(1).forEach(b => { b.alive=false; });
    const b = game.getBall();
    b.attached=false; b.x=bricks[0].x+5; b.y=bricks[0].y+5; b.vx=0; b.vy=0;
    game.updatePhysics(0);
    expect(game.getLevel()).toBe(2);
  });

  // ── updatePaddle ──────────────────────────────────────────────────────────
  test('updatePaddle moves left', () => {
    game.setKeyLeft(true); game.resetPaddle();
    const x0 = game.getPaddle().x; game.updatePaddle(0.1);
    expect(game.getPaddle().x).toBeLessThan(x0);
    game.setKeyLeft(false);
  });

  test('updatePaddle moves right', () => {
    game.setKeyRight(true); game.resetPaddle();
    const x0 = game.getPaddle().x; game.updatePaddle(0.1);
    expect(game.getPaddle().x).toBeGreaterThan(x0);
    game.setKeyRight(false);
  });

  test('updatePaddle clamps left boundary', () => {
    game.getPaddle().x = -500; game.updatePaddle(0);
    expect(game.getPaddle().x).toBe(0);
  });

  test('updatePaddle clamps right boundary', () => {
    game.getPaddle().x = 9999; game.updatePaddle(0);
    expect(game.getPaddle().x).toBe(700 - game.getPaddle().w);
  });

  // ── game-flow ─────────────────────────────────────────────────────────────
  test('nextLevel increments level and rebuilds bricks', () => {
    game.setLevel(2); game.nextLevel();
    expect(game.getLevel()).toBe(3);
    expect(game.getBricks().filter(b => b.alive).length).toBe(56);
  });

  test('endGame sets gameover state and updates score-display', () => {
    game.setScore(750); game.setAnimId(1); game.setGameState('playing');
    game.endGame();
    expect(game.getGameState()).toBe('gameover');
    expect(document.getElementById('score-display').textContent).toBe('SCORE: 750');
    expect(game.getAnimId()).toBeNull();
  });

  test('endGame without score-display element does not throw', () => {
    const el = document.getElementById('score-display');
    el.remove();
    game.setGameState('playing'); game.setAnimId(1);
    expect(() => game.endGame()).not.toThrow();
    const d = document.createElement('div'); d.id='score-display';
    document.body.appendChild(d);
  });

  test('startGame resets state and starts loop', () => {
    game.startGame();
    expect(game.getGameState()).toBe('playing');
    expect(game.getScore()).toBe(0);
    expect(game.getLives()).toBe(3);
    expect(game.getLevel()).toBe(1);
    expect(game.getAnimId()).toBe(42);
  });

  test('pauseGame: playing → paused', () => {
    game.setGameState('playing'); game.setAnimId(42); game.pauseGame();
    expect(game.getGameState()).toBe('paused');
    expect(document.getElementById('pause-banner').style.display).toBe('block');
  });

  test('pauseGame: paused → playing', () => {
    game.setGameState('paused'); game.pauseGame();
    expect(game.getGameState()).toBe('playing');
    expect(document.getElementById('pause-banner').style.display).toBe('none');
  });

  test('pauseGame: no-op in other states', () => {
    game.setGameState('gameover'); game.pauseGame();
    expect(game.getGameState()).toBe('gameover');
  });

  test('abortToStart cancels animId', () => {
    game.setAnimId(77); game.abortToStart();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(77);
    expect(game.getAnimId()).toBeNull();
    expect(game.getGameState()).toBe('start');
  });

  test('abortToStart with null animId is safe', () => {
    game.setAnimId(null);
    expect(() => game.abortToStart()).not.toThrow();
  });

  // ── game loop ─────────────────────────────────────────────────────────────
  test('loop schedules next frame', () => {
    game.setLevel(1); game.buildBricks(); game.setLastTime(1000);
    globalThis.requestAnimationFrame.mockReturnValueOnce(55);
    game.loop(1016);
    expect(game.getAnimId()).toBe(55);
  });

  // ── highscores ────────────────────────────────────────────────────────────
  test('loadHighScores: empty returns []', () => {
    expect(game.loadHighScores()).toEqual([]);
  });

  test('loadHighScores: invalid JSON returns []', () => {
    localStorage.setItem('breakout_highscores', '{bad');
    expect(game.loadHighScores()).toEqual([]);
  });

  test('loadHighScores: non-array returns []', () => {
    localStorage.setItem('breakout_highscores', '{"x":1}');
    expect(game.loadHighScores()).toEqual([]);
  });

  test('loadHighScores: filters invalid entries', () => {
    localStorage.setItem('breakout_highscores', JSON.stringify([
      null, 'str', [1,2],
      { score:100, level:1 },
      { name:42, score:100, level:1 },
      { name:'a', score:'bad', level:1 },
      { name:'a', score:100, level:'x' },
      { name:'Valid', score:500, level:2 },
    ]));
    const r = game.loadHighScores();
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('Valid');
  });

  test('loadHighScores: caps at 10', () => {
    localStorage.setItem('breakout_highscores', JSON.stringify(
      Array.from({length:15}, (_,i) => ({ name:`P${i}`, score:i*10, level:1 }))
    ));
    expect(game.loadHighScores().length).toBe(10);
  });

  test('saveHighScore: stores and sorts', () => {
    game.saveHighScore('Alice', 500, 2);
    game.saveHighScore('Bob', 200, 1);
    expect(game.loadHighScores()[0].name).toBe('Alice');
  });

  test('saveHighScore: sanitises dangerous chars', () => {
    game.saveHighScore('<script>x</script>', 100, 1);
    expect(game.loadHighScores()[0].name).not.toContain('<');
  });

  test('saveHighScore: uses PLAYER for empty name', () => {
    game.saveHighScore('', 10, 1);
    expect(game.loadHighScores().find(e => e.score===10).name).toBe('PLAYER');
  });

  test('saveHighScore: silently handles localStorage quota error', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(() => game.saveHighScore('X', 1, 1)).not.toThrow();
  });

  // ── keyboard ──────────────────────────────────────────────────────────────
  test('handleKeyDown: ArrowLeft activates left', () => {
    game.handleKeyDown({ code:'ArrowLeft', preventDefault:jest.fn() });
    game.resetPaddle(); const x0 = game.getPaddle().x;
    game.updatePaddle(0.1);
    expect(game.getPaddle().x).toBeLessThan(x0);
    game.handleKeyUp({ code:'ArrowLeft' });
  });

  test('handleKeyDown: ArrowRight activates right', () => {
    game.handleKeyDown({ code:'ArrowRight', preventDefault:jest.fn() });
    game.resetPaddle(); const x0 = game.getPaddle().x;
    game.updatePaddle(0.1);
    expect(game.getPaddle().x).toBeGreaterThan(x0);
    game.handleKeyUp({ code:'ArrowRight' });
  });

  test('handleKeyDown: Space on start starts game', () => {
    game.setGameState('start');
    game.handleKeyDown({ code:'Space', preventDefault:jest.fn() });
    expect(game.getGameState()).toBe('playing');
  });

  test('handleKeyDown: Space when playing+attached launches ball', () => {
    game.setGameState('playing'); game.resetBall();
    game.handleKeyDown({ code:'Space', preventDefault:jest.fn() });
    expect(game.getBall().attached).toBe(false);
  });

  test('handleKeyDown: Space when playing+unattached pauses', () => {
    game.setGameState('playing'); game.setAnimId(42);
    game.getBall().attached = false;
    game.handleKeyDown({ code:'Space', preventDefault:jest.fn() });
    expect(game.getGameState()).toBe('paused');
  });

  test('handleKeyDown: Space when paused resumes', () => {
    game.setGameState('paused');
    game.handleKeyDown({ code:'Space', preventDefault:jest.fn() });
    expect(game.getGameState()).toBe('playing');
  });

  test('handleKeyDown: Escape when playing aborts to start', () => {
    game.setGameState('playing'); game.setAnimId(1);
    game.handleKeyDown({ code:'Escape', preventDefault:jest.fn() });
    expect(game.getGameState()).toBe('start');
  });

  test('handleKeyDown: Escape when paused aborts to start', () => {
    game.setGameState('paused'); game.setAnimId(null);
    game.handleKeyDown({ code:'Escape', preventDefault:jest.fn() });
    expect(game.getGameState()).toBe('start');
  });

  test('handleKeyDown: Escape in other states is no-op', () => {
    game.setGameState('gameover');
    game.handleKeyDown({ code:'Escape', preventDefault:jest.fn() });
    expect(game.getGameState()).toBe('gameover');
  });

  test('handleKeyDown: unknown code is no-op', () => {
    const s = game.getGameState();
    expect(() => game.handleKeyDown({ code:'KeyQ', preventDefault:jest.fn() })).not.toThrow();
    expect(game.getGameState()).toBe(s);
  });

  test('handleKeyUp: ArrowLeft stops movement', () => {
    game.setKeyLeft(true); game.handleKeyUp({ code:'ArrowLeft' });
    game.resetPaddle(); const x0 = game.getPaddle().x;
    game.updatePaddle(0.1);
    expect(game.getPaddle().x).toBeCloseTo(x0);
  });

  test('handleKeyUp: ArrowRight stops movement', () => {
    game.setKeyRight(true); game.handleKeyUp({ code:'ArrowRight' });
    game.resetPaddle(); const x0 = game.getPaddle().x;
    game.updatePaddle(0.1);
    expect(game.getPaddle().x).toBeCloseTo(x0);
  });

  // ── mouse + canvas click ──────────────────────────────────────────────────
  test('handleMouseMove positions paddle', () => {
    game.handleMouseMove({ clientX:400, clientY:0 });
    expect(game.getPaddle().x).toBeCloseTo(350);
  });

  test('canvas click launches ball when playing and attached', () => {
    game.setGameState('playing'); game.resetBall();
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    expect(game.getBall().attached).toBe(false);
  });

  test('canvas click is no-op when not playing', () => {
    game.setGameState('start'); game.resetBall();
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    expect(game.getBall().attached).toBe(true);
  });

  test('canvas click is no-op when ball already unattached', () => {
    game.setGameState('playing'); game.getBall().attached = false;
    expect(() => canvasEl.dispatchEvent(new MouseEvent('click', { bubbles:true }))).not.toThrow();
  });

  // ── handleSave ────────────────────────────────────────────────────────────
  test('handleSave saves score and returns to start', () => {
    game.setScore(1200); game.setLevel(4);
    document.getElementById('name-input').value = 'Tester';
    game.handleSave();
    expect(game.getGameState()).toBe('start');
    expect(document.getElementById('name-input').value).toBe('');
    expect(game.loadHighScores().some(e => e.name==='Tester' && e.score===1200)).toBe(true);
  });

  test('handleSave without name-input element is safe', () => {
    const el = document.getElementById('name-input');
    el.remove();
    expect(() => game.handleSave()).not.toThrow();
    const input = document.createElement('input');
    input.id='name-input'; input.type='text';
    document.body.appendChild(input);
  });

  // ── handleNameInputKey ────────────────────────────────────────────────────
  test('handleNameInputKey: Enter triggers save', () => {
    game.setScore(300);
    document.getElementById('name-input').value = 'EnterKey';
    game.handleNameInputKey({ code:'Enter' });
    expect(game.getGameState()).toBe('start');
  });

  test('handleNameInputKey: other key is no-op', () => {
    game.setGameState('gameover');
    game.handleNameInputKey({ code:'KeyZ' });
    expect(game.getGameState()).toBe('gameover');
  });

  // ── handleFileUpload ──────────────────────────────────────────────────────
  describe('handleFileUpload', () => {
    const imgInstance = () => globalThis.Image.mock.instances.at(-1);

    beforeEach(() => {
      if (!document.getElementById('upload-status')) {
        const d = document.createElement('div'); d.id='upload-status';
        document.body.appendChild(d);
      }
      document.getElementById('upload-status').textContent = '';
      globalThis.Image = jest.fn(function MockImg() {
        Object.defineProperty(this, 'src', {
          configurable: true,
          set(v) { this._src = v; },
          get() { return this._src; },
        });
      });
    });

    test('no file → early return', () => {
      const fetchFn = jest.fn();
      globalThis.fetch = fetchFn;
      game.handleFileUpload({ target:{ files:[] } });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    test('successful upload: img.onload sets BG LOADED', async () => {
      const url = '/uploads/bg_' + 'a'.repeat(32) + '.jpg';
      globalThis.fetch = jest.fn().mockResolvedValue({ ok:true, json:jest.fn().mockResolvedValue({ url }) });
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      imgInstance().onload();
      expect(document.getElementById('upload-status').textContent).toBe('BG LOADED');
    });

    test('img.onerror sets LOAD ERR', async () => {
      const url = '/uploads/bg_' + 'b'.repeat(32) + '.jpg';
      globalThis.fetch = jest.fn().mockResolvedValue({ ok:true, json:jest.fn().mockResolvedValue({ url }) });
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      imgInstance().onerror();
      expect(document.getElementById('upload-status').textContent).toBe('LOAD ERR');
    });

    test('invalid URL from server shows error', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok:true, json:jest.fn().mockResolvedValue({ url:'https://evil.com/x' }) });
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      expect(document.getElementById('upload-status').textContent).toContain('Invalid');
    });

    test('server error shows error message', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok:false, json:jest.fn().mockResolvedValue({ error:'Bad type' }) });
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      expect(document.getElementById('upload-status').textContent).toBe('Bad type');
    });

    test('server error with no error field uses Upload failed', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok:false, json:jest.fn().mockResolvedValue({}) });
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      expect(document.getElementById('upload-status').textContent).toBe('Upload failed');
    });

    test('network error shows message', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('network down'));
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      expect(document.getElementById('upload-status').textContent).toBe('network down');
    });

    test('error without message shows ERR', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue({ message:'' });
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      expect(document.getElementById('upload-status').textContent).toBe('ERR');
    });

    test('missing status element: onload/onerror do not throw', async () => {
      const url = '/uploads/bg_' + 'c'.repeat(32) + '.png';
      globalThis.fetch = jest.fn().mockResolvedValue({ ok:true, json:jest.fn().mockResolvedValue({ url }) });
      const s = document.getElementById('upload-status');
      s.remove();
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.png')] } });
      await flushPromises();
      expect(() => imgInstance().onload()).not.toThrow();
      expect(() => imgInstance().onerror()).not.toThrow();
      const d = document.createElement('div'); d.id='upload-status';
      document.body.appendChild(d);
    });

    test('missing status element: catch does not throw', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('err'));
      const s = document.getElementById('upload-status');
      s.remove();
      game.handleFileUpload({ target:{ files:[new File(['x'],'t.jpg')] } });
      await flushPromises();
      const d = document.createElement('div'); d.id='upload-status';
      document.body.appendChild(d);
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────────
  test('destroy removes listeners without error', () => {
    expect(() => game.destroy()).not.toThrow();
  });
});
