(function () {
  'use strict';

  const GAME_KEY = 'bmw_tetris_passed';
  const TARGET = 4;

  const canvas = document.getElementById('tetrisCanvas');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('nextCanvas');
  const nextCtx = nextCanvas.getContext('2d');

  const scoreVal = document.getElementById('scoreVal');
  const scoreBar = document.getElementById('scoreBar');
  const overlay = document.getElementById('tetrisOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySub = document.getElementById('overlaySub');
  const overlayBtn = document.getElementById('overlayBtn');

  const unlockBanner = document.getElementById('unlockBanner');

  const modal = document.getElementById('winModal');
  const modalEyebrow = document.getElementById('modalEyebrow');
  const modalTitle = document.getElementById('modalTitle');
  const modalSub = document.getElementById('modalSub');
  const modalContinue = document.getElementById('modalContinue');

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = canvas.width / COLS;

  const COLORS = {
    I: '#4ea3ff',
    O: '#1c69d4',
    T: '#7ec2ff',
    S: '#2b8aea',
    Z: '#0d4796',
    J: '#9ec4ff',
    L: '#1559b8'
  };

  const SHAPES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  };

  const KEYS = Object.keys(SHAPES);

  let grid = [];
  let current = null;
  let next = null;
  let score = 0;
  let gameOver = false;
  let paused = false;
  let dropInterval = 550;
  let dropTimer = 0;
  let lastTime = 0;
  let animId = null;

  function emptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function randomPiece() {
    const k = KEYS[Math.floor(Math.random() * KEYS.length)];
    const shape = SHAPES[k].map(r => r.slice());
    return {
      type: k,
      shape,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: 0
    };
  }

  function rotate(matrix) {
    const N = matrix.length;
    const M = matrix[0].length;
    const out = Array.from({ length: M }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < M; x++) {
        out[x][N - 1 - y] = matrix[y][x];
      }
    }
    return out;
  }

  function collides(piece, offX = 0, offY = 0, shape = null) {
    const s = shape || piece.shape;
    for (let y = 0; y < s.length; y++) {
      for (let x = 0; x < s[y].length; x++) {
        if (!s[y][x]) continue;
        const nx = piece.x + x + offX;
        const ny = piece.y + y + offY;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function lockPiece() {
    current.shape.forEach((row, y) => {
      row.forEach((v, x) => {
        if (v) {
          const ny = current.y + y;
          const nx = current.x + x;
          if (ny >= 0) grid[ny][nx] = current.type;
        }
      });
    });

    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every(cell => cell)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }

    if (cleared > 0) {
      score += cleared;
      updateScore();

      if (score >= TARGET && !localStorage.getItem(GAME_KEY)) {
        try { localStorage.setItem(GAME_KEY, 'true'); } catch (e) {}
        if (unlockBanner) unlockBanner.classList.add('show');
      }
    }

    spawnNext();

    if (collides(current)) {
      gameOver = true;
      showGameOverModal();
    }
  }

  function spawnNext() {
    current = next || randomPiece();
    next = randomPiece();
    current.x = Math.floor((COLS - current.shape[0].length) / 2);
    current.y = 0;
    drawNext();
  }

  function drawBlock(c, x, y, color, size = BLOCK) {
    c.fillStyle = color;
    c.fillRect(x * size, y * size, size, size);

    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(x * size + 2, y * size + 2, size - 4, 4);

    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1;
    c.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
  }

  function draw() {
    ctx.fillStyle = '#12171e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK, 0);
      ctx.lineTo(x * BLOCK, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK);
      ctx.lineTo(canvas.width, y * BLOCK);
      ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) drawBlock(ctx, x, y, COLORS[grid[y][x]]);
      }
    }

    if (current) {
      current.shape.forEach((row, y) => {
        row.forEach((v, x) => {
          if (v) drawBlock(ctx, current.x + x, current.y + y, COLORS[current.type]);
        });
      });
    }
  }

  function drawNext() {
    nextCtx.fillStyle = '#0f131a';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (!next) return;
    const size = 24;
    const shapeW = next.shape[0].length;
    const shapeH = next.shape.length;
    const offsetX = (nextCanvas.width - shapeW * size) / 2;
    const offsetY = (nextCanvas.height - shapeH * size) / 2;

    next.shape.forEach((row, y) => {
      row.forEach((v, x) => {
        if (!v) return;
        const px = offsetX + x * size;
        const py = offsetY + y * size;
        nextCtx.fillStyle = COLORS[next.type];
        nextCtx.fillRect(px, py, size, size);
        nextCtx.fillStyle = 'rgba(255,255,255,0.18)';
        nextCtx.fillRect(px + 2, py + 2, size - 4, 4);
        nextCtx.strokeStyle = 'rgba(0,0,0,0.35)';
        nextCtx.lineWidth = 1;
        nextCtx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      });
    });
  }

  function updateScore() {
    if (scoreVal) scoreVal.textContent = score;
    if (scoreBar) {
      const pct = Math.min(100, (score / TARGET) * 100);
      scoreBar.style.width = pct + '%';
    }
  }

  function move(dx) {
    if (gameOver || paused || !current) return;
    if (!collides(current, dx, 0)) current.x += dx;
  }

  function rotatePiece() {
    if (gameOver || paused || !current) return;
    const rotated = rotate(current.shape);
    if (!collides(current, 0, 0, rotated)) {
      current.shape = rotated;
    }
  }

  function softDrop() {
    if (gameOver || paused || !current) return;
    if (!collides(current, 0, 1)) {
      current.y += 1;
    } else {
      lockPiece();
    }
  }

  function loop(time) {
    if (!lastTime) lastTime = time;
    const dt = time - lastTime;
    lastTime = time;

    if (!gameOver && !paused) {
      dropTimer += dt;
      if (dropTimer >= dropInterval) {
        dropTimer = 0;
        softDrop();
      }
    }

    draw();
    animId = requestAnimationFrame(loop);
  }

  function startGame() {
    grid = emptyGrid();
    score = 0;
    gameOver = false;
    paused = false;
    dropTimer = 0;
    lastTime = 0;

    updateScore();
    spawnNext();
    spawnNext();
    overlay.classList.remove('show');
    if (modal) modal.classList.remove('show');

    if (!animId) {
      lastTime = 0;
      animId = requestAnimationFrame(loop);
    }
  }

  function resumeFromModal() {
    startGame();
  }

  function showGameOverModal() {
    if (!modal) return;

    if (score >= TARGET) {
      modalEyebrow.textContent = 'YOU WIN';
      modalTitle.textContent = 'Ты уже молодец!';
      modalSub.textContent = 'Поздравления открыты. Можно продолжать играть или вернуться.';
      modalContinue.textContent = 'ИГРАТЬ ЕЩЁ';
    } else {
      modalEyebrow.textContent = 'GAME OVER';
      modalTitle.textContent = 'Игра окончена';
      modalSub.textContent = 'Попробуй ещё раз. Нужно набрать 4 очка.';
      modalContinue.textContent = 'ЗАНОВО';
    }

    modal.classList.add('show');
  }

  if (overlayBtn) overlayBtn.addEventListener('click', startGame);
  if (modalContinue) modalContinue.addEventListener('click', resumeFromModal);

  document.addEventListener('keydown', (e) => {
    if (modal && modal.classList.contains('show')) {
      if (e.key === 'Enter') { e.preventDefault(); resumeFromModal(); }
      return;
    }
    if (overlay && overlay.classList.contains('show')) {
      if (e.key === 'Enter') { e.preventDefault(); startGame(); }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); move(-1); break;
      case 'ArrowRight': e.preventDefault(); move(1); break;
      case 'ArrowDown':  e.preventDefault(); softDrop(); break;
      case 'ArrowUp':
      case ' ':
        e.preventDefault();
        rotatePiece();
        break;
      case 'p':
      case 'P':
        paused = !paused;
        overlayTitle.textContent = paused ? 'Пауза' : 'Готов?';
        overlaySub.textContent = paused ? 'Нажми P чтобы продолжить' : '';
        overlayBtn.textContent = paused ? 'ПРОДОЛЖИТЬ' : 'СТАРТ';
        overlay.classList.toggle('show', paused);
        break;
    }
  });

  function bindHoldButton(id, onPress, holdDelay = 180, initialDelay = 220) {
    const el = document.getElementById(id);
    if (!el) return;
    let holdTimer = null;
    let initialTimer = null;
    let pressed = false;

    function start(e) {
      e.preventDefault();
      if (pressed) return;
      pressed = true;
      el.classList.add('pressed');
      if (navigator.vibrate) navigator.vibrate(10);

      onPress();

      initialTimer = setTimeout(() => {
        holdTimer = setInterval(onPress, holdDelay);
      }, initialDelay);
    }

    function stop(e) {
      if (e) e.preventDefault();
      pressed = false;
      el.classList.remove('pressed');
      clearTimeout(initialTimer);
      clearInterval(holdTimer);
      initialTimer = null;
      holdTimer = null;
    }

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', stop, { passive: false });
    el.addEventListener('touchcancel', stop, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
  }

  function bindTapButton(id, onPress) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      if (navigator.vibrate) navigator.vibrate(8);
      onPress();
      setTimeout(() => el.classList.remove('pressed'), 120);
    }, { passive: false });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      onPress();
      setTimeout(() => el.classList.remove('pressed'), 120);
    });
  }

  bindHoldButton('btnLeft', () => move(-1));
  bindHoldButton('btnRight', () => move(1));
  bindHoldButton('btnDown', () => softDrop());
  bindTapButton('btnRotate', () => rotatePiece());

  const btnPause = document.getElementById('btnPause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (gameOver) return;
      paused = !paused;
      overlayTitle.textContent = paused ? 'Пауза' : 'Готов?';
      overlaySub.textContent = paused ? 'Нажми ⏸ чтобы продолжить' : '';
      overlayBtn.textContent = paused ? 'ПРОДОЛЖИТЬ' : 'СТАРТ';
      overlay.classList.toggle('show', paused);
    });
  }

  grid = emptyGrid();
  next = randomPiece();
  drawNext();
  updateScore();
  draw();

  try {
    if (localStorage.getItem(GAME_KEY) === 'true' && unlockBanner) {
      unlockBanner.classList.add('show');
    }
  } catch (e) {}

})();