import { useState, useEffect } from 'react';
import { Cloud, KeyRound, Trash2, Plus, LogIn, Eye, EyeOff, Globe, X } from 'lucide-react';
import { supabase, AwsProfile } from '../lib/supabase';
import { Button } from './Button';
import { useToast } from '../context/ToastContext';

const regions = ['ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1', 'ap-southeast-1'];

export function CredentialsDialog({ onConnect, onClose }: { onConnect: (p: AwsProfile) => void; onClose: () => void }) {
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState({ profile_name: '', access_key: '', secret_key: '', region: 'ap-south-1' });
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('aws_profiles').select('*').order('created_at', { ascending: false });
    if (error) showToast('Failed to load profiles', 'error');
    else setProfiles(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.profile_name.trim() || !form.access_key.trim() || !form.secret_key.trim()) {
      showToast('Profile Name, Access Key, and Secret Key are required', 'error'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('aws_profiles').insert({
      profile_name: form.profile_name.trim(), access_key: form.access_key.trim(),
      secret_key: form.secret_key.trim(), region: form.region, updated: new Date().toISOString(),
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); setSaving(false); return; }
    showToast(`Profile '${form.profile_name}' saved`, 'success');
    setForm({ profile_name: '', access_key: '', secret_key: '', region: 'ap-south-1' });
    setShowForm(false); setSaving(false); await load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete profile '${name}'?`)) return;
    const { error } = await supabase.from('aws_profiles').delete().eq('id', id);
    if (error) showToast('Failed to delete', 'error');
    else { showToast(`Profile '${name}' deleted`, 'info'); await load(); }
  };

  const handleConnectClick = (p: AwsProfile) => {
    setConnecting(p.id);
    onConnect(p);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-slate-900 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center"><KeyRound size={20} className="text-white" /></div>
          <div><h2 className="text-xl font-bold text-white">AWS Credentials</h2><p className="text-xs text-slate-400">Real AWS API access | No CLI required</p></div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white"><X size={22} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading profiles...</div>
          ) : profiles.length > 0 ? (
            <>
              <h3 className="text-sm font-bold text-gray-700 mb-3">Saved Profiles</h3>
              <div className="space-y-2 mb-6">
                {profiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0"><Cloud size={16} className="text-blue-600" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-800 truncate">{p.profile_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1"><Globe size={11} /> {p.region}</div>
                    </div>
                    <Button size="sm" variant="success" icon={<LogIn size={14} />} onClick={() => handleConnectClick(p)} disabled={connecting === p.id}>
                      {connecting === p.id ? 'Connecting...' : 'Connect'}
                    </Button>
                    <button onClick={() => handleDelete(p.id, p.profile_name)} className="p-2 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {showForm ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-700">Add New Profile</h3>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Profile Name</label><input value={form.profile_name} onChange={(e) => setForm({ ...form, profile_name: e.target.value })} placeholder="default" className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">AWS Access Key ID</label><input value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} placeholder="AKIA..." className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" /></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">AWS Secret Access Key</label><div className="relative"><input type={showSecret ? 'text' : 'password'} value={form.secret_key} onChange={(e) => setForm({ ...form, secret_key: e.target.value })} placeholder="••••••••••••••••" className="w-full px-3 py-2 pr-10 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" /><button onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Region</label><select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              <div className="flex gap-2 pt-1"><Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Save & Connect'}</Button><Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div>
            </div>
          ) : (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowForm(true)} className="w-full">Add New Profile</Button>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100"><Button variant="gray" onClick={onClose} className="w-full">Exit</Button></div>
      </div>
    </div>
  );
}
