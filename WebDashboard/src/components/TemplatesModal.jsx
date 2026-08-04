import { BookOpen, X, FileText, Trash2, Plus, Save } from 'lucide-react';

const TEMPLATE_ICONS = { t1: FileText, t2: FileText, t3: FileText, t4: FileText, t5: FileText, t6: FileText };

export default function TemplatesModal({ templates, setShowTemplates, setPromptInput, showToast, deleteTemplate, newTemplateName, setNewTemplateName, newTemplatePrompt, setNewTemplatePrompt, saveTemplate }) {
  return (
    <div className="templates-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTemplates(false); }}>
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
          {templates.map(t => {
            const TI = TEMPLATE_ICONS[t.id] || FileText;
            return (
              <div key={t.id} style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem', cursor: 'pointer', transition: 'border-color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#a78bfa'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem', color: '#e6edf3' }}>
                  <TI size={14} style={{ color: 'var(--status-purple)', flexShrink: 0 }} />
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
            );
          })}
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
  );
}
