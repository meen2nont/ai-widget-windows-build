import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
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


// ── Encryption Setup ────────────────────────────────────────────────────
// Derive a 32-byte key from CONFIG_SECRET env var (or a built-in default).
// Set CONFIG_SECRET in your environment for production security.
const RAW_SECRET = process.env.CONFIG_SECRET || 'ai-widget-dashboard-default-secret-2025';
const CIPHER_KEY = crypto.createHash('sha256').update(RAW_SECRET).digest(); // 32 bytes

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

// Get Config Endpoint
app.get('/api/config', (req, res) => {
    res.json(getServerConfig());
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
        const authHeader = req.headers.authorization || (serverConfig.deepseek ? `Bearer ${serverConfig.deepseek}` : '');
        const response = await fetch('https://api.deepseek.com/user/balance', {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
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
            name: r.name,
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
        
        const updateSessions = db.transaction((sessionsData) => {
            const currentIds = sessionsData.map(s => s.id).filter(id => typeof id === 'string');
            
            // Delete sessions not in the current payload (to handle deletions from UI)
            if (currentIds.length > 0) {
                const placeholders = currentIds.map(() => '?').join(',');
                db.prepare(`DELETE FROM sessions WHERE id NOT IN (${placeholders})`).run(...currentIds);
            } else {
                db.prepare('DELETE FROM sessions').run();
            }

            // Insert or Replace current sessions
            const stmt = db.prepare('INSERT OR REPLACE INTO sessions (id, name, updated_at, messages) VALUES (?, ?, ?, ?)');
            for (const s of sessionsData) {
                if (s.id) {
                    stmt.run(
                        s.id, 
                        s.name || 'New Chat', 
                        Date.now(), 
                        JSON.stringify(s.messages || [])
                    );
                }
            }
        });

        updateSessions(sessions);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error('Error saving sessions to DB:', e);
        res.status(500).json({ error: 'Failed to save chats' });
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
    }
];

// Helper to execute function tools
async function executeToolCall(toolName, args) {
    try {
        if (toolName === 'web_search') {
            const results = await performWebSearch(args.query || '');
            return JSON.stringify(results.slice(0, 3));
        }
        if (toolName === 'fetch_url') {
            const page = await fetchWebContent(args.url || '');
            return page ? page.text : "Could not fetch URL content.";
        }
        if (toolName === 'get_current_time') {
            const now = new Date();
            return now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'full', timeStyle: 'medium' });
        }
        if (toolName === 'calculator') {
            const expr = (args.expression || '').replace(/[^0-9+\-*/().\s]/g, '');
            const val = Function(`'use strict'; return (${expr})`)();
            return String(val);
        }
    } catch (e) {
        return `Tool execution error: ${e.message}`;
    }
    return "Unknown tool";
}

// Proxy DeepSeek Chat Completions (with Web Search, URL Scraper, File Attachments, and Tool Calling)
app.post('/api/deepseek/chat', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        const authHeader = req.headers.authorization || (serverConfig.deepseek ? `Bearer ${serverConfig.deepseek}` : '');
        
        const { webSearch, personaPrompt, attachedFiles, useTools, messages, ...otherParams } = req.body;
        let finalMessages = Array.isArray(messages) ? [...messages] : [];
        let searchResults = [];
        let scrapedContent = null;
        let executedTools = [];

        // Calculate real-time current date & time (Thailand Timezone)
        const now = new Date();
        const thaiDateStr = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'full', timeStyle: 'medium' });
        const dayOfWeekTH = now.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long' });

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

        let systemContent = `Today's exact real-time Date & Time is: ${thaiDateStr} (${dayOfWeekTH}).\n`;
        if (personaPrompt) {
            systemContent += `\nRole Persona Instructions: ${personaPrompt}\n`;
        }

        // Split attachedFiles into text files and image files
        const textFiles = (Array.isArray(attachedFiles) ? attachedFiles : []).filter(f => !f.type.startsWith('image/'));
        const imageFiles = (Array.isArray(attachedFiles) ? attachedFiles : []).filter(f => f.type.startsWith('image/'));

        // Process Text-based Attached Files into system prompt
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

        systemContent += `\nInstructions: Use the real-time date, role persona, attached files, scraped web content, and search results above to provide a clear, helpful, and accurate response.`;

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
            messages: finalMessages
        };

        if (useTools) {
            payload.tools = AVAILABLE_TOOLS;
        }

        let response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        let data = await response.json();

        // Handle Tool Calling roundtrip if model requested function calls
        if (useTools && data.choices?.[0]?.message?.tool_calls) {
            const toolCalls = data.choices[0].message.tool_calls;
            finalMessages.push(data.choices[0].message);

            for (const toolCall of toolCalls) {
                const fnName = toolCall.function.name;
                const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
                const toolOutput = await executeToolCall(fnName, fnArgs);

                executedTools.push({ name: fnName, args: fnArgs, result: toolOutput });

                finalMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolOutput
                });
            }

            // Call API again with tool results
            response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...otherParams,
                    messages: finalMessages
                })
            });
            data = await response.json();
        }

        if (searchResults.length > 0) {
            data.searchResults = searchResults;
        }
        if (scrapedContent) {
            data.scrapedContent = scrapedContent;
        }
        if (executedTools.length > 0) {
            data.executedTools = executedTools;
        }

        // Attach token usage and estimated cost
        if (data.usage) {
            const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = data.usage;
            // DeepSeek pricing: input $0.14/1M tokens, output $0.28/1M tokens
            const inputCost = (prompt_tokens / 1_000_000) * 0.14;
            const outputCost = (completion_tokens / 1_000_000) * 0.28;
            data.tokenUsage = { prompt_tokens, completion_tokens, total_tokens };
            data.estimatedCostUSD = (inputCost + outputCost).toFixed(6);
        }
        res.status(response.status).json(data);
    } catch (error) {
        console.error('DeepSeek chat error:', error);
        res.status(500).json({ error: 'Failed to generate chat response' });
    }
});

// Proxy Ollama Chat Completions
app.post('/api/ollama/chat', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        const authHeader = req.headers.authorization || (serverConfig.ollama ? `Bearer ${serverConfig.ollama}` : '');
        const { model, messages } = req.body;

        // Try Ollama Cloud or local endpoint
        const response = await fetch('https://ollama.com/api/chat', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'llama3',
                messages: messages,
                stream: false
            })
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Ollama chat error:', error);
        res.status(500).json({ error: 'Failed to generate Ollama chat response' });
    }
});

// Proxy Ollama Cloud Usage
app.get('/api/ollama/usage', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        const authHeader = req.headers.authorization || (serverConfig.ollama ? `Bearer ${serverConfig.ollama}` : '');
        const response = await fetch('https://ollama.com/api/usage', {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
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
        const authHeader = req.headers.authorization || (serverConfig.ollamaPay ? `Bearer ${serverConfig.ollamaPay}` : '');
        const response = await fetch('https://ollama-pay.thaigqsoft.com/api/v1/usage/total', {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
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

app.listen(PORT, () => {
    console.log(`Dashboard server running on port ${PORT}`);
});
