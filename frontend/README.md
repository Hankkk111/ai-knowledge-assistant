# Knowledge Assistant frontend

React 19 + TypeScript + Tailwind CSS 4 chat UI for the AI Knowledge Assistant API, built with Vite.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build the production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the Vitest unit tests (`src/*.test.ts`) |
| `npm run lint` | Lint with Oxlint (`.oxlintrc.json`) |

## Which API it talks to

The base URL is chosen in `src/api.ts`:

- `VITE_API_BASE`, when set, is always used (trailing slashes are removed).
- Otherwise `npm run dev` uses relative paths, and the dev server proxies `/chat` and `/health` to the local backend (`http://localhost:3000`, or `API_PROXY_TARGET` if set; see `vite.config.ts`). Start the backend with `npm run dev` in the repo root first.
- Production builds call the deployed API Gateway URL.

Example, pointing a local build at another backend:

    VITE_API_BASE=http://localhost:4000 npm run build

## Source layout

- `src/App.tsx` – the chat page: message list, sources under each answer, input with a remaining-characters hint near the 2000-character limit.
- `src/api.ts` – `sendMessage()` for `POST /chat`, with a 45-second timeout, `ApiError` for non-2xx responses and validation of the response body.
- `src/errors.ts` – picks the error message shown to the user (API reason for 4xx, a "busy, try again" message for 429/503, timeout and generic failure messages).
- `src/format.ts` – small display helpers (message count, characters left, short document labels).
