import { useState, useEffect, useCallback } from 'react';
import { supabase, fetchProfiles, saveProfile, updateProfile, deleteProfile, callAwsApi, type AwsProfile, type Session } from './lib/supabase';
import { mirrorAwsProfiles, logUserEvent } from './lib/adminStore';
import { useTheme } from './context/ThemeContext';
import Dashboard from './components/Dashboard';
import Finance from './components/Finance';
import Instances from './components/Instances';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import MadeByBadge from './components/MadeByBadge';
import ThreeBackground from './components/ThreeBackground';
import Loader3D from './components/Loader3D';


type View = 'accounts' | 'finance' | 'instances';


export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [view, setView] = useState<View>('accounts');
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<AwsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AwsProfile | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bulkLoading, setBulkLoading] = useState<'start' | 'stop' | 'reboot' | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    profile_name: '',
    access_key: '',
    secret_key: '',
    region: 'ap-south-1',
  });
  const [manualRegion, setManualRegion] = useState('');
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [quotaMap, setQuotaMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ajaxaws-vcpu-quotas') || '{}');
    } catch {
      return {};
    }
  });
  const [quotaLoadingIds, setQuotaLoadingIds] = useState<Record<string, boolean>>({});

  const saveQuota = (id: string, value: number) => {
    setQuotaMap((m) => {
      const next = { ...m, [id]: value };
      localStorage.setItem('ajaxaws-vcpu-quotas', JSON.stringify(next));
      return next;
    });
  };

  const fetchQuota = useCallback(async (profile: AwsProfile) => {
    setQuotaLoadingIds((l) => ({ ...l, [profile.id]: true }));
    try {
      const data = await callAwsApi('get-quotas', {
        accessKey: profile.access_key,
        secretKey: profile.secret_key,
        region: profile.region,
      });
      const q = (data.quotas || []).find((x: { code: string }) => x.code === 'L-1216C47A');
      saveQuota(profile.id, q?.value ?? 0);
    } catch {
      saveQuota(profile.id, 0);
    } finally {
      setQuotaLoadingIds((l) => ({ ...l, [profile.id]: false }));
    }
  }, []);

  useEffect(() => {
    if (!profiles.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    profiles.forEach((p, i) => {
      if (quotaMap[p.id] === undefined) {
        timers.push(setTimeout(() => { fetchQuota(p); }, i * 250));
      }
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [profiles, fetchQuota]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(newSession);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function loadProfiles() {
    setLoading(true);
    try {
      const data = await fetchProfiles();
      setProfiles(data);
      mirrorAwsProfiles(session?.user?.id || '', session?.user?.email || '', data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadProfiles();
    else { setProfiles([]); setLoading(false); }
  }, [session]);

  async function handleSave() {
    if (!form.profile_name || !form.access_key || !form.secret_key) {
      setError('All fields are required');
      return;
    }
    const finalRegion = form.region === '__manual__' ? manualRegion.trim() : form.region;
    if (!finalRegion) { setError('Please enter a region'); return; }
    try {
      if (editingProfile) {
        await updateProfile(editingProfile.id, { ...form, region: finalRegion });
      } else {
        await saveProfile({ ...form, region: finalRegion });
      }
      setShowAdd(false);
      setEditingProfile(null);
      setForm({ profile_name: '', access_key: '', secret_key: '', region: 'ap-south-1' });
      setManualRegion('');
      await loadProfiles();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this profile?')) return;
    try {
      await deleteProfile(id);
      setQuotaMap((m) => {
        const next = { ...m };
        delete next[id];
        localStorage.setItem('ajaxaws-vcpu-quotas', JSON.stringify(next));
        return next;
      });
      await loadProfiles();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copyIps(p: AwsProfile) {
    setCopyingId(p.id);
    setError('');
    setNotice('');
    try {
      const data = await callAwsApi('list-instances', { accessKey: p.access_key, secretKey: p.secret_key, region: p.region });
      const ips = (data.instances || [])
        .filter((i: any) => i.state === 'running')
        .map((i: any) => (i.public_ip !== '—' ? i.public_ip : i.private_ip))
        .filter((ip: string) => ip !== '—');
      if (!ips.length) { setNotice(`${p.profile_name}: no running instances`); return; }
      await navigator.clipboard.writeText(ips.join('\n'));
      setNotice(`${p.profile_name}: ${ips.length} running IP(s) copied`);
    } catch (e) {
      setError(`${p.profile_name}: ${(e as Error).message}`);
    } finally {
      setCopyingId(null);
    }
  }

  function openAdd() {
    setEditingProfile(null);
    setForm({ profile_name: '', access_key: '', secret_key: '', region: 'ap-south-1' });
    setManualRegion('');
    setShowAdd(true);
  }

  async function bulkAction(mode: 'start' | 'stop' | 'reboot') {
    if (profiles.length === 0) { setNotice(''); setError('Add at least one account first'); return; }
    const verb = mode === 'start' ? 'Start' : mode === 'reboot' ? 'Reboot' : 'Stop';
    if (!confirm(`${verb} all instances in ${profiles.length} account(s)?`)) return;
    setBulkLoading(mode);
    setError('');
    setNotice('');
    const action = mode === 'start' ? 'start-instances' : mode === 'reboot' ? 'reboot-instances' : 'stop-instances';
    const wantState = mode === 'start' ? 'stopped' : 'running';
    const doneVerb = mode === 'start' ? 'started' : mode === 'reboot' ? 'rebooted' : 'stopped';
    let total = 0, accountsWith = 0, failed = 0;
    const errors: string[] = [];
    try {
      for (const p of profiles) {
        const creds = { accessKey: p.access_key, secretKey: p.secret_key, region: p.region };
        try {
          const data = await callAwsApi('list-instances', creds);
          const ids = (data.instances || []).filter((i: any) => i.state === wantState).map((i: any) => i.id);
          if (ids.length) {
            await callAwsApi(action, { ...creds, instanceIds: ids });
            accountsWith++;
            total += ids.length;
          }
        } catch (e) {
          failed++;
          if (errors.length < 3) errors.push(`${p.profile_name}: ${(e as Error).message}`);
        }
      }
      if (failed > 0) setError(`${failed} account(s) failed — ${errors.join(' | ')}`);
      if (total > 0) {
        setNotice(`${total} instance(s) ${doneVerb} across ${accountsWith} account(s)`);
      } else if (failed === 0) {
        setNotice(`No ${wantState} instances found`);
      }
    } finally {
      setBulkLoading(null);
    }
  }

  const PRESET_REGIONS = ['ap-south-1', 'ap-south-2', 'ap-southeast-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1'];

  function openEdit(p: AwsProfile) {
    setEditingProfile(p);
    const isPreset = PRESET_REGIONS.includes(p.region);
    setForm({
      profile_name: p.profile_name,
      access_key: p.access_key,
      secret_key: p.secret_key,
      region: isPreset ? p.region : '__manual__',
    });
    setManualRegion(isPreset ? '' : p.region);
    setShowAdd(true);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSelectedProfile(null);
  }

  if (recoveryMode && session) {
    return <ResetPassword onDone={() => setRecoveryMode(false)} />;
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ThreeBackground />
        <Loader3D />
      </div>
  );
}

function FlippingCard({ profile, idx, zones, shouldFlip, quota, quotaLoading, copyingId, zoneScanning, onFetchQuota, onCopyIps, onConnect, onEdit, onDelete }: {
  profile: AwsProfile; idx: number;
  zones: { zone: string; instances: ZoneInstance[] }[];
  shouldFlip: boolean;
  quota: number | undefined; quotaLoading: boolean;
  copyingId: string | null; zoneScanning: boolean;
  onFetchQuota: (p: AwsProfile) => void;
  onCopyIps: (p: AwsProfile) => void;
  onConnect: (p: AwsProfile) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const activeZones = zones.filter((z) => z.instances.some((i) => i.state === 'running'));
  const displayZones = activeZones.length >= 2 ? activeZones : zones;
  const [flipIdx, setFlipIdx] = useState(0);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (!shouldFlip || displayZones.length < 2) return;
    const timer = setInterval(() => {
      setFlipping(true);
      setTimeout(() => {
        setFlipIdx((p) => (p + 1) % displayZones.length);
        setFlipping(false);
      }, 400);
    }, 3000);
    return () => clearInterval(timer);
  }, [shouldFlip, displayZones.length]);

  const currentZone = displayZones[flipIdx] || zones[0];
  const currentRegion = currentZone?.zone || profile.region;
  const regionLabel = ZONE_LABEL[currentRegion] || currentRegion;
  const instances = currentZone?.instances || [];
  const running = instances.filter((i) => i.state === 'running').length;
  const stopped = instances.filter((i) => i.state === 'stopped').length;

  function handleConnect(e: React.MouseEvent) {
    e.stopPropagation();
    onConnect({ ...profile, region: currentRegion });
  }

  return (
    <div style={{ perspective: 800 }}>
      <div
        style={{
          transform: flipping ? 'rotateX(90deg)' : 'rotateX(0deg)',
          transition: flipping ? 'transform 0.4s ease-in' : 'transform 0.4s ease-out',
          transformStyle: 'preserve-3d',
        }}
        className="profile-card"
        onClick={() => onConnect({ ...profile, region: currentRegion })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: 'rgba(var(--glow-rgb), 0.12)', border: '1px solid rgba(var(--glow-rgb), 0.25)',
            color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800,
          }}>{idx + 1}</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.profile_name}</h3>
          {shouldFlip && (
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {displayZones.map((z, i) => (
                <span key={z.zone} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i === flipIdx ? 'var(--saffron)' : 'var(--line-strong)',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>
          )}
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => { e.stopPropagation(); onCopyIps(profile); }}
            disabled={copyingId === profile.id}
            title={`Copy running instance IPs of ${profile.profile_name}`}
            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {copyingId === profile.id ? <span className="spinner" /> : '📋'} Copy IPs
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontFamily: 'monospace' }}>
          {profile.access_key.slice(0, 8)}…
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: 'rgba(var(--glow-rgb), 0.1)', color: 'var(--primary)', border: '1px solid rgba(var(--glow-rgb), 0.2)', fontSize: 12, fontWeight: 700 }}>
            📍 {regionLabel}
          </span>
          {running > 0 && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(224,106,90,0.12)', color: 'var(--terracotta)' }}>
              {running} running
            </span>
          )}
          {stopped > 0 && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(139,135,160,0.12)', color: 'var(--ink-faint)' }}>
              {stopped} stopped
            </span>
          )}
        </div>
        {instances.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {instances.slice(0, 3).map((inst, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginBottom: 2,
                background: inst.state === 'running' ? 'rgba(224,106,90,0.06)' : 'rgba(139,135,160,0.05)',
                borderRadius: 4, fontSize: 11,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: inst.state === 'running' ? 'var(--terracotta)' : 'var(--ink-faint)',
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name || inst.id}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--ink-faint)' }}>{inst.type}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 9, color: inst.state === 'running' ? 'var(--terracotta)' : 'var(--ink-faint)' }}>
                  {inst.public_ip !== '—' ? inst.public_ip : inst.private_ip}
                </span>
              </div>
            ))}
            {instances.length > 3 && (
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center' }}>+{instances.length - 3} more</div>
            )}
          </div>
        )}
        {instances.length === 0 && zoneScanning && (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10, fontStyle: 'italic' }}>Scanning zones...</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {(() => {
            if (quotaLoading && quota === undefined) {
              return <span className="badge" style={{ background: 'rgba(var(--glow-rgb), 0.06)', color: 'var(--text-muted)', border: '1px solid rgba(var(--glow-rgb), 0.15)' }}>⚡ …</span>;
            }
            return (
              <span className="badge" onClick={(e) => { e.stopPropagation(); onFetchQuota(profile); }} title="Click to sync vCPU quota"
                style={{ background: 'rgba(var(--glow-rgb), 0.06)', color: 'var(--success)', border: '1px solid rgba(var(--glow-rgb), 0.15)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>
                ⚡ {quota || 0} vCPU {quotaLoading ? '(syncing…)' : '⟳'}
              </span>
            );
          })()}
        </div>
        {shouldFlip && (
          <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--ink-faint)', marginBottom: 8 }}>
            Auto: {displayZones.map((z) => ZONE_LABEL[z.zone] || z.zone).join(' ↔ ')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary btn-sm" style={{ flex: 1, fontSize: 12 }} onClick={handleConnect}>
            Connect {shouldFlip ? `(${regionLabel})` : ''}
          </button>
          <button className="btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
          <button className="btn-danger btn-sm" style={{ fontSize: 12 }} onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

  if (!session) return <Auth />;
  if (selectedProfile) return <Dashboard profile={selectedProfile} profiles={profiles} onBack={() => setSelectedProfile(null)} />;
  if (view === 'finance') return <Finance onNavigate={(v) => setView(v)} />;
  if (view === 'instances') return <Instances onNavigate={(v) => setView(v)} />;

  const sidebarNav = [
    { id: 'accounts', label: 'AWS Accounts', icon: '☁' },
    { id: 'instances', label: 'Connect Instance', icon: '🖥' },
    { id: 'finance', label: 'Finance', icon: '₹' },
  ];

  const uniqueRegions = [...new Set(profiles.map((p) => p.region))];

  return (
    <>
      <ThreeBackground />
      <MadeByBadge />
      <Sidebar
        activeItem="accounts"
        onNavigate={(id) => { if (id === 'finance') setView('finance'); if (id === 'instances') setView('instances'); }}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        onChangePassword={() => setShowChangePwd(true)}
        items={sidebarNav}
        title="AWS EC2 Pro"
        subtitle="Enterprise Management"
        userBadge={session.user.email || undefined}
      />
      <div className="main-content">
        <div style={{ maxWidth: 1200 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6, letterSpacing: -0.5 }} className="gradient-text">
              AWS Accounts
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Manage and connect your AWS profiles
            </p>
          </div>

          {error && (
            <div className="toast toast-error" style={{ position: 'static', marginBottom: 20 }}>
              {error}
            </div>
          )}

          {notice && (
            <div className="toast toast-success" style={{ position: 'static', marginBottom: 20 }}>
              {notice}
            </div>
          )}

          {!loading && profiles.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32,
            }}>
              <div className="stat-card">
                <div className="stat-card-value" style={{ color: 'var(--primary)' }}>{profiles.length}</div>
                <div className="stat-card-label">Accounts</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value" style={{ color: 'var(--success)' }}>{uniqueRegions.length}</div>
                <div className="stat-card-label">Regions</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value" style={{ color: 'var(--warning)' }}>EC2</div>
                <div className="stat-card-label">Service</div>
              </div>
              <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button className="btn-primary" onClick={openAdd} style={{ width: '100%', height: '100%', minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>+</span> Add Account
                </button>
              </div>
              <div className="stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px' }}>
                <button className="btn-primary btn-sm" onClick={() => bulkAction('start')} disabled={!!bulkLoading} style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  {bulkLoading === 'start' ? <span className="spinner" /> : '▶'} Start All
                </button>
                <button className="btn-danger btn-sm" onClick={() => bulkAction('stop')} disabled={!!bulkLoading} style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  {bulkLoading === 'stop' ? <span className="spinner" /> : '⏹'} Stop All
                </button>
                <button className="btn-secondary btn-sm" onClick={() => bulkAction('reboot')} disabled={!!bulkLoading} style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  {bulkLoading === 'reboot' ? <span className="spinner" /> : '⟳'} Reboot All
                </button>
              </div>
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16,
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 80, gridColumn: '1 / -1' }}>
                <Loader3D />
              </div>
            ) : profiles.length === 0 ? (
              <div className="profile-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, cursor: 'default' }}>
                <div style={{
                  width: 72, height: 72, margin: '0 auto 20px', borderRadius: 20,
                  background: 'rgba(var(--glow-rgb), 0.08)', border: '1px solid rgba(var(--glow-rgb), 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                  animation: 'float 3s ease-in-out infinite',
                }}>☁</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }} className="gradient-text">
                  Welcome to AWS EC2 Enterprise Pro
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 14, maxWidth: 400, margin: '0 auto 28px', lineHeight: 1.6 }}>
                  Add your first AWS account to start managing instances, volumes, AMIs, and more — all from one dashboard.
                </p>
                <button className="btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto', padding: '14px 28px', fontSize: 15 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Add Your First Account
                </button>
              </div>
            ) : (
              profiles.map((p, idx) => (
                <div key={p.id} className="profile-card" onClick={() => setSelectedProfile(p)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                      background: 'rgba(var(--glow-rgb), 0.12)', border: '1px solid rgba(var(--glow-rgb), 0.25)',
                      color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                    }}>{idx + 1}</span>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.profile_name}</h3>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); copyIps(p); }}
                      disabled={copyingId === p.id}
                      title={`Copy running instance IPs of ${p.profile_name}`}
                      style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {copyingId === p.id ? <span className="spinner" /> : '📋'} Copy IPs
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, fontFamily: 'monospace' }}>
                    {p.access_key.slice(0, 8)}…
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap',
                  }}>
                    <span className="badge" style={{ background: 'rgba(var(--glow-rgb), 0.1)', color: 'var(--primary)', border: '1px solid rgba(var(--glow-rgb), 0.2)' }}>
                      {p.region}
                    </span>
                    {(() => {
                      const quota = quotaMap[p.id];
                      if (quotaLoadingIds[p.id] && quota === undefined) {
                        return <span className="badge" style={{ background: 'rgba(var(--glow-rgb), 0.06)', color: 'var(--text-muted)', border: '1px solid rgba(var(--glow-rgb), 0.15)' }}>⚡ …</span>;
                      }
                      return (
                        <span
                          className="badge"
                          onClick={(e) => { e.stopPropagation(); fetchQuota(p); }}
                          title="Click to sync vCPU quota"
                          style={{
                            background: 'rgba(var(--glow-rgb), 0.06)', color: 'var(--success)', border: '1px solid rgba(var(--glow-rgb), 0.15)',
                            fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                          }}
                        >
                          ⚡ {quota || 0} vCPU {quotaLoadingIds[p.id] ? '(syncing…)' : '⟳'}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-primary btn-sm"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); setSelectedProfile(p); }}
                    >
                      Connect
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      style={{ fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      style={{ fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card" style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setView('instances')}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,230,118,0.12))',
              border: '1px solid rgba(0,212,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
            }}>🖥</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Connect Instance</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                Save running instance IPs + window positions and connect to all with one click
              </p>
            </div>
            <button className="btn-primary btn-sm" style={{ fontSize: 13 }}>Open →</button>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditingProfile(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingProfile ? 'Edit AWS Account' : 'Add AWS Account'}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: -6, marginBottom: 18 }}>
              {editingProfile ? 'Update access key, secret key, region, or name.' : 'Enter your AWS access key details.'}
            </p>
            <div className="form-group">
              <label>Profile Name</label>
              <input value={form.profile_name} onChange={(e) => setForm({ ...form, profile_name: e.target.value })} placeholder="My AWS Account" />
            </div>
            <div className="form-group">
              <label>Access Key ID</label>
              <input value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} placeholder="AKIA…" />
            </div>
            <div className="form-group">
              <label>Secret Access Key</label>
              <input type="password" value={form.secret_key} onChange={(e) => setForm({ ...form, secret_key: e.target.value })} placeholder="••••••••" />
            </div>
            <div className="form-group">
              <label>Region</label>
              <select value={form.region} onChange={(e) => {
                setForm({ ...form, region: e.target.value });
              }}>
                <option value="ap-south-1">ap-south-1 (Mumbai)</option>
                <option value="ap-south-2">ap-south-2 (Hyderabad)</option>
                <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                <option value="us-east-1">us-east-1 (N. Virginia)</option>
                <option value="us-west-2">us-west-2 (Oregon)</option>
                <option value="eu-west-1">eu-west-1 (Ireland)</option>
                <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                <option value="__manual__">Enter manually…</option>
              </select>
              {form.region === '__manual__' && (
                <input style={{ marginTop: 8 }} value={manualRegion} onChange={(e) => setManualRegion(e.target.value)} placeholder="e.g. ap-east-1" />
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>{editingProfile ? 'Update' : 'Save'}</button>
              <button className="btn-secondary" onClick={() => { setShowAdd(false); setEditingProfile(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pwd.length < 6) { setError('Naya password kam se kam 6 characters ka ho'); return; }
    if (pwd !== confirm) { setError('Naye passwords match nahi karte'); return; }
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user?.email) throw new Error('Not signed in');
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (signErr) throw new Error('Current password galat hai');
      const { error: upErr } = await supabase.auth.updateUser({ password: pwd });
      if (upErr) throw upErr;
      logUserEvent(user.id, user.email, 'password_reset');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h2>Change Password</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          Pehle current password, phir naya password dalo.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current Password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" autoFocus autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </div>
          {error && (
            <div style={{
              padding: '10px 14px', background: 'rgba(255,23,68,0.1)',
              border: '1px solid rgba(255,23,68,0.2)', borderRadius: 8,
              color: 'var(--danger)', fontSize: 13, marginBottom: 14,
            }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading && <span className="spinner" />}
              Save
            </button>
            <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPassword({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      const { data } = await supabase.auth.getUser();
      if (data.user) logUserEvent(data.user.id, data.user.email || '', 'password_reset');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', zIndex: 1 }}>
      <ThreeBackground />
      <MadeByBadge />
      <div style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 16px', borderRadius: 16,
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: 'var(--btn-contrast)',
            boxShadow: '0 0 30px rgba(var(--glow-rgb), 0.3)',
          }}>A</div>
          <h1 className="gradient-text" style={{ fontSize: 24, fontWeight: 800 }}>Set New Password</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
            Apna naya password choose karo
          </p>
        </div>
        <div className="card">
          <form onSubmit={handleSetPassword}>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" autoFocus autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
            {error && (
              <div style={{
                padding: '10px 14px', background: 'rgba(255,23,68,0.1)',
                border: '1px solid rgba(255,23,68,0.2)', borderRadius: 8,
                color: 'var(--danger)', fontSize: 13, marginBottom: 14,
              }}>{error}</div>
            )}
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading && <span className="spinner" />}
              Save Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
