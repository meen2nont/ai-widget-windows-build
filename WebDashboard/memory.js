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

export function allRows(db) {
  const memories = db.prepare('SELECT id, content, kind, created_at, embedding FROM memories')
    .all()
    .map(r => ({
      type: 'memory',
      id: r.id,
      content: r.content,
      kind: r.kind,
      created_at: r.created_at,
      embedding: r.embedding ? JSON.parse(r.embedding) : null
    }));
  const summaries = db.prepare('SELECT session_id, summary, created_at, embedding FROM chat_summaries')
    .all()
    .map(r => ({
      type: 'summary',
      session_id: r.session_id,
      content: r.summary,
      created_at: r.created_at,
      embedding: r.embedding ? JSON.parse(r.embedding) : null
    }));
  return [...memories, ...summaries];
}

export function allEmbeddedRows(db) {
  return allRows(db).filter(r => r.embedding !== null);
}

// ── Embedding (Ollama Cloud) ────────────────────────

export async function embedTexts(serverConfig, texts) {
  const key = serverConfig?.ollama;
  const model = serverConfig?.embedModel || DEFAULT_EMBED_MODEL;
  if (!key || !Array.isArray(texts) || texts.length === 0 || texts.every(t => !t.trim())) return null;
  try {
    const res = await fetch(OLLAMA_EMBED_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(10000)
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

export function textMatchScore(query, content) {
  if (!query || !content) return 0;
  const q = String(query).toLowerCase().trim();
  const c = String(content).toLowerCase().trim();
  if (!q || !c) return 0;

  if (c.includes(q) || q.includes(c)) return 0.8;

  const qTokens = q.split(/[\s,._\-:?!\/]+/).filter(t => t.length > 1);
  const cTokens = c.split(/[\s,._\-:?!\/]+/).filter(t => t.length > 1);

  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  let matches = 0;
  for (const qt of qTokens) {
    if (cTokens.some(ct => ct.includes(qt) || qt.includes(ct))) {
      matches++;
    }
  }

  if (matches > 0) {
    return 0.3 + (matches / qTokens.length) * 0.5;
  }
  return 0;
}

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
  const rows = allRows(db);
  if (rows.length === 0) return [];

  const [vec] = (await embedTexts(serverConfig, [query])) || [];

  if (vec) {
    const scored = rows.map(r => {
      let score = 0;
      if (r.embedding) {
        score = cosineSimilarity(vec, r.embedding);
      } else {
        score = textMatchScore(query, r.content);
      }
      if (r.kind === 'manual') score += 0.1;
      return { ...r, score };
    });

    const validMatches = scored.filter(r => r.score >= 0).sort((a, b) => b.score - a.score);
    if (validMatches.length > 0) {
      return validMatches.slice(0, limit);
    }
  }

  // Fallback when vector embedding service is unavailable or returned no results:
  const scored = rows.map(r => {
    let score = textMatchScore(query, r.content);
    if (r.kind === 'manual') score += 0.5;
    return { ...r, score };
  });

  return scored
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
