# AGENTS.md

Monorepo with three independent apps. There is **no root package.json / workspace tooling** — every npm command runs from `WebDashboard/`. UI text and git commits are in Thai.

## Layout

| Path | Stack | Buildable here? |
|------|-------|-----------------|
| `WebDashboard/` | React 19 + Vite, Express 5 + better-sqlite3, ESM (`"type": "module"`), no TypeScript | Yes — this is the actively developed component |
| `NativeApp/` | SwiftUI/AppKit menu-bar app | **No** — sources are loose `.swift` files with **no committed `.xcodeproj`**; only compiled binaries (`AIWidgetApp`, `AIWidgetApp_test`, `DeepSeekApp`) are in git. Building requires a local Xcode project. |
| `WindowsApp/` | C# / WPF (`AIWidgetWindowsApp.csproj`) | No (not buildable on macOS) |

## WebDashboard commands (run from `WebDashboard/`)

```sh
npm run dev        # Vite (5173) + nodemon server.js (9000), concurrently; Vite proxies /api -> :9000
npm start          # Express only, serves built dist/ on :9000
npm run build      # vite build --emptyOutDir -> dist/
npm run lint       # oxlint (NOT eslint), config .oxlintrc.json
npm test           # node --test (built-in runner, no framework)
```

- Lint currently reports warnings (unused `catch (e)`, `useEffect` deps) — it does not fail on them.
- Tests: `test/memory.unit.test.js` and `test/safe-evaluate.test.js` pass standalone. `test/memory.api.test.js` imports `server.js` via dynamic import, mocks `global.fetch` for upstream DeepSeek/Ollama calls, and needs env vars set *before* import.

## ⚠️ Verified gotchas

- **`npm test` can delete your real database.** `memory.api.test.js` sets `DATA_DIR`/`START_SERVER` on `process.env`, but `server.js:4` runs `dotenv.config({ override: true })`, so a local `.env` (which sets `DATA_DIR=./data`, `START_SERVER=1`) **overrides the test's values**. Result: the suite hits the real `./data` DB (401s if admin password was set), spins up a real server on :9000 that never closes (the run **hangs**), and the test's `after` hook `rmSync`s the real `./data` directory. Confirmed: running `npm test` here wiped `WebDashboard/data/database.sqlite`. Do not run `npm test` while `.env` exists; unset `DATA_DIR`/`START_SERVER` or remove `override: true` before relying on it.
- **`CONFIG_SECRET`**: required for production (`NODE_ENV=production` + missing secret = hard `process.exit(1)`). In dev it silently falls back to a random ephemeral secret — encrypted config/API keys become unrecoverable after restart.
- **Auth**: first-run setup password; every `/api/*` route except `/api/auth/*` requires `Authorization: Bearer <token>`. `GET /api/config` never returns API keys, only booleans. API keys are AES-256-GCM encrypted at rest.
- `safeEvaluate` (recursive-descent calculator, deliberately no `eval`/`Function`) is **duplicated** in `test/safe-evaluate.test.js` — update both copies together.
- `data/` (SQLite + config) and `dist/` are gitignored; `.env` is gitignored but present locally.
- Docker: `docker-compose.yml` uses an **external named volume `ai-widget-data`** — `docker compose up` fails on a fresh machine until `docker volume create ai-widget-data` is run. Docker build needs `python3`/`make`/`g++` to compile better-sqlite3. `deploy.sh` rsyncs to `root@192.168.1.252` and rebuilds the container.

## Architecture notes

- `server.js` is the whole backend: Express proxy + SSE streaming chat (`/api/deepseek/chat`, `/api/ollama/chat`), web search/URL scrape tools, memory API, auth. `memory.js` = semantic memory (Ollama embeddings via `https://ollama.com/api/embed`, SQLite vector storage). `src/App.jsx` is a single large frontend file.
- Chat is SSE (`text/event-stream`): events `delta` / `meta` / `done` / `error` / `aborted`. The server keeps a 20s keep-alive ping on stream (cleared on `done`).
- Ollama cloud data is fetched directly (no local Ollama server needed).

## CSS conventions (WebDashboard)

**ออกแบบโดยอิงข้อมูล/ค่าจากส่วนกลางเสมอ** — ทุกค่าสี, ขนาดฟอนต์, รัศมี, shadow, overlay, surface ต้องดึงจาก design tokens ใน `:root` ของ `src/index.css` ห้าม hardcode ค่า raw (hex/rgba/px) ในไฟล์ CSS หรือ inline styles ตรงๆ ยกเว้นค่า dynamic/conditional ที่ต้องตั้งจาก logic ใน JSX

- **Tokens ทั้งหมดอยู่ใน `:root` block เดียว** ของ `src/index.css` — semantic ชื่อ (เช่น `--text-muted`→`var(--text-secondary)`, `--status-red`, `--panel-border`, `--radius-md`, `--font-sm`). ถ้าจะเพิ่มค่าสีใหม่ ต้องเป็น token ก่อน แล้วค่อยนำไปใช้.
- **Type scale**: ใช้ `--font-*` tokens (0.6rem→1.5rem + relaxed steps) — ห้ามใช้ `font-size` ตัวเลขลอย.
- **Radius**: ใช้ `--radius-*` (xs/sm/md/lg/pill) — ห้ามใช้ `border-radius` ตัวเลขลอย.
- **No dead code**: อย่าสร้าง/เก็บ CSS block ที่ไม่มีคนใช้. ถ้า class ถูก refactor หาย ให้ลบ style ของมันด้วย.
- **No duplicate blocks**: อย่าเขียน rule ซ้ำสองที่ (เช่น `.glass-card` ครั้งเดียว). ถ้าเจอซ้ำ ให้ merge เป็น block เดียว.
- **Scoped transitions**: ใช้ `transition` เฉพาะ property ที่ต้องการ (color/background/transform…) ห้าม `transition: all` + ต้องมี `@media (prefers-reduced-motion: reduce)`.
- **Touch targets**: ปุ่ม icon-only ต้อง hit area ≥32px (desktop) / ≥44px (mobile) — ใช้ `min-width/min-height` อย่าพึ่ง padding อย่างเดียว.
- **Utility classes ก่อน inline styles**: สำหรับ layout/icon-color ที่ซ้ำ ให้ extract เป็น class ใน index.css (เช่น `.row-center`, `.icon-blue`, `.card-header-compact`) ดีกว่า `style={{…}}` — เหลือ inline styles เฉพาะค่าที่ dynamic (progress `scaleX`, conditional color).
