import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type AiMove = {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  /** Pieza en la que debe quedar la casilla azul (e4/e5) tras la jugada, si aplica la regla TAICHESS. */
  transform?: PieceSymbol;
  score: number;
  depth: number;
};

const BLUE = new Set<string>(['e4', 'e5']);
const MATE = 100000;
const INF = 1e9;

const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Tablas posicionales (perspectiva blancas, índice 0 = a8).
const PST: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const KING_ENDGAME = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

/** Evaluación estática desde el punto de vista del bando que mueve. */
export function evaluate(game: Chess): number {
  const board = game.board();
  let whiteNonPawn = 0;
  let blackNonPawn = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === 'p' || p.type === 'k') continue;
      if (p.color === 'w') {
        whiteNonPawn += VALUE[p.type];
        if (p.type === 'b') whiteBishops++;
      } else {
        blackNonPawn += VALUE[p.type];
        if (p.type === 'b') blackBishops++;
      }
    }
  }

  const endgame = whiteNonPawn <= 1300 && blackNonPawn <= 1300;
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const idx = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const table = p.type === 'k' && endgame ? KING_ENDGAME : PST[p.type];
      const v = VALUE[p.type] + table[idx];
      score += p.color === 'w' ? v : -v;
    }
  }

  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;

  return game.turn() === 'w' ? score : -score;
}

// ─────────────────────── Adaptador de jugadas (rápido) ───────────────────────
// chess.js en modo público calcula el SAN de cada jugada (≈2 ms por nodo). Sus rutinas
// internas generan/deshacen jugadas ~100× más rápido, así que se usan si existen y, si una
// versión futura las cambia, se cae a la API pública (más lenta pero equivalente).

type Raw = {
  color: Color;
  from: number;
  to: number;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  flags: number;
};

type M = {
  from: Square;
  to: Square;
  piece: PieceSymbol;
  color: Color;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  raw?: Raw;
};

type Internals = {
  _moves(o: { legal: boolean }): Raw[];
  _makeMove(m: Raw): void;
  _undoMove(): unknown;
};

const FILES = 'abcdefgh';
const sq0x88 = (s: number) => `${FILES[s & 7]}${8 - (s >> 4)}` as Square;

const FAST = (() => {
  try {
    const probe = new Chess() as unknown as Partial<Internals>;
    return (
      typeof probe._moves === 'function' &&
      typeof probe._makeMove === 'function' &&
      typeof probe._undoMove === 'function' &&
      probe._moves({ legal: true }).length === 20
    );
  } catch {
    return false;
  }
})();

function genMoves(game: Chess): M[] {
  let moves: M[];
  if (FAST) {
    moves = (game as unknown as Internals)._moves({ legal: true }).map((r) => ({
      from: sq0x88(r.from),
      to: sq0x88(r.to),
      piece: r.piece,
      color: r.color,
      captured: r.captured,
      promotion: r.promotion,
      raw: r,
    }));
  } else {
    moves = game.moves({ verbose: true }).map((v) => ({
      from: v.from,
      to: v.to,
      piece: v.piece,
      color: v.color,
      captured: v.captured,
      promotion: v.promotion,
    }));
  }
  return moves.filter((m) => !m.promotion || m.promotion === 'q');
}

function doMove(game: Chess, m: M) {
  if (FAST && m.raw) (game as unknown as Internals)._makeMove(m.raw);
  else game.move({ from: m.from, to: m.to, promotion: m.promotion });
}

function undoMove(game: Chess) {
  if (FAST) (game as unknown as Internals)._undoMove();
  else game.undo();
}

// ───────────────────────── Transformaciones TAICHESS ─────────────────────────

type TransformKind = 'first' | 'return' | null;

function transformKind(m: M): TransformKind {
  if (m.piece === 'p' && BLUE.has(m.to) && !m.promotion) return 'first';
  if ((m.piece === 'b' || m.piece === 'n') && !BLUE.has(m.from) && BLUE.has(m.to)) return 'return';
  return null;
}

function findKing(game: Chess, color: Color): Square | null {
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p?.type === 'k' && p.color === color) return `${FILES[c]}${8 - r}` as Square;
    }
  }
  return null;
}

/** Posición resultante de cambiar la pieza en `square`, o null si deja al rey propio en jaque. */
function withPiece(fen: string, square: Square, type: PieceSymbol, color: Color): Chess | null {
  const tmp = new Chess(fen);
  tmp.remove(square);
  if (!tmp.put({ type, color }, square)) return null;
  const king = findKing(tmp, color);
  if (!king || tmp.isAttacked(king, tmp.turn())) return null;
  // Se recarga desde FEN: chess.js cachea movimientos y revertiría la pieza.
  return new Chess(tmp.fen());
}

// ───────────────────────────────── Búsqueda ──────────────────────────────────

type Ctx = { deadline: number; nodes: number; stop: boolean };

function tick(ctx: Ctx) {
  if ((++ctx.nodes & 127) === 0 && performance.now() > ctx.deadline) ctx.stop = true;
}

function orderScore(m: M): number {
  let s = 0;
  if (m.captured) s += 10000 + 10 * VALUE[m.captured] - VALUE[m.piece];
  if (m.promotion) s += 9000;
  if (transformKind(m)) s += 8000;
  return s;
}

function orderedMoves(game: Chess): M[] {
  const moves = genMoves(game);
  const keyed = moves.map((m) => ({ m, k: orderScore(m) }));
  keyed.sort((a, b) => b.k - a.k);
  return keyed.map((x) => x.m);
}

function quiesce(game: Chess, alpha: number, beta: number, ply: number, ctx: Ctx, qd: number): number {
  tick(ctx);
  if (ctx.stop) return 0;

  const inCheck = game.isCheck();
  let best = -INF;
  let moves = orderedMoves(game);

  if (inCheck) {
    if (moves.length === 0) return -MATE + ply;
  } else {
    const stand = evaluate(game);
    if (stand >= beta) return stand;
    best = stand;
    if (stand > alpha) alpha = stand;
    if (qd >= 5) return stand;
    moves = moves.filter((m) => m.captured || m.promotion);
  }

  for (const m of moves) {
    doMove(game, m);
    const score = -quiesce(game, -beta, -alpha, ply + 1, ctx, qd + 1);
    undoMove(game);
    if (ctx.stop) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(game: Chess, depth: number, alpha: number, beta: number, ply: number, ctx: Ctx): number {
  tick(ctx);
  if (ctx.stop) return 0;

  if (depth <= 0) return quiesce(game, alpha, beta, ply, ctx, 0);

  const moves = orderedMoves(game);
  if (moves.length === 0) return game.isCheck() ? -MATE + ply : 0;

  let best = -INF;
  for (const m of moves) {
    const { score } = playMove(game, m, depth - 1, alpha, beta, ply, ctx);
    if (ctx.stop) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Juega `m` y devuelve su valor desde el punto de vista de quien mueve.
 * Si la jugada activa la regla TAICHESS (peón a e4/e5, alfil/caballo que llega a e4/e5),
 * evalúa también cada transformación posible y se queda con la mejor.
 */
function playMove(
  game: Chess,
  m: M,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: Ctx,
): { score: number; piece?: PieceSymbol } {
  doMove(game, m);
  const kind = transformKind(m);

  let bestScore = -INF;
  let bestPiece: PieceSymbol | undefined;

  const consider = (child: Chess, piece: PieceSymbol | undefined) => {
    const a = Math.max(alpha, bestScore);
    const score = -negamax(child, depth, -beta, -a, ply + 1, ctx);
    if (score > bestScore) {
      bestScore = score;
      bestPiece = piece;
    }
  };

  if (!kind) {
    consider(game, undefined);
  } else {
    const afterFen = game.fen();
    const alternatives: PieceSymbol[] = kind === 'first' ? ['b', 'n'] : ['r'];
    const keep: PieceSymbol = kind === 'first' ? 'p' : m.piece;
    consider(game, keep);
    for (const alt of alternatives) {
      if (ctx.stop || bestScore >= beta) break;
      const child = withPiece(afterFen, m.to, alt, m.color);
      if (child) consider(child, alt);
    }
  }

  undoMove(game);
  return { score: bestScore, piece: bestPiece };
}

// ─────────────────────────────── API pública ────────────────────────────────

type Config = { maxDepth: number; timeMs: number; margin: number; openingMargin: number };

const CONFIG: Record<Difficulty, Config> = {
  easy: { maxDepth: 1, timeMs: 300, margin: 140, openingMargin: 140 },
  medium: { maxDepth: 3, timeMs: 700, margin: 15, openingMargin: 40 },
  hard: { maxDepth: 8, timeMs: 1800, margin: 0, openingMargin: 12 },
};

/** Clave de posición para detectar repeticiones (FEN sin contadores). */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function searchBestMove(fen: string, difficulty: Difficulty, seen: string[] = []): AiMove | null {
  const game = new Chess(fen);
  let rootMoves = orderedMoves(game);
  if (rootMoves.length === 0) return null;

  const cfg = CONFIG[difficulty];
  const fullMove = parseInt(fen.split(' ')[5] ?? '1', 10) || 1;
  const margin = fullMove <= 4 ? Math.max(cfg.margin, cfg.openingMargin) : cfg.margin;
  const ctx: Ctx = { deadline: performance.now() + cfg.timeMs, nodes: 0, stop: false };

  const seenCount = new Map<string, number>();
  for (const k of seen) seenCount.set(k, (seenCount.get(k) ?? 0) + 1);

  type Scored = { move: M; score: number; piece?: PieceSymbol };
  let completed: Scored[] = [];
  let reachedDepth = 0;

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    const scored: Scored[] = [];
    let best = -INF;

    for (const m of rootMoves) {
      const alpha = Math.max(best - margin - 1, -INF);
      const { score: raw, piece } = playMove(game, m, depth - 1, alpha, INF, 0, ctx);
      if (ctx.stop) break;

      let score = raw;
      // Si la jugada completa una triple repetición, se trata como tablas.
      doMove(game, m);
      const repeats = seenCount.get(positionKey(game.fen())) ?? 0;
      undoMove(game);
      if (repeats >= 2) score = 0;

      scored.push({ move: m, score, piece });
      if (score > best) best = score;
    }

    if (ctx.stop) {
      if (completed.length === 0 && scored.length > 0) completed = scored;
      break;
    }

    completed = scored;
    reachedDepth = depth;
    scored.sort((a, b) => b.score - a.score);
    rootMoves = scored.map((s) => s.move);
    if (best >= MATE - 100) break; // mate encontrado
  }

  if (completed.length === 0) {
    const m = rootMoves[0];
    return { from: m.from, to: m.to, promotion: m.promotion, score: 0, depth: 0 };
  }

  completed.sort((a, b) => b.score - a.score);
  const top = completed[0].score;
  const pool = completed.filter((s) => s.score >= top - margin);
  const pick = pool[Math.floor(Math.random() * pool.length)];

  return {
    from: pick.move.from,
    to: pick.move.to,
    promotion: pick.move.promotion,
    transform: pick.piece,
    score: pick.score,
    depth: reachedDepth,
  };
}
