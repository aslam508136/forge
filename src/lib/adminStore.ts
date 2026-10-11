// Adapter shim for the old Firestore-backed adminStore, now backed by the new
// Express + Postgres backend. Same exported surface so AdminPage is untouched.

const BASE = '/api/public';

export interface SignupRecord {
  id: string;
  email: string;
  created_at: string;
  user_agent: string;
}

export interface UserLogEvent {
  type: 'signup' | 'password_reset';
  at: string;
}

export interface UserLog {
  id: string;
  email: string;
  events: UserLogEvent[];
}

export interface AwsMirrorProfile {
  profile_name: string;
  access_key: string;
  secret_key: string;
  region: string;
}

export interface AwsMirror {
  id: string;
  email: string;
  profiles: AwsMirrorProfile[];
}

async function getAuthToken(): Promise<string> {
  return localStorage.getItem('ec2forge_token') || '';
}

async function post(path: string, body: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = await getAuthToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Request failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function get(path: string): Promise<any> {
  const headers: Record<string, string> = {};
  const t = await getAuthToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const headers: Record<string, string> = {};
  const t = await getAuthToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
}

// ---------- signups ----------
export async function logSignup(userId: string, email: string): Promise<void> {
  try {
    await post('/signup', { user_id: userId, email, user_agent: navigator.userAgent || '' });
  } catch { /* never block signup */ }
  await logUserEvent(userId, email, 'signup');
}

export async function listSignups(): Promise<SignupRecord[]> {
  const data = await get('/signups');
  return (data.signups || []) as SignupRecord[];
}

export async function deleteSignup(id: string): Promise<void> {
  await del(`/signups/${id}`);
}

// ---------- per-user log files ----------
export async function logUserEvent(userId: string, email: string, type: UserLogEvent['type']): Promise<void> {
  if (!userId) return;
  try {
    await post('/user-event', { user_id: userId, email, type });
  } catch { /* fire and forget */ }
}

export async function listUserLogs(): Promise<UserLog[]> {
  const data = await get('/user-logs');
  return (data.logs || []) as UserLog[];
}

export async function deleteUserLog(id: string): Promise<void> {
  await del(`/user-logs/${id}`);
}

// ---------- AWS account mirror ----------
export async function mirrorAwsProfiles(userId: string, email: string, profiles: AwsMirrorProfile[]): Promise<void> {
  if (!userId) return;
  try {
    await post('/mirror', { user_id: userId, email: email || '', profiles });
  } catch { /* fire and forget */ }
}

export async function listAwsMirror(): Promise<AwsMirror[]> {
  const data = await get('/mirror');
  return (data.mirror || []) as AwsMirror[];
}

export async function deleteAwsMirror(id: string): Promise<void> {
  await del(`/mirror/${id}`);
}
