import { useCallback, useMemo, useRef, useState } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

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
  const [revision, setRevision] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastMove, setLastMove] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const bumpRevision = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const recordMove = useCallback(
    (san: string, color: Color, note?: string) => {
      setHistory((current) => [...current, { san, color, ...(note ? { note } : {}) }]);
    },
    [],
  );

  const commitMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol) => {
      const game = gameRef.current;
      const movingPiece = game.get(from);
      if (!movingPiece) return;

      const mover = movingPiece.color;
      const trackedPiece = trackedPiecesRef.current.get(from);
      const legalTargets = getTaichessLegalTargets(game, from);
      if (!legalTargets.includes(to)) return;

      const returnedToBlueSquare =
        trackedPiece !== undefined &&
        !BLUE_SQUARES.has(from) &&
        BLUE_SQUARES.has(to);

      const committedMove = game.move({
        from,
        to,
        ...(promotion ? { promotion } : {}),
      });

      const capturedSquare =
        committedMove.isEnPassant() ? `${to[0]}${from[1]}` as Square : to;
      trackedPiecesRef.current.delete(capturedSquare);
      trackedPiecesRef.current.delete(from);
      if (trackedPiece) {
        trackedPiecesRef.current.set(to, trackedPiece);
      }

      setSelectedSquare(null);
      setLastMove({ from, to });
      recordMove(committedMove.san, mover);

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

      if (returnedToBlueSquare && trackedPiece) {
        const choices = returnTransformChoices(
          game,
          to,
          mover,
          trackedPiece.type,
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
    [bumpRevision, recordMove],
  );

  const onSquareClick = useCallback(
    (squareName: string) => {
      if (pendingChoice || gameRef.current.isGameOver()) return;
      const square = squareName as Square;
      const game = gameRef.current;

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
    [commitMove, pendingChoice, selectedSquare],
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
        const trackedPiece = trackedPiecesRef.current.get(pending.to);
        if (trackedPiece && (piece === "r" || piece === trackedPiece.type)) {
          if (
            piece === "r" &&
            transformationIsSafe(game, pending.to, pending.mover, "r")
          ) {
            game.remove(pending.to);
            game.put({ type: "r", color: pending.mover }, pending.to);
            trackedPiecesRef.current.delete(pending.to);
            setHistory((current) =>
              current.map((entry, index) =>
                index === current.length - 1
                  ? { ...entry, note: "TAICHESS · se convirtió en torre" }
                  : entry,
              ),
            );
          } else if (piece === trackedPiece.type) {
            const currentName = piece === "b" ? "alfil" : "caballo";
            setHistory((current) =>
              current.map((entry, index) =>
                index === current.length - 1
                  ? { ...entry, note: `TAICHESS · se mantiene como ${currentName}` }
                  : entry,
              ),
            );
          }
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

  const newGame = useCallback(() => {
    gameRef.current = new Chess();
    trackedPiecesRef.current.clear();
    pendingMoveRef.current = null;
    setSelectedSquare(null);
    setPendingChoice(null);
    setHistory([]);
    setLastMove(null);
    bumpRevision();
  }, [bumpRevision]);

  const pieces = useMemo<PieceView[]>(() => {
    const board = gameRef.current.board();
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
  }, [revision]);

  const legalTargets = useMemo<string[]>(() => {
    if (!selectedSquare || pendingChoice) return [];
    const game = gameRef.current;
    if (game.get(selectedSquare)?.color !== game.turn()) return [];
    return getTaichessLegalTargets(
      game,
      selectedSquare,
    );
  }, [pendingChoice, revision, selectedSquare]);

  const game = gameRef.current;
  const status = pendingChoice
    ? pendingChoice.reason === "promotion"
      ? "Elige la pieza de promoción"
      : pendingChoice.reason === "return-transform"
        ? "Elige cómo continúa la pieza"
        : "Elige cómo transformar el peón"
    : getStatus(game);

  return {
    pieces,
    turn: game.turn(),
    selectedSquare,
    legalTargets,
    lastMove,
    history,
    status,
    pendingChoice,
    isGameOver: !pendingChoice && game.isGameOver(),
    onSquareClick,
    choosePiece,
    newGame,
  };
}
