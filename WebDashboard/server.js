import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// Proxy DeepSeek API Balance
app.get('/api/deepseek/balance', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const response = await fetch('https://api.deepseek.com/user/balance', {
            method: 'GET',
            headers: {
                'Authorization': authHeader || '',
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
        const authHeader = req.headers.authorization;
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': authHeader || '',
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
        const authHeader = req.headers.authorization;
        const response = await fetch('https://ollama.com/api/usage', {
            method: 'GET',
            headers: {
                'Authorization': authHeader || '',
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
        const authHeader = req.headers.authorization;
        const response = await fetch('https://ollama-pay.thaigqsoft.com/api/v1/usage/total', {
            method: 'GET',
            headers: {
                'Authorization': authHeader || '',
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
