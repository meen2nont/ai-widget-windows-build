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
