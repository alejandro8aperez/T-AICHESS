import { searchBestMove, type AiMove, type Difficulty } from "./chessAi";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (move: AiMove | null) => void>();

function resolveAll(move: AiMove | null) {
  pending.forEach((resolve) => resolve(move));
  pending.clear();
}

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; move: AiMove | null }>) => {
      const resolve = pending.get(e.data.id);
      if (resolve) {
        pending.delete(e.data.id);
        resolve(e.data.move);
      }
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      resolveAll(null);
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Pide la jugada a la IA en un Web Worker para no congelar la interfaz. */
export function requestAiMove(fen: string, difficulty: Difficulty, seen: string[]): Promise<AiMove | null> {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve) => setTimeout(() => resolve(searchBestMove(fen, difficulty, seen)), 0));
  }
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    w.postMessage({ id, fen, difficulty, seen });
  });
}

/** Cancela la búsqueda en curso (cambio de modo, nueva partida, deshacer…). */
export function cancelAiRequests() {
  if (!worker && pending.size === 0) return;
  worker?.terminate();
  worker = null;
  resolveAll(null);
}
