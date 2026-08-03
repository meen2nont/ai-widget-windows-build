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
