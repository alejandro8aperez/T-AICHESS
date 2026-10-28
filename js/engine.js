/**
 * engine.js — Negamax alpha-beta AI chess engine with iterative deepening
 * Strength levels 1-8 controlled by depth and move-ordering quality.
 */

const Engine = (() => {
  const C = Chess;

  // ── Piece-square tables (from white's perspective, rank 0 = rank 1) ──
  const PST = {
    [C.PAWN]: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    [C.KNIGHT]: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50
    ],
    [C.BISHOP]: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20
    ],
    [C.ROOK]: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0
    ],
    [C.QUEEN]: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20
    ],
    [C.KING]: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20
    ]
  };

  const PIECE_VALUE = {
    [C.PAWN]:100, [C.KNIGHT]:320, [C.BISHOP]:330,
    [C.ROOK]:500, [C.QUEEN]:900,  [C.KING]:20000
  };

  function pstScore(piece, sq, color) {
    const pt = C.pieceOf(piece);
    const tbl = PST[pt];
    if (!tbl) return 0;
    const file = C.fileOf(sq);
    const rank = C.rankOf(sq);
    const r = color === C.WHITE ? (7-rank) : rank;
    return tbl[r*8 + file];
  }

  function evaluate(state) {
    let score = 0;
    const board = state.board;
    for (let sq=0; sq<128; sq++) {
      if (!C.isValid(sq)) continue;
      const p = board[sq];
      if (!p) continue;
      const color = C.colorOf(p);
      const val = PIECE_VALUE[C.pieceOf(p)] + pstScore(p, sq, color);
      score += color===C.WHITE ? val : -val;
    }
    return state.turn===C.WHITE ? score : -score;
  }

  // ── Move ordering ─────────────────────────────────────────────────────
  function mvvLva(state, move) {
    const board = state.board;
    const attacker = C.pieceOf(board[move.from]);
    const victim   = C.pieceOf(board[move.to]);
    if (!victim) return 0;
    return PIECE_VALUE[victim] * 10 - PIECE_VALUE[attacker];
  }

  function orderMoves(state, moves, ttMove) {
    return moves.sort((a,b) => {
      const aScore = (ttMove && a.from===ttMove.from && a.to===ttMove.to ? 10000 : 0)
                   + mvvLva(state,a) + (a.promo ? PIECE_VALUE[a.promo] : 0);
      const bScore = (ttMove && b.from===ttMove.from && b.to===ttMove.to ? 10000 : 0)
                   + mvvLva(state,b) + (b.promo ? PIECE_VALUE[b.promo] : 0);
      return bScore - aScore;
    });
  }

  // ── Transposition table ───────────────────────────────────────────────
  const TT = new Map();
  const TT_MAX = 500000;

  function ttStore(key, depth, score, flag, bestMove) {
    if (TT.size > TT_MAX) TT.clear();
    TT.set(key, { depth, score, flag, bestMove });
  }

  // ── Quiescence search ─────────────────────────────────────────────────
  function quiesce(state, alpha, beta) {
    const stand = evaluate(state);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    const captures = C.generateMoves(state, true);
    orderMoves(state, captures, null);

    for (const m of captures) {
      const undo = C.applyMove(state, m);
      const score = -quiesce(state, -beta, -alpha);
      C.undoMove(state, undo);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // ── Alpha-beta negamax ────────────────────────────────────────────────
  function negamax(state, depth, alpha, beta) {
    const key = C.toFen(state);
    const cached = TT.get(key);
    if (cached && cached.depth >= depth) {
      if (cached.flag==='exact') return cached.score;
      if (cached.flag==='lower' && cached.score >= beta) return cached.score;
      if (cached.flag==='upper' && cached.score <= alpha) return cached.score;
    }

    if (depth===0) return quiesce(state, alpha, beta);

    const status = C.getStatus(state);
    if (status.over) {
      if (status.reason==='checkmate') return -20000 - depth;
      return 0;
    }

    const moves = status.moves;
    const ttMove = cached?.bestMove;
    orderMoves(state, moves, ttMove);

    let bestScore = -Infinity;
    let bestMove  = null;
    let flag = 'upper';

    for (const m of moves) {
      const undo = C.applyMove(state, m);
      const score = -negamax(state, depth-1, -beta, -alpha);
      C.undoMove(state, undo);

      if (score > bestScore) {
        bestScore = score;
        bestMove  = m;
      }
      if (score > alpha) {
        alpha = score;
        flag  = 'exact';
      }
      if (alpha >= beta) {
        ttStore(key, depth, bestScore, 'lower', bestMove);
        return bestScore;
      }
    }

    ttStore(key, depth, bestScore, flag, bestMove);
    return bestScore;
  }

  // ── Level config ──────────────────────────────────────────────────────
  const LEVEL_CONFIG = {
    1: { depth:1, noise:300, searchAll:true  },
    2: { depth:1, noise:150, searchAll:true  },
    3: { depth:2, noise:100, searchAll:false },
    4: { depth:2, noise: 50, searchAll:false },
    5: { depth:3, noise: 30, searchAll:false },
    6: { depth:3, noise:  0, searchAll:false },
    7: { depth:4, noise:  0, searchAll:false },
    8: { depth:5, noise:  0, searchAll:false }
  };

  // ── Best move selection ───────────────────────────────────────────────
  function getBestMove(state, level) {
    const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG[5];
    const moves = C.generateMoves(state);
    if (!moves.length) return null;

    // Random for low levels
    if (cfg.searchAll) {
      if (cfg.noise > 200) return moves[Math.floor(Math.random()*moves.length)];
    }

    let bestMove = null;
    let bestScore = -Infinity;

    // Iterative deepening
    for (let d=1; d<=cfg.depth; d++) {
      let depthBest = null;
      let depthScore = -Infinity;
      let alpha = -Infinity, beta = Infinity;

      const ordered = [...moves];
      if (bestMove) orderMoves(state, ordered, bestMove);

      for (const m of ordered) {
        const undo = C.applyMove(state, m);
        const score = -negamax(state, d-1, -beta, -alpha);
        C.undoMove(state, undo);

        // Add noise for weaker levels
        const noisy = score + (Math.random()*2-1)*cfg.noise;
        if (noisy > depthScore) {
          depthScore = noisy;
          depthBest  = m;
        }
        if (noisy > alpha) alpha = noisy;
      }
      if (depthBest) { bestMove = depthBest; bestScore = depthScore; }
    }

    return bestMove;
  }

  // ── Evaluation for analysis ───────────────────────────────────────────
  function getEval(state) {
    const raw = evaluate(state);
    // Invert so positive = white advantage always
    return state.turn===C.WHITE ? raw : -raw;
  }

  function getPvLine(state, depth) {
    const moves = [];
    const s2 = C.makeState();
    C.loadFen(s2, C.toFen(state));
    for (let d=0; d<depth; d++) {
      const m = getBestMove(s2, Math.min(6, depth));
      if (!m) break;
      const lm = C.generateMoves(s2);
      const san = C.moveToSan(s2, m, lm);
      moves.push(san);
      C.applyMove(s2, m);
      const st = C.getStatus(s2);
      if (st.over) break;
    }
    return moves.join(' ');
  }

  return { getBestMove, getEval, getPvLine, PIECE_VALUE };
})();
