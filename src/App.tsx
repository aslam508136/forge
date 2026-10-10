import { useEffect, useState } from 'react';
import { getToken, setToken, type AwsProfile } from './lib/api';
import Login from './components/Login';
import Accounts from './components/Accounts';
import Dashboard from './components/Dashboard';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [profile, setProfile] = useState<AwsProfile | null>(null);

  useEffect(() => {
    function onLogout() { setAuthed(false); setProfile(null); }
    window.addEventListener('ec2forge:logout', onLogout);
    return () => window.removeEventListener('ec2forge:logout', onLogout);
  }, []);

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  if (!profile) return <Accounts onOpenProfile={setProfile} onLogout={() => { setToken(''); setAuthed(false); }} />;
  return <Dashboard profile={profile} onBack={() => setProfile(null)} onLogout={() => { setToken(''); setAuthed(false); }} />;
}