import { useEffect, useState } from 'react';
import { ec2, getAutoConfigs, saveAutoConfig, removeAutoConfig, type Instance, type AutoConfig } from '../../lib/api';

const TYPES = ['t2.micro', 't3.micro', 't2.small', 't3.small', 't2.medium', 't3.medium', 't3a.medium', 'm5.large', 't3.large', 'c5.large', 'm5.xlarge', 't3.xlarge', 't4g.micro', 't4g.small', 't4g.medium', 'm6g.large'];

interface Props {
  profileId: number;
  instances: Instance[];
  loading: boolean;
  onRefresh: () => void;
  runAction: (action: string, ids: string[], label: string) => Promise<boolean | undefined>;
  showToast: (m: string) => void;
}

export default function InstancesTab({ profileId, instances, loading, onRefresh, runAction, showToast }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [autoConfigs, setAutoConfigs] = useState<Record<string, AutoConfig>>({});
  const [sizeI, setSizeI] = useState<Instance | null>(null);
  const [autoI, setAutoI] = useState<Instance | null>(null);

  useEffect(() => {
    getAutoConfigs(profileId).then((list) => {
      const map: Record<string, AutoConfig> = {};
      for (const c of list) map[c.instance_id] = c;
      setAutoConfigs(map);
    }).catch(() => {});
  }, [profileId]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = instances.length > 0 && instances.every((i) => selected.has(i.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(instances.map((i) => i.id)));

  async function act(action: string, label: string, ids?: string[]) {
    const target = ids || [...selected];
    setBusy(true);
    const ok = await runAction(action, target, label);
    setBusy(false);
    if (ok) setSelected(new Set());
  }

  const enabledCount = Object.values(autoConfigs).filter((c) => c.auto_enabled).length;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-success" disabled={!selected.size || busy} onClick={() => act('start-instances', 'Start')}>▶ Start</button>
        <button className="btn btn-danger" disabled={!selected.size || busy} onClick={() => act('stop-instances', 'Stop')}>⏹ Stop</button>
        <button className="btn" disabled={!selected.size || busy} onClick={() => act('reboot-instances', 'Reboot')}>⟳ Reboot</button>
        <button className="btn btn-danger" disabled={!selected.size || busy} onClick={() => { if (confirm(`Terminate ${selected.size} instance(s)? Ye undo nahi hoga.`)) act('terminate-instances', 'Terminate'); }}>🗑 Terminate</button>
        <span style={{ marginLeft: 'auto' }} className="badge-pill">{selected.size} selected</span>
        {enabledCount > 0 && <span className="badge-pill" style={{ background: 'rgba(52,211,153,0.16)', color: 'var(--success)', borderColor: 'rgba(52,211,153,0.4)' }}>{enabledCount} AUTO on</span>}
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>⟳ Refresh</button>
      </div>

      {loading && !instances.length ? <div className="empty"><span className="loader" /></div>
        : instances.length === 0 ? <div className="card empty"><span className="icon">🖥</span>Is region me koi instance nahi.</div>
        : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th>Name</th><th>Instance ID</th><th>State</th><th>Type</th><th>Public IP</th><th>AZ</th><th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((i) => {
                  const ac = autoConfigs[i.id];
                  const autoOn = ac?.auto_enabled;
                  return (
                    <tr key={i.id}>
                      <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /></td>
                      <td style={{ fontWeight: 700 }}>{i.name || <span style={{ color: 'var(--text-muted)' }}>{i.platform}</span>}</td>
                      <td className="mono">{i.id}</td>
                      <td><span className={`badge badge-${i.state === 'running' ? 'running' : i.state === 'stopped' ? 'stopped' : 'pending'}`}>{i.state}</span></td>
                      <td className="mono">{i.type}</td>
                      <td className="mono">{i.public_ip || '—'}</td>
                      <td className="mono">{i.az}</td>
                      <td style={{ textAlign: 'right', paddingRight: 20, whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => setSizeI(i)}>Size</button>
                        <button className={`btn btn-sm`} style={{ marginLeft: 6, ...(autoOn ? { color: 'var(--success)', borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.12)' } : {}) }} onClick={() => setAutoI(i)}>{autoOn ? 'AUTO ●' : 'Auto'}</button>
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={async () => {
                          const name = prompt('Naya name:', i.name);
                          if (name === null) return;
                          setBusy(true);
                          try { const r = await ec2(profileId, 'rename-instance', { instanceId: i.id, name }); showToast(r.message || 'Rename ho gaya'); onRefresh(); }
                          catch (e) { showToast((e as Error).message); }
                          setBusy(false);
                        }}>Rename</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {sizeI && <SizeModal instance={sizeI} profileId={profileId} onClose={() => setSizeI(null)} showToast={showToast} onDone={() => { setSizeI(null); onRefresh(); }} />}
      {autoI && <AutoModal profileId={profileId} instance={autoI} existing={autoConfigs[autoI.id]} onClose={() => setAutoI(null)} showToast={showToast} onSaved={(cfg) => {
        setAutoConfigs((m) => { const n = { ...m }; if (cfg) n[autoI.id] = cfg; else delete n[autoI.id]; return n; });
        setAutoI(null);
      }} />}
    </div>
  );
}

function SizeModal({ instance, profileId, onClose, showToast, onDone }: { instance: Instance; profileId: number; onClose: () => void; showToast: (m: string) => void; onDone: () => void }) {
  const [type, setType] = useState(instance.type);
  const [busy, setBusy] = useState(false);
  const stopped = instance.state === 'stopped';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Change Instance Size</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}><span className="mono">{instance.id}</span> · current <strong>{instance.type}</strong></p>
        {!stopped && <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(251,191,36,0.4)', color: 'var(--warning)', fontSize: 12.5 }}>⚠ Size badalne ke liye instance STOP hona chahiye. Pehle stop karo.</div>}
        <div className="form-group">
          <label>Naya Instance Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {[...new Set([instance.type, ...TYPES])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={busy || !stopped || type === instance.type} onClick={async () => {
            setBusy(true);
            try { const r = await ec2(profileId, 'modify-instance-type', { instanceId: instance.id, type }); showToast(r.message); onDone(); }
            catch (e) { showToast((e as Error).message); }
            setBusy(false);
          }}>{busy ? <span className="loader" /> : 'Apply'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AutoModal({ profileId, instance, existing, onClose, showToast, onSaved }: {
  profileId: number; instance: Instance; existing?: AutoConfig;
  onClose: () => void; showToast: (m: string) => void;
  onSaved: (cfg: AutoConfig | null) => void;
}) {
  const [enabled, setEnabled] = useState(!!existing?.auto_enabled);
  const [onTime, setOnTime] = useState(existing?.on_time?.slice(0, 5) || '09:00');
  const [offTime, setOffTime] = useState(existing?.off_time?.slice(0, 5) || '21:00');
  const [shrink, setShrink] = useState(!!existing?.shrink_enabled);
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Auto ON / OFF</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}><span className="mono">{instance.id}</span> · server-side chalta hai (site band ho tab bhi)</p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontWeight: 700 }}>AUTO {enabled ? 'ON' : 'OFF'}</span>
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}><label>ON time (IST)</label><input type="time" value={onTime} onChange={(e) => setOnTime(e.target.value)} style={{ width: '100%' }} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>OFF time (IST)</label><input type="time" value={offTime} onChange={(e) => setOffTime(e.target.value)} style={{ width: '100%' }} /></div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer' }}>
          <input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} />
          <span style={{ fontSize: 13 }}>OFF hone ke baad <strong>sabse chhota size</strong> kar do (cost bachao)</span>
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await saveAutoConfig(profileId, instance.id, { auto_enabled: enabled, on_time: onTime, off_time: offTime, shrink_enabled: shrink });
              showToast(enabled ? `AUTO ON ${onTime}–${offTime}` : 'AUTO config save');
              onSaved({ id: existing?.id || 0, profile_id: profileId, instance_id: instance.id, auto_enabled: enabled, on_time: onTime + ':00', off_time: offTime + ':00', shrink_enabled: shrink });
            } catch (e) { showToast((e as Error).message); }
            setBusy(false);
          }}>{busy ? <span className="loader" /> : 'Save'}</button>
          {existing && <button className="btn btn-danger" onClick={async () => {
            setBusy(true);
            try { await removeAutoConfig(profileId, instance.id); showToast('Auto config hata diya'); onSaved(null); }
            catch (e) { showToast((e as Error).message); }
            setBusy(false);
          }}>Remove</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}