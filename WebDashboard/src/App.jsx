import { useState, useEffect, useRef } from 'react';
import { 
  Settings, RefreshCw, CheckCircle2, XCircle, Activity,
  MessageSquare, LayoutGrid, List, Copy, Send, Clock, ShieldCheck, Globe, Search,
  Plus, Trash2, Download, Link2, Pencil, RotateCcw, Paperclip, Wrench, FileText, X,
  Mic, MicOff, Volume2, VolumeX, BookOpen, DollarSign, ChevronDown, Table,
  Bot, Code, PenLine, Languages, BarChart, Printer, Save, Mail, Brain
} from 'lucide-react';
import { DeepSeekIcon, OllamaIcon, OllamaPayIcon } from './components/AIIcons';
import { encryptAndSaveConfig, loadAndDecryptConfig } from './utils/crypto';
import MarkdownMessage from './components/MarkdownMessage';
import './index.css';

const PERSONAS = {
  general: { name: 'ทั่วไป (General Assistant)', prompt: '', icon: Bot },
  developer: { name: 'Senior Developer', prompt: 'You are an expert Senior Full-Stack Developer. Write clean, efficient, modern code with clear explanations.', icon: Code },
  content: { name: 'Content Creator', prompt: 'You are a creative Content Writer and Marketing Copywriter. Craft engaging, clear, and compelling content.', icon: PenLine },
  translator: { name: 'Professional Translator', prompt: 'You are a professional English-Thai translator. Translate text accurately with natural phrasing.', icon: Languages },
  analyst: { name: 'Data Analyst', prompt: 'You are a Data Analyst. Structure key insights using markdown tables and clear bullet points.', icon: BarChart },
  custom: { name: 'กำหนดเอง (Custom)', prompt: '', icon: Pencil }
};

const TEMPLATE_ICONS = { t1: FileText, t2: Code, t3: Languages, t4: Search, t5: BarChart, t6: Mail };

const EXPORT_FORMATS = [
  { fmt: 'md', icon: FileText, label: 'Markdown (.md)' },
  { fmt: 'json', icon: BarChart, label: 'JSON (.json)' },
  { fmt: 'html', icon: Globe, label: 'HTML (.html)' },
  { fmt: 'print', icon: Printer, label: 'พิมพ์ / PDF' },
];

// Shorten large token/count numbers to compact units, e.g. 12345 → "12.3K"
function formatCompact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// Meta badges (search / scrape / tools / files) shared by saved + streaming messages
function MetaBadges({ m }) {
  return (
    <>

      {m?.scrapedContent && (
        <div className="meta-badge scrape">
          <Link2 size={14} />
          <span>อ่านเนื้อหาจากลิงก์: <strong>{m.scrapedContent.title}</strong></span>
        </div>
      )}

      {m?.attachedFiles?.length > 0 && (
        <div className="meta-badge file">
          <FileText size={14} />
          <span>แนบไฟล์: <strong>{m.attachedFiles.map(f => f.name).join(', ')}</strong></span>
        </div>
      )}
    </>
  );
}

// Custom dropdown (consistent rendering across all browsers/OS)
function Dropdown({ value, onChange, options, groups, label }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const flatten = () => {
    if (groups) {
      return groups.flatMap(g => g.options.map(o => ({ value: o.value, label: o.label, icon: o.icon, group: g.label })));
    }
    return options.map(o => ({ ...o, group: null }));
  };
  const items = flatten();
  const current = items.find(i => i.value === value);

  const pick = (item) => {
    onChange(item.value);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(Math.max(0, items.findIndex(i => i.value === value)));
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(a => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(a => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeIndex >= 0) pick(items[activeIndex]);
      else setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="custom-select" role="listbox" aria-label={label}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="custom-select-value">{current.icon && <span className="custom-select-option-icon">{current.icon}</span>}{current ? current.label : label}</span>
        <ChevronDown size={14} className={`custom-select-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="custom-select-panel" role="listbox" aria-label={label}>
            {items.map((item, idx) => (
              <span key={item.value}>
                {item.group && (idx === 0 || items[idx - 1].group !== item.group) && (
                  <div className="custom-select-group-label">{item.group}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={item.value === value}
                  className={`custom-select-item ${item.value === value ? 'selected' : ''} ${activeIndex === idx ? 'highlighted' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pick(item)}
                >
                  {item.icon && <span className="custom-select-option-icon">{item.icon}</span>}
                  {item.label}
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Parse an SSE stream into per-event handlers
async function parseSSEEvents(response, handlers) {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBlock = (block) => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    let json;
    try { json = JSON.parse(data); } catch (e) { return; }
    handlers[event]?.(json);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    parts.forEach(processBlock);
  }
  if (buffer.trim()) processBlock(buffer);
}

function App() {
  const [keys, setKeys] = useState({
    deepseek: '',
    ollama: '',
    ollamaPay: '',
    embedModel: ''
  });

  const [refreshInterval, setRefreshInterval] = useState(
    Number(localStorage.getItem('refresh_interval')) || 60
  );

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'chat' | 'details'
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const carouselRef = useRef(null);

  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const el = carouselRef.current;
    if (el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== activeCardIndex && index >= 0 && index <= 2) {
      setActiveCardIndex(index);
    }
  };

  const scrollToCard = (index) => {
    if (!carouselRef.current) return;
    const el = carouselRef.current;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    setActiveCardIndex(index);
  };

  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [toastMsg, setToastMsg] = useState('');

  // Load config from server (service availability booleans, NOT actual keys)
  // and fallback to local encrypted config for the settings form.
  useEffect(() => {
    async function initKeys() {
      // 1. Load actual API keys from encrypted localStorage (for settings form)
      const decryptedKeys = await loadAndDecryptConfig();
      setKeys(decryptedKeys);

      // 2. If no keys configured, prompt user to set up
      if (!decryptedKeys.deepseek && !decryptedKeys.ollama && !decryptedKeys.ollamaPay) {
        showToast('กรุณาตั้งค่า API Key ใน Settings ก่อนใช้งาน');
      }

      // 3. Fetch service availability from server (no actual keys exposed)
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const serverConfig = await res.json();
          // serverConfig = { services: { deepseek: bool, ollama: bool, ollamaPay: bool }, embedModel: '...' }
          if (serverConfig.embedModel) {
            setKeys(k => ({ ...k, embedModel: serverConfig.embedModel }));
          }
        }
      } catch (e) {
        console.warn('Could not fetch server config', e);
      }
    }
    initKeys();
  }, []);

  const handleSaveKeys = async (e) => {
    e.preventDefault();
    // 1. Save to server-side JSON storage (/api/config)
    let serverSaved = false;
    try {
      const serverRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys)
      });
      serverSaved = serverRes.ok;
    } catch (err) {
      console.error('Failed to save config to server:', err);
    }

    // 2. Save encrypted backup to client-side localStorage
    const localSaved = await encryptAndSaveConfig(keys);
    localStorage.setItem('refresh_interval', refreshInterval);
    setShowSettings(false);
    if (localSaved && serverSaved) {
      showToast('Settings saved to server & stored locally!');
    } else if (localSaved) {
      showToast('Saved locally — server save failed');
    } else if (serverSaved) {
      showToast('Settings saved to server');
    } else {
      showToast('Failed to save settings');
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
      title: 'แชท 1',
      messages: [{ role: 'assistant', content: 'สวัสดีครับ! ผมคือ DeepSeek AI พร้อมใช้งาน Web Search, เครื่องมือ, การแนบไฟล์, Voice Input, Vision และ Personas มีอะไรให้ช่วยได้บ้างครับ?' }]
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('default-session');
  const [chatPane, setChatPane] = useState('chat');
  const [promptInput, setPromptInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');
  const [selectedPersona, setSelectedPersona] = useState('general');
  const [customPersonaPrompt, setCustomPersonaPrompt] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [useTools, setUseTools] = useState(true);
  const [useMemory, setUseMemory] = useState(() => localStorage.getItem('use_memory') !== '0');
  const [memoryData, setMemoryData] = useState({ memories: [], summaries: [] });
  const [newManualMemory, setNewManualMemory] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingMeta, setStreamingMeta] = useState(null);
  const [streamError, setStreamError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showMobileChatSettings, setShowMobileChatSettings] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const lastUserMsgRef = useRef(null);

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
      { id: 't1', name: 'สรุปรายงานประชุม', prompt: 'ช่วยสรุปรายงานการประชุมต่อไปนี้ให้กระชับ เน้นประเด็นสำคัญ การตัดสินใจ และ action items:\n\n[วางข้อความรายงานประชุมที่นี่]' },
      { id: 't2', name: 'Refactor Python Code', prompt: 'ช่วย refactor โค้ด Python ต่อไปนี้ให้เป็น Clean Code ตาม PEP 8 พร้อมอธิบายการเปลี่ยนแปลง:\n\n```python\n[วางโค้ดที่นี่]\n```' },
      { id: 't3', name: 'แปลเอกสารสัญญา', prompt: 'ช่วยแปลเอกสารต่อไปนี้จากภาษาอังกฤษเป็นภาษาไทย โดยรักษาความหมายทางกฎหมายให้ครบถ้วน:\n\n[วางข้อความที่ต้องการแปล]' },
      { id: 't4', name: 'Code Review', prompt: 'ช่วย review โค้ดต่อไปนี้ โดยตรวจหา bugs, security issues, performance issues และแนะนำการปรับปรุง:\n\n```\n[วางโค้ดที่นี่]\n```' },
      { id: 't5', name: 'วิเคราะห์ข้อมูล CSV', prompt: 'ช่วยวิเคราะห์ข้อมูลต่อไปนี้ และสรุปผลในรูปแบบตาราง Markdown พร้อม insights สำคัญ:\n\n[วางข้อมูล CSV หรือตารางที่นี่]' },
      { id: 't6', name: 'ร่างอีเมลทางการ', prompt: 'ช่วยร่างอีเมลทางการภาษาไทยสำหรับ:\nเรื่อง: [ระบุเรื่อง]\nถึง: [ระบุผู้รับ]\nสาระสำคัญ: [ระบุเนื้อหาที่ต้องการสื่อ]' }
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

  useEffect(() => { loadMemories(); }, []);

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
      // 0. Check which services are available on the server first
      let serverServices = {};
      try {
        const cfgRes = await fetch('/api/config');
        if (cfgRes.ok) {
          serverServices = (await cfgRes.json()).services || {};
        }
      } catch (e) { /* ignore */ }

      // 1. Fetch DeepSeek Balance
      if (keys.deepseek && serverServices.deepseek) {
        const start = Date.now();
        try {
          const res = await fetch('/api/deepseek/balance');
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
      if (keys.ollama && serverServices.ollama) {
        const start = Date.now();
        try {
          const res = await fetch('/api/ollama/usage');
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
      if (keys.ollamaPay && serverServices.ollamaPay) {
        const start = Date.now();
        try {
          const res = await fetch('/api/ollama-pay/usage');
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
      title: `แชท ${sessions.length + 1}`,
      messages: [{ role: 'assistant', content: 'สวัสดีครับ! มีอะไรให้ช่วยในบทสนทนาใหม่นี้ไหม?' }]
    };
    const updated = [newSess, ...sessions];
    saveSessions(updated);
    setActiveSessionId(newId);
    setChatPane('chat');
  };

  const requestDeleteCurrentSession = () => {
    if (sessions.length <= 1) {
      showToast('ไม่สามารถลบบทสนทนาสุดท้ายได้');
      return;
    }
    setConfirmDeleteSession(true);
  };

  const confirmDeleteSessionNow = () => {
    const updated = sessions.filter(s => s.id !== activeSessionId);
    saveSessions(updated);
    setActiveSessionId(updated[0].id);
    setConfirmDeleteSession(false);
    showToast('ลบบทสนทนาแล้ว');
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

  const addManualMemory = async () => {
    const content = newManualMemory.trim();
    if (!content) return;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) { setNewManualMemory(''); showToast('เพิ่มความจำแล้ว 🧠'); loadMemories(); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'เพิ่มความจำไม่สำเร็จ'); }
    } catch (e) { showToast('เพิ่มความจำไม่สำเร็จ'); }
  };

  const deleteMemoryById = async (id) => {
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      loadMemories();
    } catch (e) { /* ignore */ }
  };

  const clearAllMemories = async () => {
    try {
      await fetch('/api/memories', { method: 'DELETE' });
      showToast('ล้างความจำทั้งหมดแล้ว');
      loadMemories();
    } catch (e) { /* ignore */ }
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

  const loadMemories = async () => {
    try {
      const res = await fetch('/api/memories');
      if (res.ok) setMemoryData(await res.json());
    } catch (e) { /* memory unavailable */ }
  };

  const rememberAssistantMessage = async (idx) => {
    const m = messages[idx];
    if (!m || m.role !== 'assistant') return;
    try {
      const res = await fetch('/api/memories/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeSessionId, messageIndex: idx })
      });
      if (res.ok) { showToast('จำไว้แล้ว 🧠'); loadMemories(); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'จำไม่ได้ (ตรวจสอบ key Ollama)'); }
    } catch (e) { showToast('จำไม่ได้ (ตรวจสอบ key Ollama)'); }
  };

  const unrememberChat = async () => {
    try {
      const res = await fetch('/api/memories/unremember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeSessionId })
      });
      if (res.ok) { showToast('ลบความจำของแชทนี้แล้ว'); loadMemories(); }
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { if (showSettings) loadMemories(); }, [showSettings]);

  const appendAssistantMessage = (assistantMsg) => {
    setSessions(prev => {
      const next = prev.map(s =>
        s.id === activeSessionId ? { ...s, messages: [...s.messages, assistantMsg] } : s
      );
      localStorage.setItem('ai_chat_sessions', JSON.stringify(next));
      fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      }).catch(() => {});
      return next;
    });
  };

  const stopGenerating = () => {
    abortRef.current?.abort();
  };

  const retryLastMessage = () => {
    const last = lastUserMsgRef.current;
    if (!last) return;
    setPromptInput(last.text);
    setAttachedFiles(last.files || []);
    setStreamError('');
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
    lastUserMsgRef.current = { text: userText, files: currentAttachedFiles };
    const userMsgObj = {
      role: 'user',
      content: userText,
      attachedFiles: currentAttachedFiles.length > 0 ? currentAttachedFiles : null
    };

    // Update local state immediately via functional update
    setSessions(prevSessions => {
      const next = prevSessions.map(s =>
        s.id === activeSessionId ? { ...s, messages: [...s.messages, userMsgObj], title: s.messages.length <= 1 ? (userText ? userText.substring(0, 20) : 'แนบไฟล์') : s.title } : s
      );
      localStorage.setItem('ai_chat_sessions', JSON.stringify(next));
      return next;
    });

    setPromptInput('');
    setAttachedFiles([]);
    setStreamingContent('');
    setStreamingMeta(null);
    setStreamError('');
    setIsGenerating(true);
    setElapsedSeconds(0);
    elapsedTimerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);

    const activePersonaPrompt = selectedPersona === 'custom'
      ? customPersonaPrompt
      : PERSONAS[selectedPersona]?.prompt || '';

    const endpoint = isOllamaModel ? '/api/ollama/chat' : '/api/deepseek/chat';
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: isOllamaModel ? selectedModel.replace('ollama:', '') : selectedModel,
          webSearch: enableWebSearch,
          useTools: useTools,
          useMemory: useMemory,
          sessionId: activeSessionId,
          personaPrompt: activePersonaPrompt,
          attachedFiles: currentAttachedFiles,
          messages: [...messages, userMsgObj].map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการติดต่อ AI API');
      }

      await parseSSEEvents(res, {
        meta: (m) => {
          setStreamingMeta(prev => ({
            ...(prev || {}),
            searchResults: m.searchResults || prev?.searchResults || null,
            scrapedContent: m.scrapedContent || prev?.scrapedContent || null,
            executedTools: prev?.executedTools
              ? [...prev.executedTools, ...(m.executedTools || [])]
              : (m.executedTools || null)
          }));
        },
        delta: (m) => setStreamingContent(c => c + (m.content || '')),
        done: (m) => {
          const assistantMsg = {
            role: 'assistant',
            content: m.content || '',
            searchResults: m.searchResults || null,
            scrapedContent: m.scrapedContent || null,
            executedTools: m.executedTools || null,
            tokenUsage: m.tokenUsage || null,
            estimatedCostUSD: m.estimatedCostUSD || null
          };
          appendAssistantMessage(assistantMsg);
          fetchData();
        },
        error: (m) => setStreamError(m.error || 'เกิดข้อผิดพลาดในการติดต่อ AI API'),
        aborted: () => {}
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('ยกเลิกการสร้างคำตอบแล้ว');
      } else {
        console.error('Chat error:', err);
        setStreamError(err.message || 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
      }
    } finally {
      setIsGenerating(false);
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
      setElapsedSeconds(0);
      abortRef.current = null;
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
    showToast('Summary copied to clipboard!');
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
  }, [messages, streamingContent, streamError, isGenerating]);

  const activeServicesCount = [data.deepseek.available, data.ollama.available, data.ollamaPay.available].filter(Boolean).length;

  return (
    <div className={`container ${activeTab === 'chat' ? 'chat-active' : ''}`}>
      {/* Header */}
      <header>
        <div className="brand-title">
          <Activity size={26} style={{ color: 'var(--accent-blue)' }} />
          <h1>AI Service Monitoring <span className="build-tag">v1.0.0</span></h1>
        </div>

        <div className="header-actions">
          <div className="latency-tag" style={{ padding: '0.4rem 0.75rem', borderRadius: '10px' }}>
            <Clock size={14} />
            <span>Last updated {lastRefreshed.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false })}</span>
          </div>



          <button className="secondary" onClick={() => fetchData()} title="Refresh Data">
            <RefreshCw size={18} className={loading ? 'loading' : ''} />
          </button>

          <button className="primary" onClick={() => setShowSettings(true)}>
            <Settings size={18} /> <span className="btn-label">Settings</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutGrid size={18} /> Overview
        </button>
        <button 
          className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={18} /> Chat
        </button>
        <button 
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          <List size={18} /> Details
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
            <DeepSeekIcon size={24} style={{ color: 'var(--status-green)' }} />
          </div>
          <div>
            <div className="summary-label">DeepSeek Balance</div>
            <div className="summary-value">${data.deepseek.balance}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box cyan">
            <OllamaIcon size={24} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div>
            <div className="summary-label">Ollama Session</div>
            <div className="summary-value">{(100 - data.ollama.sessionPercent).toFixed(1)}% Free</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box amber">
            <OllamaPayIcon size={24} style={{ color: 'var(--status-amber)' }} />
          </div>
          <div>
            <div className="summary-label">Ollama Pay Today</div>
            <div className="summary-value">{formatCompact(data.ollamaPay.todayTokens)} tokens</div>
          </div>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="overview-tab-container">
          <div className="overview-carousel-wrapper">
            <div 
              className="grid overview-carousel"
              ref={carouselRef}
              onScroll={handleCarouselScroll}
            >
              {/* DeepSeek Card */}
              <div className="glass-card overview-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <DeepSeekIcon size={24} style={{ color: 'var(--status-indigo)' }} />
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
              <div className="glass-card overview-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <OllamaIcon size={24} style={{ color: 'var(--accent-blue)' }} />
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
                      style={{ transform: `scaleX(${Math.min(data.ollama.sessionPercent, 100) / 100})` }} 
                    />
                  </div>
                </div>

                <div className="progress-container">
                  <div className="progress-header">
                    <span>Weekly Limit Used</span>
                    <span>{data.ollama.weeklyPercent.toFixed(1)}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill emerald" style={{ transform: `scaleX(${Math.min(data.ollama.weeklyPercent, 100) / 100})` }} />
                  </div>
                </div>
              </div>

              {/* Ollama Pay Card */}
              <div className="glass-card overview-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <OllamaPayIcon size={24} style={{ color: 'var(--status-amber)' }} />
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
                    <div className="metric-value-huge">{formatCompact(data.ollamaPay.tokensRemaining)}</div>
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
                      transform: `scaleX(${data.ollamaPay.totalTokens ? (data.ollamaPay.tokensRemaining / data.ollamaPay.totalTokens) : 0})` 
                    }} />
                  </div>
                </div>

                <div className="sub-grid">
                  <div className="sub-stat-box">
                    <div className="sub-stat-label">Today Tokens</div>
                    <div className="sub-stat-value">{formatCompact(data.ollamaPay.todayTokens)}</div>
                  </div>
                  <div className="sub-stat-box">
                    <div className="sub-stat-label">Month Tokens</div>
                    <div className="sub-stat-value">{formatCompact(data.ollamaPay.monthTokens)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Swipe Indicators / Card Switcher Dots */}
            <div className="carousel-dots-mobile">
              <button 
                type="button" 
                className={`carousel-dot-btn ${activeCardIndex === 0 ? 'active' : ''}`}
                onClick={() => scrollToCard(0)}
              >
                <span className="dot-pip"></span>
                <span>DeepSeek</span>
              </button>
              <button 
                type="button" 
                className={`carousel-dot-btn ${activeCardIndex === 1 ? 'active' : ''}`}
                onClick={() => scrollToCard(1)}
              >
                <span className="dot-pip"></span>
                <span>Ollama Cloud</span>
              </button>
              <button 
                type="button" 
                className={`carousel-dot-btn ${activeCardIndex === 2 ? 'active' : ''}`}
                onClick={() => scrollToCard(2)}
              >
                <span className="dot-pip"></span>
                <span>Ollama Pay</span>
              </button>
            </div>
          </div>

        {/* Bottom Row: Quick AI Starters & Recent Activity Logs */}
        <div className="overview-bottom-grid">
          {/* Quick AI Starters Card */}
          <div className="glass-card overview-quick-starters">
            <div className="card-header" style={{ marginBottom: '0.6rem' }}>
              <div className="card-title-group">
                <BookOpen size={16} style={{ color: 'var(--accent-blue)' }} />
                <h3 className="card-title" style={{ fontSize: '0.92rem', margin: 0 }}>ทางลัดเริ่มแชทด่วน (Quick Starters)</h3>
              </div>
            </div>
            <div className="quick-starters-grid">
              {templates.slice(0, 4).map(t => {
                const Icon = TEMPLATE_ICONS[t.id] || FileText;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="quick-starter-btn"
                    onClick={() => {
                      setActiveTab('chat');
                      setChatPane('chat');
                      const newSession = {
                        id: 'sess_' + Date.now(),
                        title: t.name,
                        messages: [{ role: 'user', content: t.prompt }]
                      };
                      const updated = [newSession, ...sessions];
                      saveSessions(updated);
                      setActiveSessionId(newSession.id);
                    }}
                  >
                    <span className="starter-icon"><Icon size={15} /></span>
                    <span className="starter-name">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Activity & Sessions Card */}
          <div className="glass-card overview-recent-activity">
            <div className="card-header" style={{ marginBottom: '0.6rem' }}>
              <div className="card-title-group">
                <Clock size={16} style={{ color: 'var(--status-purple)' }} />
                <h3 className="card-title" style={{ fontSize: '0.92rem', margin: 0 }}>บทสนทนาล่าสุด (Recent Activity)</h3>
              </div>
              <button
                type="button"
                className="secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => { setActiveTab('chat'); setChatPane('history'); }}
              >
                ดูทั้งหมด
              </button>
            </div>
            <div className="recent-activity-list">
              {sessions.slice(0, 3).map(s => (
                <div
                  key={s.id}
                  className="recent-activity-item"
                  onClick={() => { setActiveTab('chat'); setChatPane('chat'); setActiveSessionId(s.id); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    <MessageSquare size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <span className="activity-title">{s.title}</span>
                  </div>
                  <span className="activity-badge">{s.messages.length} ข้อความ</span>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Latency Chart Card */}
          <div className="glass-card overview-latency-chart">
            <div className="card-header" style={{ marginBottom: '0.6rem' }}>
              <div className="card-title-group">
                <Activity size={16} style={{ color: 'var(--status-green)' }} />
                <h3 className="card-title" style={{ fontSize: '0.92rem', margin: 0 }}>ความเร็วการตอบสนอง (Latency)</h3>
              </div>
            </div>
            <div className="latency-chart-list">
              <div className="latency-bar-item">
                <div className="latency-item-header">
                  <span className="latency-service-name">DeepSeek API</span>
                  <span className="latency-ms-val">{data.deepseek.latencyMs} ms</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div
                    className="progress-fill emerald"
                    style={{ transform: `scaleX(${Math.min(1, Math.max(0.08, data.deepseek.latencyMs / 1000))})` }}
                  />
                </div>
              </div>

              <div className="latency-bar-item">
                <div className="latency-item-header">
                  <span className="latency-service-name">Ollama Cloud</span>
                  <span className="latency-ms-val">{data.ollama.latencyMs} ms</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div
                    className="progress-fill cyan"
                    style={{ transform: `scaleX(${Math.min(1, Math.max(0.08, data.ollama.latencyMs / 1000))})` }}
                  />
                </div>
              </div>

              <div className="latency-bar-item">
                <div className="latency-item-header">
                  <span className="latency-service-name">Ollama Pay</span>
                  <span className="latency-ms-val">{data.ollamaPay.latencyMs} ms</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div
                    className="progress-fill amber"
                    style={{ transform: `scaleX(${Math.min(1, Math.max(0.08, data.ollamaPay.latencyMs / 1000))})` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* TAB 2: AI CHAT PLAYGROUND */}
      {activeTab === 'chat' && (
        <div className={`chat-widget ${chatPane === 'history' ? 'pane-history' : 'pane-chat'}`}>
          <div className="chat-sub-tabs" role="tablist" aria-label="มุมมองแชท">
            <button type="button" role="tab" aria-selected={chatPane === 'history'} className={`chat-sub-tab ${chatPane === 'history' ? 'active' : ''}`} onClick={() => setChatPane('history')}>
              ประวัติ
            </button>
            <button type="button" role="tab" aria-selected={chatPane === 'chat'} className={`chat-sub-tab ${chatPane === 'chat' ? 'active' : ''}`} onClick={() => setChatPane('chat')}>
              แชท
            </button>
          </div>
          <div className="chat-body-layout">
            {/* Left Sidebar (Sessions List) */}
            <div className="chat-sidebar">
              <div className="chat-sidebar-header">
                <span className="chat-sidebar-title">บทสนทนา</span>
                <button type="button" onClick={createNewSession} className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} title="สร้างบทสนทนาใหม่">
                  <Plus size={14} /> ใหม่
                </button>
              </div>
              {/* Feature 3: Sidebar Search */}
              <div className="chat-sidebar-search">
                <Search size={13} className="chat-sidebar-search-icon" />
                <input
                  type="text"
                  placeholder="ค้นหาบทสนทนา..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  className="chat-sidebar-search-input"
                />
              </div>
              <div className="chat-session-list">
                {sessions.filter(s => !sidebarSearch.trim() || s.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || s.messages.some(m => m.content.toLowerCase().includes(sidebarSearch.toLowerCase()))).map(s => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className={`chat-session-item ${s.id === activeSessionId ? 'active' : ''}`}
                    onClick={() => { if (!isGenerating) { setActiveSessionId(s.id); setChatPane('chat'); } }}
                    onKeyDown={e => {
                      if (!isGenerating && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveSessionId(s.id); setChatPane('chat'); }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                      <MessageSquare size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    </div>
                    {sessions.length > 1 && s.id === activeSessionId && (
                      <button
                        type="button"
                        className="session-delete-btn"
                        onClick={(e) => { e.stopPropagation(); requestDeleteCurrentSession(); }}
                        title="ลบบทสนทนานี้"
                        aria-label="ลบบทสนทนานี้"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {sidebarSearch && sessions.filter(s => s.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || s.messages.some(m => m.content.toLowerCase().includes(sidebarSearch.toLowerCase()))).length === 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem 0.5rem' }}>
                  ไม่พบบทสนทนาที่ค้นหา
                </div>
              )}
            </div>

            {/* Main Chat Area */}
            <div className="chat-main-area">
              {/* Header Toolbar */}
              <div className="chat-header-bar">
                <div className="chat-header-title-row">
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                    <MessageSquare size={20} style={{ color: 'var(--accent-blue)' }} /> {currentSession.title}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {/* Mobile Settings Toggle Button */}
                    <button
                      type="button"
                      className={`mobile-settings-toggle ${showMobileChatSettings ? 'active' : ''}`}
                      onClick={() => setShowMobileChatSettings(s => !s)}
                      title="ตั้งค่าโมเดลและเครื่องมือ"
                      aria-label="ตั้งค่าโมเดลและเครื่องมือ"
                    >
                      <Settings size={14} />
                      <span>ตั้งค่า</span>
                      <ChevronDown size={12} style={{ transform: showMobileChatSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>

                    {/* Feature 5: Multi-format Export */}
                    <div style={{ position: 'relative', display: 'inline-block' }} className="export-dropdown-wrapper">
                      <button type="button" className="secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={() => setExportOpen(o => !o)}
                        aria-expanded={exportOpen}
                        aria-haspopup="menu"
                      >
                        <Download size={14} /> ส่งออก <ChevronDown size={12} />
                      </button>
                      {exportOpen && (
                        <>
                          <div className="dropdown-backdrop" onClick={() => setExportOpen(false)} />
                          <div role="menu" className="export-dropdown" onClick={() => setExportOpen(false)}>
                            {EXPORT_FORMATS.map(({ fmt, icon: Icon, label }) => (
                              <button key={fmt} type="button" role="menuitem" className="export-dropdown-item" onClick={() => exportAs(fmt)}>
                                <span className="custom-select-option-icon"><Icon size={13} /></span>{label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Compact Status Bar (shown when settings are collapsed on mobile) */}
                {!showMobileChatSettings && (
                  <div className="mobile-status-summary-bar" onClick={() => setShowMobileChatSettings(true)} title="แตะเพื่อปรับแต่งการตั้งค่าแชท">
                    <div className="mobile-status-pill">
                      <span className="model-label">{selectedModel}</span>
                      <div className="active-feature-icons">
                        {useTools && <span title="เครื่องมือเปิดอยู่" className="chip-mini amber"><Wrench size={11} /> เครื่องมือ</span>}
                        {enableWebSearch && <span title="ค้นหาเว็บเปิดอยู่" className="chip-mini cyan"><Globe size={11} /> ค้นหาเว็บ</span>}
                        {useMemory && <span title="ระบบความจำเปิดอยู่" className="chip-mini violet"><Brain size={11} /> ความจำ</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Controls & Model Selector */}
                <div className={`chat-toolbar ${showMobileChatSettings ? 'mobile-expanded' : ''}`}>
                  <div className="toolbar-group">
                    <span className="toolbar-group-label">บุคลิก</span>
                    <Dropdown
                      label="บุคลิก"
                      value={selectedPersona}
                      onChange={setSelectedPersona}
                      options={Object.entries(PERSONAS).map(([key, p]) => ({ value: key, label: p.name, icon: <p.icon size={14} /> }))}
                    />
                  </div>

                  <div className="toolbar-group">
                    <span className="toolbar-group-label">ความสามารถ</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setUseTools(!useTools)}
                        className={`toggle-chip ${useTools ? 'on amber' : 'off'}`}
                        title="เปิด/ปิดการเรียกใช้เครื่องมือ (Function Calling)"
                      >
                        <Wrench size={14} />
                        <span>เครื่องมือ: <strong>{useTools ? 'เปิด' : 'ปิด'}</strong></span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEnableWebSearch(!enableWebSearch)}
                        className={`toggle-chip ${enableWebSearch ? 'on cyan' : 'off'}`}
                        title="เปิด/ปิดการค้นหาเว็บเพื่อข้อมูลล่าสุด"
                      >
                        <Globe size={14} />
                        <span>ค้นหาเว็บ: <strong>{enableWebSearch ? 'เปิด' : 'ปิด'}</strong></span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { const next = !useMemory; setUseMemory(next); localStorage.setItem('use_memory', next ? '1' : '0'); if (next) loadMemories(); }}
                        className={`toggle-chip ${useMemory ? 'on violet' : 'off'}`}
                        title="เปิด/ปิดระบบความจำ — จำข้อมูลและบทสนทนาข้ามแชท"
                      >
                        <Brain size={14} />
                        <span>ความจำ: <strong>{useMemory ? 'เปิด' : 'ปิด'}</strong></span>
                      </button>
                    </div>
                  </div>

                  <div className="toolbar-group">
                    <span className="toolbar-group-label">โมเดล</span>
                    <Dropdown
                      label="โมเดล"
                      value={selectedModel}
                      onChange={setSelectedModel}
                      groups={[
                        { label: 'DeepSeek API', options: [
                          { value: 'deepseek-chat', label: 'deepseek-chat' },
                          { value: 'deepseek-coder', label: 'deepseek-coder' },
                        ] },
                        { label: 'Ollama Cloud / Local', options: [
                          { value: 'ollama:llama3', label: 'ollama: llama3' },
                          { value: 'ollama:qwen2.5', label: 'ollama: qwen2.5' },
                          { value: 'ollama:mistral', label: 'ollama: mistral' },
                        ] },
                      ]}
                    />
                  </div>

                  {/* Feature 4: Templates Button */}
                  <div className="toolbar-group">
                    <span className="toolbar-group-label">คลัง</span>
                    <button
                      type="button"
                      onClick={() => setShowTemplates(true)}
                      className="templates-btn"
                      title="คลังเทมเพลต Prompt"
                    >
                      <BookOpen size={14} /> เทมเพลต
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom Persona Text Input (if selected) */}
              {selectedPersona === 'custom' && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="กรอก System Prompt / คำสั่ง Persona ที่กำหนดเอง..."
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
                      <MetaBadges m={m} />
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
                            title="ย้อนกลับ — ลบข้อความนี้และคำตอบออก แล้วนำกลับมาแก้ใหม่"
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
                      {m.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => rememberAssistantMessage(idx)}
                          className="action-icon-btn"
                          title="จำข้อความนี้ไว้ (เพิ่มลงความจำ)"
                        >
                          <Brain size={13} />
                        </button>
                      )}
                      {m.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => unrememberChat()}
                          className="action-icon-btn"
                          title="อย่าจำ — ลบความจำทั้งหมดของแชทนี้"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
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
                      <div className="token-usage-line">
                        <DollarSign size={11} className="token-cost-icon" />
                        <span className="token-cost">${m.estimatedCostUSD}</span>
                        <span>·</span>
                        <span title={`${m.tokenUsage.prompt_tokens?.toLocaleString()} prompt tokens`}>
                          ↑ {formatCompact(m.tokenUsage.prompt_tokens)} in
                        </span>
                        <span title={`${m.tokenUsage.completion_tokens?.toLocaleString()} completion tokens`}>
                          ↓ {formatCompact(m.tokenUsage.completion_tokens)} out
                        </span>
                        <span title={`${m.tokenUsage.total_tokens?.toLocaleString()} total tokens`}>
                          · total {formatCompact(m.tokenUsage.total_tokens)} tokens
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Transient error bubble (not persisted) */}
                {streamError && (
                  <div className="message-wrapper assistant">
                    <div className="message-bubble error">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <XCircle size={16} />
                        <span>{streamError}</span>
                      </div>
                    </div>
                    <div className="message-actions-outside">
                      <button type="button" className="action-icon-btn" onClick={retryLastMessage} title="ลองส่งคำถามนี้อีกครั้ง">
                        <RotateCcw size={13} /> ลองอีกครั้ง
                      </button>
                      <button type="button" className="action-icon-btn" onClick={() => setStreamError('')} title="ปิดข้อความแจ้งเตือน">
                        <X size={13} /> ปิด
                      </button>
                    </div>
                  </div>
                )}

                {/* Streaming / loading bubble */}
                {isGenerating && (
                  <div className="message-wrapper assistant">
                    <div className="message-bubble assistant">
                      <MetaBadges m={streamingMeta} />
                      {streamingContent ? (
                        <MarkdownMessage content={streamingContent} />
                      ) : (
                        <div className="chat-typing-indicator">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-status">
                            {streamingMeta?.searchResults?.length
                              ? 'กำลังอ่านลิงก์และสรุปคำตอบ...'
                              : (streamingMeta ? 'กำลังวิเคราะห์และสร้างคำตอบ...' : 'กำลังค้นหาข้อมูล...')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="message-actions-outside">
                      <span className="generation-elapsed">
                        <Clock size={11} /> {elapsedSeconds} วินาที
                      </span>
                      <button type="button" className="action-icon-btn stop-btn" onClick={stopGenerating} title="หยุดสร้างคำตอบ">
                        <X size={13} /> หยุด
                      </button>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick Prompt Pills */}
              {messages.length <= 1 && (
                <div className="prompt-pills-container">
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยสรุปข่าวสารและเหตุการณ์สำคัญประจำวันนี้ให้ฟังหน่อย')}><Globe size={13} /> ข่าวอัปเดตวันนี้</button>
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยตรวจเช็กและแนะนำการ refactor โค้ดส่วนนี้ให้เป็น Clean Code')}><Code size={13} /> ตรวจสอบโค้ด</button>
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยวิเคราะห์ข้อมูลต่อไปนี้และจัดรูปแบบให้อยู่ในตาราง Markdown')}><BarChart size={13} /> สรุปตารางข้อมูล</button>
                  <button type="button" className="prompt-pill" onClick={() => setPromptInput('ช่วยร่างอีเมลสื่อสารการทำงานที่เป็นมืออาชีพ')}><PenLine size={13} /> ร่างอีเมลการทำงาน</button>
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
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: file.type.startsWith('image/') ? 'rgba(10, 132, 255, 0.12)' : 'rgba(191, 90, 242, 0.12)', border: `1px solid ${file.type.startsWith('image/') ? 'rgba(10, 132, 255, 0.3)' : 'rgba(191, 90, 242, 0.3)'}`, padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', color: file.type.startsWith('image/') ? 'var(--accent-blue)' : 'var(--status-purple)' }}>
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
        <div className="templates-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTemplates(false); }}
        >
          <div className="templates-card">
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem', color: '#e6edf3' }}>
                    {(() => { const TI = TEMPLATE_ICONS[t.id] || FileText; return <TI size={14} style={{ color: 'var(--status-purple)', flexShrink: 0 }} />; })()}
                    <span>{t.name}</span>
                  </div>
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
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Plus size={14} /> บันทึก Template ใหม่</div>
              <input type="text" placeholder="ชื่อ Template..." value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                style={{ width: '100%', marginBottom: '0.6rem', padding: '0.55rem 0.75rem', background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              <textarea rows={3} placeholder="เนื้อหา Prompt..." value={newTemplatePrompt} onChange={e => setNewTemplatePrompt(e.target.value)}
                style={{ width: '100%', marginBottom: '0.75rem', padding: '0.55rem 0.75rem', background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }} />
              <button type="button" onClick={saveTemplate} className="primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                <Save size={14} /> บันทึก Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DETAILED METRICS TABLE */}
      {activeTab === 'details' && (
        <div className="glass-card details-card">
          <h3 className="details-title">
            <Table size={15} /> Comprehensive Service Quota Breakdown
          </h3>
          <table className="details-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Metric / Metric Name</th>
                <th>Current Value</th>
                <th>Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="details-service" rowSpan={2}>DeepSeek API</td>
                <td className="details-metric">Total Balance</td>
                <td className="details-value">${data.deepseek.balance} {data.deepseek.currency}</td>
                <td className="details-latency">{data.deepseek.latencyMs} ms</td>
                <td>{data.deepseek.available ? <span className="badge success">OK</span> : <span className="badge error">Error</span>}</td>
              </tr>
              <tr>
                <td className="details-metric">Estimated Spent Today</td>
                <td className="details-value">${data.deepseek.spentToday}</td>
                <td className="details-latency">--</td>
                <td><span className="badge success">OK</span></td>
              </tr>
              <tr>
                <td className="details-service" rowSpan={2}>Ollama Cloud</td>
                <td className="details-metric">Session Quota Used</td>
                <td className="details-value">{data.ollama.sessionPercent.toFixed(2)}%</td>
                <td className="details-latency">{data.ollama.latencyMs} ms</td>
                <td>{data.ollama.available ? <span className="badge success">OK</span> : <span className="badge error">Error</span>}</td>
              </tr>
              <tr>
                <td className="details-metric">Weekly Usage</td>
                <td className="details-value">{data.ollama.weeklyPercent.toFixed(2)}%</td>
                <td className="details-latency">--</td>
                <td><span className="badge success">OK</span></td>
              </tr>
              <tr>
                <td className="details-service" rowSpan={3}>Ollama Pay</td>
                <td className="details-metric">Tokens Remaining</td>
                <td className="details-value">{formatCompact(data.ollamaPay.tokensRemaining)}</td>
                <td className="details-latency">{data.ollamaPay.latencyMs} ms</td>
                <td>{data.ollamaPay.available ? <span className="badge success">OK</span> : <span className="badge error">Error</span>}</td>
              </tr>
              <tr>
                <td className="details-metric">Today / Month Requests</td>
                <td className="details-value">{data.ollamaPay.todayRequests} / {data.ollamaPay.monthRequests}</td>
                <td className="details-latency">--</td>
                <td><span className="badge success">OK</span></td>
              </tr>
              <tr>
                <td className="details-metric">Today PloyJoy Tokens</td>
                <td className="details-value">{formatCompact(data.ollamaPay.todayPloyJoyTokens)}</td>
                <td className="details-latency">--</td>
                <td><span className="badge success">OK</span></td>
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
              <Settings size={22} style={{ color: 'var(--accent-blue)' }} /> Dashboard Settings
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
              <span>API Keys are saved securely to a JSON file on the server and synced with LocalStorage</span>
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
                <label>Auto Refresh Interval</label>
                <Dropdown
                  label="Auto Refresh Interval"
                  value={refreshInterval}
                  onChange={v => setRefreshInterval(Number(v))}
                  options={[
                    { value: 15, label: 'Every 15 seconds' },
                    { value: 30, label: 'Every 30 seconds' },
                    { value: 60, label: 'Every 1 minute (Recommended)' },
                    { value: 300, label: 'Every 5 minutes' },
                    { value: 0, label: 'Manual refresh only' },
                  ]}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Brain size={14} /> ระบบความจำ (Memory)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => { const next = !useMemory; setUseMemory(next); localStorage.setItem('use_memory', next ? '1' : '0'); }}
                    className={`toggle-chip ${useMemory ? 'on violet' : 'off'}`}
                  >
                    <Brain size={14} />
                    <span>ความจำ: <strong>{useMemory ? 'เปิด' : 'ปิด'}</strong></span>
                  </button>
                  <button type="button" className="secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }} onClick={loadMemories} title="โหลดรายการความจำ">
                    <RefreshCw size={13} /> โหลด
                  </button>
                </div>
                <small style={{ color: 'var(--text-muted)', display: 'block', margin: '0.35rem 0' }}>
                  ความจำ {memoryData.memories.length} รายการ · สรุปแชท {memoryData.summaries.length} รายการ
                </small>
                <input
                  type="text"
                  placeholder="เพิ่มความจำด้วยตัวเอง (เช่น ชื่อฉันคือ...)"
                  value={newManualMemory}
                  onChange={e => setNewManualMemory(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualMemory(); } }}
                />
              </div>

              {memoryData.memories.length > 0 && (
                <div className="memory-list" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '0.5rem' }}>
                  {memoryData.memories.map(mem => (
                    <div key={mem.id} className="memory-list-item">
                      <span className={`memory-kind-tag ${mem.kind}`}>{mem.kind === 'manual' ? 'ด้วยมือ' : 'อัตโนมัติ'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mem.content}>{mem.content}</span>
                      <button type="button" className="action-icon-btn" onClick={() => deleteMemoryById(mem.id)} title="ลบความจำนี้">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {memoryData.memories.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <button type="button" className="secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', color: '#f85149', borderColor: 'rgba(248,113,113,0.3)' }} onClick={clearAllMemories}>
                    <Trash2 size={13} /> ล้างความจำทั้งหมด
                  </button>
                </div>
              )}

              <div className="form-group">
                <label>Embedding Model (ใช้ key Ollama)</label>
                <input
                  type="text"
                  value={keys.embedModel || 'nomic-embed-text'}
                  onChange={e => setKeys({ ...keys, embedModel: e.target.value })}
                  placeholder="nomic-embed-text"
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" className="secondary" onClick={() => setShowSettings(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Session */}
      {confirmDeleteSession && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteSession(false); }}>
          <div className="modal-card" style={{ maxWidth: 'min(420px, 100%)', padding: 'clamp(1.1rem, 3vw, 1.5rem)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f85149' }}>
              <Trash2 size={18} /> ลบบทสนทนานี้?
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              บทสนทนา “{currentSession.title}” และข้อความทั้งหมดจะถูกลบออกถาวร ข้อมูลนี้ไม่สามารถกู้คืนได้
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setConfirmDeleteSession(false)}>
                ยกเลิก
              </button>
              <button type="button" className="primary" style={{ background: '#da3633' }} onClick={confirmDeleteSessionNow}>
                <Trash2 size={14} /> ลบถาวร
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

export default App;
