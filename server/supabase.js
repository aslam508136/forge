const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://aaqdscfgawuvjbvoudbc.supabase.co').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_neyjJViPHQo5g8Xjg_TArQ_9sqnvfFB';

export function supabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function oldLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || !data.access_token) return null;
  return { accessToken: data.access_token, userId: data.user?.id || null };
}

async function getTable(token, table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function fetchUserData(token) {
  const [profiles, schedules, autos] = await Promise.all([
    getTable(token, 'aws_profiles'),
    getTable(token, 'instance_schedules'),
    getTable(token, 'instance_auto_config'),
  ]);
  return { profiles: profiles || [], schedules: schedules || [], autos: autos || [] };
}