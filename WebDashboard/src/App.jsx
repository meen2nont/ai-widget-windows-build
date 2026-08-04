import { useState, useEffect, useRef } from 'react';
import { 
  Settings, RefreshCw, CheckCircle2, XCircle, Activity,
  MessageSquare, LayoutGrid, Copy, Send, Clock, Globe, Search,
  Plus, Trash2, Download, Link2, Pencil, RotateCcw, Paperclip, Wrench, FileText, X,
  Mic, MicOff, Volume2, VolumeX, BookOpen, DollarSign, ChevronDown,
  Bot, Code, PenLine, Languages, BarChart, Printer, Mail, Brain, LogOut
} from 'lucide-react';
import { DeepSeekIcon, OllamaIcon, OllamaPayIcon } from './components/AIIcons';
import { encryptAndSaveConfig, loadAndDecryptConfig } from './utils/crypto';
import MarkdownMessage from './components/MarkdownMessage';
import Dropdown from './components/Dropdown';
import AuthScreen from './components/AuthScreen';
import TemplatesModal from './components/TemplatesModal';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import SettingsModal from './components/SettingsModal';
import pkg from '../package.json';
import { isPeakHour, bangkokDateStr, formatBangkokFull, formatBangkokTime, formatBangkokDayMonth } from '../time.js';
import './index.css';

// Stable message id helper
let msgCounter = 0;
const newMsgId = () => `m-${Date.now()}-${msgCounter++}`;
const ensureMsgIds = (msgs) => (msgs || []).map(m => (m && m.id) ? m : { ...m, id: newMsgId() });


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

function formatPeriod(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatBangkokDayMonth(d);
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

// --- Global Fetch Override for Auth ---
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  
  if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/')) {
    const token = localStorage.getItem('app_session_token');
    if (token) {
      config = config || {};
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`
      };
    }
  }
  
  const response = await originalFetch(resource, config);
  if (response.status === 401) {
    window.dispatchEvent(new Event('auth-failed'));
  }
  return response;
};

function App() {
  const [authState, setAuthState] = useState('loading');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('app_session_token') || ''}`
          }
        });
        const data = await res.json();
        setAuthState(data.status || 'needs_login');
      } catch (e) {
        setAuthState('needs_login');
      }
    };
    checkAuth();

    const handleAuthFailed = () => {
      setAuthState('needs_login');
      localStorage.removeItem('app_session_token');
    };
    window.addEventListener('auth-failed', handleAuthFailed);
    return () => window.removeEventListener('auth-failed', handleAuthFailed);
  }, []);

  const handleSetup = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('app_session_token', data.token);
        setAuthState('authenticated');
      } else {
        setAuthError(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (e) {
      setAuthError('Connection failed');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('app_session_token', data.token);
        setAuthState('authenticated');
      } else {
        setAuthError(data.error || 'รหัสผ่านไม่ถูกต้อง');
      }
    } catch (e) {
      setAuthError('Connection failed');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('app_session_token');
    setAuthState('needs_login');
    setAuthPassword('');
  };

  // (Auth UI moved to bottom to prevent hook order errors)

  const [keys, setKeys] = useState({
    deepseek: '',
    ollama: '',
    ollamaPay: '',
    embedModel: ''
  });

  const [refreshInterval, setRefreshInterval] = useState(
    Number(localStorage.getItem('refresh_interval')) || 60
  );

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'chat'
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
  const [settingsTab, setSettingsTab] = useState('general'); // 'general', 'keys', 'memory', 'security'
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [toastMsg, setToastMsg] = useState('');

  // Load config from server (including actual keys now that it's authenticated)
  // and fallback to local encrypted config.
  useEffect(() => {
    async function initKeys() {
      // 1. Load actual API keys from encrypted localStorage as fallback
      let decryptedKeys = await loadAndDecryptConfig();
      setKeys(decryptedKeys);

      // 2. Fetch config and keys from server
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const serverConfig = await res.json();
          if (serverConfig.keys && (serverConfig.keys.deepseek || serverConfig.keys.ollama || serverConfig.keys.ollamaPay)) {
            decryptedKeys = { ...decryptedKeys, ...serverConfig.keys };
            setKeys(k => ({ ...k, ...serverConfig.keys }));
            // Cache them locally too
            encryptAndSaveConfig(decryptedKeys);
          }
          if (serverConfig.embedModel) {
            setKeys(k => ({ ...k, embedModel: serverConfig.embedModel }));
          }
        }
      } catch (e) {
        console.warn('Could not fetch server config', e);
      }

      // 3. If no keys configured at all, prompt user to set up
      if (!decryptedKeys.deepseek && !decryptedKeys.ollama && !decryptedKeys.ollamaPay) {
        showToast('กรุณาตั้งค่า API Key ใน Settings ก่อนใช้งาน');
      }
    }
    
    if (authState === 'authenticated') {
      initKeys();
    }
  }, [authState]);

  const handleSaveKeys = async (e) => {
    if (e) e.preventDefault();
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

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบใหม่');
        setCurrentPassword('');
        setNewPassword('');
        setShowSettings(false);
        window.dispatchEvent(new Event('auth-failed'));
      } else {
        showToast(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      }
    } catch (e) {
      showToast('Connection failed');
    }
  };

  // Service Data State
  const [data, setData] = useState({
    deepseek: {
      balance: '0.00',
      currency: 'USD',
      granted: '0.00',
      toppedUp: '0.00',
      spentToday: '0.0000',
      latencyMs: 0,
      available: false
    },
    ollama: {
      sessionPercent: 0,
      weeklyPercent: 0,
      cost: '$0.00',
      latencyMs: 0,
      available: false,
      totalRequests: 0,
      activeModels: 0,
      periodStart: '',
      periodEnd: ''
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
      messages: [{ role: 'assistant', content: 'สวัสดีครับ! ผมคือ DeepSeek AI พร้อมใช้งาน Web Search, เครื่องมือ, การแนบไฟล์, Voice Input, Vision และ Personas มีอะไรให้ช่วยได้บ้างครับ?', id: newMsgId() }]
    }
  ]);
  const sessionsRef = useRef(null);
  const [activeSessionId, setActiveSessionId] = useState('default-session');
  const [chatPane, setChatPane] = useState('chat');
  const [promptInput, setPromptInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [lastResolvedModel, setLastResolvedModel] = useState(null);
  const [now, setNow] = useState(() => new Date());
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
      { id: 't1', name: 'Summarize Meeting', prompt: 'Summarize the following meeting report concisely, highlighting key points, decisions, and action items:\n\n[paste meeting report here]' },
      { id: 't2', name: 'Refactor Python Code', prompt: 'Refactor the following Python code to Clean Code following PEP 8, with an explanation of changes:\n\n```python\n[paste code here]\n```' },
      { id: 't3', name: 'Translate Contract', prompt: 'Translate the following document while preserving the legal meaning completely:\n\n[paste text to translate]' },
      { id: 't4', name: 'Code Review', prompt: 'Review the following code, checking for bugs, security issues, performance issues, and suggesting improvements:\n\n```\n[paste code here]\n```' },
      { id: 't5', name: 'Analyze CSV', prompt: 'Analyze the following data and summarize it in a Markdown table with key insights:\n\n[paste CSV or table here]' },
      { id: 't6', name: 'Draft Formal Email', prompt: 'Draft a formal email for:\nSubject: [state subject]\nTo: [state recipient]\nKey points: [state content to convey]' }
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
            setSessions(saved.map(s => ({ ...s, messages: ensureMsgIds(s.messages) })));
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
          if (parsed.length > 0) setSessions(parsed.map(s => ({ ...s, messages: ensureMsgIds(s.messages) })));
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

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // Refresh clock every 30s so the peak badge stays current.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const isPeak = isPeakHour(now);

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
            const info = json.balance_infos?.[0] || {};
            const bal = info.total_balance || '0.00';
            const granted = info.granted_balance || '0.00';
            const toppedUp = info.topped_up_balance || '0.00';
            const curr = info.currency || 'USD';

            // Calculate daily spend estimation (Thailand Timezone), based on topped-up balance
            // so free granted credit doesn't skew the spend delta.
            const todayStr = bangkokDateStr();
            const savedDate = localStorage.getItem('ds_spend_date');
            const startBal = localStorage.getItem('ds_start_bal') || toppedUp;
            let spent = '0.0000';

            if (savedDate === todayStr) {
              const diff = Math.max(0, parseFloat(startBal) - parseFloat(toppedUp));
              spent = diff.toFixed(4);
            } else {
              localStorage.setItem('ds_spend_date', todayStr);
              localStorage.setItem('ds_start_bal', toppedUp);
            }

            setData(d => ({
              ...d,
              deepseek: { balance: bal, currency: curr, granted, toppedUp, spentToday: spent, latencyMs: latency, available: true }
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
            const weeklyModels = json.limits?.weekly?.models || [];
            const totalRequests = weeklyModels.reduce((s, m) => s + (m.request_count || 0), 0);
            const activeModels = weeklyModels.length;
            const period = json.activity?.period || {};
            const periodStart = period.starting_at || '';
            const periodEnd = period.ending_at || '';
            setData(d => ({
              ...d,
              ollama: {
                sessionPercent: session, weeklyPercent: weekly, cost, latencyMs: latency, available: true,
                totalRequests, activeModels, periodStart, periodEnd
              }
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
      messages: [{ role: 'assistant', content: 'สวัสดีครับ! มีอะไรให้ช่วยในบทสนทนาใหม่นี้ไหม?', id: newMsgId() }]
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
    fetch('/api/chats/' + encodeURIComponent(activeSessionId), { method: 'DELETE' }).catch(() => {});
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
      return next;
    });
    const base = sessionsRef.current || sessions;
    const updated = base.map(s =>
      s.id === activeSessionId ? { ...s, messages: [...s.messages, assistantMsg] } : s
    );
    localStorage.setItem('ai_chat_sessions', JSON.stringify(updated));
    fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch(() => {});
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

  // Route to a concrete model based on the task, given available keys.
  const resolveModel = (prompt, attachedFiles) => {
    const hasImg = (attachedFiles || []).some(f => f.type?.startsWith('image/'));
    const text = (prompt || '').toLowerCase();
    const hasDS = !!keys.deepseek;
    const hasOllama = !!keys.ollama;

    const codeKeywords = ['โค้ด', 'code', 'refactor', 'debug', 'function', 'javascript', 'python', 'typescript', 'sql', 'api', 'react', 'component', 'error', 'bug'];
    const reasonKeywords = ['วิเคราะห์', 'วิเคราห์', 'เหตุผล', 'ทำไม', 'เพราะ', 'เปรียบเทียบ', 'สรุป', 'ข้อดีข้อเสีย', 'pros and cons', 'why', 'compare', 'analyze', 'evaluate'];

    const peak = isPeakHour();

    // Cheapest capable DeepSeek fallback for a non-reasoning task.
    const cheapest = () => {
      if (hasOllama) return 'ollama:deepseek-v4-flash';
      if (hasDS) return 'deepseek-v4-flash';
      return 'deepseek-v4-flash';
    };

    const pick = (prefer) => {
      if (prefer === 'reason') {
        // Use pro only off-peak; during peak downgrade to flash to save money.
        if (hasDS) return peak ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
        return cheapest();
      }
      return cheapest();
    };

    if (hasImg) {
      // Ollama Cloud has no vision model — route images to DeepSeek (has multimodal).
      return hasDS ? 'deepseek-v4-flash' : 'deepseek-v4-flash';
    }
    if (codeKeywords.some(k => text.includes(k))) return pick('code');
    if (reasonKeywords.some(k => text.includes(k))) return pick('reason');
    return pick('chat');
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if ((!promptInput.trim() && attachedFiles.length === 0) || isGenerating) return;

    const actualModel = selectedModel === 'auto'
      ? resolveModel(promptInput, attachedFiles)
      : selectedModel;
    const isOllamaModel = actualModel.startsWith('ollama:');
    if (isOllamaModel) {
      if (!keys.ollama) {
        showToast('กรุณากรอก Ollama Key ใน Settings ก่อนใช้งาน');
        setShowSettings(true);
        return;
      }
    } else if (!keys.deepseek) {
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
      id: newMsgId(),
      attachedFiles: currentAttachedFiles.length > 0 ? currentAttachedFiles : null
    };

    // Update local state immediately via functional update
    setSessions(prevSessions => {
      const next = prevSessions.map(s =>
        s.id === activeSessionId ? { ...s, messages: [...s.messages, userMsgObj], title: s.messages.length <= 1 ? (userText ? userText.substring(0, 20) : 'แนบไฟล์') : s.title } : s
      );
      return next;
    });
    const baseSessions = sessionsRef.current || sessions;
    const updatedSessions = baseSessions.map(s =>
      s.id === activeSessionId ? { ...s, messages: [...s.messages, userMsgObj], title: s.messages.length <= 1 ? (userText ? userText.substring(0, 20) : 'แนบไฟล์') : s.title } : s
    );
    localStorage.setItem('ai_chat_sessions', JSON.stringify(updatedSessions));

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

    const controller = new AbortController();
    abortRef.current = controller;

    // Stream against a chosen model. Returns true if the stream completed
    // (or was aborted), false if the provider was unavailable (503) and a
    // fallback should be attempted.
    const streamWith = async (model, endpoint) => {
      const isOllama = model.startsWith('ollama:');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: isOllama ? model.replace('ollama:', '') : model,
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
        if (res.status === 503) return false;
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการติดต่อ AI API');
      }

      let providerFailed = false;
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
            id: newMsgId(),
            model,
            searchResults: m.searchResults || null,
            scrapedContent: m.scrapedContent || null,
            executedTools: m.executedTools || null,
            tokenUsage: m.tokenUsage || null,
            estimatedCostUSD: m.estimatedCostUSD || null
          };
          appendAssistantMessage(assistantMsg);
          fetchData();
        },
        error: (m) => {
          console.error(`[chat][${model}] SSE error:`, m.error);
          if (m.error && (m.error.includes('503') || m.error.includes('404') || m.error.includes('400') || m.error.includes('not found'))) providerFailed = true;
          setStreamError(m.error || 'เกิดข้อผิดพลาดในการติดต่อ AI API');
        },
        aborted: () => {}
      });
      return !providerFailed;
    };

    try {
      const isAuto = selectedModel === 'auto';
      if (isAuto) setLastResolvedModel(actualModel);

      // Candidate chain: the resolved model first, then alternates until one succeeds.
      // Only used in auto mode when the primary provider fails.
      let candidates = null;
      if (isAuto) {
        const dsModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
        const ollamaModels = ['ollama:deepseek-v4-flash', 'ollama:gpt-oss:20b', 'ollama:gemma4:31b', 'ollama:qwen3.5:397b'];
        const ordered = [];
        if (actualModel.startsWith('ollama:')) {
          ordered.push(actualModel);
          if (keys.deepseek) ordered.push(...dsModels);
          ordered.push(...ollamaModels.filter(m => m !== actualModel));
        } else {
          ordered.push(actualModel);
          ordered.push(...dsModels.filter(m => m !== actualModel));
          if (keys.ollama) ordered.push(...ollamaModels);
        }
        candidates = [...new Set(ordered)];
      }

      let attempt = 0;
      let ok = false;
      let lastEndpoint = isOllamaModel ? '/api/ollama/chat' : '/api/deepseek/chat';

      if (candidates) {
        // Auto mode: walk the chain, resetting stream state between attempts.
        for (; attempt < candidates.length; attempt++) {
          const m = candidates[attempt];
          const ep = m.startsWith('ollama:') ? '/api/ollama/chat' : '/api/deepseek/chat';
          const usable = m.startsWith('ollama:') ? keys.ollama : keys.deepseek;
          if (!usable) continue;
          if (attempt > 0) {
            setStreamingContent('');
            setStreamingMeta(null);
            setStreamError('');
            setLastResolvedModel(m);
          }
          ok = await streamWith(m, ep);
          if (ok) break;
        }
      } else {
        ok = await streamWith(actualModel, lastEndpoint);
      }

      if (candidates && !ok) {
        setStreamError('ทุกโมเดลใช้งานไม่ได้ชั่วคราว — ลองอีกครั้งในอีกสักครู่');
      }
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
    const thaiTimeStr = formatBangkokFull();
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

  if (authState === 'loading') {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>Loading...</div>;
  }

  if (authState === 'needs_setup' || authState === 'needs_login') {
    return (
      <AuthScreen
        authState={authState}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authError={authError}
        handleSetup={handleSetup}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <div className={`container ${activeTab === 'chat' ? 'chat-active' : ''}`}>
      {/* Header */}
      <header>
        <div className="brand-title">
          <Activity size={26} className="icon-blue" />
          <h1>AI Service Monitoring <span className="build-tag">v{pkg.version}</span></h1>
        </div>

        <div className="header-actions">
          <div className="latency-tag" style={{ padding: '0.4rem 0.75rem', borderRadius: '10px' }}>
            <Clock size={14} />
            <span>Last updated {formatBangkokTime(lastRefreshed)}</span>
          </div>



          <button className="secondary" onClick={() => fetchData()} title="Refresh Data">
            <RefreshCw size={18} className={loading ? 'loading' : ''} />
          </button>

          <button className="primary" onClick={() => setShowSettings(true)}>
            <Settings size={18} /> <span className="btn-label">Settings</span>
          </button>
          
          <button className="secondary" onClick={handleLogout} title="Logout" style={{ marginLeft: '8px', color: 'var(--status-red)', borderColor: 'rgba(255, 69, 58, 0.25)', background: 'rgba(255, 69, 58, 0.08)' }}>
            <LogOut size={18} /> <span className="btn-label">Logout</span>
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
            <DeepSeekIcon size={24} className="icon-green" />
          </div>
          <div>
            <div className="summary-label">DeepSeek Balance</div>
            <div className="summary-value">${data.deepseek.balance}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box cyan">
            <OllamaIcon size={24} className="icon-blue" />
          </div>
          <div>
            <div className="summary-label">Ollama Session</div>
            <div className="summary-value">{(100 - data.ollama.sessionPercent).toFixed(1)}% Free</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon-box amber">
            <OllamaPayIcon size={24} className="icon-amber" />
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
                    <DeepSeekIcon size={24} className="icon-indigo" />
                    <h2 className="card-title">DeepSeek AI</h2>
                  </div>
                  <div className="row-center">
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
                    <div className="sub-stat-label">Spent Today</div>
                    <div className="sub-stat-value">${data.deepseek.spentToday}</div>
                  </div>
                  <div className="sub-stat-box">
                    <div className="sub-stat-label">Pricing</div>
                    <div className="sub-stat-value">
                      <span className={`peak-badge ${isPeak ? 'peak' : 'offpeak'}`}>
                        {isPeak ? '⚡ Peak (x2)' : '🟢 ราคาปกติ'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="progress-container" style={{ marginTop: '1rem' }}>
                  <div className="progress-header">
                    <span>Credit Composition</span>
                    <span>
                      {(() => {
                        const total = parseFloat(data.deepseek.granted) + parseFloat(data.deepseek.toppedUp);
                        if (!total) return '—';
                        return `${((parseFloat(data.deepseek.toppedUp) / total) * 100).toFixed(0)}% topped-up`;
                      })()}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill indigo"
                      style={{ transform: `scaleX(${(() => {
                        const total = parseFloat(data.deepseek.granted) + parseFloat(data.deepseek.toppedUp);
                        return total ? Math.min((parseFloat(data.deepseek.toppedUp) / total), 1) : 0;
                      })()})` }}
                    />
                  </div>
                </div>
              </div>

              {/* Ollama Cloud Card */}
              <div className="glass-card overview-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <OllamaIcon size={24} className="icon-blue" />
                    <h2 className="card-title">Ollama Cloud</h2>
                  </div>
                  <div className="row-center">
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
                    <span style={{ fontWeight: 700, color: data.ollama.sessionPercent > 85 ? 'var(--status-red)' : 'white' }}>
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

                <div className="sub-grid">
                  <div className="sub-stat-box">
                    <div className="sub-stat-label">Total Requests</div>
                    <div className="sub-stat-value">{formatCompact(data.ollama.totalRequests)}</div>
                  </div>
                  <div className="sub-stat-box">
                    <div className="sub-stat-label">Active Models</div>
                    <div className="sub-stat-value">{data.ollama.activeModels}</div>
                  </div>
                </div>
                <div className="period-line">
                  Period: {formatPeriod(data.ollama.periodStart)} → {formatPeriod(data.ollama.periodEnd)}
                </div>
              </div>

              {/* Ollama Pay Card */}
              <div className="glass-card overview-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <OllamaPayIcon size={24} className="icon-amber" />
                    <h2 className="card-title">Ollama Pay</h2>
                  </div>
                  <div className="row-center">
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
            <div className="card-header card-header-compact">
              <div className="card-title-group">
                <BookOpen size={16} className="icon-blue" />
                <h3 className="card-title">Quick Starters</h3>
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
            <div className="card-header card-header-compact">
              <div className="card-title-group">
                <Clock size={16} className="icon-purple" />
                <h3 className="card-title">Recent Activity</h3>
              </div>
              <button
                type="button"
                className="secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => { setActiveTab('chat'); setChatPane('history'); }}
              >
                View all
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
                  <span className="activity-badge">{s.messages.length} messages</span>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Latency Chart Card */}
          <div className="glass-card overview-latency-chart">
            <div className="card-header card-header-compact">
              <div className="card-title-group">
                <Activity size={16} className="icon-green" />
                <h3 className="card-title">Latency</h3>
              </div>
            </div>
            <div className="latency-chart-list">
              <div className="latency-bar-item">
                <div className="latency-item-header">
                  <span className="latency-service-name">DeepSeek API</span>
                  <span className="latency-ms-val">{data.deepseek.latencyMs} ms</span>
                </div>
                <div className="progress-track chart-track">
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
                <div className="progress-track chart-track">
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
                <div className="progress-track chart-track">
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
                    <MessageSquare size={20} className="icon-blue" /> {currentSession.title}
                  </h3>
                  <div className="row-center-sm">
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
                        { label: 'อัตโนมัติ', options: [
                          { value: 'auto', label: '🤖 Auto — เลือกเองตามงาน' },
                        ] },
                        { label: 'DeepSeek API', options: [
                          { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
                          { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
                        ] },
                        { label: 'Ollama Cloud', options: [
                          { value: 'ollama:deepseek-v4-flash', label: 'ollama: deepseek-v4-flash' },
                          { value: 'ollama:gpt-oss:20b', label: 'ollama: gpt-oss:20b' },
                          { value: 'ollama:gpt-oss:120b', label: 'ollama: gpt-oss:120b' },
                          { value: 'ollama:gemma4:31b', label: 'ollama: gemma4:31b' },
                          { value: 'ollama:qwen3.5:397b', label: 'ollama: qwen3.5:397b' },
                          { value: 'ollama:kimi-k2.6', label: 'ollama: kimi-k2.6' },
                          { value: 'ollama:mistral-large-3:675b', label: 'ollama: mistral-large-3:675b' },
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

                {selectedModel === 'auto' && lastResolvedModel && (
                  <div className="auto-model-badge">
                    <span className="auto-model-dot" />
                    Auto: ใช้โมเดล <strong>{lastResolvedModel.replace('ollama:', 'ollama: ')}</strong>
                  </div>
                )}
                <div className={`peak-badge ${isPeak ? 'peak' : 'offpeak'}`}>
                  {isPeak ? '⚡ ช่วง Peak — DeepSeek ราคา x2' : '🟢 ช่วงประหยัด — ราคาปกติ'}
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
                  <div key={m.id || idx} className={`message-wrapper ${m.role}`}>
                    <div className={`message-bubble ${m.role}`}>
                      <MetaBadges m={m} />
                      {/* Message Content with Markdown & Code Highlighting */}
                      {m.role === 'user' ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      ) : (
                        <MarkdownMessage content={m.content} />
                      )}
                    </div>

                    {m.role === 'assistant' && m.model && (
                      <div className="message-model-tag">
                        <Bot size={11} />
                        <span>{m.model.replace('ollama:', 'ollama: ')}</span>
                      </div>
                    )}

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
                      <div className="row-center">
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
        <TemplatesModal
          templates={templates}
          setShowTemplates={setShowTemplates}
          setPromptInput={setPromptInput}
          showToast={showToast}
          deleteTemplate={deleteTemplate}
          newTemplateName={newTemplateName}
          setNewTemplateName={setNewTemplateName}
          newTemplatePrompt={newTemplatePrompt}
          setNewTemplatePrompt={setNewTemplatePrompt}
          saveTemplate={saveTemplate}
        />
      )}

      {/* Modal Settings */}
      <SettingsModal
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        keys={keys}
        setKeys={setKeys}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        useMemory={useMemory}
        setUseMemory={setUseMemory}
        memoryData={memoryData}
        loadMemories={loadMemories}
        newManualMemory={newManualMemory}
        setNewManualMemory={setNewManualMemory}
        addManualMemory={addManualMemory}
        deleteMemoryById={deleteMemoryById}
        clearAllMemories={clearAllMemories}
        currentPassword={currentPassword}
        setCurrentPassword={setCurrentPassword}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        handleSaveKeys={handleSaveKeys}
        handleChangePassword={handleChangePassword}
      />

      {/* Confirm Delete Session */}
      {confirmDeleteSession && (
        <ConfirmDeleteModal
          currentSession={currentSession}
          setConfirmDeleteSession={setConfirmDeleteSession}
          confirmDeleteSessionNow={confirmDeleteSessionNow}
        />
      )}

      {/* Toast notification */}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

export default App;
