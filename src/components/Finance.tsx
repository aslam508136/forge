import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { loadLedger, saveLedger, EMPTY_LEDGER, type LedgerData, type Person, type KhataEntry, type FinanceRecord } from '../lib/financeStore';import Sidebar from './Sidebar';
import MadeByBadge from './MadeByBadge';
import ThreeBackground from './ThreeBackground';
import Loader3D from './Loader3D';

type RecordType = 'profit' | 'expense' | 'loss';
type Filter = 'all' | RecordType;

const TYPE_META: Record<RecordType, { label: string; icon: string; color: string; bg: string }> = {
  profit: { label: 'Income', icon: '▲', color: '#00e676', bg: 'rgba(0,230,118,0.14)' },
  expense: { label: 'Expense', icon: '▼', color: '#ff1744', bg: 'rgba(255,23,68,0.14)' },
  loss: { label: 'Loss', icon: '●', color: '#ffab00', bg: 'rgba(255,171,0,0.14)' },
};

function fmt(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Finance({ onNavigate }: { onNavigate: (view: 'accounts' | 'finance' | 'instances') => void }) {
  const { isDark, toggleTheme } = useTheme();

  const [data, setData] = useState<LedgerData>(EMPTY_LEDGER);
  // Har mutation ke liye latest data ka ref — stale closure ki wajah se koi
  // entry save me kho na jaye. Saves bhi serialized hain (ek ke baad ek).
  const dataRef = useRef<LedgerData>(EMPTY_LEDGER);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'ok' | 'err'>('ok');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'khata' | 'business'>('khata');

  // khata state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [seg, setSeg] = useState<'all' | 'toReceive' | 'toPay'>('all');
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [personForm, setPersonForm] = useState({ name: '', note: '' });
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryDir, setEntryDir] = useState<'given' | 'received'>('given');
  const [entryForm, setEntryForm] = useState({ amount: '', note: '', date: today() });

  // business state
  const [filter, setFilter] = useState<Filter>('all');
  const [bform, setBform] = useState({ type: 'profit' as RecordType, amount: '', note: '', date: today() });

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToastType(type);
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await loadLedger();
      dataRef.current = d;
      setData(d);
    } catch (e) {
      setError((e as Error).message);
      showToast((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function persist(next: LedgerData) {
    dataRef.current = next;
    setData(next);
    // Saves ko queue karo taaki purane data ka save naye data ko overwrite na kare
    saveChainRef.current = saveChainRef.current
      .catch(() => {})
      .then(async () => {
        try {
          await saveLedger(next);
        } catch (e) {
          showToast('Save fail hua: ' + ((e as Error).message || e), 'err');
        }
      });
  }

  // ---------- khata helpers ----------
  const entriesOf = (pid: string) => data.khata.filter((k) => k.personId === pid);

  const balanceOf = (pid: string) => {
    const es = entriesOf(pid);
    return es.reduce((s, k) => {
      const n = typeof k.amount === 'string' ? parseFloat(k.amount) : Number(k.amount);
      return s + (Number.isFinite(n) ? n : 0) * (k.dir === 'given' ? 1 : -1);
    }, 0);
  };

  const sortedPeople = [...data.people].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const peopleList = sortedPeople.filter((p) => {
    const b = balanceOf(p.id);
    if (seg === 'toReceive') return b > 0;
    if (seg === 'toPay') return b < 0;
    return true;
  });

  const totalToReceive = data.people.reduce((s, p) => s + Math.max(0, balanceOf(p.id)), 0);
  const totalToPay = data.people.reduce((s, p) => s + Math.max(0, -balanceOf(p.id)), 0);

  const active = data.people.find((p) => p.id === activeId) || null;
  const activeEntries = active ? entriesOf(active.id).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1
  ) : [];

  const activeGrouped: { date: string; entries: KhataEntry[] }[] = (() => {
    const map = new Map<string, KhataEntry[]>();
    for (const k of activeEntries) {
      if (!map.has(k.date)) map.set(k.date, []);
      map.get(k.date)!.push(k);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, entries]) => ({ date, entries }));
  })();

  function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!personForm.name.trim()) { showToast('Naam dalo', 'err'); return; }
    const person: Person = {
      id: crypto.randomUUID(),
      name: personForm.name.trim(),
      note: personForm.note.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    persist({ ...dataRef.current, people: [person, ...dataRef.current.people] });
    setPersonForm({ name: '', note: '' });
    setShowPersonModal(false);
    setActiveId(person.id);
    showToast('Khata ban gaya ✓');
  }

  function deletePerson(id: string) {
    if (!confirm('Is bande ka khata aur saari entries delete ho jayengi. Pakka?')) return;
    persist({
      ...dataRef.current,
      people: dataRef.current.people.filter((p) => p.id !== id),
      khata: dataRef.current.khata.filter((k) => k.personId !== id),
    });
    setActiveId(null);
    showToast('Khata delete ho gaya');
  }

  function openEntry(dir: 'given' | 'received') {
    setEntryDir(dir);
    setEntryForm({ amount: '', note: '', date: today() });
    setShowEntryModal(true);
  }

  function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    const amount = parseFloat(entryForm.amount);
    if (!amount || amount <= 0) { showToast('Sahi amount dalo', 'err'); return; }
    if (!entryForm.date) { showToast('Date chahiye', 'err'); return; }
    const entry: KhataEntry = {
      id: crypto.randomUUID(),
      personId: active.id,
      dir: entryDir,
      amount,
      note: entryForm.note.trim(),
      date: entryForm.date,
      created_at: new Date().toISOString(),
    };
    persist({ ...dataRef.current, khata: [entry, ...dataRef.current.khata] });
    setShowEntryModal(false);
    showToast(entryDir === 'given' ? 'Udhaar diya ✓' : 'Paisa mila ✓');
  }

  function deleteEntry(id: string) {
    if (!confirm('Entry delete karein?')) return;
    persist({ ...dataRef.current, khata: dataRef.current.khata.filter((k) => k.id !== id) });
  }

  // ---------- business helpers ----------
  const amt = (r: { amount: unknown }) => {
    const n = typeof r.amount === 'string' ? parseFloat(r.amount) : Number(r.amount);
    return Number.isFinite(n) ? n : 0;
  };
  const totals = data.records.reduce(
    (acc, r) => {
      const a = amt(r);
      if (r.type === 'profit') acc.profit += a;
      else if (r.type === 'expense') acc.expense += a;
      else acc.loss += a;
      return acc;
    },
    { profit: 0, expense: 0, loss: 0 }
  );

  // Net Balance card — SIRF current month ka, poora overall nahi
  const cm = today().slice(0, 7); // "2026-09"
  const currentTotals = data.records.reduce(
    (acc, r) => {
      if (r.date.slice(0, 7) !== cm) return acc;
      const a = amt(r);
      if (r.type === 'profit') acc.profit += a;
      else if (r.type === 'expense') acc.expense += a;
      else acc.loss += a;
      return acc;
    },
    { profit: 0, expense: 0, loss: 0 }
  );
  const net = currentTotals.profit - currentTotals.expense - currentTotals.loss;
  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const visible = filter === 'all' ? data.records : data.records.filter((r) => r.type === filter);
  const sortedRecords = [...visible].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1
  );
  const businessGrouped: { date: string; records: FinanceRecord[]; profit: number; expense: number; loss: number; net: number }[] = (() => {
    const map = new Map<string, any>();
    for (const r of sortedRecords) {
      let g = map.get(r.date);
      if (!g) { g = { date: r.date, records: [], profit: 0, expense: 0, loss: 0, net: 0 }; map.set(r.date, g); }
      g.records.push(r);
      const a = amt(r);
      if (r.type === 'profit') g.profit += a;
      else if (r.type === 'expense') g.expense += a;
      else g.loss += a;
      g.net = g.profit - g.expense - g.loss;
    }
    return [...map.values()];
  })();

  // Month-wise grouping: ALL records (not just filtered) grouped by YYYY-MM
  const currentMonth = today().slice(0, 7); // "2026-09"
  const monthWise: { month: string; label: string; profit: number; expense: number; loss: number; net: number; count: number; isCurrent: boolean }[] = (() => {
    const map = new Map<string, { profit: number; expense: number; loss: number; count: number }>();
    for (const r of data.records) {
      const ym = r.date.slice(0, 7); // "2026-08"
      let entry = map.get(ym);
      if (!entry) { entry = { profit: 0, expense: 0, loss: 0, count: 0 }; map.set(ym, entry); }
      const a = amt(r);
      if (r.type === 'profit') entry.profit += a;
      else if (r.type === 'expense') entry.expense += a;
      else entry.loss += a;
      entry.count++;
    }
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])) // newest month first
      .map(([ym, v]) => {
        const [y, m] = ym.split('-');
        return {
          month: ym,
          label: `${monthNames[parseInt(m, 10) - 1]} ${y}`,
          ...v,
          net: v.profit - v.expense - v.loss,
          isCurrent: ym === currentMonth,
        };
      });
  })();

  function addBusiness(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(bform.amount);
    if (!amount || amount <= 0) { showToast('Sahi amount dalo', 'err'); return; }
    if (!bform.date) { showToast('Date chahiye', 'err'); return; }
    setSaving(true);
    const record: FinanceRecord = {
      id: crypto.randomUUID(),
      type: bform.type,
      amount,
      note: bform.note.trim(),
      date: bform.date,
      created_at: new Date().toISOString(),
    };
    persist({ ...dataRef.current, records: [record, ...dataRef.current.records] });
    setBform((f) => ({ ...f, amount: '', note: '' }));
    setSaving(false);
    showToast('Saved ✓');
  }

  function deleteBusiness(id: string) {
    if (!confirm('Delete this record?')) return;
    persist({ ...dataRef.current, records: dataRef.current.records.filter((r) => r.id !== id) });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function clearAllData() {
    if (!confirm('Pura apna data (khata + business + log) DELETE ho jayega. Pakka?')) return;
    if (!confirm('Are you SURE? Ye wapas nahi aa sakta.')) return;
    setLoading(true);
    try {
      await saveLedger(EMPTY_LEDGER);
      dataRef.current = EMPTY_LEDGER;
      setData(EMPTY_LEDGER);
      showToast('Data clear ho gaya ✓');
    } catch (e) {
      showToast((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }

  const navItems = [
    { id: 'accounts', label: 'Accounts', icon: '☁' },
    { id: 'instances', label: 'Connect Instance', icon: '🖥' },
    { id: 'finance', label: 'Finance', icon: '₹' },
  ];

  const handleNav = (id: string) => {
    if (id === 'accounts' || id === 'finance' || id === 'instances') onNavigate(id as 'accounts' | 'finance' | 'instances');
  };

  const green = '#00e676';
  const red = '#ff5252';

  // ---------- khata person row ----------
  const renderPersonRow = (p: Person) => {
    const b = balanceOf(p.id);
    const due = b > 0;
    return (
      <button
        key={p.id}
        onClick={() => setActiveId(p.id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 22px', borderBottom: '1px solid var(--border)',
          background: 'transparent', textAlign: 'left',
        }}
      >
        <div style={{
          width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
          background: due
            ? 'linear-gradient(135deg, rgba(0,230,118,0.22), rgba(0,230,118,0.06))'
            : 'linear-gradient(135deg, rgba(255,82,82,0.22), rgba(255,82,82,0.06))',
          color: due ? green : red,
          border: due ? '1px solid rgba(0,230,118,0.35)' : '1px solid rgba(255,82,82,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800,
        }}>
          {initialsOf(p.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {b === 0 ? 'Khata set hai — koi hisab nahi' : due ? 'Mujhe lena hai' : 'Mujhe dena hai'}
            {p.note ? ` • ${p.note}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: b === 0 ? 'var(--text-muted)' : due ? green : red }}>
            {b === 0 ? '—' : `${due ? '+' : '-'}₹${Math.abs(b).toLocaleString('en-IN')}`}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: b === 0 ? 'var(--text-muted)' : due ? green : red, opacity: 0.85 }}>
            {b === 0 ? 'Settled' : due ? 'Lena Hai' : 'Dena Hai'}
          </div>
        </div>
      </button>
    );
  };

  const segBtn = (id: 'all' | 'toReceive' | 'toPay', label: string) => (
    <button
      onClick={() => setSeg(id)}
      style={{
        padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, flex: 1,
        background: seg === id ? 'rgba(0,212,255,0.16)' : 'transparent',
        color: seg === id ? 'var(--primary)' : 'var(--text-muted)',
        border: seg === id ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <ThreeBackground />
      <MadeByBadge />
      <Sidebar
        activeItem="finance"
        onNavigate={handleNav}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        items={navItems}
        title="AWS EC2 Pro"
        subtitle="Enterprise Management"
        userBadge={`${data.people.length} khata`}
      />
      <div className="main-content">
        <div style={{ maxWidth: 1100 }}>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6, letterSpacing: -0.5 }} className="gradient-text">
                {tab === 'khata' ? 'Khata' : 'Business'}
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                {tab === 'khata' ? 'Jin logon ka aapke saath lena-dena hai' : 'Income, expense, loss — date wise'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 11, border: '1px solid var(--glass-border)' }}>
              <button className="btn-danger" onClick={clearAllData} title="Clear all data" style={{ fontSize: 12, padding: '8px 10px', marginRight: 2 }}>🗑</button>
              <button
                onClick={() => setTab('khata')}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  background: tab === 'khata' ? 'linear-gradient(135deg, rgba(0,230,118,0.2), rgba(0,212,255,0.12))' : 'transparent',
                  color: tab === 'khata' ? green : 'var(--text-muted)',
                  border: tab === 'khata' ? '1px solid rgba(0,230,118,0.35)' : '1px solid transparent',
                }}
              >
                📒 Khata
              </button>
              <button
                onClick={() => setTab('business')}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  background: tab === 'business' ? 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(68,138,255,0.12))' : 'transparent',
                  color: tab === 'business' ? 'var(--primary)' : 'var(--text-muted)',
                  border: tab === 'business' ? '1px solid rgba(0,212,255,0.35)' : '1px solid transparent',
                }}
              >
                📊 Business
              </button>
            </div>
          </div>

          {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: 20 }}>{error}</div>}

          {tab === 'khata' ? (
            active ? (
              // ============ KHATA DETAIL VIEW ============
              <>
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--glass-border)' }}>
                    <button className="btn-secondary" onClick={() => setActiveId(null)} style={{ fontSize: 18, padding: '6px 12px' }}>←</button>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                      background: balanceOf(active.id) > 0 ? 'linear-gradient(135deg, rgba(0,230,118,0.22), rgba(0,230,118,0.06))' : 'linear-gradient(135deg, rgba(255,82,82,0.22), rgba(255,82,82,0.06))',
                      color: balanceOf(active.id) > 0 ? green : red,
                      border: `1px solid ${balanceOf(active.id) > 0 ? 'rgba(0,230,118,0.35)' : 'rgba(255,82,82,0.35)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>
                      {initialsOf(active.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800 }}>{active.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {active.note || 'Khata'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: balanceOf(active.id) === 0 ? 'var(--text-muted)' : balanceOf(active.id) > 0 ? green : red }}>
                        {balanceOf(active.id) === 0 ? '—' : fmt(balanceOf(active.id))}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: balanceOf(active.id) === 0 ? 'var(--text-muted)' : balanceOf(active.id) > 0 ? green : red }}>
                        {balanceOf(active.id) === 0 ? 'Settled' : balanceOf(active.id) > 0 ? 'Lena Hai' : 'Dena Hai'}
                      </div>
                    </div>
                    <button className="btn-danger" onClick={() => deletePerson(active.id)} title="Delete khata" style={{ fontSize: 14 }}>🗑</button>
                  </div>
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                  {activeEntries.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 20px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>📔</div>
                      Abhi koi entry nahi. Neeche se "Udhaar Diya" ya "Paisa Mila" dabao.
                    </div>
                  ) : (
                    activeGrouped.map((g) => (
                      <div key={g.date}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 22px', background: 'rgba(0,0,0,0.22)', borderBottom: '1px solid var(--glass-border)',
                        }}>
                          <span style={{ fontWeight: 800, fontSize: 12.5 }}>{fmtDate(g.date)}</span>
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: (() => {
                            const s = g.entries.reduce((sum, k) => {
                              const n = typeof k.amount === 'string' ? parseFloat(k.amount) : Number(k.amount);
                              return sum + (Number.isFinite(n) ? n : 0) * (k.dir === 'given' ? 1 : -1);
                            }, 0);
                            return s > 0 ? green : red;
                          })() }}>
                            {fmt(g.entries.reduce((s, k) => {
                              const n = typeof k.amount === 'string' ? parseFloat(k.amount) : Number(k.amount);
                              return s + (Number.isFinite(n) ? n : 0) * (k.dir === 'given' ? 1 : -1);
                            }, 0))}
                          </span>
                        </div>
                        {g.entries.map((k) => {
                          const isGiven = k.dir === 'given';
                          return (
                            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: isGiven ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)',
                                color: isGiven ? green : red, border: `1px solid ${isGiven ? 'rgba(0,230,118,0.3)' : 'rgba(255,82,82,0.3)'}`,
                                fontSize: 16, fontWeight: 900,
                              }}>
                                {isGiven ? '＋' : '−'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: isGiven ? green : red }}>
                                  {isGiven ? 'Udhaar Diya' : 'Paisa Mila'}
                                </div>
                                {k.note && (
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.note}</div>
                                )}
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: isGiven ? green : red, whiteSpace: 'nowrap' }}>
                                {isGiven ? '+' : '-'}{fmt(k.amount)}
                              </div>
                              <button className="btn-danger" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => deleteEntry(k.id)}>✕</button>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                <div style={{
                  position: 'sticky', bottom: 16, display: 'flex', gap: 12,
                  background: 'rgba(12,16,24,0.85)', backdropFilter: 'blur(14px)',
                  border: '1px solid var(--glass-border)', borderRadius: 16, padding: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                }}>
                  <button className="btn-primary" style={{ flex: 1, padding: '14px', fontSize: 15, fontWeight: 800, background: 'rgba(0,230,118,0.16)', border: '1px solid rgba(0,230,118,0.4)', color: green }} onClick={() => openEntry('given')}>
                    ＋ Udhaar Diya
                  </button>
                  <button className="btn-secondary" style={{ flex: 1, padding: '14px', fontSize: 15, fontWeight: 800, background: 'rgba(255,82,82,0.16)', border: '1px solid rgba(255,82,82,0.4)', color: red }} onClick={() => openEntry('received')}>
                    − Paisa Mila
                  </button>
                </div>
              </>
            ) : (
              // ============ KHATA HOME ============
              <>
                <div style={{
                  borderRadius: 22, padding: '26px 30px', marginBottom: 20,
                  background: 'linear-gradient(135deg, rgba(0,230,118,0.12), rgba(0,212,255,0.06) 60%, rgba(255,82,82,0.05))',
                  border: '1px solid rgba(0,230,118,0.2)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>
                    Total Lenden
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div style={{ borderRadius: 14, padding: '16px 18px', background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: green }}>Aapko Lena Hai</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: green, marginTop: 4, textShadow: '0 0 24px rgba(0,230,118,0.25)' }}>{fmt(totalToReceive)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{data.people.filter((p) => balanceOf(p.id) > 0).length} log</div>
                    </div>
                    <div style={{ borderRadius: 14, padding: '16px 18px', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.3)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: red }}>Aapko Dena Hai</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: red, marginTop: 4 }}>{fmt(totalToPay)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{data.people.filter((p) => balanceOf(p.id) < 0).length} log</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Net outstanding: <strong style={{ color: totalToReceive - totalToPay >= 0 ? green : red }}>
                      {fmt(totalToReceive - totalToPay)}
                    </strong>
                  </div>
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 3, borderRadius: 10, border: '1px solid var(--glass-border)', flex: 1, minWidth: 220 }}>
                      {segBtn('all', `Sabhi (${data.people.length})`)}
                      {segBtn('toReceive', 'Lena Hai')}
                      {segBtn('toPay', 'Dena Hai')}
                    </div>
                    <button className="btn-primary btn-sm" onClick={() => setShowPersonModal(true)} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>＋ Naya Khata</button>
                  </div>

                  {loading ? (
                    <div style={{ textAlign: 'center', padding: 50 }}><Loader3D /></div>
                  ) : peopleList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                      {data.people.length === 0 ? (
                        <p>Abhi koi khata nahi. "Naya Khata" se log add karo —<br />jaise Rahul, jisne 3000 ka maal 2300 de kar rakha hai.</p>
                      ) : (
                        <p>Is section me koi nahi.</p>
                      )}
                    </div>
                  ) : (
                    peopleList.map(renderPersonRow)
                  )}
                </div>
              </>
            )
          ) : (
            // ============ BUSINESS TAB ============
            <>
              <div style={{
                borderRadius: 22, padding: '26px 30px', marginBottom: 20,
                background: 'linear-gradient(135deg, rgba(0,212,255,0.14), rgba(68,138,255,0.05) 55%, rgba(0,230,118,0.04))',
                border: '1px solid rgba(0,212,255,0.22)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.12), transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Net Balance — {monthLabel}</div>
                <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1, color: net >= 0 ? 'var(--success)' : 'var(--danger)', textShadow: net >= 0 ? '0 0 30px rgba(0,230,118,0.25)' : '0 0 30px rgba(255,23,68,0.25)' }}>{fmt(net)}</div>
                <div style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
                    Income <strong style={{ color: 'var(--success)', fontSize: 15 }}>{fmt(currentTotals.profit)}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 8px var(--danger)' }} />
                    Expense <strong style={{ color: 'var(--danger)', fontSize: 15 }}>{fmt(currentTotals.expense)}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', boxShadow: '0 0 8px var(--warning)' }} />
                    Loss <strong style={{ color: 'var(--warning)', fontSize: 15 }}>{fmt(currentTotals.loss)}</strong>
                  </div>
                </div>
              </div>

              {/* Monthly Summary */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>📅 Monthly Summary</h3>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Current month + past months</span>
                </div>
                {monthWise.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
                    Abhi koi entry nahi.
                  </div>
                ) : (
                  <div>
                    {/* CURRENT MONTH highlighted first */}
                    {monthWise.filter((m) => m.isCurrent).map((m) => (
                      <div key={m.month} style={{
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        padding: '16px 22px', borderBottom: '2px solid rgba(0,212,255,0.4)',
                        background: 'linear-gradient(135deg, rgba(0,212,255,0.14), rgba(0,230,118,0.06))',
                      }}>
                        <span style={{
                          fontWeight: 800, fontSize: 13.5, minWidth: 120,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                            color: 'var(--primary)', background: 'rgba(0,212,255,0.16)',
                            border: '1px solid rgba(0,212,255,0.35)', borderRadius: 6,
                            padding: '2px 7px', textTransform: 'uppercase',
                          }}>● Current</span>
                          {m.label}
                        </span>
                        <div style={{ flex: 1 }} />
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>Income {fmt(m.profit)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Expense {fmt(m.expense)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)' }}>Loss {fmt(m.loss)}</span>
                          <span style={{
                            fontSize: 13, fontWeight: 800, padding: '4px 12px', borderRadius: 8,
                            color: m.net >= 0 ? 'var(--success)' : 'var(--danger)',
                            background: m.net >= 0 ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.15)',
                            border: `1px solid ${m.net >= 0 ? 'rgba(0,230,118,0.4)' : 'rgba(255,82,82,0.4)'}`,
                          }}>{m.net >= 0 ? 'Profit' : 'Loss'} {fmt(Math.abs(m.net))}</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{m.count} entry</span>
                      </div>
                    ))}

                    {/* PAST MONTHS history */}
                    {monthWise.some((m) => !m.isCurrent) && (
                      <>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 22px', background: 'rgba(0,0,0,0.28)', borderBottom: '1px solid var(--glass-border)',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                            📜 Past Months
                          </span>
                        </div>
                        {monthWise.filter((m) => !m.isCurrent).map((m) => (
                          <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '13px 22px', borderBottom: '1px solid var(--border)', opacity: 0.85 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, minWidth: 110 }}>{m.label}</span>
                            <div style={{ flex: 1 }} />
                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>Income {fmt(m.profit)}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Expense {fmt(m.expense)}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)' }}>Loss {fmt(m.loss)}</span>
                              <span style={{
                                fontSize: 13, fontWeight: 800, padding: '4px 12px', borderRadius: 8,
                                color: m.net >= 0 ? 'var(--success)' : 'var(--danger)',
                                background: m.net >= 0 ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)',
                                border: `1px solid ${m.net >= 0 ? 'rgba(0,230,118,0.3)' : 'rgba(255,82,82,0.3)'}`,
                              }}>{m.net >= 0 ? 'Profit' : 'Loss'} {fmt(Math.abs(m.net))}</span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{m.count} entry</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 20, alignItems: 'start', marginBottom: 20 }}>
                <div className="card">
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Add Entry</h3>
                  <form onSubmit={addBusiness}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                      {(Object.keys(TYPE_META) as RecordType[]).map((t) => {
                        const meta = TYPE_META[t];
                        const active = bform.type === t;
                        return (
                          <button key={t} type="button" onClick={() => setBform({ ...bform, type: t })}
                            style={{
                              flex: 1, padding: '9px 4px', borderRadius: 9, fontWeight: 700, fontSize: 11,
                              background: active ? meta.bg : 'rgba(0,0,0,0.2)',
                              color: active ? meta.color : 'var(--text-muted)',
                              border: active ? `1px solid ${meta.color}55` : '1px solid var(--glass-border)',
                            }}>
                            {meta.icon} {meta.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="form-group">
                      <label>Amount (₹)</label>
                      <input type="number" min="0" step="any" inputMode="decimal" value={bform.amount} onChange={(e) => setBform({ ...bform, amount: e.target.value })} placeholder="0.00" autoFocus />
                    </div>
                    <div className="form-group">
                      <label>Note</label>
                      <input value={bform.note} onChange={(e) => setBform({ ...bform, note: e.target.value })} placeholder="e.g. server bill, sold 3 vps…" />
                    </div>
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" value={bform.date} onChange={(e) => setBform({ ...bform, date: e.target.value })} />
                    </div>
                    <button className="btn-primary" type="submit" disabled={saving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {saving ? <span className="spinner" /> : '＋ Save Entry'}
                    </button>
                  </form>
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>Transactions</h3>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 3, borderRadius: 9, border: '1px solid var(--glass-border)' }}>
                      {(['all', 'profit', 'expense', 'loss'] as Filter[]).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                          style={{
                            padding: '5px 12px', borderRadius: 7, fontWeight: 700, fontSize: 11,
                            background: filter === f ? 'rgba(0,212,255,0.14)' : 'transparent',
                            color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
                            border: filter === f ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                            textTransform: 'capitalize',
                          }}>
                          {f === 'profit' ? 'income' : f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {loading ? (
                    <div style={{ textAlign: 'center', padding: 50 }}><Loader3D /></div>
                  ) : sortedRecords.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: 36, marginBottom: 10 }}>📒</p>
                      No transactions yet.
                    </div>
                  ) : (
                    businessGrouped.map((g) => (
                      <div key={g.date}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 22px', background: 'rgba(0,0,0,0.22)', borderBottom: '1px solid var(--glass-border)' }}>
                          <span style={{ fontWeight: 800, fontSize: 13 }}>{fmtDate(g.date)}</span>
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>I {fmt(g.profit)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>E {fmt(g.expense)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)' }}>L {fmt(g.loss)}</span>
                          <span style={{
                            fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 7,
                            color: g.net >= 0 ? 'var(--success)' : 'var(--danger)',
                            background: g.net >= 0 ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)',
                            border: `1px solid ${g.net >= 0 ? 'rgba(0,230,118,0.25)' : 'rgba(255,23,68,0.25)'}`,
                          }}>Net {fmt(g.net)}</span>
                        </div>
                        {g.records.map((r) => {
                          const meta = TYPE_META[r.type];
                          return (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>
                              <span style={{
                                width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                                background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33`,
                              }}>{meta.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.note || meta.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{meta.label}</div>
                              </div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: meta.color, whiteSpace: 'nowrap' }}>{r.type === 'profit' ? '+' : '-'}{fmt(r.amount)}</div>
                              <button className="btn-danger" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => deleteBusiness(r.id)}>✕</button>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Naya Khata modal ---------- */}
      {showPersonModal && (
        <div className="modal-overlay" onClick={() => setShowPersonModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2>Naya Khata</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Jis bande ke saath lena-dena hai usse add karo.
            </p>
            <form onSubmit={addPerson}>
              <div className="form-group">
                <label>Naam</label>
                <input value={personForm.name} onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} placeholder="e.g. Rahul" autoFocus />
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input value={personForm.note} onChange={(e) => setPersonForm({ ...personForm, note: e.target.value })} placeholder="e.g. dukaan, dost…" />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1 }}>Add Khata</button>
                <button className="btn-secondary" type="button" onClick={() => setShowPersonModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- Udhaar/Paisa entry modal ---------- */}
      {showEntryModal && active && (
        <div className="modal-overlay" onClick={() => setShowEntryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 style={{ color: entryDir === 'given' ? green : red }}>
              {entryDir === 'given' ? '＋ Udhaar Diya' : '− Paisa Mila'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              {entryDir === 'given'
                ? `Aapne ${active.name} ko aur kitna udhaar (credit) diya?`
                : `${active.name} ne kitna paisa wapas diya?`}
            </p>
            <form onSubmit={addEntry}>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input type="number" min="0" step="any" inputMode="decimal" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} placeholder="0.00" autoFocus />
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input value={entryForm.note} onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })} placeholder="e.g. 3 VPS ka bill, cash mila…" />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1 }}>Save</button>
                <button className="btn-secondary" type="button" onClick={() => setShowEntryModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toastType === 'ok' ? 'toast-success' : 'toast-error'}`}>{toast}</div>}
    </>
  );
}
