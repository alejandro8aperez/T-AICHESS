/**
 * chess.js — Complete chess rules engine (no dependencies)
 * Covers: move generation, make/undo, FEN, PGN, check/mate/stalemate,
 *         castling, en passant, promotion, repetition, 50-move rule.
 */

const Chess = (() => {

  // ── Piece constants ──────────────────────────────────────────────────
  const EMPTY = 0;
  const PAWN=1, KNIGHT=2, BISHOP=3, ROOK=4, QUEEN=5, KING=6;
  const WHITE=8, BLACK=16;
  const WP=WHITE|PAWN, WN=WHITE|KNIGHT, WB=WHITE|BISHOP,
        WR=WHITE|ROOK, WQ=WHITE|QUEEN, WK=WHITE|KING;
  const BP=BLACK|PAWN, BN=BLACK|KNIGHT, BB=BLACK|BISHOP,
        BR=BLACK|ROOK, BQ=BLACK|QUEEN, BK=BLACK|KING;

  const PIECE_MASK = 7;
  const COLOR_MASK = 24;
  const pieceOf = p => p & PIECE_MASK;
  const colorOf = p => p & COLOR_MASK;
  const opponent = c => c === WHITE ? BLACK : WHITE;

  // Unicode glyphs
  const GLYPHS = {
    [WP]:'♙',[WN]:'♘',[WB]:'♗',[WR]:'♖',[WQ]:'♕',[WK]:'♔',
    [BP]:'♟',[BN]:'♞',[BB]:'♝',[BR]:'♜',[BQ]:'♛',[BK]:'♚'
  };
  const PIECE_LETTERS = { [PAWN]:'P',[KNIGHT]:'N',[BISHOP]:'B',[ROOK]:'R',[QUEEN]:'Q',[KING]:'K' };
  const LETTER_PIECE  = {'P':PAWN,'N':KNIGHT,'B':BISHOP,'R':ROOK,'Q':QUEEN,'K':KING};

  // ── Board representation: 0×88 ───────────────────────────────────────
  // Index: rank*16 + file  (0..7 valid, 8..15 off-board sentinel)
  function idx(file, rank) { return rank * 16 + file; }
  function rankOf(sq)  { return sq >> 4; }
  function fileOf(sq)  { return sq & 0xF; }
  function isValid(sq) { return !(sq & 0x88); }
  function sqName(sq)  {
    return 'abcdefgh'[fileOf(sq)] + (rankOf(sq)+1);
  }
  function sqFromName(s) {
    return idx('abcdefgh'.indexOf(s[0]), parseInt(s[1])-1);
  }

  // Directions
  const DIAG   = [-17,-15,15,17];
  const ORTHO  = [-16,-1,1,16];
  const ALL8   = [-17,-16,-15,-1,1,15,16,17];
  const KNIGHT_DIRS = [-33,-31,-18,-14,14,18,31,33];

  // ── Game state ────────────────────────────────────────────────────────
  function makeState() {
    return {
      board: new Uint8Array(128),
      turn: WHITE,
      castling: { [WHITE]: {k:true,q:true}, [BLACK]: {k:true,q:true} },
      ep: -1,           // en passant target square (-1 = none)
      halfmove: 0,      // 50-move rule counter
      fullmove: 1,
      history: [],      // move objects for undo
      positionCounts: {},
      kings: { [WHITE]: idx(4,0), [BLACK]: idx(4,7) }
    };
  }

  // ── FEN ───────────────────────────────────────────────────────────────
  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function loadFen(state, fen) {
    fen = fen || INITIAL_FEN;
    const parts = fen.split(' ');
    const rows  = parts[0].split('/');

    state.board.fill(0);
    state.kings = { [WHITE]:-1, [BLACK]:-1 };

    for (let rank=7; rank>=0; rank--) {
      let file=0;
      for (const c of rows[7-rank]) {
        if ('12345678'.includes(c)) { file+=parseInt(c); }
        else {
          const upper = c.toUpperCase();
          const color = c === upper ? WHITE : BLACK;
          const piece = LETTER_PIECE[upper];
          const sq = idx(file, rank);
          state.board[sq] = color | piece;
          if (piece === KING) state.kings[color] = sq;
          file++;
        }
      }
    }

    state.turn = parts[1] === 'w' ? WHITE : BLACK;

    const cast = parts[2] || '-';
    state.castling = {
      [WHITE]: { k: cast.includes('K'), q: cast.includes('Q') },
      [BLACK]: { k: cast.includes('k'), q: cast.includes('q') }
    };

    state.ep = parts[3] && parts[3] !== '-' ? sqFromName(parts[3]) : -1;
    state.halfmove  = parseInt(parts[4]) || 0;
    state.fullmove  = parseInt(parts[5]) || 1;
    state.history   = [];
    state.positionCounts = {};
    recordPosition(state);
  }

  function toFen(state) {
    let rows=[];
    for (let rank=7; rank>=0; rank--) {
      let row='', empty=0;
      for (let file=0; file<8; file++) {
        const p = state.board[idx(file,rank)];
        if (p===EMPTY) { empty++; }
        else {
          if (empty) { row+=empty; empty=0; }
          const letter = PIECE_LETTERS[pieceOf(p)];
          row += colorOf(p)===WHITE ? letter : letter.toLowerCase();
        }
      }
      if (empty) row+=empty;
      rows.push(row);
    }
    const boardStr = rows.reverse().join('/');
    const turn = state.turn===WHITE ? 'w' : 'b';
    const cw = state.castling[WHITE], cb = state.castling[BLACK];
    const castStr = (cw.k?'K':'')+(cw.q?'Q':'')+(cb.k?'k':'')+(cb.q?'q':'') || '-';
    const ep = state.ep !== -1 ? sqName(state.ep) : '-';
    return `${boardStr} ${turn} ${castStr} ${ep} ${state.halfmove} ${state.fullmove}`;
  }

  // ── Move generation ───────────────────────────────────────────────────
  function generateMoves(state, onlyCaptures=false) {
    const moves=[];
    const color = state.turn;
    const opp   = opponent(color);
    const board = state.board;

    for (let sq=0; sq<128; sq++) {
      if (!isValid(sq)) continue;
      const p = board[sq];
      if (!p || colorOf(p)!==color) continue;
      const pt = pieceOf(p);

      if (pt===PAWN) {
        const dir  = color===WHITE ? 16 : -16;
        const start= color===WHITE ? 1 : 6;
        const promo= color===WHITE ? 7 : 0;
        const rank = rankOf(sq);

        // Pushes
        if (!onlyCaptures) {
          const fwd = sq+dir;
          if (isValid(fwd) && !board[fwd]) {
            if (rankOf(fwd)===promo) {
              for (const pp of [QUEEN,ROOK,BISHOP,KNIGHT])
                moves.push(makeMove(sq,fwd,pp));
            } else {
              moves.push(makeMove(sq,fwd));
              // double push
              if (rank===start) {
                const fwd2=fwd+dir;
                if (!board[fwd2]) moves.push(makeMove(sq,fwd2));
              }
            }
          }
        }

        // Captures (diagonals)
        for (const dcap of [dir-1, dir+1]) {
          const to = sq+dcap;
          if (!isValid(to)) continue;
          const target = board[to];
          if (target && colorOf(target)===opp) {
            if (rankOf(to)===promo) {
              for (const pp of [QUEEN,ROOK,BISHOP,KNIGHT])
                moves.push(makeMove(sq,to,pp));
            } else {
              moves.push(makeMove(sq,to));
            }
          }
          // en passant
          if (to===state.ep) moves.push({from:sq,to,flags:'ep',promo:0});
        }

      } else if (pt===KNIGHT) {
        for (const d of KNIGHT_DIRS) {
          const to=sq+d;
          if (!isValid(to)) continue;
          const t=board[to];
          if (!t || colorOf(t)===opp) {
            if (!onlyCaptures || t) moves.push(makeMove(sq,to));
          }
        }

      } else if (pt===KING) {
        for (const d of ALL8) {
          const to=sq+d;
          if (!isValid(to)) continue;
          const t=board[to];
          if (!t || colorOf(t)===opp) {
            if (!onlyCaptures || t) moves.push(makeMove(sq,to));
          }
        }
        // Castling
        if (!onlyCaptures) {
          const backRank = color===WHITE ? 0 : 7;
          const kingSq   = idx(4, backRank);
          if (sq===kingSq && !isInCheck(state, color)) {
            // King-side
            if (state.castling[color].k &&
                !board[idx(5,backRank)] && !board[idx(6,backRank)] &&
                !isSquareAttacked(state,idx(5,backRank),opp) &&
                !isSquareAttacked(state,idx(6,backRank),opp)) {
              moves.push({from:sq,to:idx(6,backRank),flags:'castle-k',promo:0});
            }
            // Queen-side
            if (state.castling[color].q &&
                !board[idx(3,backRank)] && !board[idx(2,backRank)] && !board[idx(1,backRank)] &&
                !isSquareAttacked(state,idx(3,backRank),opp) &&
                !isSquareAttacked(state,idx(2,backRank),opp)) {
              moves.push({from:sq,to:idx(2,backRank),flags:'castle-q',promo:0});
            }
          }
        }

      } else {
        // Slider: Bishop, Rook, Queen
        const dirs = pt===BISHOP ? DIAG : pt===ROOK ? ORTHO : ALL8;
        for (const d of dirs) {
          let to=sq+d;
          while (isValid(to)) {
            const t=board[to];
            if (t) {
              if (colorOf(t)===opp) moves.push(makeMove(sq,to));
              break;
            }
            if (!onlyCaptures) moves.push(makeMove(sq,to));
            to+=d;
          }
        }
      }
    }

    // Filter illegal (own king left in check)
    return moves.filter(m => isLegal(state, m));
  }

  function makeMove(from, to, promo=0) {
    return { from, to, promo, flags:'' };
  }

  function isLegal(state, move) {
    const undo = applyMove(state, move);
    const color = undo.color;
    const inCheck = isInCheck(state, color);
    undoMove(state, undo);
    return !inCheck;
  }

  // ── Apply / Undo ──────────────────────────────────────────────────────
  function applyMove(state, move) {
    const { from, to, promo, flags } = move;
    const board = state.board;
    const moving = board[from];
    const color  = colorOf(moving);
    const pt     = pieceOf(moving);
    const captured = board[to];

    const undo = {
      from, to, promo, flags,
      moving, captured,
      color,
      prevEp:   state.ep,
      prevCast: JSON.parse(JSON.stringify(state.castling)),
      prevHalf: state.halfmove,
      prevKings:{ ...state.kings }
    };

    // Move piece
    board[to]   = moving;
    board[from] = EMPTY;
    state.ep    = -1;

    // Special flags
    if (flags==='ep') {
      const capSq = color===WHITE ? to-16 : to+16;
      undo.epCapSq   = capSq;
      undo.epCaptured= board[capSq];
      board[capSq]   = EMPTY;
    } else if (flags==='castle-k') {
      const r = idx(7, rankOf(from));
      board[idx(5,rankOf(from))] = board[r];
      board[r] = EMPTY;
      undo.rookFrom = r;
      undo.rookTo   = idx(5,rankOf(from));
    } else if (flags==='castle-q') {
      const r = idx(0, rankOf(from));
      board[idx(3,rankOf(from))] = board[r];
      board[r] = EMPTY;
      undo.rookFrom = r;
      undo.rookTo   = idx(3,rankOf(from));
    }

    // Promotion
    if (promo) board[to] = color | promo;

    // King position
    if (pt===KING) {
      state.kings[color] = to;
      state.castling[color].k = false;
      state.castling[color].q = false;
    }

    // Rook moves kill castling rights
    if (pt===ROOK) {
      if (color===WHITE) {
        if (from===idx(7,0)) state.castling[WHITE].k=false;
        if (from===idx(0,0)) state.castling[WHITE].q=false;
      } else {
        if (from===idx(7,7)) state.castling[BLACK].k=false;
        if (from===idx(0,7)) state.castling[BLACK].q=false;
      }
    }
    // If rook captured on its home square
    if (to===idx(7,0)) state.castling[WHITE].k=false;
    if (to===idx(0,0)) state.castling[WHITE].q=false;
    if (to===idx(7,7)) state.castling[BLACK].k=false;
    if (to===idx(0,7)) state.castling[BLACK].q=false;

    // En passant square
    if (pt===PAWN && Math.abs(to-from)===32) {
      state.ep = (from+to)>>1;
    }

    // 50-move rule
    if (pt===PAWN || captured || flags==='ep') state.halfmove=0;
    else state.halfmove++;

    if (color===BLACK) state.fullmove++;
    state.turn = opponent(color);

    recordPosition(state);
    state.history.push({move, undo});
    return undo;
  }

  function undoMove(state, undo) {
    const { from, to, flags, moving, captured, color,
            prevEp, prevCast, prevHalf, prevKings } = undo;
    const board = state.board;

    state.turn     = color;
    state.ep       = prevEp;
    state.castling = prevCast;
    state.halfmove = prevHalf;
    state.kings    = prevKings;
    if (color===BLACK) state.fullmove--;

    board[from] = moving;
    board[to]   = captured;

    if (flags==='ep') {
      board[undo.epCapSq] = undo.epCaptured;
      board[to] = EMPTY;
    } else if (flags==='castle-k' || flags==='castle-q') {
      board[undo.rookFrom] = board[undo.rookTo];
      board[undo.rookTo]   = EMPTY;
    }

    if (state.history.length && state.history[state.history.length-1].undo===undo)
      state.history.pop();

    unrecordPosition(state);
  }

  // ── Check detection ───────────────────────────────────────────────────
  function isInCheck(state, color) {
    return isSquareAttacked(state, state.kings[color], opponent(color));
  }

  function isSquareAttacked(state, sq, byColor) {
    const board = state.board;
    // Pawns
    const pawnDir = byColor===WHITE ? 1 : -1;
    for (const d of [-1,1]) {
      const from = sq + pawnDir*16 + d;
      if (isValid(from)) {
        const p=board[from];
        if (p && colorOf(p)===byColor && pieceOf(p)===PAWN) return true;
      }
    }
    // Knights
    for (const d of KNIGHT_DIRS) {
      const f=sq+d;
      if (!isValid(f)) continue;
      const p=board[f];
      if (p && colorOf(p)===byColor && pieceOf(p)===KNIGHT) return true;
    }
    // Sliders
    for (const d of DIAG) {
      let f=sq+d;
      while (isValid(f)) {
        const p=board[f];
        if (p) {
          if (colorOf(p)===byColor && (pieceOf(p)===BISHOP||pieceOf(p)===QUEEN)) return true;
          break;
        }
        f+=d;
      }
    }
    for (const d of ORTHO) {
      let f=sq+d;
      while (isValid(f)) {
        const p=board[f];
        if (p) {
          if (colorOf(p)===byColor && (pieceOf(p)===ROOK||pieceOf(p)===QUEEN)) return true;
          break;
        }
        f+=d;
      }
    }
    // King
    for (const d of ALL8) {
      const f=sq+d;
      if (!isValid(f)) continue;
      const p=board[f];
      if (p && colorOf(p)===byColor && pieceOf(p)===KING) return true;
    }
    return false;
  }

  // ── Game status ────────────────────────────────────────────────────────
  function getStatus(state) {
    const moves = generateMoves(state);
    const inCheck = isInCheck(state, state.turn);

    if (!moves.length) {
      return inCheck ? { over:true, result: opponent(state.turn)===WHITE?'1-0':'0-1', reason:'checkmate' }
                     : { over:true, result:'1/2-1/2', reason:'stalemate' };
    }
    if (state.halfmove >= 100) return { over:true, result:'1/2-1/2', reason:'fifty-move' };
    if (isThreefoldRepetition(state)) return { over:true, result:'1/2-1/2', reason:'repetition' };
    if (isInsufficientMaterial(state)) return { over:true, result:'1/2-1/2', reason:'insufficient' };

    return { over:false, inCheck, moves };
  }

  function isInsufficientMaterial(state) {
    let wPieces=[], bPieces=[];
    for (let sq=0; sq<128; sq++) {
      if (!isValid(sq)) continue;
      const p=state.board[sq];
      if (!p) continue;
      const pt=pieceOf(p);
      if (pt===PAWN||pt===ROOK||pt===QUEEN) return false;
      if (colorOf(p)===WHITE && pt!==KING) wPieces.push(pt);
      if (colorOf(p)===BLACK && pt!==KING) bPieces.push(pt);
    }
    if (!wPieces.length && !bPieces.length) return true;
    if (!wPieces.length && bPieces.length===1) return true;
    if (!bPieces.length && wPieces.length===1) return true;
    return false;
  }

  // ── Position hashing / repetition ────────────────────────────────────
  function positionKey(state) {
    return toFen(state).split(' ').slice(0,4).join(' ');
  }
  function recordPosition(state) {
    const key=positionKey(state);
    state.positionCounts[key]=(state.positionCounts[key]||0)+1;
  }
  function unrecordPosition(state) {
    const key=positionKey(state);
    if (state.positionCounts[key]) state.positionCounts[key]--;
  }
  function isThreefoldRepetition(state) {
    return (state.positionCounts[positionKey(state)]||0)>=3;
  }

  // ── Move to SAN ────────────────────────────────────────────────────────
  function moveToSan(state, move, legalMoves) {
    const { from, to, promo, flags } = move;
    if (flags==='castle-k') return 'O-O';
    if (flags==='castle-q') return 'O-O-O';

    const board = state.board;
    const moving = board[from];
    const pt = pieceOf(moving);
    const color = colorOf(moving);
    const opp = opponent(color);

    let san='';
    if (pt===PAWN) {
      if (fileOf(from)!==fileOf(to)) {
        san='abcdefgh'[fileOf(from)]+'x';
      }
      san += sqName(to);
      if (promo) san+='='+ PIECE_LETTERS[promo];
    } else {
      san = PIECE_LETTERS[pt];
      // Disambiguation
      const ambig = (legalMoves||generateMoves(state)).filter(m=>
        m.from!==from && board[m.from] && pieceOf(board[m.from])===pt &&
        colorOf(board[m.from])===color && m.to===to
      );
      if (ambig.length) {
        const sameFile = ambig.some(m=>fileOf(m.from)===fileOf(from));
        const sameRank = ambig.some(m=>rankOf(m.from)===rankOf(from));
        if (!sameFile) san+='abcdefgh'[fileOf(from)];
        else if (!sameRank) san+=(rankOf(from)+1);
        else san+=sqName(from);
      }
      if (board[to] && colorOf(board[to])===opp) san+='x';
      if (flags==='ep') san+='x';
      san+=sqName(to);
    }

    // Check / checkmate
    const undo = applyMove(state, move);
    const nextStatus = getStatus(state);
    undoMove(state, undo);

    if (!nextStatus.over && nextStatus.inCheck) san+='+'
    else if (nextStatus.over && nextStatus.reason==='checkmate') san+='#';

    return san;
  }

  // ── PGN ───────────────────────────────────────────────────────────────
  function toPgn(state, meta={}) {
    const s2 = makeState();
    loadFen(s2, INITIAL_FEN);
    let pgn='';
    const tags = {
      Event: meta.event||'T-AICHESS Game',
      Site:  'T-AICHESS',
      Date:  new Date().toISOString().slice(0,10).replace(/-/g,'.'),
      White: meta.white||'White',
      Black: meta.black||'Black',
      Result:meta.result||'*',
      ...( meta.extra||{} )
    };
    for (const [k,v] of Object.entries(tags)) pgn+=`[${k} "${v}"]\n`;
    pgn+='\n';

    const moves = state.history.map(h=>h.move);
    for (let i=0; i<moves.length; i++) {
      const m = moves[i];
      const lm = generateMoves(s2);
      const san = moveToSan(s2, m, lm);
      if (s2.turn===WHITE) pgn+=`${s2.fullmove}. `;
      pgn+=san+' ';
      applyMove(s2,m);
    }
    pgn+=tags.Result;
    return pgn.trim();
  }

  // ── Moves for a square (for highlight) ─────────────────────────────────
  function movesFrom(state, sq) {
    return generateMoves(state).filter(m=>m.from===sq);
  }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    WHITE, BLACK, EMPTY,
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    WP, WN, WB, WR, WQ, WK,
    BP, BN, BB, BR, BQ, BK,
    GLYPHS, PIECE_LETTERS, LETTER_PIECE,
    pieceOf, colorOf, opponent,
    idx, rankOf, fileOf, isValid, sqName, sqFromName,
    makeState, loadFen, toFen,
    generateMoves, applyMove, undoMove,
    isInCheck, isSquareAttacked, getStatus,
    moveToSan, movesFrom,
    toPgn, INITIAL_FEN
  };
})();
