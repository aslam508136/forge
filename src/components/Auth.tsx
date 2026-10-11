import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { logSignup } from '../lib/adminStore';
import MadeByBadge from './MadeByBadge';
import ThreeBackground from './ThreeBackground';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'forgot') {
        if (!email.trim()) { setError('Enter your email'); setLoading(false); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setInfo('Reset link sent! Check your email and click the link to set a new password.');
      } else if (mode === 'signup') {
        if (!email.trim() || !password) { setError('Email and password are required'); setLoading(false); return; }
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        logSignup(data.user?.id || '', email.trim());
      } else {
        if (!email.trim() || !password) { setError('Email and password are required'); setLoading(false); return; }
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = (err as Error).message || 'Authentication failed';
      setError(msg.includes('Invalid login') || msg.includes('Invalid credentials')
        ? 'Wrong email or password'
        : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ThreeBackground />
      <MadeByBadge />
      <div className="auth-split">
        <div className="auth-brand">
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 400 }}>
            <div style={{
              width: 80, height: 80, margin: '0 auto 28px', borderRadius: 22,
              background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 38, fontWeight: 800, color: 'var(--btn-contrast)',
              boxShadow: '0 0 50px rgba(var(--glow-rgb), 0.3)',
              animation: 'float 3s ease-in-out infinite',
            }}>
              <span style={{ display: 'inline-block', animation: 'glow 2s ease-in-out infinite' }}>A</span>
            </div>
            <h1 style={{
              fontSize: 36,
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: 16,
            }} className="gradient-text">
              AWS EC2<br />Enterprise Pro
            </h1>
            <p style={{
              color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7,
              maxWidth: 320, margin: '0 auto',
            }}>
              Manage your EC2 fleet — instances, volumes, AMIs, and key pairs — all with enterprise-grade security and real-time control.
            </p>
            <div style={{
              display: 'flex', gap: 20, marginTop: 36, justifyContent: 'center',
              fontSize: 12, color: 'var(--text-muted)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 8px var(--success)' }} />
                Encrypted
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', boxShadow: '0 0 8px var(--primary)' }} />
                Private
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block', boxShadow: '0 0 8px var(--warning)' }} />
                Secure
              </span>
            </div>
          </div>
        </div>
        <div className="auth-form-panel">
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
                {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {mode === 'login' ? 'Sign in to access your AWS accounts' :
                 mode === 'signup' ? 'Enter your details to get started' :
                 'Enter your email to receive a reset link'}
              </p>
            </div>

            {mode !== 'forgot' && (
              <div style={{
                display: 'flex', gap: 4, marginBottom: 28,
                background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10,
                border: '1px solid var(--glass-border)',
              }}>
                <button
                  onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                    background: mode === 'login' ? 'rgba(0,212,255,0.12)' : 'transparent',
                    color: mode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
                    border: mode === 'login' ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                    transition: 'all 0.3s ease',
                  }}
                >Sign In</button>
                <button
                  onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                    background: mode === 'signup' ? 'rgba(0,212,255,0.12)' : 'transparent',
                    color: mode === 'signup' ? 'var(--primary)' : 'var(--text-muted)',
                    border: mode === 'signup' ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                    transition: 'all 0.3s ease',
                  }}
                >Sign Up</button>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              {mode !== 'forgot' && (
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </div>
              )}
              {error && (
                <div style={{
                  padding: '10px 14px', background: 'rgba(255,23,68,0.1)',
                  border: '1px solid rgba(255,23,68,0.2)', borderRadius: 8,
                  color: 'var(--danger)', fontSize: 13, marginBottom: 14,
                }}>
                  {error}
                </div>
              )}
              {info && (
                <div style={{
                  padding: '10px 14px', background: 'rgba(0,230,118,0.1)',
                  border: '1px solid rgba(0,230,118,0.2)', borderRadius: 8,
                  color: 'var(--success)', fontSize: 13, marginBottom: 14, lineHeight: 1.5,
                }}>
                  {info}
                </div>
              )}
              <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 20px', fontSize: 15 }}>
                {loading && <span className="spinner" />}
                {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>

            {mode === 'login' && (
              <button
                onClick={() => { setMode('forgot'); setError(''); setInfo(''); setPassword(''); }}
                style={{
                  width: '100%', background: 'none', color: 'var(--text-muted)',
                  fontSize: 13, marginTop: 18, padding: '4px', textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                Forgot password?
              </button>
            )}
            {mode === 'forgot' && (
              <button
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                style={{ width: '100%', background: 'none', color: 'var(--text-muted)', fontSize: 13, marginTop: 18, padding: '4px' }}
              >
                ← Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
