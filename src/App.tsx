import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useTaichessGame, type PieceView } from '@/hooks/useTaichessGame';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="Taichess home">
          <div className="brand-mark" aria-hidden="true">T</div>
          <div>
            <div className="brand-name">TAICHESS</div>
          <div className="brand-caption">AJEDREZ · REGLAS FIDE +</div>
          </div>
        </div>
          <div className="club-stamp"><span className="stamp-dot" /> PARTIDA LOCAL <span>·</span> DOS JUGADORES</div>
      </header>

      <div className="main-layout">
        <section className="board-column fade-in" aria-label="Tablero de ajedrez">
          <div className="intro">
            <div>
              <div className="eyebrow">Ajedrez clásico. Nuevas posibilidades.</div>
              <h1>Haz tu jugada.<br /><span>Cambia el tablero.</span></h1>
            </div>
            <div className="board-tag">TABLERO CLÁSICO / 01</div>
          </div>
          <div className="board-frame">
            <div className="board-grid" role="grid" aria-label="Tablero TAICHESS">
              {Array.from({ length: 8 }, (_, row) =>
                Array.from({ length: 8 }, (_, col) => {
                  const rank = 8 - row;
                  const square = `${files[col]}${rank}`;
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
                       {special && <span className="special-label">{square === 'e4' ? 'CAMBIO' : 'CAMBIO'}</span>}
                      {piece && <span className={`piece ${piece.color === 'w' ? 'white' : 'black'}`}>{pieceGlyph[piece.type][piece.color]}</span>}
                      {col === 0 && <span className="rank-label">{rank}</span>}
                      {row === 7 && <span className="file-label">{files[col]}</span>}
                    </button>
                  );
                }),
              )}
            </div>
            <div className="board-foot">
              <span>e4 / e5 · casillas azules</span>
              <span>8 × 8 · reglas FIDE</span>
            </div>
          </div>
        </section>

        <aside className="side-column fade-in delay-1">
          <section className="status-card" aria-label="Game status">
            <div className="status-top">
              <span className="status-kicker">{isGameOver ? 'Partida finalizada' : 'Partida en curso'}</span>
              <span className="turn-indicator">
                <span className={`turn-chip ${isWhiteTurn ? 'white-turn' : 'black-turn'}`} />
                {isGameOver ? 'Posición final' : `Juegan ${turnName.toLowerCase()}`}
              </span>
            </div>
            <h2 className="status-message" data-testid="status-message">{status || (isGameOver ? 'Game over' : `${turnName} to move`)}</h2>
            <p className="status-sub">
              {isGameOver
                ? 'Revisa la posición y comienza otra partida cuando quieras.'
                : 'Dos personas en el mismo dispositivo. Pasen el turno después de cada jugada.'}
            </p>
            <div className="action-row">
              <div className="turn-name">
                <small>Turno de</small>
                {turnName}
              </div>
              <button type="button" data-testid="button-new-game" className="new-game" onClick={newGame}>Nueva partida</button>
            </div>
          </section>

          <section className="info-panel" aria-labelledby="rules-heading">
            <div className="panel-heading">
              <h2 id="rules-heading">Regla TAICHESS</h2>
              <span className="panel-meta">01 / regla especial</span>
            </div>
            <div className="rule-card">
              <div className="rule-symbol" aria-hidden="true">↗</div>
              <div>
                <div className="rule-title">Dos casillas. Nuevas estrategias.</div>
                <div className="rule-copy">
                  Un peón que llega a <strong>e4</strong> o <strong>e5</strong> puede seguir como peón o transformarse en alfil o caballo. Si esa pieza sale de la zona azul y vuelve a e4 o e5, puedes elegir conservarla o convertirla en torre. El resto sigue las reglas FIDE.
                </div>
              </div>
            </div>
          </section>

          <section className="history-section fade-in delay-2" aria-labelledby="history-heading">
            <div className="panel-heading">
              <h2 id="history-heading">Historial</h2>
              <span className="panel-meta" data-testid="history-count">{history.length} {history.length === 1 ? 'JUGADA' : 'JUGADAS'}</span>
            </div>
            <div className="history-list" data-testid="move-history" aria-live="polite">
              {groupedHistory.length === 0 ? (
                <div className="history-empty">
                  <div><span>La primera jugada espera</span>Selecciona una pieza y luego su destino.</div>
                </div>
              ) : groupedHistory.map((row) => (
                <div className="move-row" key={row.number} data-testid={`move-row-${row.number}`}>
                  <span className="move-number">{String(row.number).padStart(2, '0')}.</span>
                  <span className="move-san">{row.white?.san ?? '—'}</span>
                  <span className="move-san" style={{ textAlign: 'right' }}>{row.black?.san ?? ''}</span>
                  {(row.white?.note || row.black?.note) && <span className="move-note">{row.white?.note || row.black?.note}</span>}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {pendingChoice && (
        <div className="choice-backdrop" role="presentation">
          <section className="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choice-heading" data-testid="choice-dialog">
            <div className="choice-eyebrow">{pendingChoice.square} / decisión TAICHESS</div>
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
                  <span className="choice-arrow" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
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
