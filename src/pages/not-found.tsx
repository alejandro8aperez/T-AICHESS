import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="site" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: 28, marginBottom: 8 }}>404</h1>
        <p style={{ marginBottom: 16 }}>No hay una página en esta ruta.</p>
        <Link href="/" style={{ color: '#81b64c' }}>Volver a jugar</Link>
      </div>
    </div>
  );
}
