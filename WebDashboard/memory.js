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
