import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useTaichessGame, type PieceView } from '@/hooks/useTaichessGame';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const INITIAL_CLOCK_MS = 10 * 60 * 1000;
const pieceName: Record<PieceView['type'], string> = {
  k: 'rey',
  q: 'reina',
  r: 'torre',
  b: 'alfil',
  n: 'caballo',
  p: 'peón',
};
const pieceGlyph: Record<PieceView['type'], { w: string; b: string }> = {
  k: { w: '♔', b: '♚' },
  q: { w: '♕', b: '♛' },
  r: { w: '♖', b: '♜' },
  b: { w: '♗', b: '♝' },
  n: { w: '♘', b: '♞' },
  p: { w: '♙', b: '♟' },
};

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function KnightMark() {
  return (
    <svg className="logo-knight" viewBox="0 0 40 40" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 34h24v3H8zm4.2-3.2c.6-4.4 2.4-7.4 5.6-10.2-2.2-1.1-4.3-2.8-5.2-5.5-.5-1.6-.4-3.3.4-4.8.7 1.8 2.2 3 4.1 3.4-.7-2.6.2-5.2 2.4-6.8 1.2-.9 2.7-1.3 4.2-1.2-.8 1.6-.6 3.5.5 4.9 1.3 1.6 3.4 2.2 5.4 1.7-.4 2.3-1.6 4.3-3.4 5.7 3.1 1.6 5.4 4.5 6.2 8 .3 1.4.4 2.9.3 4.8H12.2z"
      />
    </svg>
  );
}

function Game() {
  const {
    pieces,
    turn,
    selectedSquare,
    legalTargets,
    lastMove,
    history,
    status,
    pendingChoice,
    isGameOver,
    onSquareClick,
    choosePiece,
    newGame,
  } = useTaichessGame();
  const [flipped, setFlipped] = useState(false);
  const [whiteMs, setWhiteMs] = useState(INITIAL_CLOCK_MS);
  const [blackMs, setBlackMs] = useState(INITIAL_CLOCK_MS);

  useEffect(() => {
    if (isGameOver || pendingChoice) return undefined;
    const id = window.setInterval(() => {
      const setter = turn === 'w' ? setWhiteMs : setBlackMs;
      setter((ms) => Math.max(0, ms - 100));
    }, 100);
    return () => window.clearInterval(id);
  }, [turn, isGameOver, pendingChoice]);

  const startNewGame = () => {
    newGame();
    setWhiteMs(INITIAL_CLOCK_MS);
    setBlackMs(INITIAL_CLOCK_MS);
  };

  const pieceAt = (square: string) => pieces.find((piece) => piece.square === square);
  const groupedHistory = Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => ({
    number: index + 1,
    white: history[index * 2],
    black: history[index * 2 + 1],
  }));
  const isWhiteTurn = turn === 'w';
  const turnName = isWhiteTurn ? 'Blancas' : 'Negras';
  const choiceColor =
    pendingChoice?.reason === 'promotion'
      ? turn
      : turn === 'w'
        ? 'b'
        : 'w';
  const choiceTitle =
    pendingChoice?.reason === 'promotion'
      ? 'Elige la promoción'
      : pendingChoice?.reason === 'return-transform'
        ? 'Decide cómo continúa'
        : 'Elige la primera forma';
  const choiceCopy =
    pendingChoice?.reason === 'promotion'
      ? 'El peón llegó a la última fila. Selecciona la pieza de promoción.'
      : pendingChoice?.reason === 'return-transform'
        ? pendingChoice.choices.some((choice) => choice.piece === 'r')
          ? 'Tu alfil o caballo llegó a una casilla azul. Puedes conservarlo o convertirlo en torre.'
          : 'Puedes conservar esta pieza como alfil o caballo. Convertirla en torre dejaría a tu rey en jaque.'
        : 'El peón llegó a una casilla azul. Puedes mantenerlo o transformarlo en alfil o caballo.';

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const fileOrder = flipped ? [...files].reverse() : files;
  const topColor = flipped ? 'w' : 'b';
  const bottomColor = flipped ? 'b' : 'w';

  const renderClock = (color: 'w' | 'b') => {
    const ms = color === 'w' ? whiteMs : blackMs;
    const active = !isGameOver && !pendingChoice && turn === color;
    const low = ms <= 30_000;
    return (
      <div className={`rclock ${active ? 'active' : ''} ${low ? 'low' : ''}`} aria-live="polite">
        {formatClock(ms)}
      </div>
    );
  };

  const renderPlayer = (color: 'w' | 'b') => (
    <div className="ruser">
      <span className={`dot ${color === 'w' ? 'white' : 'black'}`} />
      <span className="uname">{color === 'w' ? 'Blancas' : 'Negras'}</span>
      <span className="rating">{color === 'w' ? 'local' : 'local'}</span>
    </div>
  );

  return (
    <main className="site">
      <header className="site-header">
        <a className="brand" href="#play" aria-label="TAICHESS">
          <KnightMark />
          <span>taichess</span>
        </a>
        <nav className="topnav" aria-label="Principal">
          <a className="active" href="#play">Jugar</a>
          <a href="#variante">Variante</a>
        </nav>
        <div className="header-meta">ajedrez · 10+0 · 2 jugadores</div>
      </header>

      <div className="round" id="play">
        <section className="board-column" aria-label="Tablero de ajedrez">
          <div className="player-strip mobile-only">
            {renderPlayer(topColor)}
            {renderClock(topColor)}
          </div>
          <div className="board-wrap">
            <div className="board-grid" role="grid" aria-label="Tablero TAICHESS">
              {ranks.map((rank, row) =>
                fileOrder.map((file, col) => {
                  const square = `${file}${rank}`;
                  const piece = pieceAt(square);
                  const isLight = (row + col) % 2 === 0;
                  const special = square === 'e4' || square === 'e5';
                  const isLastMove = lastMove?.from === square || lastMove?.to === square;
                  const isTarget = legalTargets.includes(square);
                  const squareClasses = [
                    'square',
                    isLight ? 'light' : 'dark',
                    special ? 'special-square' : '',
                    selectedSquare === square ? 'selected' : '',
                    isTarget ? 'legal-target' : '',
                    piece && isTarget ? 'has-piece' : '',
                    isLastMove ? 'last-move' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      key={square}
                      type="button"
                      role="gridcell"
                      aria-label={`${square}${special ? ', casilla de transformación' : ''}${piece ? `, ${piece.color === 'w' ? 'pieza blanca' : 'pieza negra'} ${pieceName[piece.type]}` : ''}`}
                      aria-pressed={selectedSquare === square}
                      data-testid={`square-${square}`}
                      className={squareClasses}
                      onClick={() => onSquareClick(square)}
                    >
                      {special && <span className="special-label">T</span>}
                      {piece && <span className={`piece ${piece.color === 'w' ? 'white' : 'black'}`}>{pieceGlyph[piece.type][piece.color]}</span>}
                      {col === 0 && <span className="coord rank">{rank}</span>}
                      {row === 7 && <span className="coord file">{file}</span>}
                    </button>
                  );
                }),
              )}
            </div>
            {pendingChoice && (
              <div className="choice-backdrop" role="presentation">
                <section className="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choice-heading" data-testid="choice-dialog">
                  <div className="choice-eyebrow">{pendingChoice.square} · decisión TAICHESS</div>
                  <h3 id="choice-heading">{choiceTitle}</h3>
                  <p className="choice-description">{choiceCopy}</p>
                  <div className="choice-options">
                    {pendingChoice.choices.map((choice) => (
                      <button
                        type="button"
                        key={choice.piece}
                        className="choice-option"
                        data-testid={`choose-${choice.piece}`}
                        onClick={() => choosePiece(choice.piece)}
                      >
                        <span className="choice-piece">{pieceGlyph[choice.piece][choiceColor]}</span>
                        <span>
                          <span className="choice-label">{choice.label}</span>
                          <span className="choice-detail">{choice.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
          <div className="player-strip mobile-only">
            {renderPlayer(bottomColor)}
            {renderClock(bottomColor)}
          </div>
        </section>

        <aside className="table-column">
          <div className="table-clock desktop-only">{renderClock(topColor)}</div>
          <div className="table-user desktop-only">{renderPlayer(topColor)}</div>

          <div className="rmoves" data-testid="move-history" aria-labelledby="history-heading">
            <div className="rmoves-head">
              <h2 id="history-heading">Jugadas</h2>
              <span data-testid="history-count">{history.length}</span>
            </div>
            <div className="rmoves-list">
              {groupedHistory.length === 0 ? (
                <p className="history-empty">Selecciona una pieza y luego su destino.</p>
              ) : groupedHistory.map((row) => (
                <div className="move-row" key={row.number} data-testid={`move-row-${row.number}`}>
                  <span className="move-number">{row.number}</span>
                  <span className="move-san">{row.white?.san ?? '—'}</span>
                  <span className="move-san">{row.black?.san ?? ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rcontrols">
            <p className="status-message" data-testid="status-message">
              {status || (isGameOver ? 'Partida terminada' : `Juegan ${turnName.toLowerCase()}`)}
            </p>
            <div className="rcontrols-buttons">
              <button type="button" data-testid="button-new-game" className="btn-primary" onClick={startNewGame}>
                Nueva partida
              </button>
              <button type="button" className="btn-ghost" onClick={() => setFlipped((value) => !value)}>
                Girar tablero
              </button>
            </div>
          </div>

          <div className="table-user desktop-only">{renderPlayer(bottomColor)}</div>
          <div className="table-clock desktop-only">{renderClock(bottomColor)}</div>

          <section className="variant-card" id="variante" aria-labelledby="rules-heading">
            <h2 id="rules-heading">Variante TAICHESS</h2>
            <p>
              Mismas reglas FIDE, con una excepción: un peón que llega a <strong>e4</strong> o <strong>e5</strong> puede seguir como peón o transformarse en alfil o caballo. Si esa pieza sale y vuelve a esas casillas, puedes conservarla o convertirla en torre.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Game} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
