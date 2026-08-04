import { ShieldCheck } from 'lucide-react';

export default function AuthScreen({ authState, authPassword, setAuthPassword, authError, handleSetup, handleLogin }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
      <div style={{ background: 'var(--panel-bg-solid)', padding: '2.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--panel-border)', boxShadow: '0 16px 32px rgba(0,0,0,0.5)', width: '100%', maxWidth: '420px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
          <ShieldCheck size={36} style={{ color: 'var(--accent-blue)' }} />
          <h2 style={{ fontSize: '1.5rem', margin: 0, fontWeight: '600' }}>{authState === 'needs_setup' ? 'ตั้งรหัสผ่านระบบ' : 'เข้าสู่ระบบ'}</h2>
        </div>

        {authState === 'needs_setup' && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem', textAlign: 'center', lineHeight: '1.5' }}>
            ระบบยังไม่มีรหัสผ่าน กรุณาตั้งรหัสผ่านสำหรับเข้าใช้งาน Dashboard (ตั้งครั้งเดียว)
          </p>
        )}

        <form onSubmit={authState === 'needs_setup' ? handleSetup : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="รหัสผ่าน"
              style={{ width: '100%', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem', color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none', fontSize: '1rem', transition: 'border-color 0.2s' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--panel-border)'}
              autoFocus
            />
          </div>

          {authError && <p style={{ color: 'var(--status-red)', fontSize: '0.875rem', textAlign: 'center', margin: '0' }}>{authError}</p>}

          <button
            type="submit"
            className="primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1rem' }}
          >
            {authState === 'needs_setup' ? 'ยืนยันรหัสผ่าน' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}
