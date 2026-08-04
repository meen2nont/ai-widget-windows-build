import { Trash2 } from 'lucide-react';

export default function ConfirmDeleteModal({ currentSession, setConfirmDeleteSession, confirmDeleteSessionNow }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteSession(false); }}>
      <div className="modal-card" style={{ maxWidth: 'min(420px, 100%)', padding: 'clamp(1.1rem, 3vw, 1.5rem)' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f85149' }}>
          <Trash2 size={18} /> ลบบทสนทนานี้?
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          บทสนทนา &ldquo;{currentSession.title}&rdquo; และข้อความทั้งหมดจะถูกลบออกถาวร ข้อมูลนี้ไม่สามารถกู้คืนได้
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
  );
}
