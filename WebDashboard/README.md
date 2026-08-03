# AI Service Monitoring Dashboard

Dashboard สำหรับตรวจสอบสถานะ AI Services (DeepSeek, Ollama Cloud, Ollama Pay) พร้อม AI Chat Playground

## Quick Start

```bash
# 1. คัดลอกและแก้ไข environment variables
cp .env.example .env
# แก้ไข CONFIG_SECRET ใน .env (ใช้ openssl rand -hex 32)

# 2. ติดตั้ง dependencies
npm install

# 3. รัน development server (Vite + Express)
npm run dev    # Frontend (Vite) — http://localhost:5173
npm start      # Backend (Express) — http://localhost:9000
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONFIG_SECRET` | **Yes** | — | ใช้เข้ารหัส API keys ที่เก็บใน SQLite ต้องตั้งค่าก่อนรัน production |
| `PORT` | No | `9000` | พอร์ตของ Express server |
| `DATA_DIR` | No | `./data` | ที่เก็บ SQLite database และ config |
| `NODE_ENV` | No | — | ตั้งเป็น `production` เพื่อบังคับให้ต้องมี `CONFIG_SECRET` |

> **Warning:** ถ้าไม่ตั้ง `CONFIG_SECRET` ใน development จะใช้ random secret ชั่วคราว — ข้อมูล config จะหายเมื่อ restart

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | รัน Express server (port 9000) |
| `npm run dev` | รัน Vite dev server (port 5173) |
| `npm run build` | Build frontend ไปที่ `dist/` |
| `npm test` | รัน tests (`node --test`) |
| `npm run lint` | ตรวจสอบ code quality ด้วย oxlint |

## Architecture

```
WebDashboard/
├── server.js          # Express backend — proxy API, SSE streaming, memory
├── memory.js          # Semantic memory (Ollama embeddings + SQLite)
├── src/
│   ├── App.jsx        # React frontend — dashboard + chat playground
│   ├── main.jsx       # Entry point
│   ├── index.css      # Styles (Apple HIG dark palette)
│   ├── components/
│   │   ├── AIIcons.jsx        # DeepSeek / Ollama brand icons
│   │   └── MarkdownMessage.jsx # Markdown renderer
│   └── utils/
│       └── crypto.js  # Web Crypto AES-GCM encryption (client-side)
├── test/              # Tests (node --test)
├── data/              # SQLite database + config (auto-created)
└── .env.example       # ตัวอย่าง environment variables
```

## Security

- API keys ถูกเข้ารหัสด้วย AES-256-GCM ทั้งฝั่ง server (`CONFIG_SECRET`) และ client (Web Crypto API + PBKDF2)
- `GET /api/config` **ไม่ส่ง API keys กลับไป** — ส่งเฉพาะ boolean ว่า service ไหนถูกตั้งค่าบ้าง
- Server เป็น proxy ให้ทุก API call — client ไม่ต้องส่ง Authorization header
- Calculator tool ใช้ recursive descent parser แทน `eval()` / `Function()` — ป้องกัน code injection
