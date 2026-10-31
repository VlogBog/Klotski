(() => {
  const COLS = 4, ROWS = 5;
  const START = [
    { id: 'g',  x: 0, y: 0, w: 1, h: 2, c: '#1f9273' },
    { id: 'K',  x: 1, y: 0, w: 2, h: 2, big: true },
    { id: 'a',  x: 3, y: 0, w: 1, h: 2, c: '#c0831f' },
    { id: 'l2', x: 0, y: 2, w: 1, h: 2, c: '#1b80b3' },
    { id: 's1', x: 1, y: 2, w: 1, h: 1, c: '#bf4658' },
    { id: 's2', x: 2, y: 2, w: 1, h: 1, c: '#1d9386' },
    { id: 'r2', x: 3, y: 2, w: 1, h: 2, c: '#6f53bf' },
    { id: 's3', x: 1, y: 3, w: 1, h: 1, c: '#c26829' },
    { id: 's4', x: 2, y: 3, w: 1, h: 1, c: '#9d4bb8' },
    { id: 'p',  x: 1, y: 4, w: 2, h: 1, c: '#5b6a8c' },
  ];
  const WIN = { x: 1, y: 3 };
  const CROWN = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 10H5z"/><path d="M5 21h14"/></svg>';

  const $ = id => document.getElementById(id);
  const board = $('board'), stage = $('stage');
  let blocks, els = {}, cell = 80, pad = 8, gap = 8;
  let moves, history, startT, timerOn, finalT, won, raf;

  // ---------- storage ----------
  const KEY = 'klotski-train-v2';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
  let rec = load();

  const fmt = ms => {
    const t = Math.floor(ms / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
    return `${m}:${String(s).padStart(2, '0')}.${t % 10}`;
  };

  function renderRecords() {
    const parts = [];
    if (rec.bestTime != null) parts.push(`<b>${fmt(rec.bestTime)}</b>`);
    if (rec.bestMoves != null) parts.push(`<b>${rec.bestMoves}</b> хода`);
    $('best').innerHTML = 'Рекорд: ' + (parts.length ? parts.join(' · ') : '<b>—</b>');
    const r = rec.recent || [];
    $('recent').innerHTML = r.length
      ? 'Последни: ' + r.map(x => `<span class="chip">${fmt(x.t)} · ${x.m}</span>`).join('')
      : 'Таймерът тръгва при първия ход.';
  }

  // ---------- geometry ----------
  function measure() {
    const w = Math.min(stage.clientWidth, 520), h = stage.clientHeight;
    const c = Math.floor(Math.min(w / (COLS + 0.25), h / (ROWS + 0.25)));
    cell = Math.max(40, c);
    pad = Math.round(cell * 0.1);
    gap = Math.max(5, Math.round(cell * 0.07));
    board.style.width = (COLS * cell + pad * 2) + 'px';
    board.style.height = (ROWS * cell + pad * 2) + 'px';
    const rad = Math.round(cell * 0.2) + 'px';
    for (const b of blocks) { els[b.id].style.borderRadius = rad; place(b); }
    const ex = board.querySelector('.exit');
    ex.style.left = (pad + cell + gap / 2) + 'px';
    ex.style.top = (pad + 4 * cell + gap / 2) + 'px';
    ex.style.width = (2 * cell - gap) + 'px';
    ex.style.height = (cell - gap) + 'px';
    ex.style.fontSize = Math.max(11, Math.round(cell * 0.17)) + 'px';
    ex.style.borderRadius = rad;
    const n = board.querySelector('.exit-notch');
    n.style.left = (pad + cell + cell * 0.25) + 'px';
    n.style.width = (cell * 1.5) + 'px';
  }

  function place(b, ox = 0, oy = 0) {
    const el = els[b.id];
    el.style.width = (b.w * cell - gap) + 'px';
    el.style.height = (b.h * cell - gap) + 'px';
    el.style.transform = `translate(${pad + b.x * cell + gap / 2 + ox}px, ${pad + b.y * cell + gap / 2 + oy}px)`;
  }

  function free(b, nx, ny) {
    if (nx < 0 || ny < 0 || nx + b.w > COLS || ny + b.h > ROWS) return false;
    for (const o of blocks) {
      if (o === b) continue;
      if (nx < o.x + o.w && nx + b.w > o.x && ny < o.y + o.h && ny + b.h > o.y) return false;
    }
    return true;
  }
  function maxSteps(b, axis, dir) {
    let k = 0;
    while (free(b, b.x + (axis === 'x' ? dir * (k + 1) : 0), b.y + (axis === 'y' ? dir * (k + 1) : 0))) k++;
    return k;
  }

  // ---------- game flow ----------
  function build() {
    board.innerHTML = '<div class="exit">ИЗХОД</div><div class="exit-notch"></div>';
    els = {};
    for (const b of blocks) {
      const el = document.createElement('div');
      el.className = 'block' + (b.big ? ' big' : '');
      if (b.big) el.innerHTML = CROWN; else el.style.background = b.c;
      el.dataset.id = b.id;
      board.appendChild(el);
      els[b.id] = el;
      attach(el, b);
    }
    measure();
  }

  function reset() {
    cancelAnimationFrame(raf);
    blocks = START.map(b => ({ ...b }));
    moves = 0; history = []; startT = 0; timerOn = false; finalT = 0; won = false;
    $('overlay').hidden = true;
    build();
    updateHud();
  }

  function startTimer() {
    if (timerOn) return;
    timerOn = true; startT = performance.now();
    const tick = () => { if (!timerOn) return; $('time').value = fmt(performance.now() - startT); raf = requestAnimationFrame(tick); };
    tick();
  }

  function updateHud() {
    $('moves').value = moves;
    $('time').value = fmt(won ? finalT : timerOn ? performance.now() - startT : 0);
    $('timeBox').classList.toggle('idle', !timerOn && !won);
    $('undo').disabled = !history.length || won;
  }

  function commit(b, nx, ny, isUndo) {
    if (!isUndo) history.push({ id: b.id, x: b.x, y: b.y });
    b.x = nx; b.y = ny;
    moves++;
    startTimer();
    place(b);
    updateHud();
    if (b.big && b.x === WIN.x && b.y === WIN.y) finish(b);
  }

  function finish(b) {
    won = true; timerOn = false;
    cancelAnimationFrame(raf);
    finalT = performance.now() - startT;
    updateHud();
    const el = els[b.id];
    setTimeout(() => { el.classList.add('exiting'); place(b, 0, cell * 2.2); }, 150);

    const newTime = rec.bestTime == null || finalT < rec.bestTime;
    const newMoves = rec.bestMoves == null || moves < rec.bestMoves;
    if (newTime) rec.bestTime = finalT;
    if (newMoves) rec.bestMoves = moves;
    rec.recent = [{ t: finalT, m: moves }, ...(rec.recent || [])].slice(0, 6);
    save(rec);
    renderRecords();

    $('wTime').textContent = fmt(finalT);
    $('wMoves').textContent = moves;
    const badge = $('wBadge');
    const msg = newTime && newMoves ? 'Нов рекорд по време и ходове' : newTime ? 'Нов рекорд по време' : newMoves ? 'Нов рекорд по ходове' : '';
    badge.textContent = msg; badge.hidden = !msg;
    setTimeout(() => { $('overlay').hidden = false; $('again').focus(); }, 700);
  }

  function undo() {
    if (won || !history.length) return;
    const h = history.pop();
    const b = blocks.find(x => x.id === h.id);
    commit(b, h.x, h.y, true);
  }

  // ---------- input ----------
  function attach(el, b) {
    // Free drag: the block follows the finger cell by cell through any free path
    // (left then down, around corners), and the whole drag counts as one move.
    let sx, sy, ox0, oy0, gx, gy, moved, active = false;
    el.addEventListener('pointerdown', e => {
      if (won || active) return;
      active = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      ox0 = b.x; oy0 = b.y; gx = b.x; gy = b.y;
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
    });
    el.addEventListener('pointermove', e => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      const fx = ox0 + dx / cell, fy = oy0 + dy / cell;
      // step through free cells toward the finger
      for (let i = 0; i < 20; i++) {
        const rx = fx - gx, ry = fy - gy;
        const sxn = Math.sign(rx), syn = Math.sign(ry);
        const tryX = Math.abs(rx) >= 0.5 && free(b, gx + sxn, gy);
        const tryY = Math.abs(ry) >= 0.5 && free(b, gx, gy + syn);
        if (tryX && (!tryY || Math.abs(rx) >= Math.abs(ry))) gx += sxn;
        else if (tryY) gy += syn;
        else if (tryX) gx += sxn;
        else break;
      }
      // partial slide inside the current cell, only toward a free neighbour
      const rx = fx - gx, ry = fy - gy;
      const okX = rx !== 0 && free(b, gx + Math.sign(rx), gy);
      const okY = ry !== 0 && free(b, gx, gy + Math.sign(ry));
      let px = 0, py = 0;
      if (okX && (!okY || Math.abs(rx) >= Math.abs(ry))) px = Math.max(-0.5, Math.min(0.5, rx));
      else if (okY) py = Math.max(-0.5, Math.min(0.5, ry));
      const tx = b.x, ty = b.y;
      b.x = gx; b.y = gy;
      place(b, px * cell, py * cell);
      b.x = tx; b.y = ty;
    });
    const end = () => {
      if (!active) return;
      active = false;
      el.classList.remove('drag');
      if (moved) {
        if (gx !== b.x || gy !== b.y) commit(b, gx, gy);
        else place(b);
      } else {
        // tap: move one step if there is exactly one direction to go
        const opts = [['x', -1], ['x', 1], ['y', -1], ['y', 1]].filter(([a, d]) => maxSteps(b, a, d) > 0);
        if (opts.length === 1) {
          const [a, d] = opts[0];
          commit(b, b.x + (a === 'x' ? d : 0), b.y + (a === 'y' ? d : 0));
        } else if (!opts.length) {
          el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  $('reset').addEventListener('click', reset);
  $('again').addEventListener('click', reset);
  $('undo').addEventListener('click', undo);
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'r' || k === 'р') { e.preventDefault(); reset(); }
    else if (k === 'z' || k === 'з' || k === 'backspace') { e.preventDefault(); undo(); }
  });
  new ResizeObserver(() => measure()).observe(stage);

  renderRecords();
  reset();
})();
