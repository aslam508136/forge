import { useState, useEffect } from 'react';
import { Plus, Trash2, LogIn, KeyRound, Globe, Clock } from 'lucide-react';
import { supabase, AwsProfile } from '../lib/supabase';
import { Button } from './Button';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

const regions = ['ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1', 'ap-southeast-1'];

export function CredentialsTab({ onConnect, currentProfileId }: { onConnect: (p: AwsProfile) => void; currentProfileId?: string }) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ profile_name: '', access_key: '', secret_key: '', region: 'ap-south-1' });

  const load = async () => { setLoading(true); const { data } = await supabase.from('aws_profiles').select('*').order('created_at', { ascending: false }); setProfiles(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.profile_name.trim() || !form.access_key.trim() || !form.secret_key.trim()) { showToast('All fields required', 'error'); return; }
    const { error } = await supabase.from('aws_profiles').insert({ profile_name: form.profile_name.trim(), access_key: form.access_key.trim(), secret_key: form.secret_key.trim(), region: form.region, updated: new Date().toISOString() });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast(`Profile '${form.profile_name}' saved`, 'success'); setForm({ profile_name: '', access_key: '', secret_key: '', region: 'ap-south-1' }); await load();
  };

  const handleDelete = async (id: string, name: string) => { if (!confirm(`Delete '${name}'?`)) return; const { error } = await supabase.from('aws_profiles').delete().eq('id', id); if (error) { showToast('Failed', 'error'); return; } showToast(`'${name}' deleted`, 'info'); await load(); };

  const inputClass = `px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`;
  const inputStyle = { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text };

  return (
    <div className="h-full overflow-y-auto">
      <h2 className="text-xl font-bold mb-6" style={{ color: theme.accent }}>AWS Credentials Management</h2>
      <div className="mb-8">
        <h3 className="text-sm font-bold mb-3" style={{ color: theme.text }}>Saved Profiles</h3>
        {loading ? <p className="text-sm" style={{ color: theme.textMuted }}>Loading...</p> :
         profiles.length === 0 ? <p className="text-sm py-8 text-center" style={{ color: theme.textMuted }}>No profiles saved yet</p> :
         <div className="space-y-2">
           {profiles.map((p) => (
             <div key={p.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
               <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: currentProfileId === p.id ? '#10b98120' : '#3b82f620' }}><KeyRound size={16} style={{ color: currentProfileId === p.id ? '#10b981' : theme.accent }} /></div>
               <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: theme.text }}>{p.profile_name}{currentProfileId === p.id && <span className="ml-2 text-xs text-emerald-500">● Connected</span>}</div><div className="text-xs flex items-center gap-3" style={{ color: theme.textMuted }}><span className="flex items-center gap-1"><Globe size={11} /> {p.region}</span><span className="flex items-center gap-1"><Clock size={11} /> {p.updated?.slice(0, 10) || 'N/A'}</span></div></div>
               <Button size="sm" variant="success" icon={<LogIn size={14} />} onClick={() => onConnect(p)}>Connect</Button>
               <button onClick={() => handleDelete(p.id, p.profile_name)} className="p-2 rounded-md transition-colors" style={{ color: theme.textMuted }}><Trash2 size={16} /></button>
             </div>
           ))}
         </div>}
      </div>
      <div className="rounded-xl border p-5" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: theme.accent }}>Add New Profile</h3>
        <div className="space-y-3">
          {[{ k: 'profile_name', l: 'Profile Name', p: 'production' }, { k: 'access_key', l: 'Access Key ID', p: 'AKIA...' }, { k: 'secret_key', l: 'Secret Key', p: '••••••••', t: 'password' }].map((f) => (
            <div key={f.k}><label className="text-xs font-medium block mb-1" style={{ color: theme.textMuted }}>{f.l}</label><input type={f.t || 'text'} value={(form as Record<string, string>)[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.p} className={`${inputClass} w-full font-mono`} style={inputStyle} /></div>
          ))}
          <div><label className="text-xs font-medium block mb-1" style={{ color: theme.textMuted }}>Region</label><select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={inputClass} style={inputStyle}>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
          <Button variant="primary" icon={<Plus size={16} />} onClick={handleSave} className="w-full">Save Profile</Button>
        </div>
      </div>
    </div>
  );
}
