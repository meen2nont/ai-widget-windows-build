# Memory System Design — AI Widget Dashboard (WebDashboard)

วันที่: 2026-08-03
สถานะ: Approved (ผ่านการ brainstorm กับผู้ใช้)

## เป้าหมาย

เพิ่มระบบ "ความจำ" ให้แชทใน WebDashboard ครบ 4 ความสามารถ:

1. จำข้อมูลส่วนตัวระยะยาวข้ามแชท (เช่น "ชื่อสมชาย", "ชอบกาแฟดำ") — ไม่ต้องบอกซ้ำในแชทใหม่
2. อ้างอิงแชทเก่าเมื่อถูกถาม ("เมื่อวานเราคุยเรื่องอะไร?") — ผ่าน semantic search
3. สรุปบทสนทนาเก่าเป็นบริบทอัตโนมัติ
4. คุมด้วยตัวเองได้: ดูรายการ memory, ลบทีละอัน, กด "จำไว้"/"อย่าจำ", ล้างทั้งหมด

ขอบเขต: ทำงานกับแชท **DeepSeek** และ **Ollama** เท่านั้น ส่วน **Ollama Pay** ไม่ใช่ระบบแชท (เป็นแค่หน้า dashboard ดู token) — ไม่มีผล

ผู้ใช้: คนเดียวในบ้าน (single user) — ออกแบบให้เรียบง่าย ไม่ต้องมี auth/login

## แนวทางที่เลือก: Semantic Memory (Approach C)

ใช้เวกเตอร์ความหมาย (embeddings) ในการค้นหา แทนการค้นด้วยคำตรง
- Embedding ใช้ **Ollama Cloud** ผ่าน key ที่มีอยู่แล้ว: `POST https://ollama.com/api/embed`, model `nomic-embed-text` (Bearer auth)
  - ยืนยันแล้วว่า Ollama Cloud รองรับ `/api/embed` และ L2-normalize เวกเตอร์ให้อัตโนมัติ
  - **จุดยืนยันตอน implement**: ลอง curl จริงว่า cloud เปิดใช้ `nomic-embed-text` หรือไม่ ถ้าไม่ได้ให้สลับเป็น `embeddinggemma` หรือ `mxbai-embed-large` (กลไกเดียวกัน)
- เก็บ embedding เป็น JSON ในคอลัมน์ SQLite + คำนวณ cosine similarity ใน JS (เหมาะกับ scale ผู้ใช้คนเดียว ไม่ต้องพึ่ง sqlite-vec)
- การสกัดข้อเท็จจริง/สรุปบทสนทนา ใช้ **DeepSeek** (คุณภาพดีกว่า llama3) — ทั้งตอนแชทกับ DeepSeek และ Ollama

## สถาปัตยกรรม

ทั้งหมดอยู่ฝั่ง server (server.js) + React UI (App.jsx) — ใช้ better-sqlite3 เดิม ไม่เพิ่ม dependency ใหม่

### ตารางใหม่ (SQLite)

```sql
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'auto',        -- 'auto' (AI สกัด) | 'manual' (กดจำเอง)
    source_chat_id TEXT,                       -- แชทต้นทาง (ถ้ามี)
    embedding TEXT,                            -- เวกเตอร์ความหมาย (JSON array)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,                  -- session ของแชท
    summary TEXT NOT NULL,
    embedding TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### Embedding service

```js
async function embedText(texts, serverConfig) {
    // POST https://ollama.com/api/embed
    // headers: Authorization: Bearer <keys.ollama>
    // body: { model: embedModel, input: texts }
    // return: array of float vectors (L2-normalized)
}
```

- รองรับ batch (ส่งหลายข้อความในครั้งเดียว)
- ถ้า `keys.ollama` ว่างหรือ API ล้ม → return `null` (ระบบปิดความจำเงียบ ๆ)

## การไหลของข้อมูล

### A. การจำอัตโนมัติ (หลังจบแชท) — fire-and-forget

1. หลังส่ง `done` event แล้ว → server ส่ง messages ทั้งแชทให้ DeepSeek สกัด ด้วย prompt พิเศษ ขอผลเป็น JSON:
   ```json
   {
     "facts": ["ชื่อสมชาย", "ชอบกาแฟดำ"],
     "summary": "คุยเรื่องการตั้งค่า refresh interval ของแอป..."
   }
   ```
2. ข้อเท็จจริง → **dedup** ด้วย cosine similarity กับ memory เดิม (threshold `0.9`) → ถ้าซ้ำอัปเดตแทน (updated_at + embedding ใหม่) ถ้าใหม่ insert → embed → เก็บลง `memories`
3. สรุป → embed → upsert ลง `chat_summaries` ตาม `session_id` (แชทเดิมแทนที่สรุปเก่า)
4. ไม่บล็อกการตอบแชท (async, ไม่รอผล)

### B. การดึงมาใช้ (ตอนถามใหม่)

1. embed ข้อความ user ล่าสุด
2. ค้นหา **top 5** จาก memories + chat_summaries (cosine similarity)
3. inject ลง system prompt เป็น section `--- MEMORY ---` พร้อมวัน/แหล่งที่มา:
   ```
   --- MEMORY ---
   [จำได้ว่า (จากแชทเมื่อ 2 วันก่อน)] ชื่อสมชาย
   [จำได้ว่า (ด้วยมือ)] ชอบกาแฟดำ
   ```
4. แชทใหม่จึงจำได้โดยไม่ต้องบอกซ้ำ

### C. การค้นแชทเก่าแบบเจาะจง — tool `memory_search`

- เพิ่มเข้า `AVAILABLE_TOOLS`
- embed คำถาม → คืน top 5 จาก **memories + chat_summaries เท่านั้น** (ไม่ค้นข้อความดิบของแชท — จำกัด scope ให้เรียบง่าย) พร้อมวัน/แหล่งที่มา
- ใช้เมื่อผู้ใช้ถามเรื่องเก่า ("เมื่อวานเราคุยอะไร?", "ตอนนั้นเราตกลงกันไว้ยังไง?")
- มีผลเมื่อเปิด `useTools` + `useMemory`

### D. การคุมด้วยตัวเอง

- ปุ่ม "จำไว้" บนคำตอบ AI → POST `/api/memories/remember` (chatId + messageIndex) → เก็บคำตอบนั้นเป็น kind=manual
- ปุ่ม "อย่าจำ" → ลบ memory ที่ `source_chat_id` ตรงกับแชทนั้น
- สลับเปิด/ปิดความจำได้ตลอด

## API endpoints (เพิ่มใน server.js)

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/memories` | รายการ memories + summaries ทั้งหมด |
| POST | `/api/memories` | เพิ่ม memory เอง (ป้อนข้อความ, kind=manual) |
| POST | `/api/memories/remember` | "จำไว้" จากคำตอบ AI (chatId + messageIndex) |
| DELETE | `/api/memories/:id` | ลบ memory อันเดียว |
| DELETE | `/api/memories` | ล้าง memory ทั้งหมด |
| POST | `/api/memories/search` | ค้นแบบ semantic (ใช้โดย tool `memory_search`) |
| POST | `/api/memories/extract` | สกัด facts+สรุปด้วยมือ (สำรองถ้าไม่ใช้อัตโนมัติ) |

## การแก้ chat flow

แก้ทั้ง `/api/deepseek/chat` และ `/api/ollama/chat`:

1. รับ flag `useMemory` (จาก UI) + ใช้ `embedModel` และ key Ollama จาก serverConfig
2. **ก่อนส่ง upstream** → ถ้า `useMemory`: embed ข้อความ user ล่าสุด → ดึง top-5 → ใส่ `--- MEMORY ---` ใน system prompt
3. **หลังส่ง `done`** → fire-and-forget: สกัด facts+สรุปด้วย DeepSeek → embed → เก็บ
   - ทั้ง `/api/deepseek/chat` และ `/api/ollama/chat` ใช้ DeepSeek สกัดเหมือนกัน (Ollama แค่ได้รับ memory ไปเป็นบริบท) — ถ้าไม่มี key DeepSeek ให้ข้ามการสกัดอัตโนมัติ
4. เพิ่ม tool `memory_search` ใน `AVAILABLE_TOOLS` (เมื่อ `useTools` + `useMemory`)

## Settings (หน้า config เดิม)

- สลับเปิด/ปิดความจำ (`useMemory`)
- embed model (`nomic-embed-text` ปรับได้)
- ใช้ key Ollama ตัวเดิม ไม่ต้องกรอกเพิ่ม

## UI (React)

### หน้าแชท
- ปุ่มเปิด/ปิดความจำมุมบนแชท (lucide-react icon เช่น `Brain`) แสดงสถานะ
- ปุ่ม "จำไว้" / "อย่าจำ" ใต้คำตอบ AI
- ตัวแสดงจำนวน memory เช่น "🧠 จำได้ 12 อย่าง"

### หน้า Memory (แท็บใหม่ใน Settings)
- สลับเปิด/ปิดความจำ + เลือก embed model
- รายการ memories แยกหมวด อัตโนมัติ / ด้วยมือ พร้อมวัน
- ปุ่มลบทีละอัน + ปุ่ม "ล้างทั้งหมด"
- รายการ chat_summaries ดูได้ใต้ memories

## Error handling

- **Embed ล้ม** (ไม่มี key / API ลง) → ปิดความจำเงียบ ๆ แชททำงานปกติ + log + toast "ความจำไม่ทำงานชั่วคราว"
- **สกัด/สรุปล้ม** → ไม่เก็บ memory แชทไม่พัง (fire-and-forget)
- **ไม่มี key DeepSeek** → ข้ามการสกัดอัตโนมัติ (แค่ injection + search + manual ยังทำงาน)
- **dedup ผิดพลาด** → เก็บรายการซ้ำ ไม่ crash
- ทุก endpoint คืน JSON error + status เหมือน `/api/config` เดิม

## Testing

เพิ่ม script `"test": "node --test test/memory.test.js"` ใน package.json (ใช้ `node:test` ในตัว ไม่เพิ่ม dependency)

1. **Unit tests**: cosine similarity (ค่าปกติ / เวกเตอร์ความยาวต่าง / เวกเตอร์ 0), dedup threshold, embed payload building, การแยก facts/summary จาก response AI
2. **Integration tests**: endpoint `/api/memories` (GET/POST/DELETE/clear/search) ผ่าน server บนพอร์ตทดสอบ + SQLite ไฟล์ชั่วคราว
3. **Manual**: รัน server → curl ยืนยันว่า `--- MEMORY ---` โผล่ใน payload ที่ส่งไป DeepSeek
4. ผ่าน `npm run lint` (oxlint) + `npm run build` ก่อนสรุป

## ไม่รวม (Out of scope / YAGNI)

- Auth/login (ใช้คนเดียวในบ้าน)
- sqlite-vec / vector extension
- การค้นแบบผูกกับ Ollama Pay
- Embedding provider อื่น (DeepSeek ไม่มี embedding API จึงใช้ Ollama)
