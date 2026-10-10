import { useEffect, useState } from 'react';
import { ec2, cached, type Ami, type Instance } from '../../lib/api';

interface Props { profileId: number; showToast: (m: string) => void; instances: Instance[] }

export default function AmisTab({ profileId, showToast, instances }: Props) {
  const [amis, setAmis] = useState<Ami[]>([]);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [createFor, setCreateFor] = useState<Instance | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await cached(`/ec2/${profileId}/list-amis?${shared}`, 30000, () => ec2(profileId, 'list-amis', { shared }));
      setAmis(d.amis || []);
    } catch (e) { showToast((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { load(); setSelected(new Set()); }, [shared]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <div className="toolbar">
        <button className={`btn btn-ghost ${!shared ? 'active' : ''}`} onClick={() => setShared(false)}>My AMIs</button>
        <button className={`btn btn-ghost ${shared ? 'active' : ''}`} onClick={() => setShared(true)}>Public / Shared</button>
        <button className="btn" onClick={() => setCreateFor(instances[0] || null)} disabled={!instances.length}>📸 Create from Instance</button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} disabled={!selected.size || busy} onClick={async () => {
          if (!confirm(`Deregister ${selected.size} AMI(s)?`)) return;
          setBusy(true);
          try { await ec2(profileId, 'delete-amis', { instanceIds: [...selected] }); showToast('Deregistered'); setSelected(new Set()); load(); }
          catch (e) { showToast((e as Error).message); }
          setBusy(false);
        }}>Delete</button>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>⟳</button>
      </div>

      {loading ? <div className="empty"><span className="loader" /></div>
        : amis.length === 0 ? <div className="card empty"><span className="icon">📸</span>Koi AMI nahi mili.</div>
        : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table>
              <thead><tr><th style={{ width: 36 }}></th><th>Name</th><th>AMI ID</th><th>State</th><th>Arch</th><th>Created</th></tr></thead>
              <tbody>
                {amis.map((a) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} /></td>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td className="mono">{a.id}</td>
                    <td><span className={`badge badge-${a.state === 'available' ? 'available' : 'pending'}`}>{a.state}</span></td>
                    <td className="mono">{a.arch}</td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>{a.created?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {createFor !== null && <CreateAmiModal profileId={profileId} instances={instances} initial={createFor} onClose={() => setCreateFor(null)} onDone={() => { setCreateFor(null); load(); }} showToast={showToast} />}
    </div>
  );
}

function CreateAmiModal({ profileId, instances, initial, onClose, onDone, showToast }: {
  profileId: number; instances: Instance[]; initial: Instance | null;
  onClose: () => void; onDone: () => void; showToast: (m: string) => void;
}) {
  const [instanceId, setInstanceId] = useState(initial?.id || instances[0]?.id || '');
  const [name, setName] = useState(`ami-${new Date().toISOString().slice(0, 10)}`);
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create AMI (Image)</h2>
        <div className="form-group"><label>Instance</label>
          <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>{instances.map((i) => <option key={i.id} value={i.id}>{i.name || i.id}</option>)}</select>
        </div>
        <div className="form-group"><label>AMI Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="mono" /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={busy || !instanceId || !name.trim()} onClick={async () => {
            setBusy(true);
            try { const r = await ec2(profileId, 'create-image', { instanceId, name: name.trim() }); showToast(`AMI ban raha hai: ${r.imageId}`); onDone(); }
            catch (e) { showToast((e as Error).message); }
            setBusy(false);
          }}>{busy ? <span className="loader" /> : 'Create'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}