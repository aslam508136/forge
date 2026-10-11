import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Play, Square, Zap, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { useTheme } from '../context/ThemeContext';
import {
  fetchSchedules, addSchedule, updateSchedule, deleteSchedule,
  type InstanceSchedule,
} from '../lib/supabase';
import type { Instance } from './InstancesTab';

interface Props {
  profileId: string;
  instances: Instance[];
  onAction: (action: string, ids: string[]) => Promise<void>;
  showToast: (msg: string) => void;
}

const TIME_RE = /^\d{1,2}:\d{2}$/;

export function SchedulesTab({ profileId, instances, onAction, showToast }: Props) {
  const { theme } = useTheme();
  const [schedules, setSchedules] = useState<InstanceSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [action, setAction] = useState<'start' | 'stop'>('start');
  const [time, setTime] = useState('09:00');
  const [target, setTarget] = useState<'all' | 'list'>('all');
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchSchedules(profileId);
      setSchedules(data);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [profileId]);

  const add = async () => {
    const t = time.trim();
    if (!TIME_RE.test(t)) { showToast('Set a valid time (HH:MM)', 'warning'); return; }
    const ids = target === 'all' ? instances.map((i) => i.id) : instanceIds;
    if (!ids.length) { showToast('No instances selected', 'warning'); return; }
    try {
      await addSchedule(profileId, {
        name: name.trim() || `${action === 'start' ? 'Start' : 'Stop'} @ ${t}`,
        action,
        time: `${t.length === 4 ? '0' + t : t}:00`,
        instance_ids: ids,
      });
      setName(''); setInstanceIds([]);
      showToast(`Schedule added — server-side timer active`, 'success');
      await load();
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const toggle = async (s: InstanceSchedule) => {
    try {
      await updateSchedule(s.id, { enabled: !s.enabled });
      await load();
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteSchedule(id);
      await load();
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const fireNow = async (s: InstanceSchedule) => {
    setRunning(true);
    try {
      await onAction(s.action, s.instance_ids);
      showToast(`Schedule "${s.name}" fired (${s.action})`, 'success');
    } catch (e) {
      showToast((e as Error).message);
    }
    setRunning(false);
  };

  const nameOf = (id: string) => instances.find((i) => i.id === id)?.name || id;

  const allIds = instances.map((i) => i.id);
  const isAll = (s: InstanceSchedule) => s.instance_ids.length === allIds.length && allIds.length > 0;

  return (
    <div className="card" style={{ maxWidth: 720, padding: 24 }}>
      <h4 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: theme.accent }}>
        <Clock size={18} /> Auto On/Off Scheduler
      </h4>
      <p className="text-xs mb-5" style={{ color: theme.textMuted }}>
        Instances apne aap ON/OFF honge — {loading ? '' : 'server-side timer (page band ho tab bhi chalta hai)'}
        {' '}<RefreshCw size={11} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onClick={load} />
      </p>

      <div className="rounded-xl border p-4 mb-5" style={{ borderColor: theme.cardBorder, backgroundColor: theme.inputBg }}>
        <div className="grid gap-3 mb-3">
          <div className="form-group">
            <label>Schedule Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office hours" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="form-group">
              <label>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value as 'start' | 'stop')}>
                <option value="start">START</option>
                <option value="stop">STOP</option>
              </select>
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ color: theme.text }} />
            </div>
            <div className="form-group">
              <label>Target</label>
              <select value={target} onChange={(e) => setTarget(e.target.value as 'all' | 'list')}>
                <option value="all">All instances</option>
                <option value="list">Selected instances</option>
              </select>
            </div>
          </div>
          {target === 'list' && (
            <div className="form-group">
              <label>Select instances</label>
              <select multiple value={instanceIds} onChange={(e) => setInstanceIds(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ minHeight: 100 }}>
                {instances.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.type}) — {i.public_ip}</option>)}
              </select>
            </div>
          )}
        </div>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={add}>Add Schedule</Button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: theme.textMuted }}>Loading schedules...</p>
      ) : schedules.length === 0 ? (
        <p className="text-sm" style={{ color: theme.textMuted }}>No schedules yet. Add one above.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: theme.cardBorder, backgroundColor: theme.cardBg }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.text }}>
                  {s.name}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.action === 'start' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-rose-600 border-rose-200 bg-rose-50'}`}>
                    {s.action === 'start' ? <Play size={11} /> : <Square size={11} />} {s.action.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono" style={{ color: theme.accent }}>⏰ {s.time.slice(0, 5)} IST</span>
                </div>
                <div className="text-xs mt-1 truncate" style={{ color: theme.textMuted }}>
                  {isAll(s) ? `${s.instance_ids.length} instances (all)` : s.instance_ids.slice(0, 3).map(nameOf).join(', ') + (s.instance_ids.length > 3 ? ` +${s.instance_ids.length - 3}` : '')}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs" style={{ color: theme.textMuted, cursor: 'pointer' }}>
                <input type="checkbox" checked={s.enabled} onChange={() => toggle(s)} style={{ width: 'auto' }} />
                Active
              </label>
              <Button size="sm" variant="warning" icon={<Zap size={13} />} onClick={() => fireNow(s)} disabled={running}>Run Now</Button>
              <Button size="sm" variant="gray" icon={<Trash2 size={13} />} onClick={() => remove(s.id)}>Remove</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}