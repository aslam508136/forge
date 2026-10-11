import { useState, useMemo } from 'react';
import { Search, RefreshCw, Save, Copy, Square, Play, RotateCw, KeyRound, Monitor, FileKey, Pencil, Trash2, Server, Cpu, Globe, Hash } from 'lucide-react';
import { Button } from './Button';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { EmptyState } from './Loading';
import { awsApi } from '../lib/supabase';

export interface Instance {
  id: string; name: string; state: string; type: string;
  public_ip: string; private_ip: string; platform: string; az: string;
}

interface Props {
  instances: Instance[];
  onRefresh: () => void;
  creds: { accessKey: string; secretKey: string; region: string };
  onAction: (action: string, ids: string[]) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
}

const stateColors: Record<string, string> = {
  running: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  stopped: 'bg-rose-100 text-rose-700 border-rose-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  'shutting-down': 'bg-orange-100 text-orange-700 border-orange-200',
  terminated: 'bg-gray-200 text-gray-600 border-gray-300',
  stopping: 'bg-amber-100 text-amber-700 border-amber-200',
};

export function InstancesTab({ instances, onRefresh, creds, onAction, onRename }: Props) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [selected, setSelected] = useState<Instance | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [keyLoaded, setKeyLoaded] = useState<string | null>(null);
  const [keyContent, setKeyContent] = useState<string>('');
  const [password, setPassword] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const filtered = useMemo(() => instances.filter((i) => {
    if (stateFilter !== 'All' && i.state.toLowerCase() !== stateFilter.toLowerCase()) return false;
    if (search) { const s = search.toLowerCase(); if (!`${i.name} ${i.id} ${i.public_ip} ${i.private_ip}`.toLowerCase().includes(s)) return false; }
    return true;
  }), [instances, search, stateFilter]);

  const stats = useMemo(() => ({
    total: instances.length,
    running: instances.filter((i) => i.state === 'running').length,
    stopped: instances.filter((i) => i.state === 'stopped').length,
  }), [instances]);

  const copyAllIps = () => {
    const ips = instances.filter((i) => i.state === 'running').map((i) => i.public_ip !== '—' ? i.public_ip : i.private_ip).filter((ip) => ip !== '—');
    if (!ips.length) { showToast('No running instances', 'warning'); return; }
    navigator.clipboard.writeText(ips.join('\n'));
    showToast(`${ips.length} IPs copied`, 'success');
  };

  const saveIps = () => {
    const ips = instances.filter((i) => i.state === 'running').map((i) => i.public_ip !== '—' ? i.public_ip : i.private_ip).filter((ip) => ip !== '—');
    if (!ips.length) { showToast('No running instances', 'warning'); return; }
    const blob = new Blob([ips.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'running_ec2_ips.txt'; a.click();
    showToast(`${ips.length} IPs saved`, 'success');
  };

  const doRename = async () => {
    if (!selected || !renameVal.trim()) { showToast('Select instance and enter name', 'warning'); return; }
    await onRename(selected.id, renameVal.trim());
    setRenameVal('');
  };

  const loadPem = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.pem';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) { const reader = new FileReader(); reader.onload = () => { setKeyContent(reader.result as string); setKeyLoaded(file.name); showToast(`Loaded: ${file.name}`, 'success'); }; reader.readAsText(file); }
    };
    input.click();
  };

  const decryptPassword = async () => {
    if (!selected || selected.platform !== 'Windows') { showToast('Only for Windows instances', 'warning'); return; }
    if (!keyContent) { showToast('Load a PEM file first', 'warning'); return; }
    setDecrypting(true);
    try {
      const result = await awsApi.getPasswordData(creds.accessKey, creds.secretKey, creds.region, selected.id, keyContent);
      if (result.password) { setPassword(result.password); showToast('Password decrypted', 'success'); }
      else showToast(result.error || 'Password not available yet', 'warning');
    } catch (e) { showToast((e as Error).message, 'error'); }
    setDecrypting(false);
  };

  const launchRdp = () => {
    if (!selected || selected.platform !== 'Windows') { showToast('RDP is for Windows only', 'warning'); return; }
    if (selected.state !== 'running') { showToast('Instance must be running', 'warning'); return; }
    showToast(`RDP: ${selected.public_ip} | Username: Administrator`, 'info');
  };

  const doAction = async (action: string, ids: string[]) => {
    if (!ids.length) { showToast('Select an instance', 'warning'); return; }
    setActionLoading(true);
    await onAction(action, ids);
    setActionLoading(false);
  };

  const handleRowClick = (inst: Instance) => { setSelected(inst); setRenameVal(inst.name === '—' ? '' : inst.name); };

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[{ l: 'Total', v: stats.total, c: 'text-gray-700' }, { l: 'Running', v: stats.running, c: 'text-emerald-600' }, { l: 'Stopped', v: stats.stopped, c: 'text-rose-600' }].map((s) => (
          <div key={s.l} className="rounded-xl border p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
            <div className="text-xs font-medium" style={{ color: theme.textMuted }}>{s.l}</div><div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap rounded-xl border p-3" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
        <div className="flex items-center gap-2"><Search size={16} style={{ color: theme.textMuted }} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="px-2 py-1.5 rounded-md border text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} /></div>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="px-2 py-1.5 rounded-md border text-sm focus:outline-none" style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}>{['All', 'Running', 'Stopped', 'Pending'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <div className="flex-1" />
        <Button size="sm" variant="gray" icon={<RefreshCw size={14} />} onClick={onRefresh}>Refresh</Button>
        <Button size="sm" variant="primary" icon={<Save size={14} />} onClick={saveIps}>Save IPs</Button>
        <Button size="sm" variant="success" icon={<Copy size={14} />} onClick={copyAllIps}>Copy IPs</Button>
        <Button size="sm" variant="warning" icon={<Square size={14} />} onClick={() => { const ids = instances.filter(i => i.state === 'running').map(i => i.id); if (ids.length && confirm(`Stop all ${ids.length} running?`)) doAction('stop', ids); }} disabled={actionLoading}>Stop All</Button>
        <Button size="sm" variant="success" icon={<Play size={14} />} onClick={() => { const ids = instances.filter(i => i.state === 'stopped').map(i => i.id); if (ids.length && confirm(`Start all ${ids.length} stopped?`)) doAction('start', ids); }} disabled={actionLoading}>Start All</Button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
          <div className="overflow-auto flex-1">
            {filtered.length === 0 ? (
              <EmptyState icon={<Server size={48} />} title="No instances found" subtitle="Launch a new instance or adjust filters." />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10" style={{ backgroundColor: theme.frame }}>
                  <tr>{['Name', 'Instance ID', 'State', 'Type', 'Public IP', 'Private IP', 'Platform', 'AZ'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: theme.text }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filtered.map((inst, idx) => (
                    <tr key={inst.id} onClick={() => handleRowClick(inst)} className={`cursor-pointer transition-colors ${selected?.id === inst.id ? 'ring-1 ring-blue-400' : ''}`} style={{ backgroundColor: idx % 2 === 0 ? theme.rowEven : theme.rowOdd }}>
                      <td className="px-3 py-2.5 font-medium" style={{ color: theme.text }}>{inst.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: theme.textMuted }}>{inst.id}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${stateColors[inst.state] || stateColors['terminated']}`}>{inst.state.toUpperCase()}</span></td>
                      <td className="px-3 py-2.5" style={{ color: theme.text }}>{inst.type}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: theme.text }}>{inst.public_ip}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: theme.textMuted }}>{inst.private_ip}</td>
                      <td className="px-3 py-2.5 text-center" style={{ color: theme.text }}>{inst.platform}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: theme.textMuted }}>{inst.az}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="w-80 shrink-0 rounded-xl border overflow-y-auto" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
          <div className="p-4 space-y-5">
            <div><h4 className="text-sm font-bold mb-3" style={{ color: theme.accent }}>Instance Details</h4>
              {selected ? (
                <div className="space-y-1.5 text-sm">
                  {[{ l: 'Name:', v: selected.name, i: <Server size={12} /> }, { l: 'ID:', v: selected.id, i: <Hash size={12} /> }, { l: 'State:', v: selected.state.toUpperCase(), i: <Cpu size={12} /> }, { l: 'Type:', v: selected.type, i: <Cpu size={12} /> }, { l: 'IP:', v: selected.public_ip !== '—' ? selected.public_ip : selected.private_ip, i: <Globe size={12} /> }, { l: 'Platform:', v: selected.platform, i: <Monitor size={12} /> }].map((f) => (
                    <div key={f.l} className="flex items-start gap-2"><span className="font-semibold text-xs w-16 shrink-0 flex items-center gap-1" style={{ color: theme.textMuted }}>{f.i}{f.l}</span><span className="font-mono text-xs break-all" style={{ color: theme.text }}>{f.v}</span></div>
                  ))}
                </div>
              ) : <p className="text-xs" style={{ color: theme.textMuted }}>Select an instance.</p>}
            </div>

            <div><h4 className="text-sm font-bold mb-2" style={{ color: theme.accent }}>Power Management</h4>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="success" icon={<Play size={14} />} onClick={() => selected && doAction('start', [selected.id])} disabled={actionLoading}>Start</Button>
                <Button size="sm" variant="warning" icon={<Square size={14} />} onClick={() => selected && doAction('stop', [selected.id])} disabled={actionLoading}>Stop</Button>
                <Button size="sm" variant="primary" icon={<RotateCw size={14} />} onClick={() => selected && doAction('reboot', [selected.id])} disabled={actionLoading}>Reboot</Button>
              </div>
            </div>

            <div><h4 className="text-sm font-bold mb-2" style={{ color: theme.accent }}>Windows Tools</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="primary" icon={<KeyRound size={14} />} onClick={decryptPassword} disabled={decrypting}>{decrypting ? 'Decrypting...' : 'Get Password'}</Button>
                <Button size="sm" variant="success" icon={<Monitor size={14} />} onClick={launchRdp}>RDP Connect</Button>
              </div>
              {password && <div className="mt-2 p-2 rounded-md border font-mono text-xs break-all" style={{ backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.accent }}>{password}</div>}
            </div>

            <div><h4 className="text-sm font-bold mb-2" style={{ color: theme.accent }}>Key Management</h4>
              <div className="flex items-center gap-2"><Button size="sm" variant="gray" icon={<FileKey size={14} />} onClick={loadPem}>Load PEM</Button><span className="text-xs" style={{ color: theme.textMuted }}>{keyLoaded || 'No key loaded'}</span></div>
            </div>

            <div><h4 className="text-sm font-bold mb-2" style={{ color: theme.accent }}>Rename Instance</h4>
              <div className="flex gap-2"><input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} placeholder="New name" className="flex-1 px-2 py-1.5 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} /><Button size="sm" variant="primary" icon={<Pencil size={14} />} onClick={doRename}>Rename</Button></div>
            </div>

            <div className="rounded-lg bg-rose-600 p-3">
              <h4 className="text-sm font-bold text-white mb-1">DANGER ZONE</h4>
              <p className="text-xs text-rose-100 mb-3">Terminating permanently deletes all data.</p>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => selected && confirm(`Terminate ${selected.id}? CANNOT be undone!`) && doAction('terminate', [selected.id])} className="w-full !text-rose-600 !border-rose-200 !bg-white hover:!bg-rose-50" disabled={actionLoading}>TERMINATE INSTANCE</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
