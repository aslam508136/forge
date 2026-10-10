import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { ec2, invalidate, type AwsProfile, type Instance } from '../lib/api';

const InstancesTab = lazy(() => import('./tabs/InstancesTab'));
const LaunchTab = lazy(() => import('./tabs/LaunchTab'));
const AmisTab = lazy(() => import('./tabs/AmisTab'));
const VolumesTab = lazy(() => import('./tabs/VolumesTab'));
const SchedulesTab = lazy(() => import('./tabs/SchedulesTab'));

type Tab = 'instances' | 'launch' | 'amis' | 'volumes' | 'schedules';

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'instances', label: 'Instances', icon: '🖥' },
  { id: 'launch', label: 'Launch', icon: '🚀' },
  { id: 'amis', label: 'AMIs', icon: '📸' },
  { id: 'volumes', label: 'Volumes', icon: '💾' },
  { id: 'schedules', label: 'Schedule', icon: '⏰' },
];

export default function Dashboard({ profile, onBack, onLogout }: { profile: AwsProfile; onBack: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('instances');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [quota, setQuota] = useState(0);

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);

  const loadInstances = useCallback(async (fresh = false) => {
    if (fresh) invalidate(`/ec2/${profile.id}`);
    setLoading(true); setError('');
    try {
      const d = await ec2(profile.id, 'list-instances');
      setInstances(d.instances || []);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      if (/login again/i.test(msg)) onLogout();
    } finally { setLoading(false); }
    // quota quietly in background
    ec2(profile.id, 'get-quotas').then((q) => setQuota(q.quotas?.[0]?.value || 0)).catch(() => {});
  }, [profile.id, onLogout]);

  useEffect(() => { loadInstances(); }, [loadInstances]);

  const runAction = useCallback(async (action: string, ids: string[], label: string) => {
    if (!ids.length) { showToast('Pehle instance select karo'); return; }
    try {
      await ec2(profile.id, action, { instanceIds: ids });
      showToast(`${label} ho gaya`);
      await loadInstances(true);
      return true;
    } catch (e) { showToast((e as Error).message); return false; }
  }, [profile.id, loadInstances, showToast]);

  const running = instances.filter((i) => i.state === 'running').length;
  const stopped = instances.filter((i) => i.state === 'stopped').length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">EC2<span className="gradient-text">Forge</span><small>{profile.profile_name}</small></div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            <span style={{ fontSize: 15 }}>{n.icon}</span> {n.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <span className="badge-pill">{instances.length} instances · {profile.region}</span>
          <button className="nav-item" onClick={onBack}>← Accounts</button>
          <button className="nav-item" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <main className="main">
        <div className="page-head">
          <h1>{
            tab === 'instances' ? 'Instances' :
            tab === 'launch' ? 'Launch New Instance' :
            tab === 'amis' ? 'Amazon Machine Images' :
            tab === 'volumes' ? 'EBS Volumes' : 'Auto On/Off Schedules'
          } <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>{profile.region}</span></h1>
          <p>{profile.profile_name}</p>
        </div>

        {tab === 'instances' && (
          <div className="stats-grid">
            <div className="stat-card"><div className="k">Total</div><div className="v">{instances.length}</div></div>
            <div className="stat-card"><div className="k">Running</div><div className="v" style={{ color: 'var(--success)' }}>{running}</div></div>
            <div className="stat-card"><div className="k">Stopped</div><div className="v" style={{ color: 'var(--danger)' }}>{stopped}</div></div>
            <div className="stat-card"><div className="k">vCPU Quota</div><div className="v">{quota || '—'}</div></div>
          </div>
        )}

        {error && tab !== 'launch' && <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(248,113,113,0.4)', color: 'var(--danger)' }}>{error}</div>}

        <Suspense fallback={<div className="empty"><span className="loader" /></div>}>
          {tab === 'instances' && (
            <InstancesTab
              profileId={profile.id}
              instances={instances}
              loading={loading}
              onRefresh={() => loadInstances(true)}
              runAction={runAction}
              showToast={showToast}
            />
          )}
          {tab === 'launch' && <LaunchTab profileId={profile.id} showToast={showToast} onLaunched={() => { showToast('Instance launch ho gaya'); loadInstances(true); }} />}
          {tab === 'amis' && <AmisTab profileId={profile.id} showToast={showToast} instances={instances} />}
          {tab === 'volumes' && <VolumesTab profileId={profile.id} showToast={showToast} instances={instances} />}
          {tab === 'schedules' && <SchedulesTab profileId={profile.id} instances={instances} showToast={showToast} />}
        </Suspense>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}