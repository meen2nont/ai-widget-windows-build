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

test('deepseek chat injects MEMORY section into upstream request when useMemory', async () => {
  const originalFetch = global.fetch;
  const chatBodies = [];
  try {
    await fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollama: 'test-ollama-key', deepseek: '', ollamaPay: '' })
    });

    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.startsWith(base)) return originalFetch(u, opts);
      if (u.includes('/api/embed')) {
        return { ok: true, json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }) };
      }
      chatBodies.push(JSON.parse(opts.body || '{}'));
      const sse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'hello' } }] }) + '\n\ndata: [DONE]\n\n';
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          }
        })
      };
    };

    await fetch(`${base}/api/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'ชื่อสมชาย' })
    });

    const res = await fetch(`${base}/api/deepseek/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-deepseek-key' },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        useMemory: true,
        sessionId: 'x',
        messages: [{ role: 'user', content: 'คุณชื่ออะไร' }]
      })
    });
    const sseText = await res.text();
    assert.ok(sseText.includes('event: done'), 'expected streamed done event');
    assert.ok(chatBodies.length > 0, 'expected an upstream DeepSeek chat call');
    const hasMemorySection = chatBodies.some(body =>
      Array.isArray(body.messages) && body.messages.some(m =>
        m.role === 'system' && typeof m.content === 'string' && m.content.includes('--- MEMORY')
      )
    );
    assert.ok(hasMemorySection, 'expected --- MEMORY --- in the upstream system prompt');
  } finally {
    global.fetch = originalFetch;
  }
});
