import { useState, useEffect, useRef } from 'react';
import { 
  Settings, RefreshCw, CheckCircle2, XCircle, Zap, Activity,
  MessageSquare, LayoutGrid, List, Copy, Send, ExternalLink, Clock, ShieldCheck, Lock
} from 'lucide-react';
import { DeepSeekIcon, OllamaIcon, OllamaPayIcon } from './components/AIIcons';
import { encryptAndSaveConfig, loadAndDecryptConfig } from './utils/crypto';
import './index.css';

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
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am DeepSeek AI. How can I assist you today?' }
  ]);
  const [promptInput, setPromptInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef(null);

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
            
            // Calculate daily spend estimation
            const todayStr = new Date().toISOString().split('T')[0];
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

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!promptInput.trim() || isGenerating || !keys.deepseek) return;

    const userText = promptInput;
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setPromptInput('');
    setIsGenerating(true);

    try {
      const res = await fetch('/api/deepseek/chat', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${keys.deepseek}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content || 'No response from model.';
        setMessages([...newMessages, { role: 'assistant', content: reply }]);
        fetchData(); // Refresh balance after chat
      } else {
        setMessages([...newMessages, { role: 'assistant', content: '⚠️ Error communicating with DeepSeek API.' }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '⚠️ Network request failed.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyStatsToClipboard = () => {
    const summary = `
📊 AI Quota Dashboard Summary (${new Date().toLocaleString()})
-----------------------------------------
🔹 DeepSeek: $${data.deepseek.balance} ${data.deepseek.currency} (Spent today: $${data.deepseek.spentToday})
☁️ Ollama Cloud: Session ${data.data?.ollama?.sessionPercent?.toFixed(1) || data.ollama.sessionPercent.toFixed(1)}% | Weekly ${data.ollama.weeklyPercent.toFixed(1)}% | Cost: ${data.ollama.cost}
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
            <span>Updated {lastRefreshed.toLocaleTimeString()}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={20} style={{ color: '#818cf8' }} /> DeepSeek Playground
            </h3>
            <select 
              value={selectedModel} 
              onChange={e => setSelectedModel(e.target.value)}
              style={{ width: 'auto', padding: '0.4rem 1rem' }}
            >
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-coder">deepseek-coder</option>
            </select>
          </div>

          <div className="chat-messages">
            {messages.map((m, idx) => (
              <div key={idx} className={`message-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {isGenerating && (
              <div className="message-bubble assistant">
                <div className="loading" /> Generating response...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChatMessage} className="chat-input-box">
            <input 
              type="text" 
              placeholder={keys.deepseek ? "Ask DeepSeek AI anything..." : "Please set DeepSeek API Key in Settings first..."}
              value={promptInput}
              onChange={e => setPromptInput(e.target.value)}
              disabled={isGenerating || !keys.deepseek}
            />
            <button type="submit" className="primary" disabled={isGenerating || !keys.deepseek}>
              <Send size={18} /> Send
            </button>
          </form>
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
              <Settings size={22} style={{ color: '#818cf8' }} /> Dashboard Configuration
            </h2>

            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              marginBottom: '1.5rem', 
              padding: '0.5rem 0.85rem', 
              background: 'rgba(16, 185, 129, 0.12)', 
              border: '1px solid rgba(16, 185, 129, 0.25)', 
              borderRadius: '10px', 
              fontSize: '0.8rem', 
              color: '#34d399' 
            }}>
              <ShieldCheck size={16} />
              <span>API Keys are encrypted with <strong>AES-256 (AES-GCM) JSON</strong> in LocalStorage.</span>
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
                <label>Auto-Refresh Interval</label>
                <select 
                  value={refreshInterval} 
                  onChange={e => setRefreshInterval(Number(e.target.value))}
                >
                  <option value={15}>Every 15 Seconds</option>
                  <option value={30}>Every 30 Seconds</option>
                  <option value={60}>Every 1 Minute</option>
                  <option value={300}>Every 5 Minutes</option>
                  <option value={0}>Manual Only</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" className="secondary" onClick={() => setShowSettings(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save Changes
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
