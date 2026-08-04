import { Settings, ShieldCheck, Brain, RefreshCw, Trash2 } from 'lucide-react';
import Dropdown from './Dropdown';

export default function SettingsModal({
  showSettings, setShowSettings, settingsTab, setSettingsTab,
  keys, setKeys, refreshInterval, setRefreshInterval,
  useMemory, setUseMemory, memoryData, loadMemories,
  newManualMemory, setNewManualMemory, addManualMemory,
  deleteMemoryById, clearAllMemories,
  currentPassword, setCurrentPassword,
  newPassword, setNewPassword,
  handleSaveKeys, handleChangePassword
}) {
  if (!showSettings) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2 style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Settings size={22} style={{ color: 'var(--accent-blue)' }} /> Dashboard Settings
        </h2>

        <div className="modal-tab-bar" style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid var(--panel-border)', marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {[
            { key: 'general', label: 'ทั่วไป' },
            { key: 'keys', label: 'API Keys' },
            { key: 'memory', label: 'ความจำ' },
            { key: 'security', label: 'ความปลอดภัย' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSettingsTab(tab.key)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                background: settingsTab === tab.key ? 'var(--accent-blue-bg)' : 'transparent',
                border: '1px solid',
                borderColor: settingsTab === tab.key ? 'var(--accent-blue)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                color: settingsTab === tab.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
                padding: '0.45rem 0.5rem',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: settingsTab === tab.key ? '600' : 'normal',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {settingsTab === 'security' && (
          <div>
            <h3 style={{ marginTop: '0', marginBottom: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              <ShieldCheck size={18} style={{ color: 'var(--accent-blue)' }} /> เปลี่ยนรหัสผ่าน Dashboard
            </h3>
            <form onSubmit={handleChangePassword} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label>รหัสผ่านปัจจุบัน</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="รหัสผ่านปัจจุบัน..." />
              </div>
              <div className="form-group" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label>รหัสผ่านใหม่</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="รหัสผ่านใหม่..." />
                </div>
                <button type="submit" className="primary" style={{ height: '42px', padding: '0 1.5rem' }}>
                  เปลี่ยนรหัสผ่าน
                </button>
              </div>
            </form>
          </div>
        )}

        {settingsTab !== 'security' && (
          <form onSubmit={handleSaveKeys}>
            {settingsTab === 'keys' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.5rem 0.85rem', background: 'rgba(35, 134, 54, 0.15)', border: '1px solid rgba(35, 134, 54, 0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#3fb950' }}>
                  <ShieldCheck size={16} />
                  <span>API Keys are saved securely to a JSON file on the server and synced with LocalStorage</span>
                </div>
                <div className="form-group">
                  <label>DeepSeek API Key</label>
                  <input type="password" value={keys.deepseek} onChange={e => setKeys({...keys, deepseek: e.target.value})} placeholder="sk-..." />
                </div>
                <div className="form-group">
                  <label>Ollama Cloud API Key</label>
                  <input type="password" value={keys.ollama} onChange={e => setKeys({...keys, ollama: e.target.value})} placeholder="Bearer token..." />
                </div>
                <div className="form-group">
                  <label>Ollama Pay API Key</label>
                  <input type="password" value={keys.ollamaPay} onChange={e => setKeys({...keys, ollamaPay: e.target.value})} placeholder="Bearer token..." />
                </div>
              </div>
            )}

            {settingsTab === 'general' && (
              <div>
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
                  <label>Embedding Model (ใช้ key Ollama)</label>
                  <input type="text" value={keys.embedModel || 'nomic-embed-text'} onChange={e => setKeys({ ...keys, embedModel: e.target.value })} placeholder="nomic-embed-text" />
                </div>
              </div>
            )}

            {settingsTab === 'memory' && (
              <div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Brain size={14} /> ระบบความจำ (Memory)
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    <button type="button" onClick={() => { const next = !useMemory; setUseMemory(next); localStorage.setItem('use_memory', next ? '1' : '0'); }} className={`toggle-chip ${useMemory ? 'on violet' : 'off'}`}>
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
                  <input type="text" placeholder="เพิ่มความจำด้วยตัวเอง (เช่น ชื่อฉันคือ...)" value={newManualMemory} onChange={e => setNewManualMemory(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualMemory(); } }} />
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
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button type="button" className="secondary" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save Settings
              </button>
            </div>
          </form>
        )}

        {settingsTab === 'security' && (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
