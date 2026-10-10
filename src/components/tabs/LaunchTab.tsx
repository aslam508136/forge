import { useEffect, useState } from 'react';
import { ec2, type Instance } from '../../lib/api';

const TYPES = ['t2.micro', 't3.micro', 't2.small', 't3.small', 't2.medium', 't3.medium', 'm5.large', 't3.large', 'c5.large', 'm5.xlarge', 'm5.2xlarge', 't4g.micro', 't4g.small', 't4g.medium', 'm6g.large'];
const REGION_AMIS: Record<string, string> = {
  'us-east-1': 'ami-0c7217cdde317cfec', 'ap-south-1': 'ami-0f58b397bc5c1f2e8',
  'us-west-2': 'ami-008fe2fc65df48dac', 'eu-west-1': 'ami-0d71ea30463e0ff8d',
  'ap-southeast-1': 'ami-0dca7db2bbd9e2f1b', 'ap-northeast-1': 'ami-0d52744d6551d851e',
};

interface Props { profileId: number; showToast: (m: string) => void; onLaunched: () => void }

export default function LaunchTab({ profileId, showToast, onLaunched }: Props) {
  const [keys, setKeys] = useState<string[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [subnets, setSubnets] = useState<{ id: string; az: string }[]>([]);
  const [ami, setAmi] = useState('ami-0f58b397bc5c1f2e8');
  const [name, setName] = useState('');
  const [type, setType] = useState('t3.micro');
  const [count, setCount] = useState(1);
  const [keyName, setKeyName] = useState('');
  const [sg, setSg] = useState('');
  const [subnet, setSubnet] = useState('');
  const [volumeSize, setVolumeSize] = useState('');
  const [userData, setUserData] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    setLoadingMeta(true);
    Promise.allSettled([
      ec2(profileId, 'list-key-pairs'),
      ec2(profileId, 'list-security-groups'),
      ec2(profileId, 'list-subnets'),
    ]).then(([k, g, s]) => {
      if (k.status === 'fulfilled') setKeys(k.value.keys || []);
      if (g.status === 'fulfilled') setGroups(g.value.groups || []);
      if (s.status === 'fulfilled') setSubnets(s.value.subnets || []);
      setLoadingMeta(false);
    });
  }, [profileId]);

  async function launch() {
    if (!ami.trim()) { showToast('AMI ID do'); return; }
    setBusy(true);
    try {
      const r = await ec2(profileId, 'launch-instance', {
        ami: ami.trim(), type, count, name: name.trim() || undefined,
        keyName: keyName || undefined, securityGroupIds: sg ? [sg] : undefined,
        subnetId: subnet || undefined, volumeSize: volumeSize || undefined,
        userData: userData || undefined,
      });
      showToast(`Launched: ${(r.ids || []).join(', ')}`);
      onLaunched();
    } catch (e) { showToast((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="form-group"><label>Instance Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" /></div>
      <div className="form-group">
        <label>AMI ID</label>
        <input value={ami} onChange={(e) => setAmi(e.target.value)} className="mono" placeholder="ami-xxxxx" />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {Object.entries(REGION_AMIS).map(([r, a]) => (
            <button key={r} className="btn btn-ghost btn-sm" onClick={() => setAmi(a)}>{r}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Instance Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="form-group" style={{ width: 120 }}>
          <label>Count</label>
          <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
      </div>
      <div className="form-group"><label>Key Pair {loadingMeta && <span style={{ color: 'var(--text-muted)' }}>(loading…)</span>}</label>
        <select value={keyName} onChange={(e) => setKeyName(e.target.value)}><option value="">— none —</option>{keys.map((k) => <option key={k}>{k}</option>)}</select>
      </div>
      <div className="form-group"><label>Security Group</label>
        <select value={sg} onChange={(e) => setSg(e.target.value)}><option value="">— default —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.id})</option>)}</select>
      </div>
      <div className="form-group"><label>Subnet (optional)</label>
        <select value={subnet} onChange={(e) => setSubnet(e.target.value)}><option value="">— default —</option>{subnets.map((s) => <option key={s.id} value={s.id}>{s.az} · {s.id}</option>)}</select>
      </div>
      <div className="form-group"><label>Root Volume Size (GB, optional)</label><input value={volumeSize} onChange={(e) => setVolumeSize(e.target.value)} placeholder="20" /></div>
      <div className="form-group"><label>User Data / Startup Script (optional)</label><textarea rows={4} value={userData} onChange={(e) => setUserData(e.target.value)} placeholder="#!/bin/bash" className="mono" /></div>
      <button className="btn btn-primary" disabled={busy} onClick={launch} style={{ marginTop: 8 }}>{busy ? <span className="loader" /> : '🚀 Launch Instance'}</button>
    </div>
  );
}