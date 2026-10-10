import { useEffect, useState } from 'react';
import { getProfiles, createProfile, updateProfile, deleteProfile, invalidate, type AwsProfile } from '../lib/api';

const REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'eu-west-1', 'eu-central-1', 'ca-central-1', 'sa-east-1'];

export default function Accounts({ onOpenProfile, onLogout }: { onOpenProfile: (p: AwsProfile) => void; onLogout: () => void }) {
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<AwsProfile | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  async function load() {
    setLoading(true);
    try { setProfiles(await getProfiles()); }
    catch (e) { showToast((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">EC2<span className="gradient-text">Forge</span><small>AWS CONTROL PANEL</small></div>
        <div style={{ flex: 1 }} />
        <div className="sidebar-footer">
          <span className="badge-pill">{profiles.length} account(s)</span>
          <button className="nav-item" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <main className="main">
        <div className="page-head">
          <h1>AWS Accounts</h1>
          <p>Har account ke instances, launch, AMI, schedule alag manage hote hain.</p>
        </div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Add Account</button>
          <button className="btn btn-ghost" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
        </div>

        {loading ? <div className="empty"><span className="loader" /></div>
          : profiles.length === 0 ? (
            <div className="card empty"><span className="icon">☁️</span>Koi AWS account nahi. <strong>Add Account</strong> dabao.</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Name</th><th>Region</th><th style={{ paddingRight: 20, textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.profile_name}</td>
                      <td><span className="mono">{p.region}</span></td>
                      <td style={{ paddingRight: 20, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => onOpenProfile(p)}>Open</button>
                        <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setEditing(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={async () => {
                          if (!confirm(`Delete account '${p.profile_name}'?`)) return;
                          try { await deleteProfile(p.id); invalidate('/'); await load(); } catch (e) { showToast((e as Error).message); }
                        }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </main>

      {toast && <div className="toast">{toast}</div>}

      {addOpen && <AccountModal title="Add AWS Account" onClose={() => setAddOpen(false)} onSave={async (d) => {
        try { await createProfile(d); invalidate('/'); setAddOpen(false); await load(); } catch (e) { showToast((e as Error).message); }
      }} />}

      {editing && <AccountModal title="Edit AWS Account" initial={editing} onClose={() => setEditing(null)} onSave={async (d) => {
        try { await updateProfile(editing.id, d); invalidate('/'); setEditing(null); await load(); } catch (e) { showToast((e as Error).message); }
      }} />}
    </div>
  );
}

function AccountModal({ title, initial, onClose, onSave }: {
  title: string; initial?: AwsProfile;
  onClose: () => void;
  onSave: (d: { profile_name: string; access_key?: string; secret_key?: string; region: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.profile_name || '');
  const [ak, setAk] = useState('');
  const [sk, setSk] = useState('');
  const [region, setRegion] = useState(initial?.region || 'ap-south-1');
  const [busy, setBusy] = useState(false);

  const needKeys = !initial;
  const canSave = name.trim() && region && (!needKeys || (ak.trim() && sk.trim()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="form-group"><label>Profile Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="My AWS Account" autoFocus /></div>
        <div className="form-group"><label>Access Key ID {initial && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(khaali chhodo = same rahega)</span>}</label><input value={ak} onChange={(e) => setAk(e.target.value)} placeholder="AKIA..." className="mono" /></div>
        <div className="form-group"><label>Secret Access Key {initial && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>}</label><input value={sk} onChange={(e) => setSk(e.target.value)} placeholder="••••••••••" className="mono" type="password" /></div>
        <div className="form-group"><label>Region</label><select value={region} onChange={(e) => setRegion(e.target.value)}>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" disabled={busy || !canSave} onClick={async () => { setBusy(true); await onSave({ profile_name: name.trim(), access_key: ak.trim() || undefined, secret_key: sk.trim() || undefined, region }); setBusy(false); }}>
            {busy ? <span className="loader" /> : 'Save'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}