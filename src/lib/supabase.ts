// Adapter shim: exposes the exact old `lib/supabase.ts` surface, but backed by
// the new Express + Postgres backend under /api. The old UI stays untouched.

export type Session = { access_token: string; user: { id: string; email: string } };

const TOKEN_KEY = 'ec2forge_token';
const EMAIL_KEY = 'ec2forge_email';
const UID_KEY = 'ec2forge_uid';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setAuth(token: string, email: string, id: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email || '');
  localStorage.setItem(UID_KEY, id || '');
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(UID_KEY);
}

function decodeJwt(token: string): { uid?: string | number } {
  try {
    const part = token.split('.')[1];
    const json = decodeURIComponent(
      atob(part.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function currentUser(): { id: string; email: string } | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwt(token);
  const id = String(localStorage.getItem(UID_KEY) || payload.uid || '');
  if (!id) return null;
  return { id, email: localStorage.getItem(EMAIL_KEY) || '' };
}

function currentSession(): Session | null {
  const u = currentUser();
  return u ? { access_token: getToken(), user: u } : null;
}

type AuthListener = (event: string, session: Session | null) => void;
let listeners: AuthListener[] = [];

async function api<T = any>(path: string, { method = 'GET', body, auth = true }: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401) { clearAuth(); throw new Error(data.error || 'Login again'); }
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

type ErrObj = { message: string } | null;

// ---- profiles ----
export interface AwsProfile {
  id: string;
  profile_name: string;
  access_key: string;
  secret_key: string;
  region: string;
}

export async function fetchProfiles(): Promise<AwsProfile[]> {
  const rows = await api<any[]>('/profiles');
  return (rows || []).map((r) => ({
    id: String(r.id),
    profile_name: r.profile_name || '',
    access_key: r.access_key || '',
    secret_key: r.secret_key || '',
    region: r.region || 'ap-south-1',
  }));
}

export async function saveProfile(profile: Omit<AwsProfile, 'id'>): Promise<void> {
  await api('/profiles', { method: 'POST', body: profile });
}

export async function updateProfile(id: string, profile: Omit<AwsProfile, 'id'>): Promise<void> {
  await api(`/profiles/${id}`, { method: 'PUT', body: profile });
}

export async function deleteProfile(id: string): Promise<void> {
  await api(`/profiles/${id}`, { method: 'DELETE' });
}

// ---- finance records (kept for API-compat) ----
export interface FinanceRecord {
  id: string;
  type: 'profit' | 'expense' | 'loss';
  amount: number;
  note: string;
  date: string;
  created_at: string;
}

export async function fetchFinanceRecords(): Promise<FinanceRecord[]> {
  const d = await api<any>('/user-blob/finance-record');
  return (d?.data?.records || []) as FinanceRecord[];
}

export async function saveFinanceRecord(record: Omit<FinanceRecord, 'id' | 'created_at'>): Promise<void> {
  const cur = await fetchFinanceRecords();
  cur.push({ ...record, id: String(Date.now()), created_at: new Date().toISOString() });
  await api('/user-blob/finance-record', { method: 'PUT', body: { data: { records: cur } } });
}

export async function deleteFinanceRecord(id: string): Promise<void> {
  const cur = (await fetchFinanceRecords()).filter((r) => r.id !== id);
  await api('/user-blob/finance-record', { method: 'PUT', body: { data: { records: cur } } });
}

// ---- schedules ----
export interface InstanceSchedule {
  id: string;
  name: string;
  action: 'start' | 'stop';
  time: string;
  instance_ids: string[];
  enabled: boolean;
  last_fired: string | null;
}

export async function fetchSchedules(profileId: string): Promise<InstanceSchedule[]> {
  const rows = await api<any[]>(`/schedules/${profileId}`);
  return (rows || []).map((r) => ({
    ...r,
    id: String(r.id),
    enabled: r.enabled === 0 ? false : Boolean(r.enabled),
    instance_ids: Array.isArray(r.instance_ids) ? r.instance_ids : [],
  }));
}

export async function addSchedule(
  profileId: string,
  input: { name: string; action: 'start' | 'stop'; time: string; instance_ids: string[] }
): Promise<InstanceSchedule> {
  const d = await api<any>(`/schedules/${profileId}`, { method: 'POST', body: input });
  return d;
}

export async function updateSchedule(
  id: string,
  patch: Partial<Pick<InstanceSchedule, 'name' | 'action' | 'time' | 'instance_ids' | 'enabled'>>
): Promise<void> {
  await api(`/schedules/${id}`, { method: 'PUT', body: patch });
}

export async function deleteSchedule(id: string): Promise<void> {
  await api(`/schedules/${id}`, { method: 'DELETE' });
}

// ---- auto config ----
export interface InstanceAutoConfig {
  id: string;
  profile_id: string;
  instance_id: string;
  auto_enabled: boolean;
  on_time: string | null;
  off_time: string | null;
  shrink_enabled: boolean;
  last_on_fired: string | null;
  last_off_fired: string | null;
}

export async function fetchAutoConfigs(profileId: string): Promise<InstanceAutoConfig[]> {
  const rows = await api<any[]>(`/auto-configs/${profileId}`);
  return rows || [];
}

export async function upsertAutoConfig(
  profileId: string,
  instanceId: string,
  input: { auto_enabled: boolean; on_time?: string | null; off_time?: string | null; shrink_enabled?: boolean }
): Promise<void> {
  await api(`/auto-configs/${profileId}/${instanceId}`, { method: 'POST', body: input });
}

export async function deleteAutoConfig(profileId: string, instanceId: string): Promise<void> {
  await api(`/auto-configs/${profileId}/${instanceId}`, { method: 'DELETE' });
}

// ---- AWS proxy (raw creds, like the old Supabase edge function) ----
export async function callAwsApi(action: string, payload: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;

  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    response = await fetch(`/api/ec2-raw/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(`Cannot reach server. Check your internet connection. (${(e as Error).message})`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Request failed (${response.status})`);
  }
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export const awsApi = callAwsApi;

// ---- minimal supabase-compatible client (auth + rpc + from) ----
function makeQuery(table: string) {
  const state: { op: string | null; order: { col: string; asc: boolean } | null; eq: Record<string, unknown>; values: any } = {
    op: null,
    order: null,
    eq: {},
    values: null,
  };

  async function exec(): Promise<{ data: any; error: ErrObj }> {
    try {
      if (table === 'aws_profiles') {
        if (state.op === 'select') {
          let rows = await fetchProfiles();
          if (state.order) {
            const col = state.order.col as keyof AwsProfile;
            rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (state.order!.asc ? 1 : -1));
          }
          return { data: rows, error: null };
        }
        if (state.op === 'insert') {
          const v = Array.isArray(state.values) ? state.values[0] : state.values;
          await saveProfile(v);
          return { data: null, error: null };
        }
        if (state.op === 'delete') {
          await deleteProfile(String(state.eq.id));
          return { data: null, error: null };
        }
      }
      return { data: [], error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  const q: any = {
    select: () => { state.op = 'select'; return q; },
    insert: (vals: any) => { state.op = 'insert'; state.values = Array.isArray(vals) ? vals : [vals]; return q; },
    update: (vals: any) => { state.op = 'update'; state.values = vals; return q; },
    delete: () => { state.op = 'delete'; return q; },
    order: (col: string, opts?: { ascending?: boolean }) => { state.order = { col, asc: opts?.ascending !== false }; return q; },
    eq: (col: string, val: unknown) => { state.eq[col] = val; return q; },
    then: (resolve: any, reject: any) => exec().then(resolve, reject),
    catch: (fn: any) => exec().catch(fn),
    finally: (fn: any) => exec().finally(fn),
  };
  return q;
}

export const supabase = {
  auth: {
    async getSession(): Promise<{ data: { session: Session | null }; error: ErrObj }> {
      return { data: { session: currentSession() }, error: null };
    },
    onAuthStateChange(cb: AuthListener): { data: { subscription: { unsubscribe: () => void } } } {
      listeners.push(cb);
      setTimeout(() => cb('INITIAL_SESSION', currentSession()), 0);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners = listeners.filter((l) => l !== cb);
            },
          },
        },
      };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const d = await api<{ token: string }>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
        const p = decodeJwt(d.token);
        setAuth(d.token, email, String(p.uid || ''));
        const s = currentSession();
        listeners.forEach((l) => l('SIGNED_IN', s));
        return { data: { user: s!.user, session: s }, error: null };
      } catch (e) {
        return { data: { user: null, session: null }, error: { message: (e as Error).message } };
      }
    },
    async signUp({ email, password }: { email: string; password: string }) {
      try {
        const d = await api<{ token: string }>('/auth/register', { method: 'POST', body: { email, password }, auth: false });
        const p = decodeJwt(d.token);
        setAuth(d.token, email, String(p.uid || ''));
        const s = currentSession();
        listeners.forEach((l) => l('SIGNED_IN', s));
        return { data: { user: s!.user, session: s }, error: null };
      } catch (e) {
        return { data: { user: null, session: null }, error: { message: (e as Error).message } };
      }
    },
    async signOut() {
      clearAuth();
      listeners.forEach((l) => l('SIGNED_OUT', null));
      return { error: null };
    },
    async getUser() {
      return { data: { user: currentUser() }, error: null as ErrObj };
    },
    async updateUser({ password }: { password: string }) {
      try {
        await api('/auth/update', { method: 'POST', body: { password } });
        return { data: { user: currentUser() }, error: null };
      } catch (e) {
        return { data: { user: null }, error: { message: (e as Error).message } };
      }
    },
    async resetPasswordForEmail(_email: string, _opts?: unknown) {
      // New backend has no email provider yet; acknowledge without error so the
      // old UI's "reset link sent" flow keeps working.
      return { data: {}, error: null as ErrObj };
    },
  },
  async rpc(name: string, args: Record<string, unknown>) {
    try {
      const d = await api<{ result: any }>(`/public/rpc/${name}`, { method: 'POST', body: args || {}, auth: false });
      return { data: d.result, error: null as ErrObj };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  },
  from(table: string) {
    return makeQuery(table);
  },
};
