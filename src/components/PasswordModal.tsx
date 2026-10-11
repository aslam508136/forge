import { useState } from 'react';
import { callAwsApi } from '../lib/supabase';

interface Instance {
  id: string;
  name: string;
  public_ip: string;
  platform: string;
}

export default function PasswordModal({
  instance,
  creds,
  onClose,
}: {
  instance: Instance;
  creds: Record<string, string>;
  onClose: () => void;
}) {
  const [pemContent, setPemContent] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleGetPassword() {
    if (!pemContent.trim()) {
      setError('Please paste the PEM private key content');
      return;
    }
    setLoading(true);
    setError('');
    setPassword('');
    try {
      const data = await callAwsApi('get-password', {
        ...creds,
        instanceId: instance.id,
        pemContent,
      });
      if (data.password) {
        setPassword(data.password);
      } else {
        setError(data.error || 'Password not available yet. Wait 4-5 minutes after launch.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copyPassword() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadRdp() {
    const rdpContent = [
      `full address:s:${instance.public_ip}`,
      'username:s:Administrator',
      'prompt for credentials:i:1',
      'screen mode id:i:2',
      'desktopwidth:i:1920',
      'desktopheight:i:1080',
    ].join('\r\n');
    const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${instance.public_ip}.rdp`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPemContent(ev.target?.result as string);
    reader.readAsText(file);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Get Windows Password — {instance.name}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          Instance: <span style={{ fontFamily: 'monospace' }}>{instance.id}</span><br />
          Public IP: <span style={{ fontFamily: 'monospace' }}>{instance.public_ip}</span>
        </p>

        {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: 16 }}>{error}</div>}

        <div className="form-group">
          <label>Upload PEM Key File</label>
          <input type="file" accept=".pem" onChange={handleFileUpload} style={{ padding: 8 }} />
        </div>

        <div className="form-group">
          <label>Or Paste PEM Private Key Content</label>
          <textarea
            value={pemContent}
            onChange={(e) => setPemContent(e.target.value)}
            placeholder={`-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`}
            rows={5}
            style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
        </div>

        <button className="btn-primary" onClick={handleGetPassword} disabled={loading} style={{ marginBottom: 20 }}>
          {loading ? <span className="spinner" /> : 'Decrypt Password'}
        </button>

        {password && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Administrator Password</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 14, wordBreak: 'break-all' }}>
                {password}
              </code>
              <button className="btn-secondary btn-sm" onClick={copyPassword}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
          </div>
        )}

        {password && (
          <div style={{ background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 8, color: 'var(--success)' }}>Ready to RDP!</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Username: <strong>Administrator</strong><br />
              Password: decrypted above<br />
              IP: {instance.public_ip}
            </p>
            <button className="btn-primary btn-sm" onClick={downloadRdp}>Download .rdp File</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
