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
  return Math.min(63, Math.max(0, row * 8 + file));
}

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

      let taichessBonus = 0;
      if (sq === 'e4' || sq === 'e5') {
        if (piece.type === 'p') {
          taichessBonus = 120; // High incentive for pawn to reach e4/e5
        } else if (piece.type === 'b' || piece.type === 'n') {
          taichessBonus = 180; // Potential upgrade into rook
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
  try {
    const legalMoves = game.moves({ verbose: true });
    if (!legalMoves || legalMoves.length === 0) return null;

    // Variety in opening moves: if moves <= 4, pick randomly among top central/good moves
    const moveCount = game.history().length;
    if (moveCount < 3 && Math.random() < 0.75) {
      // Good opening moves
      const goodOpenings = legalMoves.filter((m) =>
        ['e4', 'd4', 'c4', 'Nf3', 'e5', 'd5', 'c5', 'Nf6', 'Nc6', 'Nc3'].some((s) => m.san.startsWith(s))
      );
      if (goodOpenings.length > 0) {
        const pick = goodOpenings[Math.floor(Math.random() * goodOpenings.length)];
        return { from: pick.from as Square, to: pick.to as Square, promotion: pick.promotion };
      }
    }

    if (difficulty === 'easy') {
      const captures = legalMoves.filter((m) => m.captured);
      if (captures.length > 0 && Math.random() < 0.5) {
        const move = captures[Math.floor(Math.random() * captures.length)];
        return { from: move.from as Square, to: move.to as Square, promotion: move.promotion };
      }
      const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return { from: move.from as Square, to: move.to as Square, promotion: move.promotion };
    }

    const isMaximizing = game.turn() === 'w';
    const maxDepth = difficulty === 'hard' ? 2 : 1;

    // Shuffle moves first so equally scored moves create different games!
    const shuffledMoves = [...legalMoves].sort(() => Math.random() - 0.5);

    const scoredMoves: { move: typeof legalMoves[0]; score: number }[] = [];

    for (const move of shuffledMoves) {
      const tempGame = new Chess(game.fen());
      tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

      // Add a small random jitter (+-4 points) to prevent robotic repetitive games
      const jitter = (Math.random() - 0.5) * 8;
      const score = (maxDepth === 1
        ? evaluateBoard(tempGame, trackedPieces)
        : evaluateMinimax(tempGame, trackedPieces, 1, -Infinity, Infinity, !isMaximizing)) + jitter;

      scoredMoves.push({ move, score });
    }

    // Sort by best score
    scoredMoves.sort((a, b) => isMaximizing ? b.score - a.score : a.score - b.score);

    // Pick among the top 2-3 best moves for realistic variety
    const topCandidates = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
    const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)].move;

    return {
      from: chosen.from as Square,
      to: chosen.to as Square,
      promotion: (chosen.promotion as PieceSymbol) || 'q',
    };
  } catch (err) {
    console.error('Error generating AI move:', err);
    const moves = game.moves({ verbose: true });
    if (moves.length > 0) {
      const fallback = moves[Math.floor(Math.random() * moves.length)];
      return { from: fallback.from as Square, to: fallback.to as Square, promotion: fallback.promotion };
    }
    return null;
  }
}

function evaluateMinimax(
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
  const candidateMoves = moves.slice(0, 18);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of candidateMoves) {
      const tempGame = new Chess(game.fen());
      tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      const evaluation = evaluateBoard(tempGame, trackedPieces);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of candidateMoves) {
      const tempGame = new Chess(game.fen());
      tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      const evaluation = evaluateBoard(tempGame, trackedPieces);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}
