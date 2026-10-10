import { useState } from 'react';
import { login, register, setToken } from '../lib/api';

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !pass) { setError('Email aur password daalo'); return; }
    setLoading(true); setError('');
    try {
      const fn = mode === 'login' ? login : register;
      const { token } = await fn(email.trim(), pass);
      setToken(token);
      onAuthed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={handle}>
        <h1 className="gradient-text">EC2 Forge</h1>
        <div className="sub">AWS Control Panel — fast, secure, sab ek jagah</div>

        <div className="seg">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Login</button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Sign Up</button>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus autoComplete="email" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="min 6 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
          {loading ? <span className="loader" /> : mode === 'login' ? 'Login' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}