// Adapter shim: old finance ledger lived in Firestore; now stored as a per-user
// JSON blob in the new Postgres backend. Same surface as before.

export interface FinanceRecord {
  id: string;
  type: 'profit' | 'expense' | 'loss';
  amount: number;
  note: string;
  date: string;
  created_at: string;
}

export interface Person {
  id: string;
  name: string;
  note?: string;
  created_at: string;
}

export interface KhataEntry {
  id: string;
  personId: string;
  dir: 'given' | 'received';
  amount: number;
  note: string;
  date: string;
  created_at: string;
}

export interface LedgerData {
  records: FinanceRecord[];
  people: Person[];
  khata: KhataEntry[];
}

export const EMPTY_LEDGER: LedgerData = { records: [], people: [], khata: [] };

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('ec2forge_token');
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

function normalize(input: any): LedgerData {
  const data: LedgerData = { records: [], people: [], khata: [] };
  if (input && typeof input === 'object') {
    if (Array.isArray(input.records)) data.records = input.records;
    if (Array.isArray(input.people)) data.people = input.people;
    if (Array.isArray(input.khata)) data.khata = input.khata;
  }
  const num = (v: any) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  data.records = data.records.map((r) => ({ ...r, amount: num(r.amount) }));
  data.khata = data.khata.map((k) => ({ ...k, amount: num(k.amount) }));
  return data;
}

export async function loadLedger(): Promise<LedgerData> {
  const res = await fetch('/api/user-blob/ledger', { headers: authHeaders() });
  if (res.status === 404) return EMPTY_LEDGER;
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  const body = await res.json().catch(() => ({}));
  return normalize(body.data);
}

export async function saveLedger(data: LedgerData): Promise<void> {
  const res = await fetch('/api/user-blob/ledger', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`Failed to save data (${res.status})`);
}
