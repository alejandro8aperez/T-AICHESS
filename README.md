# TAICHESS para Windows

Esta es una copia independiente del código fuente de TAICHESS. No necesita PostgreSQL: las partidas se juegan localmente en el navegador.

## Instalar y ejecutar

1. Extrae la carpeta `T-AICHESS` en `C:\Postgres\T-AICHESS`.
2. Instala Node.js 22 LTS (o Node.js 20.19 o posterior) si aún no está instalado.
3. Haz doble clic en `start.bat`. La primera ejecución descarga las dependencias.
4. Cuando Vite indique que está listo, abre `http://localhost:5173`.

También puedes ejecutarlo desde una terminal:

```bat
cd /d C:\Postgres\T-AICHESS
npm install --legacy-peer-deps
npm run dev
```

Las partidas no se guardan al cerrar o recargar la página.
