import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to read server-side saved config
function getServerConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading config.json:', e);
    }
    return { deepseek: '', ollama: '', ollamaPay: '' };
}

// Helper to save server-side config
function saveServerConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error writing config.json:', e);
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

// Proxy DeepSeek Chat Completions
app.post('/api/deepseek/chat', async (req, res) => {
    try {
        const serverConfig = getServerConfig();
        const authHeader = req.headers.authorization || (serverConfig.deepseek ? `Bearer ${serverConfig.deepseek}` : '');
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate chat response' });
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
