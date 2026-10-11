import { useState, useEffect, useCallback } from 'react';
import { supabase, callAwsApi, fetchAutoConfigs, upsertAutoConfig, deleteAutoConfig, type AwsProfile, type InstanceAutoConfig } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { SchedulesTab } from './SchedulesTab';
import PasswordModal from './PasswordModal';
import Sidebar from './Sidebar';
import MadeByBadge from './MadeByBadge';
import ThreeBackground from './ThreeBackground';
import Loader3D from './Loader3D';

interface Instance {
  id: string; name: string; state: string; type: string;
  public_ip: string; private_ip: string; platform: string; az: string;
}

interface Volume {
  id: string; size: number; type: string; state: string; instance: string;
}

interface Ami {
  id: string; name: string; state: string; created: string;
  arch: string; rootDevice: string; shared?: boolean;
}

interface Quota {
  code: string; name: string; value: number; unit: string; adjustable?: boolean;
}

type Tab = 'instances' | 'volumes' | 'amis' | 'launch' | 'schedules';

export default function Dashboard({ profile, profiles, onBack }: { profile: AwsProfile; profiles: AwsProfile[]; onBack: () => void }) {
  const { isDark, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('instances');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [amis, setAmis] = useState<Ami[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [passwordInstance, setPasswordInstance] = useState<Instance | null>(null);
  const [createAmiFor, setCreateAmiFor] = useState<Instance | null>(null);
  const [presetAmi, setPresetAmi] = useState<Ami | null>(null);
  const [amiName, setAmiName] = useState('');
  const [shareAmiFor, setShareAmiFor] = useState<Ami | null>(null);
  const [accountIds, setAccountIds] = useState<Record<string, string>>({});
  const [shareLoading, setShareLoading] = useState(false);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [autoConfigs, setAutoConfigs] = useState<Record<string, InstanceAutoConfig>>({});
  const [sizeInstance, setSizeInstance] = useState<Instance | null>(null);
  const [sizeBusy, setSizeBusy] = useState(false);
  const [autoEditing, setAutoEditing] = useState<Instance | null>(null);
  const [autoAutoEnabled, setAutoAutoEnabled] = useState(true);
  const [autoOnTime, setAutoOnTime] = useState('09:00');
  const [autoOffTime, setAutoOffTime] = useState('18:00');
  const [autoShrink, setAutoShrink] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);

  const creds = {
    accessKey: profile.access_key,
    secretKey: profile.secret_key,
    region: profile.region,
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadQuotas = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const data = await callAwsApi('get-quotas', creds);
      setQuotas(data.quotas || []);
    } catch (e) {
      setQuotas([]);
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  useEffect(() => { loadQuotas(); }, [loadQuotas]);

  const loadAutoConfigs = useCallback(async () => {
    try {
      const list = await fetchAutoConfigs(profile.id);
      const map: Record<string, InstanceAutoConfig> = {};
      for (const c of list) map[c.instance_id] = c;
      setAutoConfigs(map);
    } catch (e) {
      setAutoConfigs({});
    }
  }, [profile.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'instances') {
        const data = await callAwsApi('list-instances', creds);
        setInstances(data.instances || []);
        loadAutoConfigs();
      } else if (tab === 'volumes') {
        const data = await callAwsApi('list-volumes', creds);
        setVolumes(data.volumes || []);
      } else if (tab === 'amis') {
        const data = await callAwsApi('list-amis', creds);
        setAmis(data.amis || []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAction(action: string, label: string) {
    if (selected.length === 0) { showToast('Select at least one instance'); return; }
    if (!confirm(`${label} ${selected.length} instance(s)?`)) return;
    try {
      await callAwsApi(action, { ...creds, instanceIds: selected });
      showToast(`${label} successful`);
      setSelected([]);
      await loadData();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function handleRename(id: string) {
    const name = prompt('Enter new name:');
    if (!name) return;
    try {
      await callAwsApi('rename-instance', { ...creds, instanceId: id, name });
      showToast('Renamed successfully');
      await loadData();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function handleResize() {
    const inst = sizeInstance;
    if (!inst) return;
    const type = (document.getElementById('resize-type') as HTMLSelectElement)?.value;
    if (!type) { showToast('Select an instance type'); return; }
    setSizeBusy(true);
    try {
      await callAwsApi('modify-instance-type', { ...creds, instanceId: inst.id, instanceType: type });
      showToast(`Size changed to ${type}`);
      setSizeInstance(null);
      await loadData();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setSizeBusy(false);
    }
  }

  function openSizeModal(inst: Instance) {
    setSizeInstance(inst);
  }

  function openAutoModal(inst: Instance) {
    const cfg = autoConfigs[inst.id];
    setAutoEditing(inst);
    setAutoAutoEnabled(cfg ? cfg.auto_enabled : true);
    setAutoOnTime(cfg?.on_time ? cfg.on_time.slice(0, 5) : '09:00');
    setAutoOffTime(cfg?.off_time ? cfg.off_time.slice(0, 5) : '18:00');
    setAutoShrink(cfg ? cfg.shrink_enabled : true);
  }

  async function saveAutoConfig() {
    const inst = autoEditing;
    if (!inst) return;
    const onT = autoOnTime.trim();
    const offT = autoOffTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(onT) || !/^\d{1,2}:\d{2}$/.test(offT)) {
      showToast('Valid ON/OFF time chahiye (HH:MM)');
      return;
    }
    setAutoBusy(true);
    try {
      await upsertAutoConfig(profile.id, inst.id, {
        auto_enabled: autoAutoEnabled,
        on_time: `${onT.length === 4 ? '0' + onT : onT}:00`,
        off_time: `${offT.length === 4 ? '0' + offT : offT}:00`,
        shrink_enabled: autoAutoEnabled ? autoShrink : false,
      });
      showToast(autoAutoEnabled ? `AUTO ON: ${onT} → OFF: ${offT}${autoShrink ? ' + shrink' : ''}` : 'AUTO OFF ho gaya');
      setAutoEditing(null);
      await loadAutoConfigs();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setAutoBusy(false);
    }
  }

  async function removeAutoConfig() {
    const inst = autoEditing;
    if (!inst) return;
    setAutoBusy(true);
    try {
      await deleteAutoConfig(profile.id, inst.id);
      showToast('Auto config hata diya');
      setAutoEditing(null);
      await loadAutoConfigs();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setAutoBusy(false);
    }
  }

  async function handleCreateAmi() {
    if (!createAmiFor || !amiName.trim()) return;
    try {
      await callAwsApi('create-ami', { ...creds, instanceId: createAmiFor.id, name: amiName.trim() });
      showToast(`AMI '${amiName.trim()}' is being created`);
      setCreateAmiFor(null);
      setAmiName('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteAmi(id: string, name: string) {
    if (!confirm(`Delete AMI '${name}'? This cannot be undone.`)) return;
    try {
      await callAwsApi('delete-ami', { ...creds, amiId: id });
      showToast('AMI deleted');
      loadData();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleShareAmi(targetAccountId: string) {
    if (!shareAmiFor || !targetAccountId.trim()) return;
    if (!/^\d{12}$/.test(targetAccountId.trim())) {
      showToast('Enter a valid 12-digit AWS account ID');
      return;
    }
    setShareLoading(true);
    try {
      await callAwsApi('share-ami', { ...creds, amiId: shareAmiFor.id, targetAccountId: targetAccountId.trim() });
      showToast(`AMI shared with ${targetAccountId.trim()}`);
      setShareAmiFor(null);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setShareLoading(false);
    }
  }

  async function loadAccountId(p: AwsProfile) {
    if (accountIds[p.id]) return accountIds[p.id];
    try {
      const r = await callAwsApi('get-account-id', {
        accessKey: p.access_key, secretKey: p.secret_key, region: p.region,
      });
      setAccountIds((prev) => ({ ...prev, [p.id]: r.accountId }));
      return r.accountId as string;
    } catch { return ''; }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function downloadRdp(ip: string, username: string) {
    const rdpContent = [
      'full address:s:' + ip,
      'username:s:' + username,
      'prompt for credentials:i:1',
      'screen mode id:i:2',
      'desktopwidth:i:1920',
      'desktopheight:i:1080',
    ].join('\r\n');
    const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ip}.rdp`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const navItems = [
    { id: 'back', label: '← Accounts', icon: '◀' },
    { id: 'instances', label: 'Instances', icon: '🖥' },
    { id: 'volumes', label: 'Volumes', icon: '💾' },
    { id: 'amis', label: 'AMIs', icon: '📸' },
    { id: 'launch', label: 'Launch', icon: '🚀' },
    { id: 'schedules', label: 'Schedule', icon: '⏰' },
  ];

  const handleNav = (id: string) => {
    if (id === 'back') { onBack(); return; }
    setTab(id as Tab);
  };

  const runningInstances = instances.filter((i) => i.state === 'running').length;
  const stoppedInstances = instances.filter((i) => i.state === 'stopped').length;
  const mainQuota = quotas.find((q) => q.code === 'L-1216C47A')?.value || 0;

  return (
    <>
      <ThreeBackground />
      <MadeByBadge />
      <Sidebar
        activeItem={tab}
        onNavigate={handleNav}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={async () => { await supabase.auth.signOut(); }}
        items={navItems}
        title={profile.profile_name}
        subtitle={profile.region}
        userBadge={`${instances.length} instance${instances.length !== 1 ? 's' : ''}`}
      />
      <div className="main-content">
        <div style={{ maxWidth: 1200 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: 'var(--primary)' }}>{instances.length}</div>
              <div className="stat-card-label">Total Instances</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: 'var(--success)' }}>{runningInstances}</div>
              <div className="stat-card-label">Running</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: 'var(--danger)' }}>{stoppedInstances}</div>
              <div className="stat-card-label">Stopped</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{volumes.length > 0 ? volumes.length : '—'}</div>
              <div className="stat-card-label">Volumes</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: 'var(--info)' }}>{amis.length > 0 ? amis.length : '—'}</div>
              <div className="stat-card-label">AMIs</div>
            </div>
            <div className="stat-card" title={quotas.find((q) => q.code === 'L-1216C47A')?.name || 'vCPU quota'}>
              <div className="stat-card-value" style={{ color: 'var(--primary)' }}>
                {quotaLoading ? '…' : (mainQuota > 0 ? mainQuota : '—')}
              </div>
              <div className="stat-card-label">vCPU Quota ({profile.region})</div>
            </div>
          </div>

          {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: 16 }}>{error}</div>}

          {tab === 'instances' && (
            <>
              <div style={{
                display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
                padding: '14px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12,
                border: '1px solid var(--glass-border)', alignItems: 'center',
              }}>
                <button className="btn-primary btn-sm" onClick={() => handleAction('start-instances', 'Start')}>▶ Start</button>
                <button className="btn-secondary btn-sm" onClick={() => handleAction('stop-instances', 'Stop')}>⏹ Stop</button>
                <button className="btn-secondary btn-sm" onClick={() => handleAction('reboot-instances', 'Reboot')}>⟳ Reboot</button>
                <button className="btn-danger btn-sm" onClick={() => handleAction('terminate-instances', 'Terminate')}>✕ Terminate</button>
                <div style={{ flex: 1 }} />
                <button className="btn-secondary btn-sm" onClick={loadData}>↻ Refresh</button>
                <button className="btn-primary btn-sm" onClick={() => {
                  const ips = instances.filter((i) => i.state === 'running')
                    .map((i) => i.public_ip !== '—' ? i.public_ip : i.private_ip)
                    .filter((ip) => ip !== '—');
                  if (!ips.length) { showToast('No running instances'); return; }
                  navigator.clipboard.writeText(ips.join('\n'));
                  showToast(`${ips.length} IPs copied to clipboard`);
                }}>Copy All IPs</button>
                {selected.length > 0 && (
                  <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
                    {selected.length} selected
                  </span>
                )}
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Loader3D /></div>
              ) : instances.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 40, marginBottom: 12 }}>🖥</p>
                  No instances found
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40, paddingLeft: 20 }}>
                          <input type="checkbox" onChange={(e) => setSelected(e.target.checked ? instances.map((i) => i.id) : [])} checked={selected.length === instances.length} style={{ width: 'auto' }} />
                        </th>
                        <th>Name</th>
                        <th>Instance ID</th>
                        <th>State</th>
                        <th>Type</th>
                        <th>Public IP</th>
                        <th>Platform</th>
                        <th style={{ paddingRight: 20 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances.map((inst) => (
                        <tr key={inst.id}>
                          <td style={{ paddingLeft: 20 }}><input type="checkbox" checked={selected.includes(inst.id)} onChange={() => toggleSelect(inst.id)} style={{ width: 'auto' }} /></td>
                          <td style={{ fontWeight: 700 }}>{inst.name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{inst.id}</td>
                          <td><span className={`badge badge-${inst.state}`}>{inst.state}</span></td>
                          <td>{inst.type}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--primary)' }}>{inst.public_ip}</td>
                          <td>{inst.platform}</td>
                          <td style={{ paddingRight: 20 }}>
                            <button className="btn-secondary btn-sm" style={{ marginRight: 4 }} onClick={() => openSizeModal(inst)} title="Change instance size (stopped)">Size</button>
                            <button
                              className="btn-secondary btn-sm"
                              style={{
                                marginRight: 4,
                                background: autoConfigs[inst.id]?.auto_enabled ? 'rgba(0,230,118,0.16)' : (autoConfigs[inst.id] ? 'rgba(0,212,255,0.16)' : undefined),
                                border: autoConfigs[inst.id] ? '1px solid rgba(0,212,255,0.35)' : undefined,
                                color: autoConfigs[inst.id]?.auto_enabled ? 'var(--success)' : (autoConfigs[inst.id] ? 'var(--primary)' : undefined),
                              }}
                              onClick={() => openAutoModal(inst)}
                              title="Auto ON/OFF + shrink on stop"
                            >
                              {autoConfigs[inst.id] ? (autoConfigs[inst.id].auto_enabled ? 'AUTO ON' : 'AUTO ⏸') : 'Auto'}
                            </button>
                            <button className="btn-secondary btn-sm" style={{ marginRight: 4 }} onClick={() => handleRename(inst.id)}>Rename</button>
                            <button className="btn-secondary btn-sm" style={{ marginRight: 4 }} onClick={() => setCreateAmiFor(inst)}>AMI</button>
                            {inst.platform === 'Windows' && inst.state === 'running' && (
                              <>
                                <button className="btn-primary btn-sm" style={{ marginRight: 4 }} onClick={() => setPasswordInstance(inst)}>Password</button>
                                {inst.public_ip !== '—' && (
                                  <button className="btn-secondary btn-sm" onClick={() => downloadRdp(inst.public_ip, 'Administrator')}>RDP</button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'volumes' && (
            <>
              <div style={{
                display: 'flex', gap: 8, marginBottom: 16,
                padding: '14px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12,
                border: '1px solid var(--glass-border)',
              }}>
                <button className="btn-secondary btn-sm" onClick={loadData}>↻ Refresh</button>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Loader3D /></div>
              ) : volumes.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 40, marginBottom: 12 }}>💾</p>
                  No volumes found
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 20 }}>Volume ID</th>
                        <th>Size (GB)</th>
                        <th>Type</th>
                        <th>State</th>
                        <th style={{ paddingRight: 20 }}>Attached To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volumes.map((v) => (
                        <tr key={v.id}>
                          <td style={{ paddingLeft: 20, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{v.id}</td>
                          <td style={{ fontWeight: 700 }}>{v.size}</td>
                          <td>{v.type}</td>
                          <td><span className={`badge badge-${v.state === 'in-use' ? 'running' : 'stopped'}`}>{v.state}</span></td>
                          <td style={{ paddingRight: 20, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{v.instance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'amis' && (
            <>
              <div style={{
                display: 'flex', gap: 8, marginBottom: 16,
                padding: '14px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12,
                border: '1px solid var(--glass-border)', alignItems: 'center',
              }}>
                <button className="btn-secondary btn-sm" onClick={loadData}>↻ Refresh</button>
                <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 8 }}>
                  Your custom AMIs (created from your instances)
                </span>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Loader3D /></div>
              ) : amis.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 40, marginBottom: 12 }}>📸</p>
                  No AMIs found. Go to Instances and click "AMI" on an instance to make one.
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 20 }}>Name</th>
                        <th>AMI ID</th>
                        <th>State</th>
                        <th>Architecture</th>
                        <th>Created</th>
                        <th style={{ paddingRight: 20 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amis.map((a) => (
                        <tr key={a.id}>
                          <td style={{ paddingLeft: 20, fontWeight: 700 }}>
                            {a.name}
                            {a.shared && <span className="badge badge-pending" style={{ marginLeft: 8, fontSize: 10 }}>shared</span>}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{a.id}</td>
                          <td><span className={`badge badge-${a.state === 'available' ? 'running' : 'pending'}`}>{a.state}</span></td>
                          <td>{a.arch}</td>
                          <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.created?.slice(0, 10) || '—'}</td>
                          <td style={{ paddingRight: 20 }}>
                            <button className="btn-primary btn-sm" style={{ marginRight: 4 }} disabled={a.state !== 'available'} onClick={() => { setTab('launch'); setPresetAmi(a); }}>Launch</button>
                            {!a.shared && <button className="btn-secondary btn-sm" style={{ marginRight: 4 }} disabled={a.state !== 'available'} onClick={() => setShareAmiFor(a)}>Share</button>}
                            {!a.shared && <button className="btn-danger btn-sm" onClick={() => handleDeleteAmi(a.id, a.name)}>Delete</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'launch' && <LaunchForm creds={creds} onLaunch={() => { showToast('Instance launched'); loadData(); }} presetAmi={presetAmi} onPresetConsumed={() => setPresetAmi(null)} />}

          {tab === 'schedules' && (
            <SchedulesTab
              profileId={profile.id}
              instances={instances}
              showToast={showToast}
              onAction={async (action, ids) => {
                try {
                  await callAwsApi(action, { ...creds, instanceIds: ids });
                  loadData();
                } catch (e) {
                  showToast((e as Error).message);
                }
              }}
            />
          )}
        </div>
      </div>

      {sizeInstance && (
        <div className="modal-overlay" onClick={() => setSizeInstance(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2>Change Instance Size</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>{sizeInstance.name}</strong> ({sizeInstance.id})
            </p>
            {sizeInstance.state !== 'stopped' ? (
              <p style={{ color: 'var(--warning)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                ⚠ Size tabhi badalega jab instance <strong>stopped</strong> ho (current: {sizeInstance.state}). Pehle Stop dabao, phir yaha aao.
              </p>
            ) : (
              <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 20 }}>
                Current type: <strong>{sizeInstance.type}</strong> — stopped hai, change allowed
              </p>
            )}
            <div className="form-group">
              <label>New Instance Type</label>
              <select id="resize-type" defaultValue={['t2.micro', 't2.small', 't2.medium', 't3.micro', 't3.small', 't3.medium', 'm5.large', 'm5.xlarge', 'c5.large', 'c5.xlarge'].includes(sizeInstance.type) ? sizeInstance.type : 't2.micro'}>
                <optgroup label="Sabse sasta">
                  <option value="t2.micro">t2.micro (1 vCPU, 1GB)</option>
                  <option value="t2.small">t2.small (1 vCPU, 2GB)</option>
                  <option value="t2.medium">t2.medium (2 vCPU, 4GB)</option>
                  <option value="t3.micro">t3.micro (2 vCPU, 1GB)</option>
                  <option value="t3.small">t3.small (2 vCPU, 2GB)</option>
                  <option value="t3.medium">t3.medium (2 vCPU, 4GB)</option>
                </optgroup>
                <optgroup label="General (m5)">
                  <option value="m5.large">m5.large (2 vCPU, 8GB)</option>
                  <option value="m5.xlarge">m5.xlarge (4 vCPU, 16GB)</option>
                  <option value="m5.2xlarge">m5.2xlarge (8 vCPU, 32GB)</option>
                </optgroup>
                <optgroup label="Compute (c5)">
                  <option value="c5.large">c5.large (2 vCPU, 4GB)</option>
                  <option value="c5.xlarge">c5.xlarge (4 vCPU, 8GB)</option>
                  <option value="c5.2xlarge">c5.2xlarge (8 vCPU, 16GB)</option>
                </optgroup>
                <optgroup label="High-ram / z1d">
                  <option value="z1d.large">z1d.large (2 vCPU, 32GB)</option>
                  <option value="z1d.xlarge">z1d.xlarge (4 vCPU, 64GB)</option>
                </optgroup>
              </select>
              <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Ye manual button hai — AUTO ON ho ya OFF, hamesha chalta rahega.
              </small>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button className="btn-primary" onClick={handleResize} disabled={sizeBusy || sizeInstance.state !== 'stopped'}>
                {sizeBusy ? <span className="spinner" /> : 'Change Size'}
              </button>
              <button className="btn-secondary" onClick={() => setSizeInstance(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {autoEditing && (
        <div className="modal-overlay" onClick={() => setAutoEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2>AUTO On/Off</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              <strong style={{ color: 'var(--text)' }}>{autoEditing.name}</strong> ({autoEditing.id})
            </p>
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                <input type="checkbox" checked={autoAutoEnabled} onChange={(e) => setAutoAutoEnabled(e.target.checked)} style={{ width: 'auto' }} />
                AUTO ON karo (server-side timer)
              </label>
              <small style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginTop: 4 }}>
                Isse on kiya toh batao ON aur OFF time — itne baje apne aap chalu/band hoga, page band ho tab bhi.
              </small>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>ON time (IST)</label>
                <input type="time" value={autoOnTime} onChange={(e) => setAutoOnTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>OFF time (IST)</label>
                <input type="time" value={autoOffTime} onChange={(e) => setAutoOffTime(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={autoShrink}
                  onChange={(e) => setAutoShrink(e.target.checked)}
                  style={{ width: 'auto' }}
                  disabled={!autoAutoEnabled}
                />
                Stop hote hi sabse chhota size kar do
              </label>
              <small style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginTop: 4 }}>
                Instance stopped hote hi uske zone me jo sabse chhota size available hai wahi auto lag jayega (t2.micro nahi hai toh usse bada).
              </small>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button className="btn-primary" onClick={saveAutoConfig} disabled={autoBusy}>
                {autoBusy ? <span className="spinner" /> : 'Save'}
              </button>
              {autoConfigs[autoEditing.id] && (
                <button className="btn-danger" onClick={removeAutoConfig} disabled={autoBusy} title="Remove this auto config">
                  Remove
                </button>
              )}
              <button className="btn-secondary" onClick={() => setAutoEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {passwordInstance && (
        <PasswordModal instance={passwordInstance} creds={creds} onClose={() => setPasswordInstance(null)} />
      )}

      {createAmiFor && (
        <div className="modal-overlay" onClick={() => { setCreateAmiFor(null); setAmiName(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2>Create AMI</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Creating an AMI from instance <strong style={{ color: 'var(--text)' }}>{createAmiFor.name}</strong> ({createAmiFor.id})
            </p>
            <div className="form-group">
              <label>AMI Name</label>
              <input value={amiName} onChange={(e) => setAmiName(e.target.value)} placeholder="my-custom-ami" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button className="btn-primary" onClick={handleCreateAmi} disabled={!amiName.trim()}>Create AMI</button>
              <button className="btn-secondary" onClick={() => { setCreateAmiFor(null); setAmiName(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {shareAmiFor && (
        <ShareAmiModal
          ami={shareAmiFor}
          profiles={profiles}
          currentProfileId={profile.id}
          accountIds={accountIds}
          onResolveAccountId={loadAccountId}
          onShare={handleShareAmi}
          onClose={() => setShareAmiFor(null)}
          loading={shareLoading}
        />
      )}

      {toast && <div className="toast toast-success">{toast}</div>}
    </>
  );
}

function LaunchForm({ creds, onLaunch, presetAmi, onPresetConsumed }: { creds: Record<string, string>; onLaunch: () => void; presetAmi?: Ami | null; onPresetConsumed?: () => void }) {
  const [config, setConfig] = useState({
    name: '', os: 'amazon-linux', version: '2023', instanceType: 't2.micro',
    count: 1, keyPair: '', rootSize: 50, rootType: 'gp3', spot: false, amiId: '',
  });
  const [customInstanceType, setCustomInstanceType] = useState('');
  const [keyPairs, setKeyPairs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    callAwsApi('list-key-pairs', creds).then((d) => setKeyPairs(d.keyPairs || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (presetAmi) {
      setConfig((c) => ({ ...c, amiId: presetAmi.id, name: c.name || `from-${presetAmi.name}` }));
      onPresetConsumed?.();
    }
  }, [presetAmi]);

  async function createKeyPair() {
    if (!newKeyName.trim()) { setError('Enter a key pair name'); return; }
    setCreatingKey(true);
    setError('');
    try {
      const res = await callAwsApi('create-key-pair', { ...creds, keyName: newKeyName.trim() });
      if (res.keyMaterial) {
        const blob = new Blob([res.keyMaterial], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${newKeyName.trim()}.pem`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      setKeyPairs([...keyPairs, res.keyName]);
      setConfig({ ...config, keyPair: res.keyName });
      setNewKeyName('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleLaunch() {
    if (config.amiId === '__select__' || (config.amiId && !config.amiId.startsWith('ami-'))) {
      setError('Enter a valid AMI ID (starts with ami-)');
      return;
    }
    if (config.instanceType === 'custom' && !customInstanceType.trim()) {
      setError('Enter a custom instance type');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const effectiveType = config.instanceType === 'custom' ? customInstanceType.trim() : config.instanceType;
      const payload = { ...config, instanceType: effectiveType, amiId: config.amiId || undefined };
      await callAwsApi('launch-instance', { ...creds, config: payload });
      onLaunch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <h2 style={{
        marginBottom: 24, fontSize: 22,
        background: 'linear-gradient(135deg, var(--primary), var(--info))',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
      }}>
        Launch New Instance
      </h2>
      {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: 16 }}>{error}</div>}
      <div className="form-group">
        <label>Instance Name</label>
        <input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} placeholder="my-server" />
      </div>
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20,
        background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10,
        border: '1px solid var(--glass-border)',
      }}>
        <button
          onClick={() => setConfig({ ...config, amiId: '' })}
          style={{
            flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: !config.amiId ? 'rgba(0,212,255,0.12)' : 'transparent',
            color: !config.amiId ? 'var(--primary)' : 'var(--text-muted)',
            border: !config.amiId ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
          }}
        >Standard OS</button>
        <button
          onClick={() => setConfig({ ...config, amiId: '__select__' })}
          style={{
            flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: config.amiId ? 'rgba(0,212,255,0.12)' : 'transparent',
            color: config.amiId ? 'var(--primary)' : 'var(--text-muted)',
            border: config.amiId ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
          }}
        >My AMI</button>
      </div>
      {config.amiId ? (
        <div className="form-group">
          <label>AMI ID</label>
          <input value={config.amiId === '__select__' ? '' : config.amiId} onChange={(e) => setConfig({ ...config, amiId: e.target.value })} placeholder="ami-xxxxxxxxxxxxxxxxx" />
          <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Paste a custom AMI ID (e.g. one from your AMIs tab).</small>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>OS</label>
            <select value={config.os} onChange={(e) => setConfig({ ...config, os: e.target.value })}>
              <option value="amazon-linux">Amazon Linux</option>
              <option value="windows">Windows</option>
              <option value="ubuntu">Ubuntu</option>
            </select>
          </div>
          <div className="form-group">
            <label>Version</label>
            <select value={config.version} onChange={(e) => setConfig({ ...config, version: e.target.value })}>
              {config.os === 'windows' ? (
                <>
                  <option value="2025">Windows 2025</option>
                  <option value="2022">Windows 2022</option>
                  <option value="2019">Windows 2019</option>
                </>
              ) : config.os === 'amazon-linux' ? (
                <>
                  <option value="2023">AL 2023</option>
                  <option value="2">AL 2</option>
                </>
              ) : (
                <>
                  <option value="22.04">Ubuntu 22.04</option>
                  <option value="20.04">Ubuntu 20.04</option>
                </>
              )}
            </select>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label>Instance Type</label>
          <select value={config.instanceType} onChange={(e) => setConfig({ ...config, instanceType: e.target.value })}>
            <optgroup label="T series (general purpose)">
              <option value="t2.micro">t2.micro (1 vCPU, 1GB)</option>
              <option value="t2.small">t2.small (1 vCPU, 2GB)</option>
              <option value="t2.medium">t2.medium (2 vCPU, 4GB)</option>
              <option value="t3.micro">t3.micro (2 vCPU, 1GB)</option>
              <option value="t3.small">t3.small (2 vCPU, 2GB)</option>
              <option value="t3.medium">t3.medium (2 vCPU, 4GB)</option>
            </optgroup>
            <optgroup label="z1d (compute optimized)">
              <option value="z1d.large">z1d.large (2 vCPU, 32GB)</option>
              <option value="z1d.xlarge">z1d.xlarge (4 vCPU, 64GB)</option>
              <option value="z1d.2xlarge">z1d.2xlarge (8 vCPU, 128GB)</option>
              <option value="z1d.3xlarge">z1d.3xlarge (12 vCPU, 192GB)</option>
              <option value="z1d.6xlarge">z1d.6xlarge (24 vCPU, 384GB)</option>
              <option value="z1d.12xlarge">z1d.12xlarge (48 vCPU, 768GB)</option>
            </optgroup>
            <optgroup label="i3en (NVMe storage)">
              <option value="i3en.large">i3en.large (2 vCPU, 16GB, up to 2.5 TB NVMe)</option>
              <option value="i3en.xlarge">i3en.xlarge (4 vCPU, 32GB, up to 5 TB NVMe)</option>
              <option value="i3en.2xlarge">i3en.2xlarge (8 vCPU, 64GB, up to 10 TB NVMe)</option>
              <option value="i3en.3xlarge">i3en.3xlarge (12 vCPU, 96GB, up to 15 TB NVMe)</option>
              <option value="i3en.6xlarge">i3en.6xlarge (24 vCPU, 192GB, up to 30 TB NVMe)</option>
              <option value="i3en.12xlarge">i3en.12xlarge (48 vCPU, 384GB, up to 60 TB NVMe)</option>
              <option value="i3en.24xlarge">i3en.24xlarge (96 vCPU, 768GB, up to 120 TB NVMe)</option>
              <option value="i3en.metal">i3en.metal (96 vCPU, 768GB, up to 120 TB NVMe)</option>
            </optgroup>
            <option value="custom">Custom…</option>
          </select>
          {config.instanceType === 'custom' && (
            <input value={customInstanceType} onChange={(e) => setCustomInstanceType(e.target.value)} placeholder="e.g. c5.2xlarge, r5.xlarge, p3.2xlarge" style={{ marginTop: 8 }} autoFocus />
          )}
        </div>
        <div className="form-group">
          <label>Count</label>
          <input type="number" min={1} max={10} value={config.count} onChange={(e) => setConfig({ ...config, count: parseInt(e.target.value) || 1 })} />
        </div>
      </div>
      <div className="form-group">
        <label>Key Pair</label>
        <select value={config.keyPair} onChange={(e) => setConfig({ ...config, keyPair: e.target.value })}>
          <option value="">Select key pair</option>
          {keyPairs.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Create New Key Pair</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="my-key-pair" style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={createKeyPair} disabled={creatingKey} style={{ width: 'auto', whiteSpace: 'nowrap' }}>
            {creatingKey ? <span className="spinner" /> : 'Create & Download'}
          </button>
        </div>
        <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>PEM file will download automatically. Save it securely.</small>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label>Root Volume Size (GB)</label>
          <input type="number" min={8} value={config.rootSize} onChange={(e) => setConfig({ ...config, rootSize: parseInt(e.target.value) || 50 })} />
        </div>
        <div className="form-group">
          <label>Volume Type</label>
          <select value={config.rootType} onChange={(e) => setConfig({ ...config, rootType: e.target.value })}>
            <option value="gp3">gp3</option>
            <option value="gp2">gp2</option>
            <option value="io1">io1</option>
            <option value="st1">st1</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
          <input type="checkbox" checked={config.spot} onChange={(e) => setConfig({ ...config, spot: e.target.checked })} style={{ width: 'auto' }} />
          Use Spot Instance
        </label>
      </div>
      <button className="btn-primary" onClick={handleLaunch} disabled={loading} style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {loading ? <span className="spinner" /> : '🚀 Launch Instance'}
      </button>
    </div>
  );
}

function ShareAmiModal({ ami, profiles, currentProfileId, accountIds, onResolveAccountId, onShare, onClose, loading }: {
  ami: Ami; profiles: AwsProfile[]; currentProfileId: string; accountIds: Record<string, string>;
  onResolveAccountId: (p: AwsProfile) => Promise<string>; onShare: (targetAccountId: string) => void;
  onClose: () => void; loading: boolean;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [manualAccountId, setManualAccountId] = useState('');
  const [mode, setMode] = useState<'pick' | 'manual'>(
    profiles.filter((p) => p.id !== currentProfileId).length > 0 ? 'pick' : 'manual'
  );
  const [resolving, setResolving] = useState<string | null>(null);

  const otherProfiles = profiles.filter((p) => p.id !== currentProfileId);

  const handleSelect = async (id: string) => {
    setSelectedProfileId(id);
    const p = otherProfiles.find((pr) => pr.id === id);
    if (!p) return;
    if (!accountIds[id]) { setResolving(id); await onResolveAccountId(p); setResolving(null); }
  };

  const targetAccountId = mode === 'manual' ? manualAccountId : (selectedProfileId ? accountIds[selectedProfileId] || '' : '');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2>Share AMI</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          Share <strong style={{ color: 'var(--text)' }}>{ami.name}</strong> ({ami.id}) with another AWS account.
        </p>
        {otherProfiles.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
            <button className={mode === 'pick' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, fontSize: 13 }} onClick={() => setMode('pick')}>From my accounts</button>
            <button className={mode === 'manual' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, fontSize: 13 }} onClick={() => setMode('manual')}>Enter account ID</button>
          </div>
        )}
        {mode === 'pick' && otherProfiles.length > 0 ? (
          <div className="form-group">
            <label>Select AWS account</label>
            <select value={selectedProfileId} onChange={(e) => handleSelect(e.target.value)}>
              <option value="">Choose an account…</option>
              {otherProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.profile_name} ({p.region}){accountIds[p.id] ? ` — ${accountIds[p.id]}` : ''}</option>
              ))}
            </select>
            {resolving && <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Resolving account ID…</p>}
            {selectedProfileId && accountIds[selectedProfileId] && (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>AWS account ID: <strong style={{ color: 'var(--text)' }}>{accountIds[selectedProfileId]}</strong></p>
            )}
          </div>
        ) : (
          <div className="form-group">
            <label>AWS Account ID (12 digits)</label>
            <input value={manualAccountId} onChange={(e) => setManualAccountId(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="123456789012" autoFocus />
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Find it in AWS Console → top-right menu → Account ID.</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className="btn-primary" onClick={() => onShare(targetAccountId)} disabled={loading || !targetAccountId || targetAccountId.length !== 12}>
            {loading ? <span className="spinner" /> : 'Share AMI'}
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
