/**
 * board.js — Renders the chess board and handles drag/click interaction
 */

const Board = (() => {
  const C = Chess;

  let state       = null;
  let flipped     = false;
  let selected    = null;   // currently selected square
  let legalMovesForSq = []; // legal moves for selected square
  let onMove      = null;   // callback(move) when user makes a move
  let pendingPromo= null;   // { from, to } awaiting promotion choice
  let dragging    = false;
  let dragFrom    = null;
  let dragGhost   = null;

  // Arrow drawing (right-click drag)
  let arrowStart  = null;
  let arrows      = [];     // {from, to, color}
  let arrowSvg    = null;

  const boardEl   = document.getElementById('chessboard');
  const promoModal= document.getElementById('promotionModal');
  const promoPieces=document.getElementById('promotionPieces');

  function init(gameState, moveCallback) {
    state  = gameState;
    onMove = moveCallback;
    dragGhost = document.getElementById('dragGhost');
    if (!dragGhost) {
      dragGhost = document.createElement('div');
      dragGhost.id = 'dragGhost';
      dragGhost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;font-size:clamp(32px,5vw,60px);transform:translate(-50%,-50%);display:none;filter:drop-shadow(2px 4px 6px rgba(0,0,0,.6))';
      document.body.appendChild(dragGhost);
    }

    // Build arrow SVG overlay
    arrowSvg = boardEl.parentElement.querySelector('.board-arrow-svg');
    if (!arrowSvg) {
      arrowSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      arrowSvg.classList.add('board-arrow-svg');
      arrowSvg.setAttribute('viewBox','0 0 8 8');
      arrowSvg.setAttribute('preserveAspectRatio','none');
      boardEl.parentElement.style.position='relative';
      boardEl.parentElement.appendChild(arrowSvg);
    }

    buildCoords();
    render();
    bindEvents();
  }

  function setFlipped(f) {
    flipped = f;
    render();
  }

  function flip() {
    flipped = !flipped;
    arrows = [];
    render();
  }

  function render(lastFrom=-1, lastTo=-1) {
    boardEl.innerHTML = '';
    arrows = arrows || [];
    const lm = state ? C.generateMoves(state) : [];
    const status = state ? C.getStatus(state) : { inCheck:false };
    const inCheckSq = (status.inCheck && state)
      ? state.kings[state.turn] : -1;

    for (let display=0; display<64; display++) {
      const col = display % 8;
      const row = Math.floor(display / 8);
      const file= flipped ? 7-col : col;
      const rank= flipped ? row : 7-row;
      const sq  = C.idx(file, rank);

      const sqEl = document.createElement('div');
      sqEl.className = 'square ' + ((file+rank)%2===0 ? 'dark' : 'light');
      sqEl.dataset.sq = sq;

      // Coordinates (on border squares)
      if (file===0 || (flipped && file===7)) {
        const r=document.createElement('span');
        r.className='coord-label coord-rank';
        r.textContent=rank+1;
        sqEl.appendChild(r);
      }
      if (rank===0 || (flipped && rank===7)) {
        const f=document.createElement('span');
        f.className='coord-label coord-file';
        f.textContent='abcdefgh'[file];
        sqEl.appendChild(f);
      }

      // Last move highlight
      if (sq===lastFrom || sq===lastTo) sqEl.classList.add('last-move');

      // In-check king
      if (sq===inCheckSq) sqEl.classList.add('in-check');

      // Selected square
      if (selected!==null && sq===selected) sqEl.classList.add('selected');

      // Legal move dots
      if (selected!==null) {
        const m = legalMovesForSq.find(m=>m.to===sq);
        if (m) {
          const isCapture = state.board[sq]!==0 || m.flags==='ep';
          sqEl.classList.add(isCapture ? 'possible-capture' : 'possible-move');
        }
      }

      // Piece
      if (state) {
        const p = state.board[sq];
        if (p) {
          const pieceEl = document.createElement('span');
          pieceEl.className = 'piece';
          pieceEl.textContent = C.GLYPHS[p];
          sqEl.appendChild(pieceEl);
        }
      }

      boardEl.appendChild(sqEl);
    }

    drawArrows();
  }

  function renderLastMove() {
    if (!state || !state.history.length) { render(); return; }
    const last = state.history[state.history.length-1];
    render(last.undo.from, last.undo.to);
  }

  // ── Arrows ────────────────────────────────────────────────────────────
  function drawArrows() {
    if (!arrowSvg) return;
    arrowSvg.innerHTML = `
      <defs>
        <marker id="ah" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
          <polygon points="0 0, 3 1.5, 0 3" fill="rgba(255,170,0,0.85)"/>
        </marker>
        <marker id="ahb" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
          <polygon points="0 0, 3 1.5, 0 3" fill="rgba(20,200,80,0.85)"/>
        </marker>
      </defs>`;
    for (const a of arrows) {
      const fc=C.fileOf(a.from), rc=C.rankOf(a.from);
      const ft=C.fileOf(a.to),   rt=C.rankOf(a.to);
      const x1=(flipped?7-fc:fc)+0.5, y1=(flipped?rc:7-rc)+0.5;
      const x2=(flipped?7-ft:ft)+0.5, y2=(flipped?rt:7-rt)+0.5;
      const dx=x2-x1, dy=y2-y1;
      const len=Math.sqrt(dx*dx+dy*dy);
      const ex=x2-dx/len*0.35, ey=y2-dy/len*0.35;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',ex); line.setAttribute('y2',ey);
      line.setAttribute('stroke', a.color==='green' ? 'rgba(20,200,80,0.85)':'rgba(255,170,0,0.85)');
      line.setAttribute('stroke-width','0.14');
      line.setAttribute('marker-end', a.color==='green'?'url(#ahb)':'url(#ah)');
      arrowSvg.appendChild(line);
    }
  }

  // ── Interaction ────────────────────────────────────────────────────────
  function bindEvents() {
    // Click
    boardEl.addEventListener('click', onSquareClick);
    // Drag
    boardEl.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    // Touch
    boardEl.addEventListener('touchstart', onTouchStart, {passive:false});
    document.addEventListener('touchmove', onTouchMove,  {passive:false});
    document.addEventListener('touchend', onTouchEnd);
    // Right-click arrows
    boardEl.addEventListener('contextmenu', e=>e.preventDefault());
    boardEl.addEventListener('mousedown', onArrowStart);
    document.addEventListener('mouseup', onArrowEnd);
  }

  function sqFromEvent(e) {
    const el = e.target.closest('[data-sq]');
    return el ? parseInt(el.dataset.sq) : -1;
  }

  function onSquareClick(e) {
    if (dragging) return;
    if (e.button && e.button!==0) return;
    const sq = sqFromEvent(e);
    if (sq<0) return;
    handleSelect(sq);
  }

  function handleSelect(sq) {
    if (!state || !onMove) return;
    if (pendingPromo) return;
    const lm = C.generateMoves(state);

    if (selected !== null) {
      // Try to complete a move
      const move = legalMovesForSq.find(m=>m.to===sq);
      if (move) {
        if (needsPromo(move)) { showPromo(move.from, sq); return; }
        finalizeMove(move);
        return;
      }
    }

    // Select a new piece
    const p = state.board[sq];
    if (p && C.colorOf(p)===state.turn) {
      selected = sq;
      legalMovesForSq = lm.filter(m=>m.from===sq);
      renderLastMove();
    } else {
      selected = null;
      legalMovesForSq = [];
      renderLastMove();
    }
  }

  function needsPromo(move) {
    return C.pieceOf(state.board[move.from])===C.PAWN &&
      (C.rankOf(move.to)===7 || C.rankOf(move.to)===0);
  }

  function showPromo(from, to) {
    pendingPromo = {from, to};
    const color = C.colorOf(state.board[from]);
    promoPieces.innerHTML='';
    for (const pt of [C.QUEEN, C.ROOK, C.BISHOP, C.KNIGHT]) {
      const piece = color|pt;
      const btn = document.createElement('button');
      btn.className='promo-btn';
      btn.textContent=C.GLYPHS[piece];
      btn.title=C.PIECE_LETTERS[pt];
      btn.addEventListener('click',()=>{
        const lm=C.generateMoves(state);
        const move=lm.find(m=>m.from===pendingPromo.from&&m.to===pendingPromo.to&&m.promo===pt);
        if (move) finalizeMove(move);
        promoModal.classList.add('hidden');
        pendingPromo=null;
      });
      promoPieces.appendChild(btn);
    }
    promoModal.classList.remove('hidden');
  }

  function finalizeMove(move) {
    selected = null;
    legalMovesForSq = [];
    arrows = [];
    onMove(move);
  }

  // ── Drag ───────────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button!==0) return;
    const sq=sqFromEvent(e);
    if (sq<0) return;
    if (!state) return;
    const p=state.board[sq];
    if (!p || C.colorOf(p)!==state.turn) return;
    startDrag(sq, e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    if (!dragging) return;
    moveDrag(e.clientX, e.clientY);
  }
  function onMouseUp(e) {
    if (!dragging) return;
    const sq=sqFromPoint(e.clientX, e.clientY);
    endDrag(sq);
  }
  function onTouchStart(e) {
    if (e.touches.length!==1) return;
    e.preventDefault();
    const t=e.touches[0];
    const sq=sqFromPoint(t.clientX,t.clientY);
    if (sq<0||!state) return;
    const p=state.board[sq];
    if (!p||C.colorOf(p)!==state.turn) return;
    startDrag(sq,t.clientX,t.clientY);
  }
  function onTouchMove(e) {
    if (!dragging||!e.touches.length) return;
    e.preventDefault();
    moveDrag(e.touches[0].clientX,e.touches[0].clientY);
  }
  function onTouchEnd(e) {
    if (!dragging) return;
    const t=e.changedTouches[0];
    endDrag(sqFromPoint(t.clientX,t.clientY));
  }

  function startDrag(sq, x, y) {
    dragging=true; dragFrom=sq;
    selected=sq;
    legalMovesForSq=C.generateMoves(state).filter(m=>m.from===sq);
    dragGhost.textContent=C.GLYPHS[state.board[sq]]||'';
    dragGhost.style.display='block';
    moveDrag(x,y);
    renderLastMove();
  }
  function moveDrag(x,y) {
    dragGhost.style.left=x+'px';
    dragGhost.style.top=y+'px';
  }
  function endDrag(toSq) {
    dragging=false;
    dragGhost.style.display='none';
    if (toSq>=0 && toSq!==dragFrom && selected!==null) {
      const move=legalMovesForSq.find(m=>m.to===toSq);
      if (move) {
        if (needsPromo(move)) { showPromo(dragFrom,toSq); dragFrom=null; return; }
        finalizeMove(move);
        dragFrom=null; return;
      }
    }
    selected=null; legalMovesForSq=[];
    dragFrom=null;
    renderLastMove();
  }

  function sqFromPoint(x, y) {
    const el=document.elementFromPoint(x,y);
    const sq=el?.closest('[data-sq]');
    return sq ? parseInt(sq.dataset.sq) : -1;
  }

  // ── Arrow drawing (right-click) ────────────────────────────────────────
  function onArrowStart(e) {
    if (e.button!==2) return;
    arrowStart=sqFromEvent(e);
  }
  function onArrowEnd(e) {
    if (e.button!==2 || arrowStart===null) return;
    const to=sqFromPoint(e.clientX,e.clientY);
    if (to<0) { arrowStart=null; return; }
    if (to===arrowStart) {
      // Clear all arrows
      arrows=[];
      arrowStart=null;
      drawArrows();
      return;
    }
    const idx=arrows.findIndex(a=>a.from===arrowStart&&a.to===to);
    if (idx>=0) arrows.splice(idx,1);
    else arrows.push({from:arrowStart, to, color: e.shiftKey?'green':'orange'});
    arrowStart=null;
    drawArrows();
  }

  // ── Coordinates ────────────────────────────────────────────────────────
  function buildCoords() {
    // Coords are rendered inside squares as .coord-label
    // External coord divs remain for spacing
  }

  return { init, render, renderLastMove, setFlipped, flip, sqFromPoint };
})();
