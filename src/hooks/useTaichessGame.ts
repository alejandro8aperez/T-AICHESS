import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { sounds } from "@/lib/sound";
import { getAiBestMove, type Difficulty } from "@/lib/chessAi";

const BLUE_SQUARES = new Set<Square>(["e4", "e5"]);

export type PieceView = {
  square: Square;
  type: PieceSymbol;
  color: Color;
};

export type Choice = {
  piece: PieceSymbol;
  label: string;
  detail: string;
};

export type ChoiceReason =
  | "first-transform"
  | "return-transform"
  | "promotion";

export type PendingChoice = {
  square: Square;
  reason: ChoiceReason;
  choices: Choice[];
};

export type HistoryEntry = {
  san: string;
  color: Color;
  note?: string;
  fen?: string;
};

type TrackedPiece = {
  color: Color;
  type: "b" | "n";
};

type PendingMove = {
  from: Square;
  to: Square;
  reason: ChoiceReason;
  mover: Color;
  choices: Choice[];
};

type Snapshot = {
  fen: string;
  trackedPieces: [Square, TrackedPiece][];
  history: HistoryEntry[];
  lastMove: { from: Square; to: Square } | null;
};

export type GameMode = "pvp" | "ai" | "ai-vs-ai";
export type PlayerColor = "w" | "b";

function squareAt(row: number, column: number): Square {
  return `${String.fromCharCode(97 + column)}${8 - row}` as Square;
}

function colorName(color: Color) {
  return color === "w" ? "blancas" : "negras";
}

function findKingSquare(game: Chess, color: Color): Square | null {
  const board = game.board();

  for (let row = 0; row < board.length; row += 1) {
    for (let column = 0; column < board[row].length; column += 1) {
      const piece = board[row][column];
      if (piece?.type === "k" && piece.color === color) {
        return squareAt(row, column);
      }
    }
  }

  return null;
}

function transformationIsSafe(
  game: Chess,
  square: Square,
  color: Color,
  type: PieceSymbol,
) {
  const candidate = new Chess(game.fen());
  candidate.remove(square);

  if (!candidate.put({ type, color }, square)) {
    return false;
  }

  const kingSquare = findKingSquare(candidate, color);
  return (
    kingSquare !== null && !candidate.isAttacked(kingSquare, candidate.turn())
  );
}

function getTaichessLegalTargets(
  game: Chess,
  from: Square,
) {
  return game.moves({ square: from, verbose: true }).map((move) => move.to);
}

function getStatus(game: Chess) {
  if (game.isCheckmate()) {
    return `Jaque mate · ganan ${colorName(game.turn() === "w" ? "b" : "w")}`;
  }
  if (game.isStalemate()) {
    return "Tablas · rey ahogado";
  }
  if (game.isInsufficientMaterial()) {
    return "Tablas · material insuficiente";
  }
  if (game.isThreefoldRepetition()) {
    return "Tablas · triple repetición";
  }
  if (game.isDraw()) {
    return "Tablas";
  }
  if (game.isCheck()) {
    return `Jaque a las ${colorName(game.turn())}`;
  }
  return `Turno de ${colorName(game.turn())}`;
}

function firstTransformChoices(game: Chess, square: Square, color: Color) {
  const choices: Choice[] = [
    {
      piece: "p",
      label: "Mantener peón",
      detail: "Seguir jugando como peón",
    },
  ];

  if (transformationIsSafe(game, square, color, "b")) {
    choices.push({
      piece: "b",
      label: "Alfil",
      detail: "El peón se transforma en alfil",
    });
  }
  if (transformationIsSafe(game, square, color, "n")) {
    choices.push({
      piece: "n",
      label: "Caballo",
      detail: "El peón se transforma en caballo",
    });
  }

  return choices;
}

function returnTransformChoices(
  game: Chess,
  square: Square,
  color: Color,
  currentType: "b" | "n",
) {
  const currentName = currentType === "b" ? "alfil" : "caballo";
  const choices: Choice[] = [
    {
      piece: currentType,
      label: `Seguir como ${currentName}`,
      detail: `La pieza conserva su movimiento de ${currentName}`,
    },
  ];

  if (transformationIsSafe(game, square, color, "r")) {
    choices.push({
      piece: "r",
      label: "Convertir en torre",
      detail: "La pieza cambia a torre",
    });
  }

  return choices;
}

export function useTaichessGame() {
  const gameRef = useRef(new Chess());
  const trackedPiecesRef = useRef(new Map<Square, TrackedPiece>());
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const snapshotsRef = useRef<Snapshot[]>([]);

  const [revision, setRevision] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [viewHistoryIndex, setViewHistoryIndex] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  // Settings & Modes
  const [gameMode, setGameMode] = useState<GameMode>("ai");
  const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [aiSpeed, setAiSpeed] = useState<number>(600); // ms for PC vs PC
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiVsAiPaused, setIsAiVsAiPaused] = useState(false);

  const bumpRevision = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const saveSnapshot = useCallback(() => {
    snapshotsRef.current.push({
      fen: gameRef.current.fen(),
      trackedPieces: Array.from(trackedPiecesRef.current.entries()),
      history: [...history],
      lastMove,
    });
  }, [history, lastMove]);

  const recordMove = useCallback(
    (san: string, color: Color, note?: string) => {
      setHistory((current) => [
        ...current,
        { san, color, ...(note ? { note } : {}), fen: gameRef.current.fen() },
      ]);
      setViewHistoryIndex(null);
    },
    [],
  );

  const commitMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol) => {
      const game = gameRef.current;
      const movingPiece = game.get(from);
      if (!movingPiece) return;

      const mover = movingPiece.color;
      const legalTargets = getTaichessLegalTargets(game, from);
      if (!legalTargets.includes(to)) return;

      saveSnapshot();

      const targetPiece = game.get(to);
      const isCapture = Boolean(targetPiece);

      const isBishopOrKnight =
        movingPiece.type === "b" || movingPiece.type === "n";

      const arrivedAtBlueSquare =
        isBishopOrKnight &&
        !BLUE_SQUARES.has(from) &&
        BLUE_SQUARES.has(to);

      const committedMove = game.move({
        from,
        to,
        ...(promotion ? { promotion } : {}),
      });

      const capturedSquare =
        committedMove.isEnPassant() ? (`${to[0]}${from[1]}` as Square) : to;
      trackedPiecesRef.current.delete(capturedSquare);
      trackedPiecesRef.current.delete(from);

      setSelectedSquare(null);
      setLastMove({ from, to });
      recordMove(committedMove.san, mover);

      // Play appropriate sound
      if (game.isGameOver()) {
        sounds.playGameEnd();
      } else if (game.isCheck()) {
        sounds.playCheck();
      } else if (isCapture || committedMove.isEnPassant()) {
        sounds.playCapture();
      } else {
        sounds.playMove();
      }

      if (movingPiece.type === "p" && BLUE_SQUARES.has(to)) {
        const choices = firstTransformChoices(game, to, mover);
        const nextPending: PendingMove = {
          from,
          to,
          mover,
          reason: "first-transform",
          choices,
        };
        pendingMoveRef.current = nextPending;
        setPendingChoice({
          square: to,
          reason: "first-transform",
          choices,
        });
      }

      if (arrivedAtBlueSquare) {
        const choices = returnTransformChoices(
          game,
          to,
          mover,
          movingPiece.type as "b" | "n",
        );
        pendingMoveRef.current = {
          from,
          to,
          mover,
          reason: "return-transform",
          choices,
        };
        setPendingChoice({
          square: to,
          reason: "return-transform",
          choices,
        });
      }

      bumpRevision();
    },
    [bumpRevision, recordMove, saveSnapshot],
  );

  const choosePiece = useCallback(
    (piece: PieceSymbol) => {
      const pending = pendingMoveRef.current;
      if (!pending || !pending.choices.some((choice) => choice.piece === piece)) {
        return;
      }

      if (pending.reason === "promotion") {
        pendingMoveRef.current = null;
        setPendingChoice(null);
        commitMove(pending.from, pending.to, piece);
        return;
      }

      const game = gameRef.current;
      if (pending.reason === "return-transform") {
        const pieceOnSquare = game.get(pending.to);
        const currentType = (pieceOnSquare?.type === "b" || pieceOnSquare?.type === "n")
          ? pieceOnSquare.type
          : (pending.choices.find((c) => c.piece !== "r")?.piece as "b" | "n" || "b");

        if (piece === "r" && transformationIsSafe(game, pending.to, pending.mover, "r")) {
          game.remove(pending.to);
          game.put({ type: "r", color: pending.mover }, pending.to);
          sounds.playTransform();
          setHistory((current) =>
            current.map((entry, index) =>
              index === current.length - 1
                ? { ...entry, note: "TAICHESS · se convirtió en torre" }
                : entry,
            ),
          );
        } else if (piece === currentType) {
          const currentName = piece === "b" ? "alfil" : "caballo";
          setHistory((current) =>
            current.map((entry, index) =>
              index === current.length - 1
                ? { ...entry, note: `TAICHESS · se mantiene como ${currentName}` }
                : entry,
            ),
          );
        }
        pendingMoveRef.current = null;
        setPendingChoice(null);
        bumpRevision();
        return;
      }

      if (pending.reason === "first-transform") {
        if (piece === "b" || piece === "n") {
          game.remove(pending.to);
          game.put({ type: piece, color: pending.mover }, pending.to);
          trackedPiecesRef.current.set(pending.to, {
            color: pending.mover,
            type: piece,
          });
          sounds.playTransform();
          setHistory((current) =>
            current.map((entry, index) =>
              index === current.length - 1
                ? {
                    ...entry,
                    note: `TAICHESS · el peón se transformó en ${piece === "b" ? "alfil" : "caballo"}`,
                  }
                : entry,
            ),
          );
        }
      }

      pendingMoveRef.current = null;
      setPendingChoice(null);
      bumpRevision();
    },
    [bumpRevision, commitMove],
  );

  const onSquareClick = useCallback(
    (squareName: string) => {
      if (pendingChoice || gameRef.current.isGameOver() || isAiThinking || gameMode === "ai-vs-ai") return;
      if (viewHistoryIndex !== null) {
        setViewHistoryIndex(null); // return to live position on click
      }
      const square = squareName as Square;
      const game = gameRef.current;

      // In AI mode, prevent moving for AI turn
      if (gameMode === "ai" && game.turn() !== playerColor) {
        return;
      }

      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      if (selectedSquare) {
        const isLegalTarget = getTaichessLegalTargets(
          game,
          selectedSquare,
        ).includes(square);

        if (isLegalTarget) {
          const piece = game.get(selectedSquare);
          if (
            piece?.type === "p" &&
            ((piece.color === "w" && square.endsWith("8")) ||
              (piece.color === "b" && square.endsWith("1")))
          ) {
            const choices: Choice[] = [
              { piece: "q", label: "Reina", detail: "Promoción FIDE" },
              { piece: "r", label: "Torre", detail: "Promoción FIDE" },
              { piece: "b", label: "Alfil", detail: "Promoción FIDE" },
              { piece: "n", label: "Caballo", detail: "Promoción FIDE" },
            ];
            const move: PendingMove = {
              from: selectedSquare,
              to: square,
              mover: piece.color,
              reason: "promotion",
              choices,
            };
            pendingMoveRef.current = move;
            setPendingChoice({
              square,
              reason: "promotion",
              choices,
            });
            return;
          }

          commitMove(selectedSquare, square);
          return;
        }
      }

      const pieceOnSquare = game.get(square);
      if (pieceOnSquare?.color === game.turn()) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
    },
    [commitMove, gameMode, isAiThinking, pendingChoice, playerColor, selectedSquare, viewHistoryIndex],
  );

  // AI Turn handler (vs AI and PC vs PC)
  useEffect(() => {
    const game = gameRef.current;
    if (game.isGameOver()) return;

    if (gameMode === "ai-vs-ai") {
      if (isAiVsAiPaused || isAiThinking) return;

      if (pendingChoice) {
        const timer = setTimeout(() => {
          if (pendingChoice.reason === "first-transform") {
            const hasBishop = pendingChoice.choices.some((c) => c.piece === "b");
            choosePiece(hasBishop ? "b" : "n");
          } else if (pendingChoice.reason === "return-transform") {
            const hasRook = pendingChoice.choices.some((c) => c.piece === "r");
            choosePiece(hasRook ? "r" : pendingChoice.choices[0].piece);
          } else if (pendingChoice.reason === "promotion") {
            choosePiece("q");
          }
        }, 300);
        return () => clearTimeout(timer);
      }

      setIsAiThinking(true);
      const timer = setTimeout(() => {
        try {
          const move = getAiBestMove(gameRef.current, trackedPiecesRef.current, difficulty);
          if (move) {
            commitMove(move.from, move.to, move.promotion);
          }
        } catch (e) {
          console.error("AI vs AI error:", e);
        } finally {
          setIsAiThinking(false);
        }
      }, aiSpeed);

      return () => clearTimeout(timer);
    }

    if (gameMode === "ai") {
      if (isAiThinking) return;
      const aiColor = playerColor === "w" ? "b" : "w";

      if (pendingChoice) {
        if (pendingMoveRef.current?.mover === aiColor) {
          const timer = setTimeout(() => {
            if (pendingChoice.reason === "first-transform") {
              const hasBishop = pendingChoice.choices.some((c) => c.piece === "b");
              choosePiece(hasBishop ? "b" : "n");
            } else if (pendingChoice.reason === "return-transform") {
              const hasRook = pendingChoice.choices.some((c) => c.piece === "r");
              choosePiece(hasRook ? "r" : pendingChoice.choices[0].piece);
            } else if (pendingChoice.reason === "promotion") {
              choosePiece("q");
            }
          }, 350);
          return () => clearTimeout(timer);
        }
        return;
      }

      if (game.turn() === aiColor) {
        setIsAiThinking(true);
        const timer = setTimeout(() => {
          try {
            const move = getAiBestMove(gameRef.current, trackedPiecesRef.current, difficulty);
            if (move) {
              commitMove(move.from, move.to, move.promotion);
            }
          } catch (e) {
            console.error("AI turn error:", e);
          } finally {
            setIsAiThinking(false);
          }
        }, 300);

        return () => clearTimeout(timer);
      }
    }
  }, [revision, gameMode, playerColor, difficulty, pendingChoice, choosePiece, commitMove, isAiThinking, isAiVsAiPaused, aiSpeed]);

  const undoMove = useCallback(() => {
    if (snapshotsRef.current.length === 0 || isAiThinking || pendingChoice) return;

    const steps = gameMode === "ai" && snapshotsRef.current.length >= 2 ? 2 : 1;
    let targetSnapshot: Snapshot | undefined;

    for (let i = 0; i < steps; i++) {
      targetSnapshot = snapshotsRef.current.pop();
    }

    if (targetSnapshot) {
      gameRef.current = new Chess(targetSnapshot.fen);
      trackedPiecesRef.current = new Map(targetSnapshot.trackedPieces);
      setHistory(targetSnapshot.history);
      setLastMove(targetSnapshot.lastMove);
      setSelectedSquare(null);
      setPendingChoice(null);
      pendingMoveRef.current = null;
      setViewHistoryIndex(null);
      bumpRevision();
    }
  }, [bumpRevision, gameMode, isAiThinking, pendingChoice]);

  // Chess.com style Resign (Rendirse)
  const resign = useCallback((color: Color) => {
    if (gameRef.current.isGameOver()) return;
    sounds.playGameEnd();
    const winner = color === "w" ? "negras" : "blancas";
    recordMove("🏳️", color, `Rendición de ${colorName(color)} · ganan ${winner}`);
    // Clear legal moves by loading a synthetic checkmate position or setting state
    bumpRevision();
  }, [bumpRevision, recordMove]);

  const newGame = useCallback(() => {
    gameRef.current = new Chess();
    trackedPiecesRef.current.clear();
    pendingMoveRef.current = null;
    snapshotsRef.current = [];
    setSelectedSquare(null);
    setPendingChoice(null);
    setHistory([]);
    setLastMove(null);
    setIsAiThinking(false);
    setViewHistoryIndex(null);
    bumpRevision();
  }, [bumpRevision]);

  // Board display: support reviewing previous moves like chess.com
  const pieces = useMemo<PieceView[]>(() => {
    let boardState = gameRef.current;
    if (viewHistoryIndex !== null && history[viewHistoryIndex]?.fen) {
      try {
        boardState = new Chess(history[viewHistoryIndex].fen);
      } catch {
        boardState = gameRef.current;
      }
    }

    const board = boardState.board();
    return board.flatMap((row, rowIndex) =>
      row.flatMap((piece, columnIndex) =>
        piece
          ? [
              {
                square: squareAt(rowIndex, columnIndex),
                type: piece.type,
                color: piece.color,
              },
            ]
          : [],
      ),
    );
  }, [revision, viewHistoryIndex, history]);

  // Captured pieces and material score
  const { capturedWhite, capturedBlack, materialScore } = useMemo(() => {
    const counts: Record<Color, Record<PieceSymbol, number>> = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };

    const board = gameRef.current.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece) {
          counts[piece.color][piece.type]--;
        }
      }
    }

    const capturedW: PieceSymbol[] = [];
    const capturedB: PieceSymbol[] = [];
    const val: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let score = 0;

    for (const [type, count] of Object.entries(counts.w) as [PieceSymbol, number][]) {
      for (let i = 0; i < Math.max(0, count); i++) {
        capturedW.push(type);
        score -= val[type];
      }
    }

    for (const [type, count] of Object.entries(counts.b) as [PieceSymbol, number][]) {
      for (let i = 0; i < Math.max(0, count); i++) {
        capturedB.push(type);
        score += val[type];
      }
    }

    return {
      capturedWhite: capturedW,
      capturedBlack: capturedB,
      materialScore: score,
    };
  }, [revision]);

  const legalTargets = useMemo<string[]>(() => {
    if (!selectedSquare || pendingChoice || viewHistoryIndex !== null) return [];
    const game = gameRef.current;
    if (game.get(selectedSquare)?.color !== game.turn()) return [];
    return getTaichessLegalTargets(game, selectedSquare);
  }, [pendingChoice, revision, selectedSquare, viewHistoryIndex]);

  const game = gameRef.current;
  const kingInCheck = game.isCheck() ? findKingSquare(game, game.turn()) : null;

  const status = pendingChoice
    ? pendingChoice.reason === "promotion"
      ? "Elige la pieza de promoción"
      : pendingChoice.reason === "return-transform"
        ? "Elige cómo continúa la pieza"
        : "Elige cómo transformar el peón"
    : getStatus(game);

  // History navigation functions (like Chess.com)
  const navFirst = () => setViewHistoryIndex(history.length > 0 ? 0 : null);
  const navPrev = () => {
    if (viewHistoryIndex === null) {
      if (history.length > 0) setViewHistoryIndex(Math.max(0, history.length - 2));
    } else {
      setViewHistoryIndex(Math.max(0, viewHistoryIndex - 1));
    }
  };
  const navNext = () => {
    if (viewHistoryIndex !== null) {
      if (viewHistoryIndex + 1 >= history.length - 1) {
        setViewHistoryIndex(null);
      } else {
        setViewHistoryIndex(viewHistoryIndex + 1);
      }
    }
  };
  const navLast = () => setViewHistoryIndex(null);

  return {
    pieces,
    turn: game.turn(),
    selectedSquare,
    legalTargets,
    lastMove,
    history,
    viewHistoryIndex,
    setViewHistoryIndex,
    navFirst,
    navPrev,
    navNext,
    navLast,
    status,
    pendingChoice,
    isGameOver: !pendingChoice && game.isGameOver(),
    isCheck: game.isCheck(),
    kingInCheck,
    capturedWhite,
    capturedBlack,
    materialScore,
    gameMode,
    setGameMode,
    playerColor,
    setPlayerColor,
    difficulty,
    setDifficulty,
    aiSpeed,
    setAiSpeed,
    isAiThinking,
    isAiVsAiPaused,
    setIsAiVsAiPaused,
    onSquareClick,
    choosePiece,
    newGame,
    undoMove,
    resign,
    fen: game.fen(),
    pgn: game.pgn(),
    canUndo: snapshotsRef.current.length > 0 && !isAiThinking && !pendingChoice,
  };
}
