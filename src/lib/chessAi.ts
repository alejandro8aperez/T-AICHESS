import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export type Difficulty = 'easy' | 'medium' | 'hard';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Positional bonuses for pieces
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

function squareToIndex(sq: Square, color: Color): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  const row = color === 'w' ? 7 - rank : rank;
  return row * 8 + file;
}

/**
 * Evaluates board taking into consideration TAICHESS special squares (e4, e5)
 */
export function evaluateBoard(game: Chess, trackedPieces: Map<Square, { color: Color; type: 'b' | 'n' }>): number {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -99999 : 99999;
  }
  if (game.isDraw()) {
    return 0;
  }

  let score = 0;
  const board = game.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const sq = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
      const baseValue = PIECE_VALUES[piece.type];
      let positional = 0;

      if (piece.type === 'p') {
        positional = PAWN_TABLE[squareToIndex(sq, piece.color)];
      } else if (piece.type === 'n') {
        positional = KNIGHT_TABLE[squareToIndex(sq, piece.color)];
      }

      // TAICHESS bonus: Pieces occupying or controlling e4/e5 have tactical upgrade advantage!
      let taichessBonus = 0;
      if (sq === 'e4' || sq === 'e5') {
        if (piece.type === 'p') {
          taichessBonus = 120; // High incentive to reach e4/e5 for transformation
        } else if (trackedPieces.has(sq)) {
          taichessBonus = 180; // Potential upgrade into rook!
        }
      }

      const totalVal = baseValue + positional + taichessBonus;
      score += piece.color === 'w' ? totalVal : -totalVal;
    }
  }

  return score;
}

export function getAiBestMove(
  game: Chess,
  trackedPieces: Map<Square, { color: Color; type: 'b' | 'n' }>,
  difficulty: Difficulty
): { from: Square; to: Square; promotion?: PieceSymbol } | null {
  const legalMoves = game.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  // Easy: random or simple captures
  if (difficulty === 'easy') {
    const captures = legalMoves.filter((m) => m.captured);
    if (captures.length > 0 && Math.random() < 0.6) {
      const move = captures[Math.floor(Math.random() * captures.length)];
      return { from: move.from as Square, to: move.to as Square, promotion: move.promotion };
    }
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return { from: move.from as Square, to: move.to as Square, promotion: move.promotion };
  }

  // Medium (depth 1-2 evaluation with minimax/heuristics)
  // Hard (depth 3 minimax with alpha-beta pruning)
  const isMaximizing = game.turn() === 'w';
  const targetDepth = difficulty === 'hard' ? 3 : 2;

  let bestMove = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  // Shuffle moves first for variety among equally scored moves
  const shuffled = [...legalMoves].sort(() => Math.random() - 0.5);

  for (const move of shuffled) {
    const tempGame = new Chess(game.fen());
    tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

    // Track simulated state
    const tempTracked = new Map(trackedPieces);
    if (move.captured) {
      tempTracked.delete(move.to as Square);
    }
    const tr = tempTracked.get(move.from as Square);
    if (tr) {
      tempTracked.delete(move.from as Square);
      tempTracked.set(move.to as Square, tr);
    }

    const score = minimax(tempGame, tempTracked, targetDepth - 1, -Infinity, Infinity, !isMaximizing);

    if (isMaximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
  }

  return {
    from: bestMove.from as Square,
    to: bestMove.to as Square,
    promotion: (bestMove.promotion as PieceSymbol) || 'q',
  };
}

function minimax(
  game: Chess,
  trackedPieces: Map<Square, { color: Color; type: 'b' | 'n' }>,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluateBoard(game, trackedPieces);
  }

  const moves = game.moves({ verbose: true });

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const tempGame = new Chess(game.fen());
      tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

      const tempTracked = new Map(trackedPieces);
      const tr = tempTracked.get(move.from as Square);
      if (tr) {
        tempTracked.delete(move.from as Square);
        tempTracked.set(move.to as Square, tr);
      }

      const evaluation = minimax(tempGame, tempTracked, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const tempGame = new Chess(game.fen());
      tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

      const tempTracked = new Map(trackedPieces);
      const tr = tempTracked.get(move.from as Square);
      if (tr) {
        tempTracked.delete(move.from as Square);
        tempTracked.set(move.to as Square, tr);
      }

      const evaluation = minimax(tempGame, tempTracked, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}
