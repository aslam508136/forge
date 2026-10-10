import { useEffect, useState } from 'react';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, type Schedule, type Instance } from '../../lib/api';

interface Props { profileId: number; instances: Instance[]; showToast: (m: string) => void }

export default function SchedulesTab({ profileId, instances, showToast }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', action: 'start' as 'start' | 'stop', time: '09:00', ids: new Set<string>() });

  async function load() {
    setLoading(true);
    try { setSchedules(await getSchedules(profileId)); }
    catch (e) { showToast((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [profileId]);

  async function add() {
    if (!form.name.trim()) { showToast('Schedule ka naam do'); return; }
    if (!form.ids.size) { showToast('Kam se kam ek instance select karo'); return; }
    setBusy(true);
    try {
      await createSchedule(profileId, { name: form.name.trim(), action: form.action, time: form.time, instance_ids: [...form.ids] });
      showToast('Schedule add ho gaya');
      setForm({ name: '', action: 'start', time: '09:00', ids: new Set() });
      load();
    } catch (e) { showToast((e as Error).message); }
    setBusy(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 800 }}>Naya Schedule (IST time)</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Morning start" /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Action</label>
            <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as 'start' | 'stop' })}><option value="start">Start</option><option value="stop">Stop</option></select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Time</label><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy} onClick={add}>{busy ? <span className="loader" /> : '+ Add'}</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Instances ({form.ids.size} selected)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, maxHeight: 140, overflow: 'auto' }}>
            {instances.map((i) => (
              <button key={i.id} className={`btn btn-sm ${form.ids.has(i.id) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setForm((f) => { const s = new Set(f.ids); s.has(i.id) ? s.delete(i.id) : s.add(i.id); return { ...f, ids: s }; })}>
                {i.name || i.id}
              </button>
            ))}
            {!instances.length && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Instances tab khol ke pehle load karo.</span>}
          </div>
        </div>
      </div>

      <div className="toolbar"><span className="badge-pill">{schedules.length} schedule(s)</span><button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>⟳ Refresh</button></div>

      {loading ? <div className="empty"><span className="loader" /></div>
        : schedules.length === 0 ? <div className="card empty"><span className="icon">⏰</span>Koi schedule nahi. Upar se banao.</div>
        : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table>
              <thead><tr><th>Name</th><th>Action</th><th>Time</th><th>Instances</th><th>Enabled</th><th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th></tr></thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td><span className={`badge ${s.action === 'start' ? 'badge-running' : 'badge-stopped'}`}>{s.action}</span></td>
                    <td className="mono">{s.time.slice(0, 5)}</td>
                    <td><span className="mono" style={{ color: 'var(--text-muted)' }}>{s.instance_ids.length} instance(s)</span></td>
                    <td>
                      <input type="checkbox" checked={!!s.enabled} onChange={async () => {
                        try { await updateSchedule(s.id, { enabled: !s.enabled }); load(); } catch (e) { showToast((e as Error).message); }
                      }} />
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 20 }}>
                      <button className="btn btn-danger btn-sm" onClick={async () => {
                        if (!confirm(`Delete schedule '${s.name}'?`)) return;
                        try { await deleteSchedule(s.id); load(); } catch (e) { showToast((e as Error).message); }
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}