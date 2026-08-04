import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { initMemoryTables, listMemories, listSummaries, addMemory, deleteMemory, clearMemories, deleteMemoriesByChat, embedTexts, retrieveTopMemories, extractAndStore, buildMemorySection } from './memory.js';
import { isPeakHour as bangkokIsPeakHour, formatBangkokFull, bangkokDayOfWeek, formatBangkokDateShort } from './time.js';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATA_DIR ? process.env.DATA_DIR : join(__dirname, 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const DB_FILE = join(DATA_DIR, 'database.sqlite');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_FILE);
db.exec(`
    CREATE TABLE IF NOT EXISTS config_store (
        key TEXT PRIMARY KEY,
        value TEXT
    );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            updated_at INTEGER,
            messages TEXT
        );
    `);
initMemoryTables(db);


// ── Encryption Setup ────────────────────────────────────────────────────
// Derive a 32-byte key from CONFIG_SECRET env var.
// CONFIG_SECRET MUST be set in production — no fallback default.
const RAW_SECRET = process.env.CONFIG_SECRET;
if (!RAW_SECRET) {
  const msg = 'CONFIG_SECRET environment variable is required. Set a strong random secret for production security.';
  if (process.env.NODE_ENV === 'production') {
    console.error(msg);
    process.exit(1);
  }
  console.warn('WARNING: ' + msg + ' Using a random ephemeral secret — config will be unrecoverable after restart.');
}
// Use a random per-run secret when none is provided (dev only — data is lost on restart)
const EFFECTIVE_SECRET = RAW_SECRET || crypto.randomBytes(32).toString('hex');
const CIPHER_KEY = crypto.createHash('sha256').update(EFFECTIVE_SECRET).digest(); // 32 bytes

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:'; // marker so we can detect encrypted files

function encryptConfig(obj) {
    const plaintext = JSON.stringify(obj);
    const iv = crypto.randomBytes(12);                          // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, CIPHER_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Pack: prefix + iv(hex) + ':' + authTag(hex) + ':' + ciphertext(hex)
    return ENC_PREFIX + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptConfig(raw) {
    if (!raw.startsWith(ENC_PREFIX)) {
        // Legacy plaintext JSON — return as-is (migration path)
        return JSON.parse(raw);
    }
    const payload = raw.slice(ENC_PREFIX.length);
    const [ivHex, tagHex, ctHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ctHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, CIPHER_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}
// ───────────────────────────────────────────────────────────────────────

// Helper to read and decrypt server-side config
function getServerConfig() {
    try {
        // 1. Try to fetch from SQLite first
        const row = db.prepare('SELECT value FROM config_store WHERE key = ?').get('app_config');
        if (row && row.value) {
            return decryptConfig(row.value);
        }

        // 2. Fallback to file for migration (if DB has no config yet)
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8').trim();
            const config = decryptConfig(raw);
            
            // Auto-migrate to DB
            saveServerConfig(config);
            console.log('[config] Migrated config from config.json to SQLite database.');
            
            try {
                fs.renameSync(CONFIG_FILE, CONFIG_FILE + '.bak');
            } catch (e) {}

            return config;
        }
    } catch (e) {
        console.error('Error reading/decrypting config:', e.message);
    }
    return { deepseek: '', ollama: '', ollamaPay: '' };
}

// Per-model pricing in USD per 1M tokens (per DeepSeek docs)
const MODEL_PRICING = {
    'deepseek-v4-flash': { input: 0.14, output: 0.28 },
    'deepseek-v4-pro': { input: 0.435, output: 0.87 },
};
const getPricing = (model) => MODEL_PRICING[model] || { input: 0.14, output: 0.28 };

// Peak pricing window (Thailand time): 08:00-11:00 and 13:00-17:00.
// Returns true when DeepSeek charges 2x (peak) pricing.
function isPeakHour() {
    return bangkokIsPeakHour();
}

// Helper to encrypt and save server-side config
function saveServerConfig(config) {
    try {
        const encrypted = encryptConfig(config);
        db.prepare('INSERT OR REPLACE INTO config_store (key, value) VALUES (?, ?)').run('app_config', encrypted);
        return true;
    } catch (e) {
        console.error('Error encrypting/writing config:', e.message);
        return false;
    }
}


const app = express();
const PORT = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// ── Auth Logic ──────────────────────────────────────────────────────────
const getAdminHash = () => {
    const row = db.prepare("SELECT value FROM config_store WHERE key = 'admin_password_hash'").get();
    return row ? row.value : null;
};
const getAdminToken = () => {
    const row = db.prepare("SELECT value FROM config_store WHERE key = 'admin_session_token'").get();
    return row ? row.value : null;
};
const setAdminHash = (hash) => db.prepare("INSERT OR REPLACE INTO config_store (key, value) VALUES ('admin_password_hash', ?)").run(hash);
const setAdminToken = (token) => db.prepare("INSERT OR REPLACE INTO config_store (key, value) VALUES ('admin_session_token', ?)").run(token);
const clearAdminToken = () => db.prepare("DELETE FROM config_store WHERE key = 'admin_session_token'").run();

app.get('/api/auth/status', (req, res) => {
    const hash = getAdminHash();
    if (!hash) return res.json({ status: 'needs_setup' });
    
    // Check if token in header is valid
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const storedToken = getAdminToken();
        if (storedToken && token === storedToken) {
            return res.json({ status: 'authenticated' });
        }
    }
    res.json({ status: 'needs_login' });
});

app.post('/api/auth/setup', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    if (getAdminHash()) return res.status(400).json({ error: 'Already setup' });
    
    const salt = crypto.randomBytes(16).toString('hex');
    const hashBuffer = crypto.scryptSync(password, salt, 64);
    const hash = `${salt}:${hashBuffer.toString('hex')}`;
    setAdminHash(hash);
    
    const token = crypto.randomBytes(32).toString('hex');
    setAdminToken(token);
    res.json({ success: true, token });
});

app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    
    const storedHash = getAdminHash();
    if (!storedHash) return res.status(400).json({ error: 'Not setup yet' });
    
    const [salt, key] = storedHash.split(':');
    const hashedBuffer = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    
    if (!crypto.timingSafeEqual(hashedBuffer, keyBuffer)) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    setAdminToken(token);
    res.json({ success: true, token });
});

app.post('/api/auth/logout', (req, res) => {
    clearAdminToken();
    res.json({ success: true });
});

app.post('/api/user/change-password', (req, res) => {
    // This route is protected by the middleware below because it doesn't start with /auth/
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new passwords required' });
    
    const storedHash = getAdminHash();
    if (!storedHash) return res.status(400).json({ error: 'Not setup yet' });
    
    const [salt, key] = storedHash.split(':');
    const hashedBuffer = crypto.scryptSync(currentPassword, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    
    if (!crypto.timingSafeEqual(hashedBuffer, keyBuffer)) {
        return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    
    // Hash new password
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHashBuffer = crypto.scryptSync(newPassword, newSalt, 64);
    const newHash = `${newSalt}:${newHashBuffer.toString('hex')}`;
    
    setAdminHash(newHash);
    
    // Invalidate session so they must login again with new password
    clearAdminToken();
    
    res.json({ success: true });
});

app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    
    const hash = getAdminHash();
    if (!hash) return res.status(401).json({ error: 'Setup required', code: 'NEEDS_SETUP' });
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    
    const token = authHeader.split(' ')[1];
    const storedToken = getAdminToken();
    
    if (!storedToken || token !== storedToken) {
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    
    next();
});
// ────────────────────────────────────────────────────────────────────────

// Get Config Endpoint — returns service availability booleans, NOT actual API keys
app.get('/api/config', (req, res) => {
    const cfg = getServerConfig();
    res.json({
        services: {
            deepseek: Boolean(cfg.deepseek),
            ollama: Boolean(cfg.ollama),
            ollamaPay: Boolean(cfg.ollamaPay)
        },
        keys: {
            deepseek: cfg.deepseek || '',
            ollama: cfg.ollama || '',
            ollamaPay: cfg.ollamaPay || ''
        },
        embedModel: cfg.embedModel || 'nomic-embed-text'
    });
});

// Save Config Endpoint
app.post('/api/config', (req, res) => {
    const success = saveServerConfig(req.body);
    if (success) {
        res.json({ status: 'ok', message: 'Config saved successfully on server' });
    } else {
        res.status(500).json({ error: 'Failed to save config on server' });
    }
});

// Proxy DeepSeek API Balance
app.get('/api/deepseek/balance', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        if (!serverConfig.deepseek) {
            return res.status(503).json({ error: 'DeepSeek API key not configured', available: false });
        }
        const response = await fetch('https://api.deepseek.com/user/balance', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serverConfig.deepseek}`,
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch DeepSeek balance' });
    }
});

// Helper to perform live web search via DuckDuckGo HTML
async function performWebSearch(query) {
    try {
        const response = await fetch('https://html.duckduckgo.com/html/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: new URLSearchParams({ q: query, kl: 'wt-wt' })
        });
        const html = await response.text();

        const snippetMatches = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
        const titleMatches = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/gi)];

        const results = [];
        for (let i = 0; i < Math.min(snippetMatches.length, 5); i++) {
            const title = titleMatches[i] ? titleMatches[i][1].replace(/<[^>]+>/g, '').trim() : '';
            const snippet = snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, '').trim() : '';
            if (title || snippet) {
                results.push({ title, snippet });
            }
        }
        return results;
    } catch (e) {
        console.error('Web search error:', e);
        return [];
    }
}



// Helper to extract readable text content from a web URL
async function fetchWebContent(targetUrl) {
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) return null;
        const html = await response.text();

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : targetUrl;

        let text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<svg[\s\S]*?<\/svg>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (text.length > 4000) {
            text = text.substring(0, 4000) + '... (content truncated)';
        }

        return { title, text, url: targetUrl };
    } catch (e) {
        console.error('URL scraping error:', e);
        return null;
    }
}

// Get Chat Sessions History Endpoint
app.get('/api/chats', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
        const sessions = rows.map(r => ({
            id: r.id,
            title: r.name,
            messages: JSON.parse(r.messages)
        }));
        return res.json(sessions);
    } catch (e) {
        console.error('Error reading sessions from DB:', e);
        res.json([]);
    }
});

// Save Chat Sessions History Endpoint
app.post('/api/chats', (req, res) => {
    try {
        const sessions = Array.isArray(req.body) ? req.body : [];

        // Upsert-only: do NOT delete sessions missing from this payload.
        // Deletion is handled explicitly via DELETE /api/chats/:id to avoid
        // race conditions across tabs/devices clobbering each other's sessions.
        const stmt = db.prepare('INSERT OR REPLACE INTO sessions (id, name, updated_at, messages) VALUES (?, ?, ?, ?)');
        const upsert = db.transaction((sessionsData) => {
            for (const s of sessionsData) {
                if (s.id) {
                    stmt.run(
                        s.id,
                        s.title || s.name || 'New Chat',
                        Date.now(),
                        JSON.stringify(s.messages || [])
                    );
                }
            }
        });

        upsert(sessions);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error('Error saving sessions to DB:', e);
        res.status(500).json({ error: 'Failed to save chats' });
    }
});

// Delete a single chat session
app.delete('/api/chats/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error('Error deleting chat session:', e);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// Tool Definitions for OpenAI-compatible Function Calling
const AVAILABLE_TOOLS = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web for up-to-date information, news, or general facts.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query keywords" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_url",
            description: "Extract readable text content from a web URL.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Target URL (e.g. https://...)" }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_current_time",
            description: "Get current exact date, day of week, and time in Thailand (Asia/Bangkok).",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calculator",
            description: "Perform mathematical calculations (e.g. 25 * 48 + 120).",
            parameters: {
                type: "object",
                properties: {
                    expression: { type: "string", description: "Math expression string to evaluate" }
                },
                required: ["expression"]
            }
        }
    },
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
];

// ── Safe arithmetic evaluator (recursive descent, no eval/Function) ──
function safeEvaluate(expr) {
  // Tokenize: numbers, operators, parentheses
  const tokens = [];
  let pos = 0;
  while (pos < expr.length) {
    const ch = expr[pos];
    if (/\s/.test(ch)) { pos++; continue; }
    if ('+-*/()'.includes(ch)) { tokens.push({ t: 'op', v: ch }); pos++; continue; }
    if (/[\d.]/.test(ch)) {
      let num = '';
      while (pos < expr.length && /[\d.]/.test(expr[pos])) { num += expr[pos]; pos++; }
      const n = parseFloat(num);
      if (isNaN(n)) throw new Error('Invalid number: ' + num);
      tokens.push({ t: 'num', v: n });
      continue;
    }
    throw new Error('Unexpected character: ' + ch);
  }

  let i = 0;
  function peek() { return i < tokens.length ? tokens[i] : null; }
  function consume(t) { const tok = tokens[i]; if (tok && tok.t === t) { i++; return tok; } throw new Error('Expected ' + t); }

  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = consume('op').v;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = consume('op').v;
      const right = parseUnary();
      if (op === '*') { left *= right; }
      else { if (right === 0) throw new Error('Division by zero'); left /= right; }
    }
    return left;
  }

  function parseUnary() {
    if (peek() && peek().t === 'op' && peek().v === '-') { consume('op'); return -parsePrimary(); }
    if (peek() && peek().t === 'op' && peek().v === '+') { consume('op'); return parsePrimary(); }
    return parsePrimary();
  }

  function parsePrimary() {
    if (!peek()) throw new Error('Unexpected end of expression');
    if (peek().t === 'num') return consume('num').v;
    if (peek().t === 'op' && peek().v === '(') {
      consume('op');
      const val = parseAddSub();
      if (!peek() || peek().t !== 'op' || peek().v !== ')') throw new Error('Missing closing parenthesis');
      consume('op');
      return val;
    }
    throw new Error('Unexpected token: ' + (peek()?.v || '?'));
  }

  const result = parseAddSub();
  if (i !== tokens.length) throw new Error('Unexpected trailing characters');
  if (!isFinite(result)) throw new Error('Result is not finite');
  return result;
}

// Helper to execute function tools
async function executeToolCall(toolName, args, db, serverConfig) {
    try {
        if (toolName === 'memory_search') {
            const results = await retrieveTopMemories(db, serverConfig, (args.query || ''));
            return JSON.stringify(results.map(r => ({
                content: r.content,
                type: r.type,
                when: r.created_at ? formatBangkokDateShort(new Date(r.created_at)) : null
            })));
        }
        if (toolName === 'web_search') {
            const results = await performWebSearch(args.query || '');
            return JSON.stringify(results.slice(0, 3));
        }
        if (toolName === 'fetch_url') {
            const page = await fetchWebContent(args.url || '');
            return page ? page.text : "Could not fetch URL content.";
        }
        if (toolName === 'get_current_time') {
            return formatBangkokFull();
        }
        if (toolName === 'calculator') {
            const expr = (args.expression || '').replace(/[^0-9+\-*/().\s]/g, '').trim();
            if (!expr) return '0';
            const val = safeEvaluate(expr);
            return String(val);
        }
    } catch (e) {
        return `Tool execution error: ${e.message}`;
    }
    return "Unknown tool";
}

// Build the shared system prompt from date, persona, attached text files,
// scraped web content, web search results, and retrieved memory.
function buildSystemContext({ thaiDateStr, dayOfWeekTH, personaPrompt, textFiles, scrapedContent, searchResults, memorySection }) {
    let systemContent = `Today's exact real-time Date & Time is: ${thaiDateStr} (${dayOfWeekTH}).\n`;
    if (personaPrompt) {
        systemContent += `\nRole Persona Instructions: ${personaPrompt}\n`;
    }

    if (textFiles.length > 0) {
        systemContent += `\n--- ATTACHED USER FILES (${textFiles.length} file(s)) ---\n`;
        textFiles.forEach((file, idx) => {
            systemContent += `\n[File ${idx + 1}: ${file.name} (${file.type || 'file'})]\n${file.content}\n`;
        });
        systemContent += `-----------------------------------------------\n`;
    }

    if (scrapedContent) {
        systemContent += `\n--- SCRAPED WEB PAGE CONTENT (${scrapedContent.url}) ---\nTitle: ${scrapedContent.title}\nContent:\n${scrapedContent.text}\n--------------------------------------------\n`;
    }

    if (searchResults.length > 0) {
        const searchFormatted = searchResults
            .map((r, i) => `[Source ${i + 1}] ${r.title}\n${r.snippet}`)
            .join('\n\n');
        systemContent += `\n--- LIVE WEB SEARCH RESULTS ---\n${searchFormatted}\n----------------------------------\n`;
    }

    if (memorySection) {
        systemContent += memorySection;
    }

    systemContent += `\nInstructions: Use the real-time date, role persona, attached files, scraped web content, search results, and memory above to provide a clear, helpful, and accurate response.`;
    return systemContent;
}

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

// ── Server-Sent Events (SSE) Helpers ─────────────────────────────────────
function sseHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}

function sseSend(res, event, data) {
    if (res.writableEnded) return;
    try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) { /* client may have disconnected */ }
}
// ────────────────────────────────────────────────────────────────────────

// Proxy DeepSeek Chat Completions (with Web Search, URL Scraper, File Attachments, Tool Calling, and SSE streaming)
app.post('/api/deepseek/chat', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        const authHeader = serverConfig.deepseek ? `Bearer ${serverConfig.deepseek}` : '';

        const { webSearch, personaPrompt, attachedFiles, useTools, useMemory, sessionId, messages, model, ...otherParams } = req.body;
        let finalMessages = Array.isArray(messages) ? [...messages] : [];
        let searchResults = [];
        let scrapedContent = null;
        let executedTools = [];

        // Calculate real-time current date & time (Thailand Timezone)
        const thaiDateStr = formatBangkokFull();
        const dayOfWeekTH = bangkokDayOfWeek();

        if (finalMessages.length > 0) {
            const lastUserMsg = [...finalMessages].reverse().find(m => m.role === 'user');
            if (lastUserMsg && lastUserMsg.content) {
                // Check if user prompt contains a URL to scrape
                const urlMatch = lastUserMsg.content.match(/https?:\/\/[^\s]+/i);
                if (urlMatch) {
                    scrapedContent = await fetchWebContent(urlMatch[0]);
                }

                // Web search if enabled
                if (webSearch) {
                    searchResults = await performWebSearch(lastUserMsg.content);
                }
            }
        }

        // Split attachedFiles into text files and image files
        const textFiles = (Array.isArray(attachedFiles) ? attachedFiles : []).filter(f => !f.type.startsWith('image/'));
        const imageFiles = (Array.isArray(attachedFiles) ? attachedFiles : []).filter(f => f.type.startsWith('image/'));

        let memorySection = '';
        if (useMemory) {
            const lastUserMsg = [...finalMessages].reverse().find(m => m.role === 'user');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
                const mems = await retrieveTopMemories(db, serverConfig, lastUserMsg.content, 5);
                memorySection = buildMemorySection(mems);
            }
        }

        const systemContent = buildSystemContext({
            thaiDateStr, dayOfWeekTH, personaPrompt, textFiles, scrapedContent, searchResults, memorySection
        });

        const systemPromptObj = {
            role: 'system',
            content: systemContent
        };
        
        finalMessages = [systemPromptObj, ...finalMessages];

        // Build Vision/Multimodal content for last user message if images are attached
        if (imageFiles.length > 0) {
            const lastUserIdx = finalMessages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx !== -1) {
                const lastUser = finalMessages[lastUserIdx];
                const multimodalContent = [
                    { type: 'text', text: lastUser.content || 'Analyze the attached image(s).' },
                    ...imageFiles.map(img => ({
                        type: 'image_url',
                        image_url: { url: img.content }
                    }))
                ];
                finalMessages[lastUserIdx] = { ...lastUser, content: multimodalContent };
            }
        }

        const payload = {
            ...otherParams,
            model,
            messages: finalMessages
        };

        if (useTools) {
            payload.tools = useMemory ? AVAILABLE_TOOLS : AVAILABLE_TOOLS.filter(t => t.function.name !== 'memory_search');
        }

        // ── SSE STREAMING MODE ──────────────────────────────────────────
        sseHeaders(res);
        const send = (event, data) => sseSend(res, event, data);
        const upstream = new AbortController();
        res.on('close', () => upstream.abort());
        const ping = setInterval(() => {
            try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
        }, 20000);

        // Send search/scrape metadata up front so badges render immediately
        const meta = {};
        if (searchResults.length > 0) meta.searchResults = searchResults;
        if (scrapedContent) meta.scrapedContent = scrapedContent;
        if (Object.keys(meta).length > 0) send('meta', meta);

        // stream each round of the (possibly tool-calling) conversation
        let fullContent = '';
        let usage = null;
        let streamPayload = { ...payload, stream: true, messages: finalMessages };

        const streamRound = async (reqPayload) => {
            let response;
            try {
                response = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(reqPayload),
                    signal: upstream.signal
                });
            } catch (e) {
                if (e.name === 'AbortError') { send('aborted', {}); return null; }
                throw e;
            }

            if (!response.ok || !response.body) {
                const errText = await response.text().catch(() => '');
                console.error('[deepseek] API error', response.status, errText.slice(0, 400));
                console.error('[deepseek] failing payload:', JSON.stringify(reqPayload.messages).slice(0, 3000));
                send('error', { error: `DeepSeek API error (${response.status}): ${errText}` });
                return null;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finishReason = null;
            const toolCalls = {};

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;
                    let json;
                    try { json = JSON.parse(data); } catch (e) { continue; }
                    const choice = json.choices?.[0];
                    if (!choice) continue;
                    if (choice.delta?.content) {
                        fullContent += choice.delta.content;
                        send('delta', { content: choice.delta.content });
                    }
                    if (choice.delta?.tool_calls) {
                        for (const tc of choice.delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            toolCalls[idx] = toolCalls[idx] || { id: '', type: 'function', function: { name: '', arguments: '' } };
                            if (tc.id) toolCalls[idx].id = tc.id;
                            if (tc.type) toolCalls[idx].type = tc.type;
                            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                        }
                    }
                    if (json.usage) usage = json.usage;
                    if (choice.finish_reason) finishReason = choice.finish_reason;
                }
            }

            return {
                finishReason,
                toolCalls: Object.values(toolCalls).filter(tc => tc.function?.name)
            };
        };

        let toolRounds = 0;
        while (toolRounds < 5) {
            const result = await streamRound(streamPayload);
            if (!result) {
                clearInterval(ping);
                res.end();
                return;
            }

            if (result.toolCalls.length === 0) break;

            // Execute requested tools, then continue streaming with results
            const assistantMsg = { role: 'assistant', content: fullContent || null, tool_calls: result.toolCalls.map(tc => ({ type: 'function', ...tc })) };
            finalMessages.push(assistantMsg);
            for (const tc of result.toolCalls) {
                const fnName = tc.function.name;
                const fnArgs = JSON.parse(tc.function.arguments || '{}');
                const toolOutput = await executeToolCall(fnName, fnArgs, db, getServerConfig());
                executedTools.push({ name: fnName, args: fnArgs, result: toolOutput });
                send('meta', { executedTools: [executedTools[executedTools.length - 1]] });
                finalMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolOutput });
            }
            streamPayload = { ...streamPayload, messages: finalMessages };
            toolRounds++;
        }

        // Final metadata + cost summary
        let estimatedCostUSD = null;
        if (usage) {
            const { input, output } = getPricing(model);
            const isDeepSeek = !model.startsWith('ollama:');
            const peakMultiplier = isDeepSeek && isPeakHour() ? 2 : 1;
            const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * input * peakMultiplier;
            const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * output * peakMultiplier;
            estimatedCostUSD = (inputCost + outputCost).toFixed(6);
        }
        send('done', {
            content: fullContent,
            tokenUsage: usage ? {
                prompt_tokens: usage.prompt_tokens || 0,
                completion_tokens: usage.completion_tokens || 0,
                total_tokens: usage.total_tokens || 0
            } : null,
            estimatedCostUSD,
            searchResults: searchResults.length > 0 ? searchResults : null,
            scrapedContent: scrapedContent || null,
            executedTools: executedTools.length > 0 ? executedTools : null
        });
        clearInterval(ping);
        res.end();

        if (useMemory && sessionId && serverConfig.deepseek) {
            const extractionMessages = [...finalMessages];
            if (fullContent && !extractionMessages.some(m => m.role === 'assistant' && m.content === fullContent)) {
                extractionMessages.push({ role: 'assistant', content: fullContent });
            }
            extractAndStore(db, serverConfig, sessionId, extractionMessages)
                .then(result => {
                    if (result) console.log('[memory] extracted', result.facts, 'facts, summary:', result.summary);
                })
                .catch(e => console.error('[memory] extraction error', e.message));
        }
    } catch (error) {
        console.error('DeepSeek chat error:', error);
        clearInterval(ping);
        try {
            sseSend(res, 'error', { error: 'Failed to generate chat response' });
            res.end();
        } catch (e) { /* ignore */ }
    }
});

// Proxy Ollama Chat Completions (with Web Search, URL Scraper, File Attachments, Vision, Tool Calling, and SSE streaming)
app.post('/api/ollama/chat', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        const authHeader = serverConfig.ollama ? `Bearer ${serverConfig.ollama}` : '';
        const { model, messages, useMemory, sessionId, webSearch, personaPrompt, attachedFiles, useTools } = req.body;
        let finalMessages = Array.isArray(messages) ? [...messages] : [];
        let searchResults = [];
        let scrapedContent = null;
        let executedTools = [];

        const thaiDateStr = formatBangkokFull();
        const dayOfWeekTH = bangkokDayOfWeek();

        if (finalMessages.length > 0) {
            const lastUserMsg = [...finalMessages].reverse().find(m => m.role === 'user');
            if (lastUserMsg && lastUserMsg.content) {
                const urlMatch = lastUserMsg.content.match(/https?:\/\/[^\s]+/i);
                if (urlMatch) {
                    scrapedContent = await fetchWebContent(urlMatch[0]);
                }
                if (webSearch) {
                    searchResults = await performWebSearch(lastUserMsg.content);
                }
            }
        }

        const textFiles = (Array.isArray(attachedFiles) ? attachedFiles : []).filter(f => !f.type.startsWith('image/'));
        const imageFiles = (Array.isArray(attachedFiles) ? attachedFiles : []).filter(f => f.type.startsWith('image/'));

        let memorySection = '';
        if (useMemory) {
            const lastUser = [...finalMessages].reverse().find(m => m.role === 'user');
            if (lastUser && typeof lastUser.content === 'string') {
                const mems = await retrieveTopMemories(db, serverConfig, lastUser.content, 5);
                memorySection = buildMemorySection(mems);
            }
        }

        const systemContent = buildSystemContext({
            thaiDateStr, dayOfWeekTH, personaPrompt, textFiles, scrapedContent, searchResults, memorySection
        });
        finalMessages = [{ role: 'system', content: systemContent }, ...finalMessages];

        // Ollama vision: images go on the user message as base64 (strip data URL prefix)
        if (imageFiles.length > 0) {
            const lastUserIdx = finalMessages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx !== -1) {
                const lastUser = finalMessages[lastUserIdx];
                const images = imageFiles.map(img => {
                    const str = String(img.content || '');
                    const commaIdx = str.indexOf(',');
                    return commaIdx !== -1 ? str.slice(commaIdx + 1) : str;
                });
                finalMessages[lastUserIdx] = { ...lastUser, images };
            }
        }

        sseHeaders(res);
        const send = (event, data) => sseSend(res, event, data);
        const upstream = new AbortController();
        res.on('close', () => upstream.abort());
        const ping = setInterval(() => {
            try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
        }, 20000);

        const meta = {};
        if (searchResults.length > 0) meta.searchResults = searchResults;
        if (scrapedContent) meta.scrapedContent = scrapedContent;
        if (Object.keys(meta).length > 0) send('meta', meta);

        let fullContent = '';
        let promptEvalCount = 0;
        let evalCount = 0;

        const streamRound = async (reqPayload) => {
            let response;
            try {
                response = await fetch('https://ollama.com/api/chat', {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(reqPayload),
                    signal: upstream.signal
                });
            } catch (e) {
                if (e.name === 'AbortError') { send('aborted', {}); return null; }
                throw e;
            }

            if (!response.ok || !response.body) {
                const errText = await response.text().catch(() => '');
                send('error', { error: `Ollama API error (${response.status}): ${errText}` });
                return null;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const toolCalls = {};

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    let json;
                    try { json = JSON.parse(line); } catch (e) { continue; }
                    if (json.message?.content) {
                        fullContent += json.message.content;
                        send('delta', { content: json.message.content });
                    }
                    if (json.message?.tool_calls) {
                        for (const tc of json.message.tool_calls) {
                            const idx = tc.index ?? toolCalls.length;
                            toolCalls[idx] = toolCalls[idx] || { id: '', type: 'function', function: { name: '', arguments: '' } };
                            if (tc.id) toolCalls[idx].id = tc.id;
                            if (tc.type) toolCalls[idx].type = tc.type;
                            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                            if (tc.function?.arguments) {
                                const argStr = typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments || {});
                                toolCalls[idx].function.arguments += argStr;
                            }
                        }
                    }
                    if (json.prompt_eval_count) promptEvalCount = json.prompt_eval_count;
                    if (json.eval_count) evalCount = json.eval_count;
                }
            }

            return { toolCalls: Object.values(toolCalls).filter(tc => tc.function?.name) };
        };

        let toolRounds = 0;
        let streamPayload = {
            model: model || 'llama3',
            messages: finalMessages,
            stream: true
        };
        if (useTools) {
            streamPayload.tools = useMemory ? AVAILABLE_TOOLS : AVAILABLE_TOOLS.filter(t => t.function.name !== 'memory_search');
        }

        while (toolRounds < 5) {
            const result = await streamRound(streamPayload);
            if (!result) {
                clearInterval(ping);
                res.end();
                return;
            }

            if (result.toolCalls.length === 0) break;

            const assistantMsg = { role: 'assistant', content: fullContent || null, tool_calls: result.toolCalls };
            finalMessages.push(assistantMsg);
            for (const tc of result.toolCalls) {
                const fnName = tc.function.name;
                let fnArgs = {};
                try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch (e) { fnArgs = {}; }
                const toolOutput = await executeToolCall(fnName, fnArgs, db, getServerConfig());
                executedTools.push({ name: fnName, args: fnArgs, result: toolOutput });
                send('meta', { executedTools: [executedTools[executedTools.length - 1]] });
                finalMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolOutput });
            }
            streamPayload = { ...streamPayload, messages: finalMessages };
            toolRounds++;
        }

        send('done', {
            content: fullContent,
            tokenUsage: (promptEvalCount || evalCount) ? {
                prompt_tokens: promptEvalCount || 0,
                completion_tokens: evalCount || 0,
                total_tokens: (promptEvalCount || 0) + (evalCount || 0)
            } : null,
            estimatedCostUSD: null,
            searchResults: searchResults.length > 0 ? searchResults : null,
            scrapedContent: scrapedContent || null,
            executedTools: executedTools.length > 0 ? executedTools : null
        });
        clearInterval(ping);
        res.end();

        if (useMemory && sessionId && serverConfig.ollama) {
            extractAndStore(db, serverConfig, sessionId, [...finalMessages, ...(fullContent ? [{ role: 'assistant', content: fullContent }] : [])])
                .then(result => {
                    if (result) console.log('[memory] extracted', result.facts, 'facts, summary:', result.summary);
                })
                .catch(e => console.error('[memory] extraction error', e.message));
        }
    } catch (error) {
        console.error('Ollama chat error:', error);
        try {
            sseSend(res, 'error', { error: 'Failed to generate Ollama chat response' });
            res.end();
        } catch (e) { /* ignore */ }
    }
});

// Proxy Ollama Cloud Usage
app.get('/api/ollama/usage', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        if (!serverConfig.ollama) {
            return res.status(503).json({ error: 'Ollama API key not configured', available: false });
        }
        const response = await fetch('https://ollama.com/api/usage', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serverConfig.ollama}`,
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Ollama usage' });
    }
});

// Proxy Ollama Pay Usage Total
app.get('/api/ollama-pay/usage', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        if (!serverConfig.ollamaPay) {
            return res.status(503).json({ error: 'Ollama Pay API key not configured', available: false });
        }
        const response = await fetch('https://ollama-pay.thaigqsoft.com/api/v1/usage/total', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serverConfig.ollamaPay}`,
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Ollama Pay usage' });
    }
});

// Serve Vite frontend
const distPath = join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res) => {
        res.sendFile(join(distPath, 'index.html'));
    });
} else {
    app.use((req, res) => {
        res.send('Frontend build not found. Please run "npm run build".');
    });
}

if (process.env.START_SERVER !== '0') {
  app.listen(PORT, () => {
    console.log(`Dashboard server running on port ${PORT}`);
  });
}

export { app };
