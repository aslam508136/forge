import { useState } from 'react';
import { Plus, Link2, Unlink, Trash2, RefreshCw, HardDrive, X } from 'lucide-react';
import { Button } from './Button';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { EmptyState } from './Loading';

export interface Volume { id: string; size: number; type: string; state: string; instance: string; }

interface Props {
  volumes: Volume[];
  onRefresh: () => void;
  onCreate: (size: number, type: string, az: string) => Promise<void>;
  onAttach: (volumeId: string, instanceId: string, device: string) => Promise<void>;
  onDetach: (volumeId: string) => Promise<void>;
  onDelete: (volumeId: string) => Promise<void>;
}

export function StorageTab({ volumes, onRefresh, onCreate, onAttach, onDetach, onDelete }: Props) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ size: 100, type: 'gp3', az: 'ap-south-1a' });
  const [attachTarget, setAttachTarget] = useState<string | null>(null);
  const [attachForm, setAttachForm] = useState({ instanceId: '', device: '/dev/xvdf' });
  const [selectedVol, setSelectedVol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputClass = `px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`;

  const handleCreate = async () => { setLoading(true); await onCreate(createForm.size, createForm.type, createForm.az); setLoading(false); setShowCreate(false); setCreateForm({ size: 100, type: 'gp3', az: 'ap-south-1a' }); };
  const handleAttach = async () => { if (!attachForm.instanceId.trim()) { showToast('Enter instance ID', 'warning'); return; } setLoading(true); await onAttach(attachTarget!, attachForm.instanceId.trim(), attachForm.device); setLoading(false); setAttachTarget(null); setAttachForm({ instanceId: '', device: '/dev/xvdf' }); };
  const handleDetach = async () => { if (!selectedVol) { showToast('Select a volume', 'warning'); return; } if (!confirm('Detach volume?')) return; setLoading(true); await onDetach(selectedVol); setLoading(false); };
  const handleDelete = async () => { if (!selectedVol) { showToast('Select a volume', 'warning'); return; } if (!confirm('Delete volume?')) return; setLoading(true); await onDelete(selectedVol); setLoading(false); };

  const stateColors: Record<string, string> = { available: 'bg-emerald-100 text-emerald-700 border-emerald-200', 'in-use': 'bg-blue-100 text-blue-700 border-blue-200', creating: 'bg-amber-100 text-amber-700 border-amber-200', deleted: 'bg-gray-200 text-gray-600 border-gray-300' };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 rounded-xl border p-3" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
        <HardDrive size={18} style={{ color: theme.text }} /><h2 className="text-sm font-bold" style={{ color: theme.text }}>EBS Volumes</h2><div className="flex-1" />
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Create</Button>
        <Button size="sm" variant="success" icon={<Link2 size={14} />} onClick={() => { if (!selectedVol) { showToast('Select a volume first', 'warning'); return; } setAttachTarget(selectedVol); }} disabled={loading}>Attach</Button>
        <Button size="sm" variant="warning" icon={<Unlink size={14} />} onClick={handleDetach} disabled={loading}>Detach</Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={handleDelete} disabled={loading}>Delete</Button>
        <Button size="sm" variant="gray" icon={<RefreshCw size={14} />} onClick={onRefresh}>Refresh</Button>
      </div>

      <div className="flex-1 rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
        <div className="overflow-auto flex-1">
          {volumes.length === 0 ? (
            <EmptyState icon={<HardDrive size={48} />} title="No EBS volumes" subtitle="Create a new volume to get started." />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: theme.frame }}>
                <tr>{['Volume ID', 'Size', 'Type', 'State', 'Instance'].map((h) => <th key={h} className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: theme.text }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {volumes.map((v, idx) => (
                  <tr key={v.id} onClick={() => setSelectedVol(v.id)} className={`cursor-pointer transition-colors ${selectedVol === v.id ? 'ring-1 ring-blue-400' : ''}`} style={{ backgroundColor: idx % 2 === 0 ? theme.rowEven : theme.rowOdd }}>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: theme.text }}>{v.id}</td>
                    <td className="px-4 py-2.5" style={{ color: theme.text }}>{v.size} GiB</td>
                    <td className="px-4 py-2.5" style={{ color: theme.text }}>{v.type}</td>
                    <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${stateColors[v.state] || stateColors['available']}`}>{v.state}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: theme.textMuted }}>{v.instance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h3 className="text-lg font-bold text-gray-800">Create New Volume</h3><button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
            <div className="p-6 space-y-4">
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Size (GB)</label><input type="number" min={1} max={16000} value={createForm.size} onChange={(e) => setCreateForm({ ...createForm, size: Number(e.target.value) })} className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Volume Type</label><select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })} className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">{['gp2', 'gp3', 'io1'].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Availability Zone</label><select value={createForm.az} onChange={(e) => setCreateForm({ ...createForm, az: e.target.value })} className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">{['ap-south-1a', 'ap-south-1b', 'ap-south-1c'].map((az) => <option key={az} value={az}>{az}</option>)}</select></div>
              <Button variant="success" onClick={handleCreate} disabled={loading} className="w-full">{loading ? 'Creating...' : 'Create Volume'}</Button>
            </div>
          </div>
        </div>
      )}

      {attachTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h3 className="text-lg font-bold text-gray-800">Attach Volume</h3><button onClick={() => setAttachTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
            <div className="p-6 space-y-4">
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Volume ID</label><input value={attachTarget} disabled className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm bg-gray-50 font-mono" /></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Instance ID</label><input value={attachForm.instanceId} onChange={(e) => setAttachForm({ ...attachForm, instanceId: e.target.value })} placeholder="i-xxxx" className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" /></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Device Name</label><input value={attachForm.device} onChange={(e) => setAttachForm({ ...attachForm, device: e.target.value })} className={`w-full ${inputClass} border-gray-300`} /></div>
              <Button variant="success" onClick={handleAttach} disabled={loading} className="w-full">{loading ? 'Attaching...' : 'Attach Volume'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
