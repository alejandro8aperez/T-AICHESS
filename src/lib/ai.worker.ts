import { searchBestMove, type Difficulty } from "./chessAi";

type Request = { id: number; fen: string; difficulty: Difficulty; seen: string[] };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, fen, difficulty, seen } = e.data;
  try {
    scope.postMessage({ id, move: searchBestMove(fen, difficulty, seen) });
  } catch (error) {
    console.error("AI worker error:", error);
    scope.postMessage({ id, move: null });
  }
};
