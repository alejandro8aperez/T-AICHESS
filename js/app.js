/**
 * app.js — Main application controller
 * Ties together Chess engine, AI, Board renderer, clocks, UI panels.
 */

(() => {
  const C = Chess;

  // ── State ─────────────────────────────────────────────────────────────
  let gameState     = null;
  let gameActive    = false;
  let playerColor   = C.WHITE;
  let opponentType  = 'ai';   // 'ai' | 'friend'
  let aiLevel       = 1;
  let timeMinutes   = 1;
  let timeIncrement = 0;
  let soundEnabled  = true;
  let aiThinking    = false;

  let clockInterval = null;
  let clocks        = { [C.WHITE]: 0, [C.BLACK]: 0 }; // milliseconds
  let clockActive   = null; // C.WHITE | C.BLACK | null

  let sanHistory    = [];   // SAN strings for move list
  let moveViewIndex = -1;   // -1 = live position
  let viewState     = null; // replayed state

  // ── DOM refs ──────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const gameSetup   = $('gameSetup');
  const gameInfo    = $('gameInfo');
  const moveList    = $('moveList');
  const statusText  = $('statusText');
  const turnIndicator=$('turnIndicator');
  const resultOverlay=$('resultOverlay');
  const openingName  =$('openingName');
  const evalFill    = $('evalFill');
  const evalText    = $('evalText');
  const chatLog     = $('chatLog');

  // ── Init ──────────────────────────────────────────────────────────────
  Board.init(null, onPlayerMove);
  setupUI();

  // ── Setup UI bindings ──────────────────────────────────────────────────
  function setupUI() {
    // Time buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.time-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        timeMinutes   = parseInt(btn.dataset.minutes);
        timeIncrement = parseInt(btn.dataset.increment);
      });
    });

    // Color buttons
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Opponent buttons
    document.querySelectorAll('.opp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.opp-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        opponentType = btn.dataset.opp;
        $('aiSection').style.display = opponentType==='ai' ? 'block' : 'none';
      });
    });

    // AI level buttons
    document.querySelectorAll('.level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.level-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        aiLevel = parseInt(btn.dataset.level);
      });
    });

    // Start button
    $('startGame').addEventListener('click', startGame);
    $('resultNewGame').addEventListener('click', () => { resultOverlay.classList.add('hidden'); showSetup(); });
    $('resultAnalyze').addEventListener('click', () => { resultOverlay.classList.add('hidden'); switchTab('analysis'); });

    // In-game buttons
    $('btnResign').addEventListener('click', resign);
    $('btnDraw').addEventListener('click', offerDraw);
    $('btnFlip').addEventListener('click', () => Board.flip());
    $('btnNewGame').addEventListener('click', () => { stopClocks(); showSetup(); });

    // Move navigation
    $('navFirst').addEventListener('click', () => gotoMove(0));
    $('navPrev').addEventListener('click',  () => gotoMove(moveViewIndex <= 0 ? 0 : moveViewIndex-1));
    $('navNext').addEventListener('click',  () => gotoMove(moveViewIndex < sanHistory.length ? moveViewIndex+1 : sanHistory.length));
    $('navLast').addEventListener('click',  () => gotoMove(sanHistory.length));

    // Keyboard
    document.addEventListener('keydown', e => {
      if (!gameActive) return;
      if (e.key==='ArrowLeft')  $('navPrev').click();
      if (e.key==='ArrowRight') $('navNext').click();
      if (e.key==='ArrowUp')    $('navFirst').click();
      if (e.key==='ArrowDown')  $('navLast').click();
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Theme toggle
    $('toggleTheme').addEventListener('click', () => {
      document.body.classList.toggle('theme-light');
      document.body.classList.toggle('theme-dark');
      $('toggleTheme').textContent = document.body.classList.contains('theme-light') ? '🌙' : '☀';
    });

    // Sound toggle
    $('toggleSound').addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      $('toggleSound').textContent = soundEnabled ? '🔊' : '🔇';
    });

    // Chat
    $('chatSend').addEventListener('click', sendChat);
    $('chatInput').addEventListener('keypress', e=>{ if(e.key==='Enter') sendChat(); });

    // Export
    $('copyFen').addEventListener('click', () => {
      const fen = gameState ? C.toFen(gameState) : C.INITIAL_FEN;
      navigator.clipboard.writeText(fen).then(()=>toast('FEN copied!'));
    });
    $('copyPgn').addEventListener('click', () => {
      if (!gameState) return;
      const pgn = C.toPgn(gameState, {
        white: playerColor===C.WHITE ? 'You' : (opponentType==='ai'?'Computer':'Opponent'),
        black: playerColor===C.BLACK ? 'You' : (opponentType==='ai'?'Computer':'Opponent')
      });
      navigator.clipboard.writeText(pgn).then(()=>toast('PGN copied!'));
    });
  }

  // ── Game start ────────────────────────────────────────────────────────
  function startGame() {
    // Determine color
    const colorChoice = document.querySelector('.color-btn.active')?.dataset.color || 'white';
    if (colorChoice === 'random') {
      playerColor = Math.random() < 0.5 ? C.WHITE : C.BLACK;
    } else {
      playerColor = colorChoice === 'white' ? C.WHITE : C.BLACK;
    }

    // Init game
    gameState = C.makeState();
    C.loadFen(gameState, C.INITIAL_FEN);
    sanHistory    = [];
    moveViewIndex = sanHistory.length;
    viewState     = null;
    aiThinking    = false;
    arrows        = [];

    // Clocks
    const totalMs = timeMinutes * 60 * 1000;
    clocks = { [C.WHITE]: totalMs, [C.BLACK]: totalMs };
    clockActive = null;

    // Board
    Board.init(gameState, onPlayerMove);
    Board.setFlipped(playerColor === C.BLACK);
    Board.renderLastMove();

    // UI
    gameSetup.classList.add('hidden');
    gameInfo.classList.remove('hidden');
    resultOverlay.classList.add('hidden');
    gameActive = true;

    updatePlayerInfo();
    updateClockDisplay();
    updateStatus();
    updateMoveList();
    updateOpeningName();
    updateEval();

    // If AI plays first (player is black)
    if (opponentType === 'ai' && gameState.turn !== playerColor) {
      setTimeout(aiMove, 500);
    } else {
      startClock(gameState.turn);
    }
  }

  function showSetup() {
    stopClocks();
    gameActive = false;
    gameSetup.classList.remove('hidden');
    gameInfo.classList.add('hidden');
    statusText.textContent = 'Select time control and press Start';
    turnIndicator.className = 'turn-indicator';
    Board.init(null, onPlayerMove);
    Board.render();
    moveList.innerHTML='';
    openingName.textContent='';
  }

  // ── Player move ────────────────────────────────────────────────────────
  function onPlayerMove(move) {
    if (!gameActive || !gameState) return;
    if (gameState.turn !== playerColor && opponentType==='ai') return;
    if (moveViewIndex < sanHistory.length) {
      // Navigating history — snap back to live
      gotoMove(sanHistory.length);
    }
    applyUserMove(move);
  }

  function applyUserMove(move) {
    const lm = C.generateMoves(gameState);
    const san = C.moveToSan(gameState, move, lm);

    stopClock(gameState.turn);
    if (timeMinutes > 0) clocks[gameState.turn] += timeIncrement * 1000;

    C.applyMove(gameState, move);
    sanHistory.push(san);
    moveViewIndex = sanHistory.length;

    playMoveSound(move, gameState);

    Board.init(gameState, onPlayerMove);
    Board.setFlipped(playerColor === C.BLACK);
    Board.renderLastMove();

    updateMoveList();
    updateOpeningName();
    updateEval();
    updateClockDisplay();

    const status = C.getStatus(gameState);
    if (status.over) {
      endGame(status);
      return;
    }

    updateStatus();
    startClock(gameState.turn);

    // AI response
    if (opponentType === 'ai' && gameState.turn !== playerColor && !aiThinking) {
      const delay = 300 + Math.random()*400;
      setTimeout(aiMove, delay);
    }
  }

  // ── AI move ─────────────────────────────────────────────────────────────
  function aiMove() {
    if (!gameActive || !gameState) return;
    aiThinking = true;
    statusText.textContent = '💭 Computer is thinking…';

    // Use setTimeout to yield UI update
    setTimeout(() => {
      const move = Engine.getBestMove(gameState, aiLevel);
      aiThinking = false;
      if (!move || !gameActive) return;
      applyUserMove(move);
    }, 20);
  }

  // ── Clocks ────────────────────────────────────────────────────────────
  function startClock(color) {
    if (timeMinutes === 0) return; // unlimited
    clockActive = color;
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(() => {
      if (!gameActive || clockActive===null) return;
      clocks[clockActive] -= 100;
      if (clocks[clockActive] <= 0) {
        clocks[clockActive] = 0;
        stopClocks();
        endGame({ over:true, result: clockActive===C.WHITE?'0-1':'1-0', reason:'timeout' });
        return;
      }
      updateClockDisplay();
    }, 100);
  }
  function stopClock(color) {
    if (clockActive===color) {
      clockActive = null;
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }
  function stopClocks() {
    clockActive = null;
    clearInterval(clockInterval);
    clockInterval = null;
  }
  function updateClockDisplay() {
    const topColor  = playerColor===C.WHITE ? C.BLACK : C.WHITE;
    const botColor  = playerColor;

    $('clockTopTime').textContent    = formatTime(clocks[topColor]);
    $('clockBottomTime').textContent = formatTime(clocks[botColor]);

    const topEl  = $('clockTop');
    const botEl  = $('clockBottom');
    topEl.classList.toggle('active',  clockActive===topColor);
    botEl.classList.toggle('active',  clockActive===botColor);
    topEl.classList.toggle('low',     clocks[topColor]  < 10000 && clockActive===topColor);
    botEl.classList.toggle('low',     clocks[botColor] < 10000 && clockActive===botColor);
  }
  function formatTime(ms) {
    if (ms <= 0) return '0:00';
    const s = Math.ceil(ms/1000);
    const m = Math.floor(s/60);
    const sec = s%60;
    return m+':'+(sec<10?'0':'')+sec;
  }

  // ── End game ──────────────────────────────────────────────────────────
  function endGame(status) {
    gameActive = false;
    stopClocks();
    Board.init(gameState, null);
    Board.renderLastMove();

    const reasons = {
      'checkmate': 'by checkmate',
      'stalemate': 'by stalemate',
      'fifty-move': 'fifty-move rule',
      'repetition': 'threefold repetition',
      'insufficient': 'insufficient material',
      'timeout': 'on time',
      'resign': 'by resignation',
      'draw': 'by agreement'
    };

    const icon  = $('resultIcon');
    const title = $('resultTitle');
    const sub   = $('resultSub');

    if (status.result==='1/2-1/2') {
      icon.textContent  = '½';
      title.textContent = 'Draw!';
    } else if (status.result==='1-0') {
      icon.textContent  = '♔';
      title.textContent = 'White wins!';
    } else {
      icon.textContent  = '♚';
      title.textContent = 'Black wins!';
    }
    sub.textContent = reasons[status.reason] || '';

    setTimeout(()=>resultOverlay.classList.remove('hidden'), 600);
    statusText.textContent = title.textContent + ' ' + sub.textContent;
    turnIndicator.className = 'turn-indicator';

    // Play sound
    if (status.result==='1/2-1/2') playSound('generic');
    else if ((status.result==='1-0'&&playerColor===C.WHITE)||(status.result==='0-1'&&playerColor===C.BLACK)) playSound('win');
    else playSound('lose');

    addChatMsg('Game over: ' + title.textContent + ' ' + sub.textContent, 'system');
  }

  function resign() {
    if (!gameActive) return;
    const result = playerColor===C.WHITE ? '0-1' : '1-0';
    endGame({ over:true, result, reason:'resign' });
  }

  function offerDraw() {
    if (!gameActive) return;
    if (confirm('Offer a draw?')) endGame({ over:true, result:'1/2-1/2', reason:'draw' });
  }

  // ── Status update ──────────────────────────────────────────────────────
  function updateStatus() {
    if (!gameState || !gameActive) return;
    const status = C.getStatus(gameState);
    const side = gameState.turn===C.WHITE ? 'White' : 'Black';
    if (status.inCheck) {
      statusText.textContent = `${side} is in check!`;
    } else {
      statusText.textContent = `${side} to move`;
    }
    turnIndicator.className = 'turn-indicator ' + (gameState.turn===C.WHITE?'white':'black');
  }

  // ── Move list ──────────────────────────────────────────────────────────
  function updateMoveList() {
    moveList.innerHTML='';
    for (let i=0; i<sanHistory.length; i+=2) {
      const row=document.createElement('div');
      row.className='move-row';
      const num=document.createElement('span');
      num.className='move-num';
      num.textContent=(i/2+1)+'.';
      row.appendChild(num);

      const white=document.createElement('span');
      white.className='move-cell'+(moveViewIndex===i+1?' active':'');
      white.textContent=sanHistory[i]||'';
      white.dataset.moveIdx=i+1;
      white.addEventListener('click',()=>gotoMove(i+1));
      row.appendChild(white);

      if (sanHistory[i+1]!==undefined) {
        const black=document.createElement('span');
        black.className='move-cell'+(moveViewIndex===i+2?' active':'');
        black.textContent=sanHistory[i+1];
        black.dataset.moveIdx=i+2;
        black.addEventListener('click',()=>gotoMove(i+2));
        row.appendChild(black);
      }
      moveList.appendChild(row);
    }
    moveList.scrollTop=moveList.scrollHeight;
  }

  function gotoMove(n) {
    if (!gameState) return;
    n = Math.max(0, Math.min(n, sanHistory.length));
    moveViewIndex = n;

    // Rebuild a state at move n
    const s = C.makeState();
    C.loadFen(s, C.INITIAL_FEN);
    for (let i=0; i<n; i++) {
      const move = gameState.history[i]?.move;
      if (move) C.applyMove(s, move);
    }
    viewState = s;

    Board.init(viewState, n===sanHistory.length ? onPlayerMove : null);
    Board.setFlipped(playerColor===C.BLACK);
    if (n>0) {
      const last = viewState.history[viewState.history.length-1];
      if (last) {
        // Highlight last move
        Board.render(last.undo.from, last.undo.to);
      } else Board.renderLastMove();
    } else {
      Board.render();
    }
    updateMoveList();
    updateAnalysis(viewState);
  }

  // ── Opening name ──────────────────────────────────────────────────────
  function updateOpeningName() {
    if (!sanHistory.length) { openingName.textContent=''; return; }
    const name = Openings.lookup(sanHistory);
    openingName.textContent = name || '';
  }

  // ── Evaluation bar ─────────────────────────────────────────────────────
  function updateEval() {
    if (!gameState) return;
    const raw = Engine.getEval(gameState); // positive = white better
    // Clamp to ±10 pawns
    const clamped = Math.max(-1000, Math.min(1000, raw));
    // Convert to 0-100 percentage (50 = equal)
    const pct = 50 + (clamped / 1000) * 50;
    evalFill.style.width = pct + '%';
    const disp = Math.abs(raw/100).toFixed(1);
    evalText.textContent = raw > 0 ? `+${disp}` : raw < 0 ? `-${disp}` : '0.0';
    updateAnalysis(gameState);
  }

  function updateAnalysis(st) {
    if (!st) return;
    const raw = Engine.getEval(st);
    const disp = Math.abs(raw/100).toFixed(2);
    $('analysisEval').textContent = raw > 0 ? `+${disp}` : raw < 0 ? `-${disp}` : '0.0';
    $('analysisDepth').textContent = '3';

    // Best move suggestion
    const bm = Engine.getBestMove(st, Math.min(aiLevel, 5));
    if (bm) {
      const lm = C.generateMoves(st);
      $('analysisBestMove').textContent = C.moveToSan(st, bm, lm);
    } else {
      $('analysisBestMove').textContent = '—';
    }
    $('analysisMoveQuality').textContent = '—';
    $('pvLine').textContent = '';
  }

  // ── Player info display ───────────────────────────────────────────────
  function updatePlayerInfo() {
    const topColor    = playerColor===C.WHITE ? C.BLACK : C.WHITE;
    const bottomColor = playerColor;

    $('topAvatar').textContent    = topColor===C.WHITE ? '♔' : '♚';
    $('bottomAvatar').textContent = bottomColor===C.WHITE ? '♔' : '♚';

    const playerName = 'You';
    const oppName    = opponentType==='ai' ? `Computer (Lvl ${aiLevel})` : 'Opponent';

    if (playerColor===C.WHITE) {
      $('bottomName').textContent = playerName;
      $('topName').textContent    = oppName;
    } else {
      $('bottomName').textContent = playerName;
      $('topName').textContent    = oppName;
    }
    $('topRating').textContent    = opponentType==='ai' ? levelToRating(aiLevel) : '?';
    $('bottomRating').textContent = '1500';
  }

  function levelToRating(lvl) {
    return [800,1000,1200,1400,1600,1800,2000,2200][lvl-1]||1000;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab===name);
    });
    document.querySelectorAll('.tab-content').forEach(c=>{
      c.classList.toggle('active', c.id==='tab'+capitalize(name));
    });
  }
  function capitalize(s) { return s.charAt(0).toUpperCase()+s.slice(1); }

  // ── Chat ──────────────────────────────────────────────────────────────
  function sendChat() {
    const inp = $('chatInput');
    const msg = inp.value.trim();
    if (!msg) return;
    addChatMsg(msg, 'player');
    inp.value='';
    // AI responds
    if (opponentType==='ai') {
      setTimeout(()=>{
        const replies=['Good move!','Interesting…','I see…','Nice try!','Let\'s continue.',
          'Hmm, I\'ll have to think.','Well played.','You\'re good!','Challenge accepted.'];
        addChatMsg(replies[Math.floor(Math.random()*replies.length)], 'opponent');
      }, 600+Math.random()*800);
    }
  }
  function addChatMsg(text, type) {
    const div=document.createElement('div');
    div.className='chat-msg chat-msg--'+type;
    div.textContent=text;
    chatLog.appendChild(div);
    chatLog.scrollTop=chatLog.scrollHeight;
    switchTab('chat');
  }

  // ── Sound (Web Audio API tones) ────────────────────────────────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    return audioCtx;
  }
  function playTone(freq, duration, type='sine', gain=0.25) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.connect(vol); vol.connect(ctx.destination);
      osc.type = type; osc.frequency.value = freq;
      vol.gain.setValueAtTime(gain, ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+duration);
      osc.start(); osc.stop(ctx.currentTime+duration);
    } catch(e){}
  }
  function playMoveSound(move, stateAfter) {
    if (!soundEnabled) return;
    const status = C.getStatus(stateAfter);
    if (status.inCheck) { playTone(880,0.12,'square'); setTimeout(()=>playTone(660,0.12,'square'),100); }
    else if (move.flags==='castle-k'||move.flags==='castle-q') {
      playTone(440,0.1); setTimeout(()=>playTone(550,0.1),80);
    } else if (stateAfter.history.length && stateAfter.history[stateAfter.history.length-1].undo.captured) {
      playTone(330,0.15,'sawtooth',0.2);
    } else {
      playTone(520,0.08);
    }
  }
  function playSound(type) {
    if (type==='win') { playTone(523,0.15);setTimeout(()=>playTone(659,0.15),150);setTimeout(()=>playTone(784,0.3),300); }
    else if (type==='lose') { playTone(440,0.2);setTimeout(()=>playTone(349,0.2),200);setTimeout(()=>playTone(294,0.35),400); }
    else { playTone(440,0.1); }
  }

  // ── Toast notification ─────────────────────────────────────────────────
  function toast(msg) {
    const t=document.createElement('div');
    t.className='toast'; t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),2000);
  }

})();
