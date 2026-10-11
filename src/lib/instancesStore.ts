// Adapter shim: old instances layout lived in Firestore; now stored as a
// per-user JSON blob in the new Postgres backend. Same surface as before.

export interface InstancesData {
  ips: string[];
  positions: string[];
}

export const EMPTY_INSTANCES: InstancesData = { ips: [], positions: [] };

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('ec2forge_token');
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

function normalize(input: any): InstancesData {
  const data: InstancesData = { ips: [], positions: [] };
  if (input && typeof input === 'object') {
    if (Array.isArray(input.ips)) data.ips = input.ips;
    if (Array.isArray(input.positions)) data.positions = input.positions;
  }
  return data;
}

export async function loadInstances(): Promise<InstancesData> {
  const res = await fetch('/api/user-blob/instances', { headers: authHeaders() });
  if (res.status === 404) return EMPTY_INSTANCES;
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  const body = await res.json().catch(() => ({}));
  return normalize(body.data);
}

export async function saveInstances(data: InstancesData): Promise<void> {
  const res = await fetch('/api/user-blob/instances', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`Failed to save data (${res.status})`);
}
