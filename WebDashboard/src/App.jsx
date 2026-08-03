import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Settings, RefreshCw, CheckCircle2, XCircle, Zap, Activity,
  MessageSquare, LayoutGrid, List, Copy, Send, ExternalLink, Clock, ShieldCheck, Lock, Globe, Search,
  Plus, Trash2, Download, UserCheck, Link2, Pencil, RotateCcw, Check, Paperclip, Wrench, FileText, X,
  Mic, MicOff, Volume2, VolumeX, BookOpen, DollarSign, ChevronDown, Image
} from 'lucide-react';
import { DeepSeekIcon, OllamaIcon, OllamaPayIcon } from './components/AIIcons';
import { encryptAndSaveConfig, loadAndDecryptConfig } from './utils/crypto';
import MarkdownMessage from './components/MarkdownMessage';
import './index.css';

const PERSONAS = {
  general: { name: '🤖 ทั่วไป (General Assistant)', prompt: '' },
  developer: { name: '👨‍💻 Senior Developer', prompt: 'You are an expert Senior Full-Stack Developer. Write clean, efficient, modern code with clear explanations.' },
  content: { name: '✍️ Content Creator', prompt: 'You are a creative Content Writer and Marketing Copywriter. Craft engaging, clear, and compelling content.' },
  translator: { name: '🌐 Professional Translator', prompt: 'You are a professional English-Thai translator. Translate text accurately with natural phrasing.' },
  analyst: { name: '📊 Data Analyst', prompt: 'You are a Data Analyst. Structure key insights using markdown tables and clear bullet points.' },
  custom: { name: '✏️ กำหนดเอง (Custom)', prompt: '' }
};

function App() {
  const [keys, setKeys] = useState({
    deepseek: '',
    ollama: '',
    ollamaPay: ''
  });

  const [refreshInterval, setRefreshInterval] = useState(
    Number(localStorage.getItem('refresh_interval')) || 60
  );

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'chat' | 'details'
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [toastMsg, setToastMsg] = useState('');

  // Load config from server (and fallback to local encrypted config) on initial mount
  useEffect(() => {
    async function initKeys() {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const serverKeys = await res.json();
          if (serverKeys.deepseek || serverKeys.ollama || serverKeys.ollamaPay) {
            setKeys(serverKeys);
            return;
          }
        }
      } catch (e) {
        console.warn('Could not fetch server config, fallback to local', e);
      }
      const decryptedKeys = await loadAndDecryptConfig();
      setKeys(decryptedKeys);
    }
    initKeys();
  }, []);

  const handleSaveKeys = async (e) => {
    e.preventDefault();
    // 1. Save to server-side JSON storage (/api/config)
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys)
      });
    } catch (err) {
      console.error('Failed to save config to server:', err);
    }

    // 2. Save encrypted backup to client-side localStorage
    const success = await encryptAndSaveConfig(keys);
    localStorage.setItem('refresh_interval', refreshInterval);
    setShowSettings(false);
    if (success) {
      showToast('Settings saved to Server & encrypted locally!');
    } else {
      showToast('Settings saved to Server!');
    }
    fetchData();
  };

  // Service Data State
  const [data, setData] = useState({
    deepseek: {
      balance: '0.00',
      currency: 'USD',
      spentToday: '0.0000',
      latencyMs: 0,
      available: false
    },
    ollama: {
      sessionPercent: 0,
      weeklyPercent: 0,
      cost: '$0.00',
      latencyMs: 0,
      available: false
    },
    ollamaPay: {
      tokensRemaining: 0,
      totalTokens: 0,
      todayTokens: 0,
      monthTokens: 0,
      todayRequests: 0,
      monthRequests: 0,
      todayPloyJoyTokens: 0,
      latencyMs: 0,
      available: false
    }
  });

  // AI Chat Playground State
  const [sessions, setSessions] = useState([
    {
      id: 'default-session',
      title: 'Chat 1',
      messages: [{ role: 'assistant', content: 'Hello! I am DeepSeek AI equipped with Web Search, Tools, File Attachments, Voice Input, Vision, and Personas. How can I assist you today?' }]
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('default-session');
  const [promptInput, setPromptInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');
  const [selectedPersona, setSelectedPersona] = useState('general');
  const [customPersonaPrompt, setCustomPersonaPrompt] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [useTools, setUseTools] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Feature 1: Voice Input (STT) & TTS
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);

  // Feature 2: Token usage per message
  // (stored inside message objects as .tokenUsage and .estimatedCostUSD)

  // Feature 3: Chat Search
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Feature 4: Prompt Templates
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState(() => {
    const saved = localStorage.getItem('prompt_templates');
    if (saved) return JSON.parse(saved);
    return [
      { id: 't1', name: '📝 สรุปรายงานประชุม', prompt: 'ช่วยสรุปรายงานการประชุมต่อไปนี้ให้กระชับ เน้นประเด็นสำคัญ การตัดสินใจ และ action items:\n\n[วางข้อความรายงานประชุมที่นี่]' },
      { id: 't2', name: '👨‍💻 Refactor Python Code', prompt: 'ช่วย refactor โค้ด Python ต่อไปนี้ให้เป็น Clean Code ตาม PEP 8 พร้อมอธิบายการเปลี่ยนแปลง:\n\n```python\n[วางโค้ดที่นี่]\n```' },
      { id: 't3', name: '🌐 แปลเอกสารสัญญา', prompt: 'ช่วยแปลเอกสารต่อไปนี้จากภาษาอังกฤษเป็นภาษาไทย โดยรักษาความหมายทางกฎหมายให้ครบถ้วน:\n\n[วางข้อความที่ต้องการแปล]' },
      { id: 't4', name: '🔍 Code Review', prompt: 'ช่วย review โค้ดต่อไปนี้ โดยตรวจหา bugs, security issues, performance issues และแนะนำการปรับปรุง:\n\n```\n[วางโค้ดที่นี่]\n```' },
      { id: 't5', name: '📊 วิเคราะห์ข้อมูล CSV', prompt: 'ช่วยวิเคราะห์ข้อมูลต่อไปนี้ และสรุปผลในรูปแบบตาราง Markdown พร้อม insights สำคัญ:\n\n[วางข้อมูล CSV หรือตารางที่นี่]' },
      { id: 't6', name: '✉️ ร่างอีเมลทางการ', prompt: 'ช่วยร่างอีเมลทางการภาษาไทยสำหรับ:\nเรื่อง: [ระบุเรื่อง]\nถึง: [ระบุผู้รับ]\nสาระสำคัญ: [ระบุเนื้อหาที่ต้องการสื่อ]' }
    ];
  });
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');

  // Load chat sessions from server / localStorage
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch('/api/chats');
        if (res.ok) {
          const saved = await res.json();
          if (Array.isArray(saved) && saved.length > 0) {
            setSessions(saved);
            setActiveSessionId(saved[0].id);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load server chats:', e);
      }
      const local = localStorage.getItem('ai_chat_sessions');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (parsed.length > 0) setSessions(parsed);
        } catch {}
      }
    }
    loadSessions();
  }, []);

  // Save chat sessions helper
  const saveSessions = (updatedSessions) => {
    setSessions(updatedSessions);
    localStorage.setItem('ai_chat_sessions', JSON.stringify(updatedSessions));
    fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSessions)
    }).catch(() => {});
  };

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = currentSession ? currentSession.messages : [];

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch DeepSeek Balance
      if (keys.deepseek) {
        const start = Date.now();
        try {
          const res = await fetch('/api/deepseek/balance', {
            headers: { 'Authorization': `Bearer ${keys.deepseek}` }
          });
          const latency = Date.now() - start;
          if (res.ok) {
            const json = await res.json();
            const bal = json.balance_infos?.[0]?.total_balance || '0.00';
            const curr = json.balance_infos?.[0]?.currency || 'USD';
            
            // Calculate daily spend estimation (Thailand Timezone)
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
            const savedDate = localStorage.getItem('ds_spend_date');
            const startBal = localStorage.getItem('ds_start_bal') || bal;
            let spent = '0.0000';

            if (savedDate === todayStr) {
              const diff = Math.max(0, parseFloat(startBal) - parseFloat(bal));
              spent = diff.toFixed(4);
            } else {
              localStorage.setItem('ds_spend_date', todayStr);
              localStorage.setItem('ds_start_bal', bal);
            }

            setData(d => ({
              ...d,
              deepseek: { balance: bal, currency: curr, spentToday: spent, latencyMs: latency, available: true }
            }));
          } else {
            setData(d => ({ ...d, deepseek: { ...d.deepseek, available: false, latencyMs: latency }}));
          }
        } catch {
          setData(d => ({ ...d, deepseek: { ...d.deepseek, available: false }}));
        }
      }

      // 2. Fetch Ollama Cloud Usage
      if (keys.ollama) {
        const start = Date.now();
        try {
          const res = await fetch('/api/ollama/usage', {
            headers: { 'Authorization': `Bearer ${keys.ollama}` }
          });
          const latency = Date.now() - start;
          if (res.ok) {
            const json = await res.json();
            const session = (json.limits?.session?.usage || 0) * 100;
            const weekly = (json.limits?.weekly?.usage || 0) * 100;
            const cost = json.activity?.cost || '$0.00';
            setData(d => ({
              ...d,
              ollama: { sessionPercent: session, weeklyPercent: weekly, cost, latencyMs: latency, available: true }
            }));
          } else {
            setData(d => ({ ...d, ollama: { ...d.ollama, available: false, latencyMs: latency }}));
          }
        } catch {
          setData(d => ({ ...d, ollama: { ...d.ollama, available: false }}));
        }
      }

      // 3. Fetch Ollama Pay Usage
      if (keys.ollamaPay) {
        const start = Date.now();
        try {
          const res = await fetch('/api/ollama-pay/usage', {
            headers: { 'Authorization': `Bearer ${keys.ollamaPay}` }
          });
          const latency = Date.now() - start;
          if (res.ok) {
            const json = await res.json();
            const acc = json.accounting || {};
            setData(d => ({
              ...d,
              ollamaPay: { 
                tokensRemaining: json.tokensRemaining || 0,
                totalTokens: json.tokensLimit || json.totalTokens || 0,
                todayTokens: acc.todayTokens || 0,
                monthTokens: acc.monthTokens || 0,
                todayRequests: acc.todayRequests || 0,
                monthRequests: acc.monthRequests || 0,
                todayPloyJoyTokens: acc.todayPloyJoyTokens || 0,
                latencyMs: latency,
                available: true 
              }
            }));
          } else {
            setData(d => ({ ...d, ollamaPay: { ...d.ollamaPay, available: false, latencyMs: latency }}));
          }
        } catch {
          setData(d => ({ ...d, ollamaPay: { ...d.ollamaPay, available: false }}));
        }
      }

      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  };

  const createNewSession = () => {
    const newId = 'session-' + Date.now();
    const newSess = {
      id: newId,
      title: `Chat ${sessions.length + 1}`,
      messages: [{ role: 'assistant', content: 'Hello! How can I help you in this new session?' }]
    };
    const updated = [newSess, ...sessions];
    saveSessions(updated);
    setActiveSessionId(newId);
  };

  const deleteCurrentSession = () => {
    if (sessions.length <= 1) return;
    const updated = sessions.filter(s => s.id !== activeSessionId);
    saveSessions(updated);
    setActiveSessionId(updated[0].id);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type,
          content: content
        }]);
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedFile = (fileIndex) => {
    setAttachedFiles(prev => prev.filter((_, idx) => idx !== fileIndex));
  };

  // Feature 1: Voice Input (STT)
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('Browser ไม่รองรับ Voice Input'); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'th-TH';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setPromptInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // Feature 1: Text-to-Speech (TTS) — Natural Voice
  const speakText = (text) => {
    if (!window.speechSynthesis) { showToast('Browser ไม่รองรับ Text-to-Speech'); return; }
    window.speechSynthesis.cancel();

    // --- Step 1: Clean Markdown and noise before speaking ---
    const cleanText = text
      // Remove code blocks (```...```) entirely — don't read code
      .replace(/```[\s\S]*?```/g, ' (โค้ดตัวอย่าง) ')
      // Remove inline code
      .replace(/`[^`]+`/g, match => match.slice(1, -1))
      // Remove markdown headers (# ## ###)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers (**text**, *text*, __text__)
      .replace(/(\*{1,2}|_{1,2})(.*?)\1/g, '$2')
      // Remove links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove bare URLs
      .replace(/https?:\/\/\S+/g, 'ลิงก์')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}$/gm, '')
      // Remove leading bullet/dash symbols
      .replace(/^[\s]*[-•*]\s/gm, '')
      // Remove numbered list dots (1. 2. etc.)
      .replace(/^\s*\d+\.\s/gm, '')
      // Collapse excessive whitespace/newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // --- Step 2: Pick the best available Thai (or fallback) voice ---
    const voices = window.speechSynthesis.getVoices();
    const preferredOrder = [
      // Google Neural Thai (Chrome)
      v => v.name.includes('Google') && v.lang.startsWith('th'),
      // Any Thai voice
      v => v.lang.startsWith('th'),
      // Google Neural — any language
      v => v.name.includes('Google') && v.lang.startsWith('en'),
      // Any English voice as last resort
      v => v.lang.startsWith('en'),
    ];
    let bestVoice = null;
    for (const matcher of preferredOrder) {
      bestVoice = voices.find(matcher);
      if (bestVoice) break;
    }

    // --- Step 3: Split into natural sentence chunks for pacing ---
    // Split on Thai/English sentence boundaries
    const sentences = cleanText
      .split(/(?<=[.!?।\n])\s+|(?<=[\u0E4F\u0E2F])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const chunks = sentences.length > 0 ? sentences : [cleanText.substring(0, 3000)];

    let chunkIndex = 0;
    const speakNext = () => {
      if (chunkIndex >= chunks.length) {
        setIsSpeaking(false);
        return;
      }
      const chunk = chunks[chunkIndex++];
      const utter = new SpeechSynthesisUtterance(chunk);
      utter.lang = bestVoice?.lang || 'th-TH';
      if (bestVoice) utter.voice = bestVoice;
      // Natural speaking pace — slightly slower than default, warmer pitch
      utter.rate = 0.88;
      utter.pitch = 1.05;
      utter.volume = 1.0;
      utter.onend = speakNext;
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    };

    setIsSpeaking(true);
    // Voices may not be loaded yet — wait for them
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speakNext();
      };
    } else {
      speakNext();
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Feature 4: Template helpers
  const saveTemplate = () => {
    if (!newTemplateName.trim() || !newTemplatePrompt.trim()) return;
    const newT = { id: `t${Date.now()}`, name: newTemplateName, prompt: newTemplatePrompt };
    const updated = [...templates, newT];
    setTemplates(updated);
    localStorage.setItem('prompt_templates', JSON.stringify(updated));
    setNewTemplateName('');
    setNewTemplatePrompt('');
    showToast('บันทึก Template เรียบร้อยแล้ว!');
  };

  const deleteTemplate = (id) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem('prompt_templates', JSON.stringify(updated));
  };

  // Feature 5: Multi-format export
  const exportAs = (format) => {
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session) return;
    const msgs = session.messages;

    if (format === 'md') {
      const md = msgs.map(m => `**${m.role === 'user' ? 'User' : 'AI'}:**\n${m.content}`).join('\n\n---\n\n');
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${session.title}.md`; a.click();
    } else if (format === 'json') {
      const blob = new Blob([JSON.stringify({ session: session.title, messages: msgs.map(m => ({ role: m.role, content: m.content, tokenUsage: m.tokenUsage || null, cost: m.estimatedCostUSD || null })) }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${session.title}.json`; a.click();
    } else if (format === 'html') {
      const rows = msgs.map(m => `<div class="msg ${m.role}"><strong>${m.role === 'user' ? '👤 User' : '🤖 AI'}</strong><div class="content">${m.content.replace(/\n/g,'<br>')}</div></div>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${session.title}</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;background:#0d1117;color:#e6edf3}.msg{margin:1rem 0;padding:1rem;border-radius:12px}.user{background:#1e3a8a;text-align:right}.assistant{background:#161b22;border:1px solid #30363d}.content{margin-top:.5rem;white-space:pre-wrap}</style></head><body><h1>${session.title}</h1>${rows}</body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${session.title}.html`; a.click();
    } else if (format === 'print') {
      window.print();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('คัดลอกข้อความเรียบร้อยแล้ว!');
  };

  const handleEditUserMessage = (msgIndex) => {
    const targetMsg = messages[msgIndex];
    if (!targetMsg || targetMsg.role !== 'user') return;

    const trimmedMsgs = messages.slice(0, msgIndex);
    setPromptInput(targetMsg.content);

    const updatedSessions = sessions.map(s => 
      s.id === activeSessionId ? { ...s, messages: trimmedMsgs } : s
    );
    saveSessions(updatedSessions);
    showToast('ดึงข้อความมาแก้ไขแล้ว สามารถปรับแก้แล้วส่งใหม่ได้เลย!');
  };

  const handleUndoLastMessage = (msgIndex) => {
    // If a specific index is provided, undo from that message
    // Otherwise fall back to the last user message (legacy usage)
    const targetIdx = (msgIndex !== undefined) 
      ? msgIndex 
      : [...messages].map(m => m.role).lastIndexOf('user');
    if (targetIdx === -1) return;
    handleEditUserMessage(targetIdx);
  };

  const exportCurrentChat = () => {
    const markdownContent = messages
      .map(m => `### ${m.role === 'user' ? '👤 User' : '🤖 Assistant'}\n${m.content}\n`)
      .join('\n---\n\n');
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentSession.title.replace(/\s+/g, '_')}_chat_export.md`;
    link.click();
    showToast('Exported chat to Markdown!');
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if ((!promptInput.trim() && attachedFiles.length === 0) || isGenerating) return;

    const isOllamaModel = selectedModel.startsWith('ollama:');
    if (!isOllamaModel && !keys.deepseek) {
      showToast('กรุณากรอก DeepSeek API Key ใน Settings ก่อนใช้งาน');
      setShowSettings(true);
      return;
    }

    const userText = promptInput;
    const currentAttachedFiles = [...attachedFiles];
    const userMsgObj = { 
      role: 'user', 
      content: userText, 
      attachedFiles: currentAttachedFiles.length > 0 ? currentAttachedFiles : null 
    };
    const updatedMessages = [...messages, userMsgObj];
    
    // Update local state immediately via functional update
    setSessions(prevSessions => {
      const next = prevSessions.map(s => 
        s.id === activeSessionId ? { ...s, messages: updatedMessages, title: s.messages.length <= 1 ? (userText ? userText.substring(0, 20) : 'File Upload') : s.title } : s
      );
      localStorage.setItem('ai_chat_sessions', JSON.stringify(next));
      return next;
    });

    setPromptInput('');
    setAttachedFiles([]);
    setIsGenerating(true);

    const activePersonaPrompt = selectedPersona === 'custom' 
      ? customPersonaPrompt 
      : PERSONAS[selectedPersona]?.prompt || '';

    try {
      const endpoint = isOllamaModel ? '/api/ollama/chat' : '/api/deepseek/chat';
      const authHeader = isOllamaModel ? `Bearer ${keys.ollama}` : `Bearer ${keys.deepseek}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: isOllamaModel ? selectedModel.replace('ollama:', '') : selectedModel,
          webSearch: enableWebSearch,
          useTools: useTools,
          personaPrompt: activePersonaPrompt,
          attachedFiles: currentAttachedFiles,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content || json.message?.content || 'No response from model.';
        const finalMsgs = [...updatedMessages, { 
          role: 'assistant', 
          content: reply, 
          searchResults: json.searchResults || null,
          scrapedContent: json.scrapedContent || null,
          executedTools: json.executedTools || null,
          tokenUsage: json.tokenUsage || null,
          estimatedCostUSD: json.estimatedCostUSD || null
        }];

        saveSessions(sessions.map(s => s.id === activeSessionId ? { ...s, messages: finalMsgs } : s));
        fetchData(); // Refresh balance after chat
      } else {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error || '⚠️ Error communicating with AI API.';
        const errMsgs = [...updatedMessages, { role: 'assistant', content: `⚠️ ${errMsg}` }];
        saveSessions(sessions.map(s => s.id === activeSessionId ? { ...s, messages: errMsgs } : s));
      }
    } catch {
      const netErrMsgs = [...updatedMessages, { role: 'assistant', content: '⚠️ Network request failed.' }];
      saveSessions(sessions.map(s => s.id === activeSessionId ? { ...s, messages: netErrMsgs } : s));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyStatsToClipboard = () => {
    const thaiTimeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const summary = `
📊 AI Service Monitoring Summary (${thaiTimeStr} น.)
-----------------------------------------
🔹 DeepSeek: $${data.deepseek.balance} ${data.deepseek.currency} (Spent today: $${data.deepseek.spentToday})
☁️ Ollama Cloud: Session ${data.ollama.sessionPercent.toFixed(1)}% | Weekly ${data.ollama.weeklyPercent.toFixed(1)}% | Cost: ${data.ollama.cost}
💳 Ollama Pay: Remaining ${data.ollamaPay.tokensRemaining.toLocaleString()} tokens | Today: ${data.ollamaPay.todayTokens.toLocaleString()}
    `.trim();
    navigator.clipboard.writeText(summary);
    showToast('คัดลอกสรุปโควต้าแล้ว!');
  };

  useEffect(() => {
    fetchData();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [keys, refreshInterval]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeServicesCount = [data.deepseek.available, data.ollama.available, data.ollamaPay.available].filter(Boolean).length;

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="brand-title">
          <Activity size={26} style={{ color: '#2f81f7' }} />
          <h1>AI Service Monitoring</h1>
        </div>

        <div className="header-actions">
          <div className="latency-tag" style={{ padding: '0.4rem 0.75rem', borderRadius: '10px' }}>
            <Clock size={14} />
            <span>อัปเดตเมื่อ {lastRefreshed.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} น.</span>
          </div>

          <button className="secondary" onClick={() => copyStatsToClipboard()} title="Copy Markdown Summary">
            <Copy size={18} /> Export
          </button>

          <button className="secondary" onClick={() => fetchData()} title="Refresh Data">
            <RefreshCw size={18} className={loading ? 'loading' : ''} />
          </button>

          <button className="primary" onClick={() => setShowSettings(true)}>
            <Settings size={18} /> Settings
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutGrid size={18} /> Overview Cards
        </button>
        <button 
          className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={18} /> DeepSeek AI Playground
        </button>
        <button 
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          <List size={18} /> Detailed Metrics
        </button>
      </div>

      {/* Summary Metrics Banner */}
      <div className="summary-banner">
        <div className="summary-card">
          <div className="summary-icon-box indigo">
            <Activity />
          </div>
          <div>
            <div className="summary-label">Active Services</div>
            <div className="summary-value">{activeServicesCount} / 3 Connected</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box emerald">
            <DeepSeekIcon size={24} style={{ color: '#34d399' }} />
          </div>
          <div>
            <div className="summary-label">DeepSeek Balance</div>
            <div className="summary-value">${data.deepseek.balance}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box cyan">
            <OllamaIcon size={24} style={{ color: '#38bdf8' }} />
          </div>
          <div>
            <div className="summary-label">Ollama Session</div>
            <div className="summary-value">{(100 - data.ollama.sessionPercent).toFixed(1)}% Free</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box amber">
            <OllamaPayIcon size={24} style={{ color: '#fbbf24' }} />
          </div>
          <div>
            <div className="summary-label">Ollama Pay Today</div>
            <div className="summary-value">{data.ollamaPay.todayTokens.toLocaleString()} tokens</div>
          </div>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid">
          {/* DeepSeek Card */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title-group">
                <DeepSeekIcon size={24} style={{ color: '#818cf8' }} />
                <h2 className="card-title">DeepSeek AI</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="latency-tag">{data.deepseek.latencyMs} ms</span>
                {data.deepseek.available ? 
                  <span className="badge success"><CheckCircle2 size={12} /> Online</span> : 
                  <span className="badge error"><XCircle size={12} /> Offline</span>
                }
              </div>
            </div>

            <div className="metric-row">
              <div>
                <div className="stat-label">Available Balance</div>
                <div className="metric-value-huge">${data.deepseek.balance} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>{data.deepseek.currency}</span></div>
              </div>
            </div>

            <div className="sub-grid">
              <div className="sub-stat-box">
                <div className="sub-stat-label">Spent Today (Est.)</div>
                <div className="sub-stat-value">${data.deepseek.spentToday}</div>
              </div>
              <div className="sub-stat-box">
                <div className="sub-stat-label">Model</div>
                <div className="sub-stat-value" style={{fontSize: '0.9rem'}}>deepseek-chat</div>
              </div>
            </div>
          </div>

          {/* Ollama Cloud Card */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title-group">
                <OllamaIcon size={24} style={{ color: '#38bdf8' }} />
                <h2 className="card-title">Ollama Cloud</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="latency-tag">{data.ollama.latencyMs} ms</span>
                {data.ollama.available ? 
                  <span className="badge success"><CheckCircle2 size={12} /> Online</span> : 
                  <span className="badge error"><XCircle size={12} /> Offline</span>
                }
              </div>
            </div>

            <div className="progress-container">
              <div className="progress-header">
                <span>5-Hour Session Quota Used</span>
                <span style={{ fontWeight: 700, color: data.ollama.sessionPercent > 85 ? 'var(--accent-rose)' : 'white' }}>
                  {data.ollama.sessionPercent.toFixed(1)}%
                </span>
              </div>
              <div className="progress-track">
                <div 
                  className={`progress-fill ${data.ollama.sessionPercent > 85 ? 'amber' : 'indigo'}`} 
                  style={{ width: `${Math.min(data.ollama.sessionPercent, 100)}%` }} 
                />
              </div>
            </div>

            <div className="progress-container">
              <div className="progress-header">
                <span>Weekly Limit Used</span>
                <span>{data.ollama.weeklyPercent.toFixed(1)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill emerald" style={{ width: `${Math.min(data.ollama.weeklyPercent, 100)}%` }} />
              </div>
            </div>

            <div className="sub-grid">
              <div className="sub-stat-box">
                <div className="sub-stat-label">Current Cost</div>
                <div className="sub-stat-value">{data.ollama.cost}</div>
              </div>
              <div className="sub-stat-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <a href="https://ollama.com/settings" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Manage Ollama <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>

          {/* Ollama Pay Card */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title-group">
                <OllamaPayIcon size={24} style={{ color: '#fbbf24' }} />
                <h2 className="card-title">Ollama Pay</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="latency-tag">{data.ollamaPay.latencyMs} ms</span>
                {data.ollamaPay.available ? 
                  <span className="badge success"><CheckCircle2 size={12} /> Online</span> : 
                  <span className="badge error"><XCircle size={12} /> Offline</span>
                }
              </div>
            </div>

            <div className="metric-row">
              <div>
                <div className="stat-label">Tokens Remaining</div>
                <div className="metric-value-huge">{data.ollamaPay.tokensRemaining.toLocaleString()}</div>
              </div>
            </div>

            <div className="progress-container">
              <div className="progress-header">
                <span>Quota Remaining</span>
                <span>
                  {data.ollamaPay.totalTokens ? ((data.ollamaPay.tokensRemaining / data.ollamaPay.totalTokens) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill amber" style={{ 
                  width: `${data.ollamaPay.totalTokens ? (data.ollamaPay.tokensRemaining / data.ollamaPay.totalTokens) * 100 : 0}%` 
                }} />
              </div>
            </div>

            <div className="sub-grid">
              <div className="sub-stat-box">
                <div className="sub-stat-label">Today Tokens</div>
                <div className="sub-stat-value">{data.ollamaPay.todayTokens.toLocaleString()}</div>
              </div>
              <div className="sub-stat-box">
                <div className="sub-stat-label">Month Tokens</div>
                <div className="sub-stat-value">{data.ollamaPay.monthTokens.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI CHAT PLAYGROUND */}
      {activeTab === 'chat' && (
        <div className="chat-widget">
          <div className="chat-body-layout">
            {/* Left Sidebar (Sessions List) */}
            <div className="chat-sidebar">
              <div className="chat-sidebar-header">
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Conversations</span>
                <button type="button" onClick={createNewSession} className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} title="Create New Chat">
                  <Plus size={14} /> New
                </button>
              </div>
              {/* Feature 3: Sidebar Search */}
              <div style={{ position: 'relative', margin: '0.4rem 0' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="ค้นหาบทสนทนา..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem 0.35rem 1.75rem', fontSize: '0.75rem', background: '#0d1117', borderRadius: '8px', border: '1px solid #21262d', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', overflowY: 'auto', flex: 1 }}>
                {sessions.filter(s => !sidebarSearch.trim() || s.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || s.messages.some(m => m.content.toLowerCase().includes(sidebarSearch.toLowerCase()))).map(s => (
                  <div 
                    key={s.id} 
                    className={`chat-session-item ${s.id === activeSessionId ? 'active' : ''}`}
                    onClick={() => setActiveSessionId(s.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                      <MessageSquare size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    </div>
                    {sessions.length > 1 && s.id === activeSessionId && (
                      <Trash2 size={13} style={{ color: '#f85149', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteCurrentSession(); }} title="Delete Chat" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Main Chat Area */}
            <div className="chat-main-area">
              {/* Header Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                    <MessageSquare size={20} style={{ color: '#38bdf8' }} /> {currentSession.title}
                  </h3>
                    {/* Feature 5: Multi-format Export */}
                  <div style={{ position: 'relative', display: 'inline-block' }} className="export-dropdown-wrapper">
                    <button type="button" className="secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      onClick={e => { e.currentTarget.nextSibling.style.display = e.currentTarget.nextSibling.style.display === 'block' ? 'none' : 'block'; }}
                    >
                      <Download size={14} /> Export <ChevronDown size={12} />
                    </button>
                    <div style={{ display: 'none', position: 'absolute', top: '110%', left: 0, zIndex: 999, background: '#1c2128', border: '1px solid #30363d', borderRadius: '10px', minWidth: '160px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '0.4rem' }}>
                      {[['md','📄 Markdown (.md)'],['json','📊 JSON (.json)'],['html','🌐 HTML (.html)'],['print','🖨️ Print / PDF']].map(([fmt, label]) => (
                        <button key={fmt} type="button" onClick={() => { exportAs(fmt); document.querySelectorAll('.export-dropdown-wrapper div').forEach(d => d.style.display='none'); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-primary)', padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', borderRadius: '7px' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#21262d'} onMouseLeave={e=>e.currentTarget.style.background='none'}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Controls & Model Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <select 
                    value={selectedPersona} 
                    onChange={e => setSelectedPersona(e.target.value)}
                    style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: '#1c2128' }}
                  >
                    {Object.entries(PERSONAS).map(([key, p]) => (
                      <option key={key} value={key}>{p.name}</option>
                    ))}
                  </select>

                  <button 
                    type="button"
                    onClick={() => setUseTools(!useTools)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem', 
                      padding: '0.35rem 0.75rem', 
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: useTools ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                      border: `1px solid ${useTools ? 'rgba(251, 191, 36, 0.4)' : 'var(--panel-border)'}`, 
                      color: useTools ? '#fbbf24' : 'var(--text-tertiary)' 
                    }}
                    title="Toggle Function Calling / AI Tools"
                  >
                    <Wrench size={14} />
                    <span>Tools: <strong>{useTools ? 'ON' : 'OFF'}</strong></span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setEnableWebSearch(!enableWebSearch)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem', 
                      padding: '0.35rem 0.75rem', 
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: enableWebSearch ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                      border: `1px solid ${enableWebSearch ? 'rgba(56, 189, 248, 0.4)' : 'var(--panel-border)'}`, 
                      color: enableWebSearch ? '#38bdf8' : 'var(--text-tertiary)' 
                    }}
                    title="Toggle Web Search for live up-to-date responses"
                  >
                    <Globe size={14} />
                    <span>Web Search: <strong>{enableWebSearch ? 'ON' : 'OFF'}</strong></span>
                  </button>

                  <select 
                    value={selectedModel} 
                    onChange={e => setSelectedModel(e.target.value)}
                    style={{ width: 'auto', padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                  >
                    <optgroup label="DeepSeek API">
                      <option value="deepseek-chat">deepseek-chat</option>
                      <option value="deepseek-coder">deepseek-coder</option>
                    </optgroup>
                    <optgroup label="Ollama Cloud / Local">
                      <option value="ollama:llama3">ollama: llama3</option>
                      <option value="ollama:qwen2.5">ollama: qwen2.5</option>
                      <option value="ollama:mistral">ollama: mistral</option>
                    </optgroup>
                  </select>

                  {/* Feature 4: Templates Button */}
                  <button
                    type="button"
                    onClick={() => setShowTemplates(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
                      fontSize: '0.8rem', fontWeight: 600,
                      background: 'rgba(167, 139, 250, 0.12)',
                      border: '1px solid rgba(167, 139, 250, 0.35)',
                      color: '#a78bfa'
                    }}
                    title="Prompt Templates Library"
                  >
                    <BookOpen size={14} /> Templates
                  </button>
                </div>
              </div>

              {/* Custom Persona Text Input (if selected) */}
              {selectedPersona === 'custom' && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <input 
                    type="text" 
                    placeholder="Enter custom System Prompt / Persona instructions..."
                    value={customPersonaPrompt}
                    onChange={e => setCustomPersonaPrompt(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
                  />
                </div>
              )}

              {/* Messages Container */}
              <div className="chat-messages">
                {messages.map((m, idx) => (
                  <div key={idx} className={`message-wrapper ${m.role}`}>
                    <div className={`message-bubble ${m.role}`}>
                      {/* Search Badge */}
                      {m.searchResults && m.searchResults.length > 0 && (
                        <div style={{
                          fontSize: '0.78rem',
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          marginBottom: '0.6rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}>
                          <Globe size={14} />
                          <span>ดึงข้อมูลสดจากเว็บแล้ว ({m.searchResults.length} แหล่งอ้างอิง)</span>
                        </div>
                      )}

                      {/* Scraped URL Content Badge */}
                      {m.scrapedContent && (
                        <div style={{
                          fontSize: '0.78rem',
                          color: '#3fb950',
                          background: 'rgba(63, 185, 80, 0.1)',
                          border: '1px solid rgba(63, 185, 80, 0.25)',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          marginBottom: '0.6rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}>
                          <Link2 size={14} />
                          <span>อ่านเนื้อหาจากลิงก์: <strong>{m.scrapedContent.title}</strong></span>
                        </div>
                      )}

                      {/* Executed Tools Badge */}
                      {m.executedTools && m.executedTools.length > 0 && (
                        <div style={{
                          fontSize: '0.78rem',
                          color: '#fbbf24',
                          background: 'rgba(251, 191, 36, 0.1)',
                          border: '1px solid rgba(251, 191, 36, 0.25)',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          marginBottom: '0.6rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}>
                          <Wrench size={14} />
                          <span>เรียกใช้เครื่องมือ: <strong>{m.executedTools.map(t => t.name).join(', ')}</strong></span>
                        </div>
                      )}

                      {/* Attached Files Badge */}
                      {m.attachedFiles && m.attachedFiles.length > 0 && (
                        <div style={{
                          fontSize: '0.78rem',
                          color: '#a78bfa',
                          background: 'rgba(167, 139, 250, 0.1)',
                          border: '1px solid rgba(167, 139, 250, 0.25)',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          marginBottom: '0.6rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}>
                          <FileText size={14} />
                          <span>แนบไฟล์: <strong>{m.attachedFiles.map(f => f.name).join(', ')}</strong></span>
                        </div>
                      )}

                      {/* Message Content with Markdown & Code Highlighting */}
                      {m.role === 'user' ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      ) : (
                        <MarkdownMessage content={m.content} />
                      )}
                    </div>

                    {/* Small Action Icons Outside Bubble (Bottom Corner) */}
                    <div className="message-actions-outside">
                      {m.role === 'user' && (
                        <>
                          <button 
                            type="button" 
                            onClick={() => handleEditUserMessage(idx)}
                            className="action-icon-btn"
                            title="แก้ไขคำถามนี้ (ดึงกลับมาแก้)"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUndoLastMessage(idx)}
                            className="action-icon-btn"
                            title="Undo — ลบข้อความนี้และคำตอบออก แล้วนำกลับมาแก้ใหม่"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </>
                      )}
                      <button 
                        type="button" 
                        onClick={() => copyToClipboard(m.content)}
                        className="action-icon-btn"
                        title="คัดลอกข้อความ"
                      >
                        <Copy size={13} />
                      </button>
                      {/* Feature 1: TTS button on AI messages */}
                      {m.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => isSpeaking ? stopSpeaking() : speakText(m.content)}
                          className="action-icon-btn"
                          title={isSpeaking ? 'หยุดอ่าน' : 'อ่านออกเสียง (TTS)'}
                          style={{ color: isSpeaking ? '#f87171' : undefined }}
                        >
                          {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                      )}
                    </div>
                    {/* Feature 2: Token usage badge below assistant messages */}
                    {m.role === 'assistant' && m.tokenUsage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: '0.25rem' }}>
                        <DollarSign size={11} style={{ color: '#34d399' }} />
                        <span style={{ color: '#34d399' }}>${m.estimatedCostUSD}</span>
                        <span>·</span>
                        <span>↑ {m.tokenUsage.prompt_tokens?.toLocaleString()} in</span>
                        <span>↓ {m.tokenUsage.completion_tokens?.toLocaleString()} out</span>
                        <span>· total {m.tokenUsage.total_tokens?.toLocaleString()} tokens</span>
                      </div>
                    )}
                  </div>
                ))}

                {isGenerating && (
                  <div className="message-bubble assistant">
                    <div className="loading" /> {enableWebSearch ? 'กำลังค้นหาเว็บ อ่านลิงก์ และสรุปคำตอบ...' : 'Generating response...'}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick Prompt Pills */}
              {messages.length <= 1 && (
                <div className="prompt-pills-container">
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยสรุปข่าวสารและเหตุการณ์สำคัญประจำวันนี้ให้ฟังหน่อย')}>🌐 ข่าวอัปเดตวันนี้</button>
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยตรวจเช็กและแนะนำการ refactor โค้ดส่วนนี้ให้เป็น Clean Code')}>👨‍💻 ตรวจสอบโค้ด</button>
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยวิเคราะห์ข้อมูลต่อไปนี้และจัดรูปแบบให้อยู่ในตาราง Markdown')}>📊 สรุปตารางข้อมูล</button>
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยร่างอีเมลสื่อสารการทำงานที่เป็นมืออาชีพ')}>✍️ ร่างอีเมลการทำงาน</button>
                </div>
              )}

              {/* Hidden File Input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                multiple 
                style={{ display: 'none' }} 
              />

              {/* Attached Files Preview Bar */}
              {attachedFiles.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', padding: '0.4rem', background: 'rgba(22, 26, 33, 0.8)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                  {attachedFiles.map((file, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: file.type.startsWith('image/') ? 'rgba(56,189,248,0.12)' : 'rgba(167, 139, 250, 0.15)', border: `1px solid ${file.type.startsWith('image/') ? 'rgba(56,189,248,0.3)' : 'rgba(167, 139, 250, 0.3)'}`, padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', color: file.type.startsWith('image/') ? '#38bdf8' : '#c4b5fd' }}>
                      {file.type.startsWith('image/') ? (
                        <img src={file.content} alt={file.name} className="file-chip-img" />
                      ) : (
                        <FileText size={14} />
                      )}
                      <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                      <X size={14} style={{ cursor: 'pointer', color: '#f85149' }} onClick={() => removeAttachedFile(i)} />
                    </div>
                  ))}
                </div>
              )}

              {/* Chat Input Form */}
              <form onSubmit={sendChatMessage} className="chat-input-box">
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="secondary"
                  style={{ padding: '0.5rem 0.65rem', border: 'none', background: 'transparent' }}
                  title="แนบไฟล์ (ข้อความ, โค้ด, ไฟล์ข้อมูล, รูปภาพ)"
                >
                  <Paperclip size={18} style={{ color: 'var(--text-secondary)' }} />
                </button>

                <textarea 
                  rows={1}
                  placeholder={selectedModel.startsWith('ollama:') ? (keys.ollama ? "Ask Ollama AI, attach files, or paste any URL..." : "Please set Ollama Key in Settings...") : (keys.deepseek ? "Ask DeepSeek, attach files, or paste any URL (Shift+Enter for new line)..." : "Please set DeepSeek Key in Settings...")}
                  value={promptInput}
                  onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage(e);
                    }
                  }}
                  disabled={isGenerating}
                />

                {/* Feature 1: Voice Input (Mic) Button */}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className="secondary"
                  style={{
                    padding: '0.5rem 0.65rem', border: 'none',
                    background: isListening ? 'rgba(248, 113, 113, 0.15)' : 'transparent',
                    color: isListening ? '#f87171' : 'var(--text-secondary)',
                    borderRadius: '10px',
                    animation: isListening ? 'pulse 1.2s ease-in-out infinite' : 'none'
                  }}
                  title={isListening ? 'กำลังฟัง... คลิกเพื่อหยุด' : 'พูดเพื่อป้อนข้อความ (Voice Input)'}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button type="submit" className="primary" style={{ padding: '0.5rem 1rem' }} disabled={isGenerating}>
                  <Send size={16} /> Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Feature 4: Prompt Templates Modal */}
      {showTemplates && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowTemplates(false); }}
        >
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '18px', padding: '1.75rem', maxWidth: '680px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a78bfa' }}>
                <BookOpen size={20} /> Prompt Templates Library
              </h3>
              <button type="button" onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '0.25rem' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {templates.map(t => (
                <div key={t.id} style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem', cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#a78bfa'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem', color: '#e6edf3' }}>{t.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '0.75rem', lineHeight: 1.4 }}>{t.prompt.substring(0, 120)}...</div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => { setPromptInput(t.prompt); setShowTemplates(false); showToast('Template โหลดแล้ว'); }}
                      style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.78rem', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', borderRadius: '8px', cursor: 'pointer' }}>
                      ใช้งาน Template นี้
                    </button>
                    {!['t1','t2','t3','t4','t5','t6'].includes(t.id) && (
                      <button type="button" onClick={() => deleteTemplate(t.id)}
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', borderRadius: '8px', cursor: 'pointer' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #30363d', paddingTop: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>➕ บันทึก Template ใหม่</div>
              <input type="text" placeholder="ชื่อ Template..." value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                style={{ width: '100%', marginBottom: '0.6rem', padding: '0.55rem 0.75rem', background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              <textarea rows={3} placeholder="เนื้อหา Prompt..." value={newTemplatePrompt} onChange={e => setNewTemplatePrompt(e.target.value)}
                style={{ width: '100%', marginBottom: '0.75rem', padding: '0.55rem 0.75rem', background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }} />
              <button type="button" onClick={saveTemplate} className="primary" style={{ width: '100%' }}>
                💾 บันทึก Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DETAILED METRICS TABLE */}
      {activeTab === 'details' && (
        <div className="glass-card" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Comprehensive Service Quota Breakdown</h3>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '0.75rem' }}>Service</th>
                <th style={{ padding: '0.75rem' }}>Metric / Metric Name</th>
                <th style={{ padding: '0.75rem' }}>Current Value</th>
                <th style={{ padding: '0.75rem' }}>Latency</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>DeepSeek API</td>
                <td style={{ padding: '0.75rem' }}>Total Balance</td>
                <td style={{ padding: '0.75rem' }}>${data.deepseek.balance} {data.deepseek.currency}</td>
                <td style={{ padding: '0.75rem' }}>{data.deepseek.latencyMs} ms</td>
                <td style={{ padding: '0.75rem' }}>{data.deepseek.available ? 'OK' : 'Error'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>DeepSeek API</td>
                <td style={{ padding: '0.75rem' }}>Estimated Spent Today</td>
                <td style={{ padding: '0.75rem' }}>${data.deepseek.spentToday}</td>
                <td style={{ padding: '0.75rem' }}>--</td>
                <td style={{ padding: '0.75rem' }}>OK</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>Ollama Cloud</td>
                <td style={{ padding: '0.75rem' }}>Session Quota Used</td>
                <td style={{ padding: '0.75rem' }}>{data.ollama.sessionPercent.toFixed(2)}%</td>
                <td style={{ padding: '0.75rem' }}>{data.ollama.latencyMs} ms</td>
                <td style={{ padding: '0.75rem' }}>{data.ollama.available ? 'OK' : 'Error'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>Ollama Cloud</td>
                <td style={{ padding: '0.75rem' }}>Weekly Usage</td>
                <td style={{ padding: '0.75rem' }}>{data.ollama.weeklyPercent.toFixed(2)}%</td>
                <td style={{ padding: '0.75rem' }}>--</td>
                <td style={{ padding: '0.75rem' }}>OK</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>Ollama Pay</td>
                <td style={{ padding: '0.75rem' }}>Tokens Remaining</td>
                <td style={{ padding: '0.75rem' }}>{data.ollamaPay.tokensRemaining.toLocaleString()}</td>
                <td style={{ padding: '0.75rem' }}>{data.ollamaPay.latencyMs} ms</td>
                <td style={{ padding: '0.75rem' }}>{data.ollamaPay.available ? 'OK' : 'Error'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>Ollama Pay</td>
                <td style={{ padding: '0.75rem' }}>Today Requests / Month Requests</td>
                <td style={{ padding: '0.75rem' }}>{data.ollamaPay.todayRequests} / {data.ollamaPay.monthRequests}</td>
                <td style={{ padding: '0.75rem' }}>--</td>
                <td style={{ padding: '0.75rem' }}>OK</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>Ollama Pay</td>
                <td style={{ padding: '0.75rem' }}>Today PloyJoy Tokens</td>
                <td style={{ padding: '0.75rem' }}>{data.ollamaPay.todayPloyJoyTokens.toLocaleString()}</td>
                <td style={{ padding: '0.75rem' }}>--</td>
                <td style={{ padding: '0.75rem' }}>OK</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Settings */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={22} style={{ color: '#2f81f7' }} /> ตั้งค่าระบบแดชบอร์ด
            </h2>

            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              marginBottom: '1.5rem', 
              padding: '0.5rem 0.85rem', 
              background: 'rgba(35, 134, 54, 0.15)', 
              border: '1px solid rgba(35, 134, 54, 0.3)', 
              borderRadius: '8px', 
              fontSize: '0.8rem', 
              color: '#3fb950' 
            }}>
              <ShieldCheck size={16} />
              <span>บันทึก API Keys ปลอดภัยเป็นไฟล์ JSON บน Server และซิงค์กับ LocalStorage</span>
            </div>

            <form onSubmit={handleSaveKeys}>
              <div className="form-group">
                <label>DeepSeek API Key</label>
                <input 
                  type="password" 
                  value={keys.deepseek} 
                  onChange={e => setKeys({...keys, deepseek: e.target.value})} 
                  placeholder="sk-..."
                />
              </div>

              <div className="form-group">
                <label>Ollama Cloud API Key</label>
                <input 
                  type="password" 
                  value={keys.ollama} 
                  onChange={e => setKeys({...keys, ollama: e.target.value})} 
                  placeholder="Bearer token..."
                />
              </div>

              <div className="form-group">
                <label>Ollama Pay API Key</label>
                <input 
                  type="password" 
                  value={keys.ollamaPay} 
                  onChange={e => setKeys({...keys, ollamaPay: e.target.value})} 
                  placeholder="Bearer token..."
                />
              </div>

              <div className="form-group">
                <label>รอบเวลาอัปเดตอัตโนมัติ (Refresh Interval)</label>
                <select 
                  value={refreshInterval} 
                  onChange={e => setRefreshInterval(Number(e.target.value))}
                >
                  <option value={15}>ทุกๆ 15 วินาที</option>
                  <option value={30}>ทุกๆ 30 วินาที</option>
                  <option value={60}>ทุกๆ 1 นาที (แนะนำ)</option>
                  <option value={300}>ทุกๆ 5 นาที</option>
                  <option value={0}>อัปเดตด้วยตนเองเท่านั้น</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" className="secondary" onClick={() => setShowSettings(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="primary">
                  บันทึกการตั้งค่า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

export default App;
