const TOKEN_KEY = 'ec2forge_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

const BASE = '/api';

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty */ }

  if (res.status === 401) {
    setToken('');
    throw new Error(data.error || 'Login again');
  }
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---- auth ----
export const login = (email, password) => request('/auth/login', { method: 'POST', body: { email, password } });
export const register = (email, password) => request('/auth/register', { method: 'POST', body: { email, password } });

// ---- profiles ----
export const getProfiles = () => request('/profiles');
export const createProfile = (p) => request('/profiles', { method: 'POST', body: p });
export const updateProfile = (id, p) => request(`/profiles/${id}`, { method: 'PUT', body: p });
export const deleteProfile = (id) => request(`/profiles/${id}`, { method: 'DELETE' });

// ---- ec2 ----
export const ec2 = (profileId, action, body = {}) => request(`/ec2/${profileId}/${action}`, { method: 'POST', body });

// ---- schedules ----
export const getSchedules = (profileId) => request(`/schedules/${profileId}`);
export const createSchedule = (profileId, s) => request(`/schedules/${profileId}`, { method: 'POST', body: s });
export const updateSchedule = (id, s) => request(`/schedules/${id}`, { method: 'PUT', body: s });
export const deleteSchedule = (id) => request(`/schedules/${id}`, { method: 'DELETE' });

// ---- auto config ----
export const getAutoConfigs = (profileId) => request(`/auto-configs/${profileId}`);
export const saveAutoConfig = (profileId, instanceId, c) => request(`/auto-configs/${profileId}/${instanceId}`, { method: 'POST', body: c });
export const removeAutoConfig = (profileId, instanceId) => request(`/auto-configs/${profileId}/${instanceId}`, { method: 'DELETE' });

// ---- tiny in-memory cache (fast repeat loads) ----
const cache = new Map();
export async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}
export function invalidate(prefix) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

export interface AwsProfile {
  id: number;
  profile_name: string;
  region: string;
}

export interface Instance {
  id: string; name: string; state: string; type: string;
  public_ip: string; private_ip: string; platform: string; az: string;
}

export interface Ami { id: string; name: string; state: string; created: string; arch: string }
export interface Volume { id: string; size: number; type: string; state: string; az: string; instance: string; device: string; encrypted: boolean }
export interface Schedule {
  id: number; profile_id: number; name: string; action: 'start' | 'stop';
  time: string; instance_ids: string[]; enabled: boolean | number;
}
export interface AutoConfig {
  id: number; profile_id: number; instance_id: string;
  auto_enabled: boolean | number; on_time: string | null; off_time: string | null; shrink_enabled: boolean | number;
}