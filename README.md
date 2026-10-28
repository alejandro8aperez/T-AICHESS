# TAICHESS

Variante de ajedrez con reglas FIDE y una excepción en **e4** y **e5**. La interfaz se inspira en una partida de [Lichess](https://lichess.org/): tablero verde, barra oscura, relojes y lista de jugadas.

## Jugar en la web (gratis, GitHub Pages)

Cuando el despliegue esté activo:

**https://alejandro8aperez.github.io/T-AICHESS/**

En el repositorio, Settings → Pages debe usar **GitHub Actions** como origen. Cada push a `main` vuelve a publicar el sitio.

## Jugar en local

1. Instala Node.js 22 LTS (o Node.js 20.19 o posterior).
2. Ejecuta `start.bat` o, en una terminal:

```bat
cd /d C:\Postgres\T-AICHESS
npm install --legacy-peer-deps
npm run dev
```

3. Abre `http://localhost:5173`.

Las partidas no se guardan al recargar la página.
