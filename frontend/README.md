# RouteWise frontend

React 19 + TypeScript 6 on Vite 8, with MapLibre GL 6 and deck.gl 9.4 for the map. See the [root README](../README.md) for what the app does and how the pieces fit.

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api to http://localhost:8000
npm test             # Vitest + Testing Library
npm run lint         # oxlint
npm run format       # Prettier
npm run build        # tsc -b && vite build
npm run api:types    # regenerate src/api/schema.d.ts from openapi.yml
```

`openapi.yml` is exported from the backend (`uv run python manage.py spectacular --file ../frontend/openapi.yml`); CI fails if it drifts from the API.

In production, set `VITE_API_BASE_URL` to the API's origin (for example `https://routewise-api.onrender.com`).
