# Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a semantic memory system to the WebDashboard chat so DeepSeek/Ollama chats remember durable facts and past-conversation context across sessions.

**Architecture:** Backend (Node/Express + better-sqlite3) gains a `memory.js` service that stores memories + per-chat summaries with Ollama Cloud embeddings (`POST https://ollama.com/api/embed`, model `nomic-embed-text`, Bearer key = existing `ollama` key). Before each chat, the last user message is embedded and the top-5 nearest memories are injected into the system prompt (`--- MEMORY ---`). After each chat reply, a fire-and-forget DeepSeek call extracts durable facts + a summary and stores them (dedup via cosine similarity). A `memory_search` tool lets the model look up old chats on demand. Frontend (React) adds a memory toggle, per-message "จำไว้", and a Memory management panel in Settings.

**Tech Stack:** Node.js (ESM), Express 5, better-sqlite3 (existing), Ollama Cloud embeddings, DeepSeek chat API (existing), React 19 + lucide-react (existing), `node:test` (built-in, no new deps).

## Global Constraints

- No new npm dependencies. Tests use built-in `node:test`.
- Embeddings use the existing `ollama` API key from server config (fallback model name: `nomic-embed-text`).
- Extraction/summarization always uses DeepSeek (`deepseek` key). If missing → skip auto-extraction silently.
- Embedding failure → memory features degrade gracefully (chat still works). Never block the chat reply on memory.
- Keep server config object shape `{ deepseek, ollama, ollamaPay, embedModel? }`; embedModel is optional and falls back to `nomic-embed-text`.
- All UI copy is Thai (matches existing UI).
- Do NOT touch the pre-existing uncommitted edits in `WebDashboard/Dockerfile`, `WebDashboard/server.js`, `WebDashboard/src/App.jsx` — build on top of current working-tree state.

---
## File Structure

- Create `WebDashboard/memory.js` — memory service (vector math, DB CRUD, embedding, retrieval, extraction). Single focused module; server.js just wires endpoints.
- Create `WebDashboard/test/memory.unit.test.js` — pure unit tests (vector math, prompt building, parsing, DB CRUD with `:memory:` sqlite, stubbed `fetch`).
- Create `WebDashboard/test/memory.api.test.js` — integration tests hitting the Express app on an ephemeral port with a temp `DATA_DIR`.
- Modify `WebDashboard/server.js` — import memory module, init tables, add `/api/memories*` endpoints, wire memory injection/extraction into both chat routes, add `memory_search` tool, add testability hooks (`DATA_DIR`, `START_SERVER`, `export { app }`).
- Modify `WebDashboard/package.json` — add `"test": "node --test test/"` script.
- Modify `WebDashboard/src/App.jsx` — memory state/handlers, chat toolbar toggle, per-message actions, Settings Memory panel.
- Modify `WebDashboard/src/index.css` — `.toggle-chip.on.violet` variant + memory panel styles.

---

### Task 1: Memory core — vector math + DB CRUD + unit tests

**Files:**
- Create: `WebDashboard/memory.js`
- Create: `WebDashboard/test/memory.unit.test.js`
- Modify: `WebDashboard/package.json:7` (add test script)

**Interfaces:**
- Produces (used by Task 2, 3, 4):
  - `initMemoryTables(db)` — creates `memories` + `chat_summaries` tables
  - `cosineSimilarity(a, b) -> number` (0 if invalid/zero vectors)
  - `isDuplicate(vec, existingVectors[], threshold = 0.9) -> boolean`
  - `listMemories(db) -> rows[]`
  - `listSummaries(db) -> rows[]`
  - `addMemory(db, { content, kind, source_chat_id, embedding }) -> lastInsertRowid`
  - `deleteMemory(db, id) -> boolean`
  - `clearMemories(db) -> void`
  - `deleteMemoriesByChat(db, chatId) -> void`
  - `upsertSummary(db, sessionId, summary, embedding) -> void`
  - `allEmbeddedRows(db) -> rows[]` (parsed embeddings, tagged `type: 'memory' | 'summary'`)

- [ ] **Step 1: Write the failing test**

Create `WebDashboard/test/memory.unit.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import {
  cosineSimilarity, isDuplicate, initMemoryTables,
  addMemory, listMemories, deleteMemory, clearMemories,
  deleteMemoriesByChat, upsertSummary, listSummaries
} from '../memory.js';

function makeDb() {
  const db = new Database(':memory:');
  initMemoryTables(db);
  return db;
}

test('cosineSimilarity identical vectors = 1', () => {
  assert.strictEqual(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('cosineSimilarity orthogonal vectors = 0', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
});

test('cosineSimilarity mismatched length = 0', () => {
  assert.strictEqual(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});

test('cosineSimilarity zero vector = 0', () => {
  assert.strictEqual(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('isDuplicate true above threshold, false below', () => {
  assert.strictEqual(isDuplicate([1, 2, 3], [[1, 2, 3]]), true);
  assert.strictEqual(isDuplicate([1, 0], [[0, 1]]), false);
});

test('init + add + list memory', () => {
  const db = makeDb();
  const id = addMemory(db, { content: 'ชื่อสมชาย', kind: 'auto', source_chat_id: 's1' });
  assert.ok(id > 0);
  const rows = listMemories(db);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].content, 'ชื่อสมชาย');
  assert.strictEqual(rows[0].kind, 'auto');
});

test('upsertSummary replaces existing session summary', () => {
  const db = makeDb();
  upsertSummary(db, 's1', 'summary A');
  upsertSummary(db, 's1', 'summary B');
  const rows = listSummaries(db);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].summary, 'summary B');
});

test('deleteMemory returns whether row existed', () => {
  const db = makeDb();
  const id = addMemory(db, { content: 'x' });
  assert.strictEqual(deleteMemory(db, id), true);
  assert.strictEqual(deleteMemory(db, id), false);
});

test('deleteMemoriesByChat and clearMemories', () => {
  const db = makeDb();
  addMemory(db, { content: 'a', source_chat_id: 'c1' });
  addMemory(db, { content: 'b', source_chat_id: 'c2' });
  deleteMemoriesByChat(db, 'c1');
  assert.strictEqual(listMemories(db).length, 1);
  clearMemories(db);
  assert.strictEqual(listMemories(db).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.unit.test.js` (from `WebDashboard/`)
Expected: FAIL — `Cannot find module '../memory.js'`

- [ ] **Step 3: Write minimal implementation**

Create `WebDashboard/memory.js`:

```js
// WebDashboard/memory.js
// Semantic memory service: Ollama Cloud embeddings + SQLite-backed storage.

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEDUP_THRESHOLD = 0.9;
const OLLAMA_EMBED_URL = 'https://ollama.com/api/embed';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// ── Vector math ─────────────────────────────────────

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function isDuplicate(vec, existingVectors, threshold = DEDUP_THRESHOLD) {
  return existingVectors.some(ev => cosineSimilarity(vec, ev) >= threshold);
}

// ── DB schema + CRUD ────────────────────────────────

export function initMemoryTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'auto',
      source_chat_id TEXT,
      embedding TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      embedding TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function listMemories(db) {
  return db.prepare('SELECT id, content, kind, source_chat_id, created_at, updated_at FROM memories ORDER BY updated_at DESC').all();
}

export function listSummaries(db) {
  return db.prepare('SELECT id, session_id, summary, created_at, updated_at FROM chat_summaries ORDER BY updated_at DESC').all();
}

export function addMemory(db, { content, kind = 'auto', source_chat_id = null, embedding = null }) {
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO memories (content, kind, source_chat_id, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(content, kind, source_chat_id || null, embedding ? JSON.stringify(embedding) : null, now, now);
  return info.lastInsertRowid;
}

export function deleteMemory(db, id) {
  return db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0;
}

export function clearMemories(db) {
  db.prepare('DELETE FROM memories').run();
  db.prepare('DELETE FROM chat_summaries').run();
}

export function deleteMemoriesByChat(db, chatId) {
  db.prepare('DELETE FROM memories WHERE source_chat_id = ?').run(chatId);
}

export function upsertSummary(db, sessionId, summary, embedding = null) {
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM chat_summaries WHERE session_id = ?').get(sessionId);
  if (existing) {
    db.prepare('UPDATE chat_summaries SET summary = ?, embedding = ?, updated_at = ? WHERE session_id = ?')
      .run(summary, embedding ? JSON.stringify(embedding) : null, now, sessionId);
  } else {
    db.prepare('INSERT INTO chat_summaries (session_id, summary, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, summary, embedding ? JSON.stringify(embedding) : null, now, now);
  }
}

export function allEmbeddedRows(db) {
  const memories = db.prepare('SELECT id, content, kind, created_at, embedding FROM memories')
    .all()
    .filter(r => r.embedding)
    .map(r => ({ type: 'memory', id: r.id, content: r.content, kind: r.kind, created_at: r.created_at, embedding: JSON.parse(r.embedding) }));
  const summaries = db.prepare('SELECT session_id, summary, created_at, embedding FROM chat_summaries')
    .all()
    .filter(r => r.embedding)
    .map(r => ({ type: 'summary', session_id: r.session_id, content: r.summary, created_at: r.created_at, embedding: JSON.parse(r.embedding) }));
  return [...memories, ...summaries];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/memory.unit.test.js` (from `WebDashboard/`)
Expected: PASS — 11 tests pass

- [ ] **Step 5: Add test script + commit**

Edit `WebDashboard/package.json` scripts (add the `test` line):

```json
  "scripts": {
    "start": "node server.js",
    "dev": "vite",
    "build": "vite build --emptyOutDir",
    "lint": "oxlint",
    "test": "node --test test/",
    "preview": "vite preview"
  },
```

```bash
git add WebDashboard/memory.js WebDashboard/test/memory.unit.test.js WebDashboard/package.json
git commit -m "feat: memory service core (vector math + SQLite CRUD) with unit tests"
```

---

### Task 2: Embedding, retrieval, extraction + unit tests

**Files:**
- Modify: `WebDashboard/memory.js` (append functions)
- Modify: `WebDashboard/test/memory.unit.test.js` (append tests)

**Interfaces:**
- Consumes: Task 1 exports (`cosineSimilarity`, `isDuplicate`, `addMemory`, `upsertSummary`, `allEmbeddedRows`)
- Produces (used by Task 3, 4):
  - `embedTexts(serverConfig, texts[]) -> number[][] | null` (null when key missing/API fails)
  - `buildMemorySection(memories[]) -> string` (empty string when none)
  - `retrieveTopMemories(db, serverConfig, query, limit = 5) -> rows[]`
  - `buildExtractionPrompt(messages[]) -> string`
  - `parseExtractionResponse(text) -> { facts: string[], summary: string }`
  - `extractAndStore(db, serverConfig, sessionId, messages) -> { facts, summary } | null`

- [ ] **Step 1: Write the failing tests**

Append to `WebDashboard/test/memory.unit.test.js`:

```js
import {
  embedTexts, buildMemorySection, retrieveTopMemories,
  buildExtractionPrompt, parseExtractionResponse, extractAndStore
} from '../memory.js';

test('buildMemorySection empty for no memories', () => {
  assert.strictEqual(buildMemorySection([]), '');
  assert.strictEqual(buildMemorySection(null), '');
});

test('buildMemorySection formats memory with source', () => {
  const section = buildMemorySection([{ content: 'ชื่อสมชาย', type: 'memory', created_at: 0 }]);
  assert.ok(section.includes('--- MEMORY'));
  assert.ok(section.includes('ชื่อสมชาย'));
});

test('buildExtractionPrompt includes transcript and asks for JSON', () => {
  const prompt = buildExtractionPrompt([{ role: 'user', content: 'สวัสดีครับ' }]);
  assert.ok(prompt.includes('สวัสดีครับ'));
  assert.ok(prompt.includes('facts'));
  assert.ok(prompt.includes('summary'));
});

test('parseExtractionResponse handles fenced JSON', () => {
  const r = parseExtractionResponse('```json\n{"facts":["ชื่อสมชาย"],"summary":"คุยเรื่อง X"}\n```');
  assert.deepStrictEqual(r, { facts: ['ชื่อสมชาย'], summary: 'คุยเรื่อง X' });
});

test('parseExtractionResponse malformed returns empty', () => {
  assert.deepStrictEqual(parseExtractionResponse('oops'), { facts: [], summary: '' });
  assert.deepStrictEqual(parseExtractionResponse('{"facts":'), { facts: [], summary: '' });
});

test('embedTexts returns null without ollama key', async () => {
  assert.strictEqual(await embedTexts({ ollama: '' }, ['hi']), null);
});

test('embedTexts posts to ollama embed with Bearer auth', async () => {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ embeddings: [[0.1, 0.2]] }) };
  };
  const res = await embedTexts({ ollama: 'k123', embedModel: 'nomic-embed-text' }, ['hello']);
  assert.deepStrictEqual(res, [[0.1, 0.2]]);
  assert.ok(calls[0].url.includes('/api/embed'));
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer k123');
  assert.deepStrictEqual(calls[0].body.input, ['hello']);
  delete global.fetch;
});

test('retrieveTopMemories returns [] when embedding fails', async () => {
  const db = new Database(':memory:');
  initMemoryTables(db);
  const rows = await retrieveTopMemories(db, { ollama: '' }, 'hello');
  assert.deepStrictEqual(rows, []);
});

test('retrieveTopMemories ranks by similarity and caps at limit', async () => {
  const db = new Database(':memory:');
  initMemoryTables(db);
  const one = [1, 0];
  const orth = [0, 1];
  addMemory(db, { content: 'nearest', embedding: one });
  addMemory(db, { content: 'orthogonal', embedding: orth });
  global.fetch = async () => ({ ok: true, json: async () => ({ embeddings: [[1, 0]] }) });
  const rows = await retrieveTopMemories(db, { ollama: 'k' }, 'query', 5);
  assert.strictEqual(rows[0].content, 'nearest');
  assert.strictEqual(rows.length, 2);
  const capped = await retrieveTopMemories(db, { ollama: 'k' }, 'query', 1);
  assert.strictEqual(capped.length, 1);
  delete global.fetch;
});

test('extractAndStore returns null without deepseek key', async () => {
  const db = new Database(':memory:');
  initMemoryTables(db);
  assert.strictEqual(await extractAndStore(db, { deepseek: '' }, 's1', []), null);
});

test('extractAndStore stores facts and summary from stub', async () => {
  const db = new Database(':memory:');
  initMemoryTables(db);
  global.fetch = async (url) => {
    if (url.includes('/api/embed')) {
      return { ok: true, json: async () => ({ embeddings: [[1], [1]] }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"facts":["ชอบกาแฟดำ"],"summary":"สรุปสั้น ๆ"}' } }] }) };
  };
  const result = await extractAndStore(db, { deepseek: 'd', ollama: 'o' }, 's1', [{ role: 'user', content: 'ฉันชอบกาแฟดำ' }]);
  assert.deepStrictEqual(result, { facts: 1, summary: true });
  assert.strictEqual(listMemories(db)[0].content, 'ชอบกาแฟดำ');
  assert.strictEqual(listMemories(db)[0].kind, 'auto');
  assert.strictEqual(listSummaries(db)[0].summary, 'สรุปสั้น ๆ');
  delete global.fetch;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/memory.unit.test.js` (from `WebDashboard/`)
Expected: FAIL — import errors for the new named exports

- [ ] **Step 3: Append implementation to `WebDashboard/memory.js`**

Add these functions (after `allEmbeddedRows`):

```js
// ── Embedding (Ollama Cloud) ────────────────────────

export async function embedTexts(serverConfig, texts) {
  const key = serverConfig?.ollama;
  const model = serverConfig?.embedModel || DEFAULT_EMBED_MODEL;
  if (!key || !Array.isArray(texts) || texts.length === 0 || texts.every(t => !t.trim())) return null;
  try {
    const res = await fetch(OLLAMA_EMBED_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts })
    });
    if (!res.ok) {
      console.error('[memory] embed HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = await res.json();
    return Array.isArray(json.embeddings) ? json.embeddings : null;
  } catch (e) {
    console.error('[memory] embed error', e.message);
    return null;
  }
}

// ── Retrieval ───────────────────────────────────────

export function buildMemorySection(memories) {
  if (!Array.isArray(memories) || memories.length === 0) return '';
  const lines = memories.map(mem => {
    const when = mem.created_at ? new Date(mem.created_at).toLocaleDateString('th-TH') : 'ไม่ทราบวัน';
    const src = mem.type === 'summary' ? `สรุปแชท (${when})` : `จำไว้ (${when})`;
    return `- ${mem.content} [${src}]`;
  });
  return `\n--- MEMORY (ความจำจากแชทก่อนหน้า) ---\n${lines.join('\n')}\n`;
}

export async function retrieveTopMemories(db, serverConfig, query, limit = 5) {
  const [vec] = (await embedTexts(serverConfig, [query])) || [];
  if (!vec) return [];
  return allEmbeddedRows(db)
    .map(r => ({ ...r, score: cosineSimilarity(vec, r.embedding) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Extraction (DeepSeek) ───────────────────────────

export function buildExtractionPrompt(messages) {
  const transcript = (Array.isArray(messages) ? messages : [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${typeof m.content === 'string' ? m.content : ''}`)
    .join('\n');
  return `You are a memory extraction engine for a personal AI assistant.

Read the conversation transcript and produce TWO things:
1. "facts": durable, long-term facts worth remembering across future chats (user's name, preferences, projects, important dates, recurring topics, things the user asked you to remember). Skip transient/one-off statements.
2. "summary": a concise 1-2 sentence summary of what this conversation was about.

Respond with ONLY a valid JSON object in this exact shape:
{"facts": ["fact 1", "fact 2"], "summary": "one or two sentence summary"}

Use the same language as the conversation (mostly Thai).

TRANSCRIPT:
${transcript}`;
}

export function parseExtractionResponse(text) {
  try {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return { facts: [], summary: '' };
    const json = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    return {
      facts: Array.isArray(json.facts) ? json.facts.filter(f => typeof f === 'string' && f.trim()).map(f => f.trim()) : [],
      summary: typeof json.summary === 'string' ? json.summary.trim() : ''
    };
  } catch (e) {
    console.error('[memory] parse extraction failed', e.message);
    return { facts: [], summary: '' };
  }
}

export async function extractAndStore(db, serverConfig, sessionId, messages) {
  const deepseekKey = serverConfig?.deepseek;
  if (!deepseekKey) return null;
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: serverConfig?.chatModel || 'deepseek-chat',
        messages: [
          { role: 'system', content: buildExtractionPrompt(messages) },
          { role: 'user', content: 'Extract memory from the transcript above.' }
        ],
        temperature: 0.2,
        max_tokens: 1500
      })
    });
    if (!res.ok) {
      console.error('[memory] extraction HTTP', res.status);
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '';
    const { facts, summary } = parseExtractionResponse(content);
    if (facts.length === 0 && !summary) return { facts: 0, summary: false };

    const toEmbed = [...facts];
    if (summary) toEmbed.push(`SUMMARY: ${summary}`);
    const vectors = toEmbed.length > 0 ? await embedTexts(serverConfig, toEmbed) : [];

    const existing = allEmbeddedRows(db).filter(r => r.type === 'memory').map(r => r.embedding);
    facts.forEach((fact, i) => {
      const vec = vectors?.[i];
      if (vec && !isDuplicate(vec, existing)) {
        addMemory(db, { content: fact, kind: 'auto', source_chat_id: sessionId, embedding: vec });
        existing.push(vec);
      }
    });
    if (summary) {
      upsertSummary(db, sessionId, summary, vectors?.[facts.length] || null);
    }
    return { facts: facts.length, summary: Boolean(summary) };
  } catch (e) {
    console.error('[memory] extraction error', e.message);
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/memory.unit.test.js` (from `WebDashboard/`)
Expected: PASS — all unit tests pass (11 + 11 = 22)

- [ ] **Step 5: Commit**

```bash
git add WebDashboard/memory.js WebDashboard/test/memory.unit.test.js
git commit -m "feat: memory embedding, semantic retrieval, and DeepSeek extraction with tests"
```

---

### Task 3: Memory API endpoints + server testability + integration tests

**Files:**
- Modify: `WebDashboard/server.js`
- Create: `WebDashboard/test/memory.api.test.js`

**Interfaces:**
- Consumes: Task 2 memory exports
- Produces (used by Task 4): testability hooks `DATA_DIR` env, `START_SERVER` env, `export { app }`

- [ ] **Step 1: Write the failing integration test**

Create `WebDashboard/test/memory.api.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'mem-api-'));
process.env.START_SERVER = '0';

const { app } = await import('../server.js');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('POST/GET/DELETE memories CRUD', async () => {
  const add = await (await fetch(`${base}/api/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'ชื่อสมชาย' })
  })).json();
  assert.strictEqual(add.status, 'ok');

  const list = await (await fetch(`${base}/api/memories`)).json();
  assert.ok(Array.isArray(list.memories));
  const found = list.memories.find(m => m.content === 'ชื่อสมชาย');
  assert.ok(found);
  assert.strictEqual(found.kind, 'manual');

  const del = await (await fetch(`${base}/api/memories/${found.id}`, { method: 'DELETE' })).json();
  assert.strictEqual(del.status, 'ok');

  await fetch(`${base}/api/memories`, { method: 'DELETE' });
  const after = await (await fetch(`${base}/api/memories`)).json();
  assert.strictEqual(after.memories.length, 0);
});

test('POST /api/memories requires content', async () => {
  const res = await fetch(`${base}/api/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '   ' })
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/memories/remember requires assistant message', async () => {
  await fetch(`${base}/api/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: 'c1', title: 't', messages: [{ role: 'assistant', content: 'ตอบว่า hello' }] }])
  });
  const ok = await (await fetch(`${base}/api/memories/remember`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: 'c1', messageIndex: 0 })
  })).json();
  assert.strictEqual(ok.status, 'ok');
  const bad = await fetch(`${base}/api/memories/remember`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: 'missing', messageIndex: 0 })
  });
  assert.strictEqual(bad.status, 404);
});

test('GET /api/memories/search returns array even with no keys', async () => {
  const res = await fetch(`${base}/api/memories/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'ชื่อ' })
  });
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(await res.json()));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.api.test.js` (from `WebDashboard/`)
Expected: FAIL — 404 on `/api/memories` and server import side-effects

- [ ] **Step 3: Implement testability hooks + endpoints in `WebDashboard/server.js`**

3a. Add the memory import at the top (after the existing `crypto` import):

```js
import { initMemoryTables, listMemories, listSummaries, addMemory, deleteMemory, clearMemories, deleteMemoriesByChat, embedTexts, retrieveTopMemories, extractAndStore, buildMemorySection } from './memory.js';
```

3b. Make `DATA_DIR` overridable (find the existing line `const DATA_DIR = join(__dirname, 'data');` and replace it):

```js
const DATA_DIR = process.env.DATA_DIR ? process.env.DATA_DIR : join(__dirname, 'data');
```

3c. Find this block:

```js
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            updated_at INTEGER,
            messages TEXT
        );
    `);
```

Replace it with the same block plus the `initMemoryTables(db);` call:

```js
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            updated_at INTEGER,
            messages TEXT
        );
    `);
initMemoryTables(db);
```

3d. Insert the memory API endpoints right before the `// ── Server-Sent Events (SSE) Helpers` comment:

```js
// ── Memory API ─────────────────────────────────────
app.get('/api/memories', (req, res) => {
  try {
    res.json({ memories: listMemories(db), summaries: listSummaries(db) });
  } catch (e) {
    console.error('Error listing memories:', e.message);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

app.post('/api/memories', async (req, res) => {
  try {
    const content = (req.body && typeof req.body.content === 'string' ? req.body.content : '').trim();
    if (!content) return res.status(400).json({ error: 'content is required' });
    const serverConfig = getServerConfig();
    const [vec] = (await embedTexts(serverConfig, [content])) || [];
    const id = addMemory(db, { content, kind: 'manual', embedding: vec || null });
    res.json({ status: 'ok', id });
  } catch (e) {
    console.error('Error adding memory:', e.message);
    res.status(500).json({ error: 'Failed to add memory' });
  }
});

app.post('/api/memories/remember', async (req, res) => {
  try {
    const chatId = req.body && req.body.chatId;
    const messageIndex = Number(req.body && req.body.messageIndex);
    const row = db.prepare('SELECT messages FROM sessions WHERE id = ?').get(chatId);
    if (!row) return res.status(404).json({ error: 'Chat session not found' });
    const messages = JSON.parse(row.messages);
    const target = messages[messageIndex];
    if (!target || target.role !== 'assistant') return res.status(400).json({ error: 'Invalid message index' });
    const content = typeof target.content === 'string' ? target.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'Message is empty' });
    const serverConfig = getServerConfig();
    const [vec] = (await embedTexts(serverConfig, [content])) || [];
    const id = addMemory(db, { content, kind: 'manual', source_chat_id: chatId, embedding: vec || null });
    res.json({ status: 'ok', id });
  } catch (e) {
    console.error('Error remembering message:', e.message);
    res.status(500).json({ error: 'Failed to remember message' });
  }
});

app.post('/api/memories/unremember', (req, res) => {
  try {
    const chatId = req.body && req.body.chatId;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    deleteMemoriesByChat(db, chatId);
    res.json({ status: 'ok' });
  } catch (e) {
    console.error('Error unremembering chat:', e.message);
    res.status(500).json({ error: 'Failed to unremember chat' });
  }
});

app.delete('/api/memories/:id', (req, res) => {
  try {
    const ok = deleteMemory(db, req.params.id);
    res.json({ status: ok ? 'ok' : 'not_found' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

app.delete('/api/memories', (req, res) => {
  try {
    clearMemories(db);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear memories' });
  }
});

app.post('/api/memories/search', async (req, res) => {
  try {
    const query = (req.body && typeof req.body.query === 'string' ? req.body.query : '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });
    const serverConfig = getServerConfig();
    const results = await retrieveTopMemories(db, serverConfig, query);
    res.json(results);
  } catch (e) {
    console.error('Error searching memories:', e.message);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

app.post('/api/memories/extract', async (req, res) => {
  try {
    const chatId = req.body && req.body.chatId;
    const row = db.prepare('SELECT messages FROM sessions WHERE id = ?').get(chatId);
    if (!row) return res.status(404).json({ error: 'Chat session not found' });
    const serverConfig = getServerConfig();
    const result = await extractAndStore(db, serverConfig, chatId, JSON.parse(row.messages));
    res.json({ status: 'ok', extracted: result });
  } catch (e) {
    console.error('Error extracting memories:', e.message);
    res.status(500).json({ error: 'Failed to extract memories' });
  }
});
```

3e. Replace the end of the file (`app.listen(PORT, () => { ... });`) with:

```js
if (process.env.START_SERVER !== '0') {
  app.listen(PORT, () => {
    console.log(`Dashboard server running on port ${PORT}`);
  });
}

export { app };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/memory.api.test.js` (from `WebDashboard/`)
Expected: PASS — 4 integration tests pass

- [ ] **Step 5: Sanity-check the normal server still boots**

Run: `START_SERVER=0 node -e "import('./server.js').then(() => console.log('import ok'))"` (from `WebDashboard/`)
Expected: prints `import ok`

- [ ] **Step 6: Commit**

```bash
git add WebDashboard/server.js WebDashboard/test/memory.api.test.js
git commit -m "feat: memory REST API endpoints with integration tests and server testability hooks"
```

---

### Task 4: Chat flow — memory injection, extraction, and memory_search tool

**Files:**
- Modify: `WebDashboard/server.js` (both chat routes + `AVAILABLE_TOOLS` + `executeToolCall`)

**Interfaces:**
- Consumes: Task 2 `retrieveTopMemories`, `buildMemorySection`, `extractAndStore`; Task 3 `db`, `getServerConfig`
- Produces: `/api/deepseek/chat` and `/api/ollama/chat` accept `useMemory` + `sessionId`; `memory_search` tool registered in `AVAILABLE_TOOLS`

- [ ] **Step 1: Add the `memory_search` tool**

Find `const AVAILABLE_TOOLS = [` in `server.js` and append the tool at the end of the array (after the `calculator` object, before the closing `];`):

```js
    {
        type: "function",
        function: {
            name: "memory_search",
            description: "Search the user's saved memory and past chat summaries for information they told you in earlier chats (e.g. their name, preferences, or what a previous conversation was about).",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "What to look up" }
                },
                required: ["query"]
            }
        }
    }
```

- [ ] **Step 2: Wire `memory_search` into `executeToolCall`**

Change the signature and add a branch. Find `async function executeToolCall(toolName, args)` and replace with:

```js
async function executeToolCall(toolName, args, db, serverConfig) {
    try {
        if (toolName === 'memory_search') {
            const results = await retrieveTopMemories(db, serverConfig, (args.query || ''));
            return JSON.stringify(results.map(r => ({
                content: r.content,
                type: r.type,
                when: r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : null
            })));
        }
        if (toolName === 'web_search') {
```

Then update the call site inside the chat route. Find `const toolOutput = await executeToolCall(fnName, fnArgs);` and replace with:

```js
                const toolOutput = await executeToolCall(fnName, fnArgs, db, getServerConfig());
```

- [ ] **Step 3: Memory injection + extraction in `/api/deepseek/chat`**

3a. Find the destructure line in the deepseek route:

```js
        const { webSearch, personaPrompt, attachedFiles, useTools, messages, ...otherParams } = req.body;
```

Replace with:

```js
        const { webSearch, personaPrompt, attachedFiles, useTools, useMemory, sessionId, messages, ...otherParams } = req.body;
```

3b. Add memory injection. Find this block:

```js
        systemContent += `\nInstructions: Use the real-time date, role persona, attached files, scraped web content, and search results above to provide a clear, helpful, and accurate response.`;
```

Replace with:

```js
        if (useMemory) {
            const lastUserMsg = [...finalMessages].reverse().find(m => m.role === 'user');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
                const mems = await retrieveTopMemories(db, serverConfig, lastUserMsg.content, 5);
                systemContent += buildMemorySection(mems);
            }
        }

        systemContent += `\nInstructions: Use the real-time date, role persona, attached files, scraped web content, search results, and memory above to provide a clear, helpful, and accurate response.`;
```

3c. Add `memory_search` to the tools payload only when memory is on. Find:

```js
        if (useTools) {
            payload.tools = AVAILABLE_TOOLS;
        }
```

Replace with:

```js
        if (useTools) {
            payload.tools = useMemory ? AVAILABLE_TOOLS : AVAILABLE_TOOLS.filter(t => t.function.name !== 'memory_search');
        }
```

3d. Fire-and-forget extraction after streaming ends. Find (at the end of the deepseek route):

```js
        clearInterval(ping);
        res.end();
    } catch (error) {
```

Replace with:

```js
        clearInterval(ping);
        res.end();

        if (useMemory && sessionId && serverConfig.deepseek) {
            extractAndStore(db, serverConfig, sessionId, finalMessages)
                .then(result => {
                    if (result) console.log('[memory] extracted', result.facts, 'facts, summary:', result.summary);
                })
                .catch(e => console.error('[memory] extraction error', e.message));
        }
    } catch (error) {
```

- [ ] **Step 4: Memory injection + extraction in `/api/ollama/chat`**

4a. Find:

```js
        const serverConfig = getServerConfig();
        const authHeader = req.headers.authorization || (serverConfig.ollama ? `Bearer ${serverConfig.ollama}` : '');
        const { model, messages } = req.body;
```

Replace with:

```js
        const serverConfig = getServerConfig();
        const authHeader = req.headers.authorization || (serverConfig.ollama ? `Bearer ${serverConfig.ollama}` : '');
        const { model, messages, useMemory, sessionId } = req.body;
        let finalMessages = Array.isArray(messages) ? [...messages] : [];

        if (useMemory) {
            const lastUser = [...finalMessages].reverse().find(m => m.role === 'user');
            if (lastUser && typeof lastUser.content === 'string') {
                const mems = await retrieveTopMemories(db, serverConfig, lastUser.content, 5);
                const section = buildMemorySection(mems);
                if (section) finalMessages = [{ role: 'system', content: section.trim() }, ...finalMessages];
            }
        }
```

4b. Find the upstream body build inside the ollama route:

```js
            body: JSON.stringify({
                model: model || 'llama3',
                messages: messages,
                stream: true
            }),
```

Replace with:

```js
            body: JSON.stringify({
                model: model || 'llama3',
                messages: finalMessages,
                stream: true
            }),
```

4c. Find the end of the ollama route:

```js
        sseSend(res, 'done', {
            content: fullContent,
            tokenUsage: evalCount ? { prompt_tokens: 0, completion_tokens: evalCount, total_tokens: evalCount } : null,
            estimatedCostUSD: null,
            searchResults: null,
            scrapedContent: null,
            executedTools: null
        });
        res.end();
    } catch (error) {
```

Replace with:

```js
        sseSend(res, 'done', {
            content: fullContent,
            tokenUsage: evalCount ? { prompt_tokens: 0, completion_tokens: evalCount, total_tokens: evalCount } : null,
            estimatedCostUSD: null,
            searchResults: null,
            scrapedContent: null,
            executedTools: null
        });
        res.end();

        if (useMemory && sessionId && serverConfig.deepseek) {
            extractAndStore(db, serverConfig, sessionId, finalMessages)
                .then(result => {
                    if (result) console.log('[memory] extracted', result.facts, 'facts, summary:', result.summary);
                })
                .catch(e => console.error('[memory] extraction error', e.message));
        }
    } catch (error) {
```

- [ ] **Step 5: Run the test suite (regression)**

Run: `node --test test/` (from `WebDashboard/`)
Expected: PASS — all unit + integration tests

- [ ] **Step 6: Manual verification of injection (no real API key needed)**

Run (from `WebDashboard/`):

```bash
DATA_DIR=/tmp/mem-verify START_SERVER=1 node server.js > /tmp/mem-server.log 2>&1 &
sleep 1
curl -s -X POST http://127.0.0.1:9000/api/memories -H 'Content-Type: application/json' -d '{"content":"ชื่อสมชาย"}' ; echo
curl -s http://127.0.0.1:9000/api/memories ; echo
kill %1
```

Expected: first curl returns `{"status":"ok","id":1}`, second returns the memory row. (Injection into the live chat prompt itself needs a real key and is verified in the final UI pass — the logic is covered by the `retrieveTopMemories`/`buildMemorySection` unit tests.)

- [ ] **Step 7: Commit**

```bash
git add WebDashboard/server.js
git commit -m "feat: wire memory injection, extraction, and memory_search tool into chat flows"
```

---

### Task 5: Frontend — chat memory toggle, request payload, per-message actions

**Files:**
- Modify: `WebDashboard/src/App.jsx`

**Interfaces:**
- Consumes: Task 3/4 API endpoints `/api/memories`, `/api/memories/remember`, `/api/memories/unremember`
- Produces: `useMemory` state + `memoryData` state; `loadMemories`, `rememberAssistantMessage`, `unrememberChat` handlers; `useMemory` + `sessionId` in chat request body

- [ ] **Step 1: Add imports + state**

Find the lucide-react import (line 2-8) and add `Brain` to it:

```js
import { 
  Settings, RefreshCw, CheckCircle2, XCircle, Activity,
  MessageSquare, LayoutGrid, List, Copy, Send, Clock, ShieldCheck, Globe, Search,
  Plus, Trash2, Download, Link2, Pencil, RotateCcw, Paperclip, Wrench, FileText, X,
  Mic, MicOff, Volume2, VolumeX, BookOpen, DollarSign, ChevronDown, Table,
  Bot, Code, PenLine, Languages, BarChart, Printer, Save, Mail, Brain
} from 'lucide-react';
```

Find the chat state block (around `const [useTools, setUseTools] = useState(true);`) and add after it:

```js
  const [useMemory, setUseMemory] = useState(() => localStorage.getItem('use_memory') !== '0');
  const [memoryData, setMemoryData] = useState({ memories: [], summaries: [] });
  const [newManualMemory, setNewManualMemory] = useState('');
```

- [ ] **Step 2: Add memory handlers**

Find the `const appendAssistantMessage = (assistantMsg) => {` function and add these handlers before it:

```js
  const loadMemories = async () => {
    try {
      const res = await fetch('/api/memories');
      if (res.ok) setMemoryData(await res.json());
    } catch (e) { /* memory unavailable */ }
  };

  const rememberAssistantMessage = async (idx) => {
    const m = messages[idx];
    if (!m || m.role !== 'assistant') return;
    try {
      const res = await fetch('/api/memories/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeSessionId, messageIndex: idx })
      });
      if (res.ok) { showToast('จำไว้แล้ว 🧠'); loadMemories(); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'จำไม่ได้ (ตรวจสอบ key Ollama)'); }
    } catch (e) { showToast('จำไม่ได้ (ตรวจสอบ key Ollama)'); }
  };

  const unrememberChat = async () => {
    try {
      const res = await fetch('/api/memories/unremember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeSessionId })
      });
      if (res.ok) { showToast('ลบความจำของแชทนี้แล้ว'); loadMemories(); }
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { if (showSettings) loadMemories(); }, [showSettings]);
```

Also add a `useEffect` to load memory counts on mount. Find the sessions-loading `useEffect` (around line 346-370) and add after it:

```js
  useEffect(() => { loadMemories(); }, []);
```

- [ ] **Step 3: Send `useMemory` + `sessionId` in the chat request**

Find the fetch body in `sendChatMessage`:

```js
        body: JSON.stringify({
          model: isOllamaModel ? selectedModel.replace('ollama:', '') : selectedModel,
          webSearch: enableWebSearch,
          useTools: useTools,
          personaPrompt: activePersonaPrompt,
          attachedFiles: currentAttachedFiles,
          messages: [...messages, userMsgObj].map(m => ({ role: m.role, content: m.content }))
        })
```

Replace with:

```js
        body: JSON.stringify({
          model: isOllamaModel ? selectedModel.replace('ollama:', '') : selectedModel,
          webSearch: enableWebSearch,
          useTools: useTools,
          useMemory: useMemory,
          sessionId: activeSessionId,
          personaPrompt: activePersonaPrompt,
          attachedFiles: currentAttachedFiles,
          messages: [...messages, userMsgObj].map(m => ({ role: m.role, content: m.content }))
        })
```

- [ ] **Step 4: Add the memory toggle chip to the chat toolbar**

Find the "ค้นหาเว็บ" toggle button (ends with the `Globe` button around line 1267) and add after it:

```jsx
                      <button
                        type="button"
                        onClick={() => { const next = !useMemory; setUseMemory(next); localStorage.setItem('use_memory', next ? '1' : '0'); if (next) loadMemories(); }}
                        className={`toggle-chip ${useMemory ? 'on violet' : 'off'}`}
                        title="เปิด/ปิดระบบความจำ — จำข้อมูลและบทสนทนาข้ามแชท"
                      >
                        <Brain size={14} />
                        <span>ความจำ: <strong>{useMemory ? 'เปิด' : 'ปิด'}</strong></span>
                      </button>
```

- [ ] **Step 5: Add per-message "จำไว้" action on assistant messages**

Find the assistant-only TTS button block inside `.message-actions-outside` (around line 1364-1374) and add a "จำไว้" button before it:

```jsx
                      {m.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => rememberAssistantMessage(idx)}
                          className="action-icon-btn"
                          title="จำข้อความนี้ไว้ (เพิ่มลงความจำ)"
                        >
                          <Brain size={13} />
                        </button>
                      )}
```

- [ ] **Step 6: Build + lint**

Run: `npm run build` and `npm run lint` (from `WebDashboard/`)
Expected: build succeeds, oxlint reports no errors

- [ ] **Step 7: Commit**

```bash
git add WebDashboard/src/App.jsx
git commit -m "feat: chat memory toggle, request payload, and per-message remember action"
```

---

### Task 6: Frontend — Memory panel in Settings + embedModel config

**Files:**
- Modify: `WebDashboard/src/App.jsx`

**Interfaces:**
- Consumes: Task 5 handlers (`loadMemories`, `memoryData`, `newManualMemory`)
- Produces: `keys.embedModel` saved to server config; Memory management UI in the settings modal

- [ ] **Step 1: Add `embedModel` to keys state**

Find:

```js
  const [keys, setKeys] = useState({
    deepseek: '',
    ollama: '',
    ollamaPay: ''
  });
```

Replace with:

```js
  const [keys, setKeys] = useState({
    deepseek: '',
    ollama: '',
    ollamaPay: '',
    embedModel: ''
  });
```

- [ ] **Step 2: Add manual-memory + delete/clear handlers**

Find `const copyToClipboard = (text) => {` and add these handlers before it:

```js
  const addManualMemory = async () => {
    const content = newManualMemory.trim();
    if (!content) return;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) { setNewManualMemory(''); showToast('เพิ่มความจำแล้ว 🧠'); loadMemories(); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'เพิ่มความจำไม่สำเร็จ'); }
    } catch (e) { showToast('เพิ่มความจำไม่สำเร็จ'); }
  };

  const deleteMemoryById = async (id) => {
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      loadMemories();
    } catch (e) { /* ignore */ }
  };

  const clearAllMemories = async () => {
    try {
      await fetch('/api/memories', { method: 'DELETE' });
      showToast('ล้างความจำทั้งหมดแล้ว');
      loadMemories();
    } catch (e) { /* ignore */ }
  };
```

- [ ] **Step 3: Load memories when settings opens** (already added as part of the handlers in Step 2 above — skip this step)

- [ ] **Step 4: Add the Memory section to the settings modal**

Find the "Auto Refresh Interval" `form-group` block (ends with the closing `</div>` before `<div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>`) and insert this block after it:

```jsx
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Brain size={14} /> ระบบความจำ (Memory)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => { const next = !useMemory; setUseMemory(next); localStorage.setItem('use_memory', next ? '1' : '0'); }}
                    className={`toggle-chip ${useMemory ? 'on violet' : 'off'}`}
                  >
                    <Brain size={14} />
                    <span>ความจำ: <strong>{useMemory ? 'เปิด' : 'ปิด'}</strong></span>
                  </button>
                  <button type="button" className="secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }} onClick={loadMemories} title="โหลดรายการความจำ">
                    <RefreshCw size={13} /> โหลด
                  </button>
                </div>
                <small style={{ color: 'var(--text-muted)', display: 'block', margin: '0.35rem 0' }}>
                  ความจำ {memoryData.memories.length} รายการ · สรุปแชท {memoryData.summaries.length} รายการ
                </small>
                <input
                  type="text"
                  placeholder="เพิ่มความจำด้วยตัวเอง (เช่น ชื่อฉันคือ...)"
                  value={newManualMemory}
                  onChange={e => setNewManualMemory(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualMemory(); } }}
                />
              </div>

              {memoryData.memories.length > 0 && (
                <div className="memory-list" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '0.5rem' }}>
                  {memoryData.memories.map(mem => (
                    <div key={mem.id} className="memory-list-item">
                      <span className={`memory-kind-tag ${mem.kind}`}>{mem.kind === 'manual' ? 'ด้วยมือ' : 'อัตโนมัติ'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mem.content}>{mem.content}</span>
                      <button type="button" className="action-icon-btn" onClick={() => deleteMemoryById(mem.id)} title="ลบความจำนี้">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {memoryData.memories.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <button type="button" className="secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', color: '#f85149', borderColor: 'rgba(248,113,113,0.3)' }} onClick={clearAllMemories}>
                    <Trash2 size={13} /> ล้างความจำทั้งหมด
                  </button>
                </div>
              )}

              <div className="form-group">
                <label>Embedding Model (ใช้ key Ollama)</label>
                <input
                  type="text"
                  value={keys.embedModel || 'nomic-embed-text'}
                  onChange={e => setKeys({ ...keys, embedModel: e.target.value })}
                  placeholder="nomic-embed-text"
                />
              </div>
```

- [ ] **Step 5: Build + lint**

Run: `npm run build` and `npm run lint` (from `WebDashboard/`)
Expected: build succeeds, oxlint reports no errors

- [ ] **Step 6: Commit**

```bash
git add WebDashboard/src/App.jsx
git commit -m "feat: memory management panel in settings with embedModel config"
```

---

### Task 7: CSS + full verification

**Files:**
- Modify: `WebDashboard/src/index.css`

- [ ] **Step 1: Add `.toggle-chip.on.violet` variant**

Find the `.toggle-chip.on.cyan` block (index.css:693-696) and add after it:

```css
.toggle-chip.on.violet {
  background: rgba(167, 139, 250, 0.16);
  color: #a78bfa;
}
```

- [ ] **Step 2: Add memory list styles**

Find the `.toggle-chip.off` block (index.css:698-700) and add after it:

```css
.memory-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem;
  background: rgba(13, 17, 23, 0.6);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}

.memory-list-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  font-size: 0.8rem;
}

.memory-kind-tag {
  flex-shrink: 0;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
}

.memory-kind-tag.manual {
  background: rgba(56, 189, 248, 0.16);
  color: #38bdf8;
}

.memory-kind-tag.auto {
  background: rgba(167, 139, 250, 0.16);
  color: #a78bfa;
}
```

- [ ] **Step 3: Run the full test suite**

Run: `node --test test/` (from `WebDashboard/`)
Expected: PASS — all tests

- [ ] **Step 4: Build + lint**

Run: `npm run build` and `npm run lint` (from `WebDashboard/`)
Expected: both pass

- [ ] **Step 5: Manual UI pass (with real keys)**

1. `npm run dev` → open dashboard, go to Settings → save a valid Ollama key.
2. Settings → Memory → add a manual memory ("ชื่อฉันคือสมชาย") → it appears in the list.
3. In a new chat, turn memory ON, ask "ฉันชื่ออะไร" → DeepSeek answers using the memory.
4. Type something personal ("ฉันชอบกาแฟดำ"), wait for the reply, then in a NEW chat ask "ฉันชอบอะไร" → it remembers.
5. Click 🧠 on an assistant reply → memory count increases by 1.
6. Settings → Memory → delete one, then clear all → list empties.
7. Turn memory OFF → ask again → DeepSeek does not know your name.

- [ ] **Step 6: Commit**

```bash
git add WebDashboard/src/index.css
git commit -m "style: memory toggle and memory list styles"
```

---
## Final checklist

- [ ] All 4 memory capabilities work: durable facts across chats, reference old chats via `memory_search`, automatic summaries, manual control (view/delete/clear/remember/unremember).
- [ ] Works for both DeepSeek and Ollama chat models.
- [ ] Memory degrades gracefully (no key / API down → chat unaffected).
- [ ] `node --test test/`, `npm run build`, `npm run lint` all pass.
