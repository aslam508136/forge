import { useEffect, useState } from 'react';
import { ec2, type Volume, type Instance } from '../../lib/api';

interface Props { profileId: number; showToast: (m: string) => void; instances: Instance[] }

const V_TYPES = ['gp3', 'gp2', 'io1', 'io2', 'st1', 'sc1', 'standard'];

export default function VolumesTab({ profileId, showToast, instances }: Props) {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [attachV, setAttachV] = useState<Volume | null>(null);

  async function load() {
    setLoading(true);
    try { const d = await ec2(profileId, 'list-volumes'); setVolumes(d.volumes || []); }
    catch (e) { showToast((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Create Volume</button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} disabled={!selected.size || busy} onClick={async () => {
          if (!confirm(`Delete ${selected.size} volume(s)? Data chala jayega.`)) return;
          setBusy(true);
          try { await ec2(profileId, 'delete-volumes', { instanceIds: [...selected] }); showToast('Deleted'); setSelected(new Set()); load(); }
          catch (e) { showToast((e as Error).message); }
          setBusy(false);
        }}>Delete</button>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>⟳</button>
      </div>

      {loading ? <div className="empty"><span className="loader" /></div>
        : volumes.length === 0 ? <div className="card empty"><span className="icon">💾</span>Koi EBS volume nahi.</div>
        : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table>
              <thead><tr><th style={{ width: 36 }}></th><th>Volume ID</th><th>Size</th><th>Type</th><th>State</th><th>Attached to</th><th>AZ</th><th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th></tr></thead>
              <tbody>
                {volumes.map((v) => (
                  <tr key={v.id}>
                    <td><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} /></td>
                    <td className="mono">{v.id}</td>
                    <td>{v.size} GB</td>
                    <td className="mono">{v.type}</td>
                    <td><span className={`badge badge-${v.state === 'in-use' ? 'running' : v.state === 'available' ? 'available' : 'pending'}`}>{v.state}</span></td>
                    <td className="mono">{v.instance || '—'}</td>
                    <td className="mono">{v.az}</td>
                    <td style={{ textAlign: 'right', paddingRight: 20, whiteSpace: 'nowrap' }}>
                      {v.instance
                        ? <button className="btn btn-sm" onClick={async () => { setBusy(true); try { await ec2(profileId, 'detach-volume', { volumeId: v.id }); showToast('Detached'); load(); } catch (e) { showToast((e as Error).message); } setBusy(false); }}>Detach</button>
                        : <button className="btn btn-sm" onClick={() => setAttachV(v)}>Attach</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {createOpen && <CreateVolumeModal profileId={profileId} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); load(); }} showToast={showToast} />}
      {attachV && <AttachModal profileId={profileId} volume={attachV} instances={instances} onClose={() => setAttachV(null)} onDone={() => { setAttachV(null); load(); }} showToast={showToast} />}
    </div>
  );
}

function CreateVolumeModal({ profileId, onClose, onDone, showToast }: { profileId: number; onClose: () => void; onDone: () => void; showToast: (m: string) => void }) {
  const [size, setSize] = useState('10');
  const [type, setType] = useState('gp3');
  const [az, setAz] = useState('ap-south-1a');
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create EBS Volume</h2>
        <div className="form-group"><label>Size (GB)</label><input type="number" min={1} value={size} onChange={(e) => setSize(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="form-group"><label>Type</label><select value={type} onChange={(e) => setType(e.target.value)}>{V_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="form-group"><label>Availability Zone</label><input value={az} onChange={(e) => setAz(e.target.value)} className="mono" /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await ec2(profileId, 'create-volume', { size, type, az }); showToast(`Volume banaya: ${r.volumeId}`); onDone(); }
            catch (e) { showToast((e as Error).message); }
            setBusy(false);
          }}>{busy ? <span className="loader" /> : 'Create'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AttachModal({ profileId, volume, instances, onClose, onDone, showToast }: {
  profileId: number; volume: Volume; instances: Instance[];
  onClose: () => void; onDone: () => void; showToast: (m: string) => void;
}) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id || '');
  const [device, setDevice] = useState('/dev/sdf');
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Attach {volume.id}</h2>
        <div className="form-group"><label>Instance</label><select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>{instances.map((i) => <option key={i.id} value={i.id}>{i.name || i.id}</option>)}</select></div>
        <div className="form-group"><label>Device</label><input value={device} onChange={(e) => setDevice(e.target.value)} className="mono" /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={busy || !instanceId} onClick={async () => {
            setBusy(true);
            try { await ec2(profileId, 'attach-volume', { volumeId: volume.id, instanceId, device }); showToast('Attached'); onDone(); }
            catch (e) { showToast((e as Error).message); }
            setBusy(false);
          }}>{busy ? <span className="loader" /> : 'Attach'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}