import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { loadInstances, saveInstances, type InstancesData } from '../lib/instancesStore';
import { useTheme } from '../context/ThemeContext';
import Sidebar from './Sidebar';
import MadeByBadge from './MadeByBadge';
import ThreeBackground from './ThreeBackground';
import Loader3D from './Loader3D';

const VALID_IP = /^(\d{1,3}\.){3}\d{1,3}$/;

function parsePos(pos: string): { x: number; y: number; w: number; h: number } | null {
  const m = /^(\d+),(\d+),(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(pos.trim());
  if (!m) return null;
  return { x: +m[3], y: +m[4], w: +m[5], h: +m[6] };
}

function encodeScript(script: string): string {
  const u16 = new Uint16Array(script.length);
  for (let i = 0; i < script.length; i++) u16[i] = script.charCodeAt(i);
  const bytes = new Uint8Array(u16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}

function buildConnectAll(ips: string[], positions: string[]): string {
  const pairs = ips.map((ip, i) => ({ ip: ip.trim(), pos: (positions[i] || '').trim() }));
  const conns = pairs.map((p) => {
    const g = parsePos(p.pos);
    return `  @{ ip = '${p.ip}'; x = ${g ? g.x : 0}; y = ${g ? g.y : 0}; w = ${g ? g.w : 384}; h = ${g ? g.h : 540} }`;
  });

  const ps = `$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RdpWin {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool r);
}
'@
$user = 'Administrator'
$pass = 'Rr@123456'
$conns = @(
${conns.join('\n')}
)
foreach ($c in $conns) {
  $ip = $c.ip
  Write-Host "Connecting to $ip ..." -ForegroundColor Cyan
  cmdkey /generic:"TERMSRV/$ip" /user:$user /pass:$pass | Out-Null
}
$dir = Join-Path $env:TEMP 'rdp_conn'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$jobs = New-Object System.Collections.ArrayList
$i = 0
foreach ($c in $conns) {
  $i++
  $file = Join-Path $dir ("conn_{0}.rdp" -f $i)
  $rdp = @()
  $rdp += 'full address:s:' + $c.ip
  $rdp += 'username:s:' + $user
  $rdp += 'prompt for credentials:i:0'
  $rdp += 'autoreconnection enabled:i:1'
  $rdp += 'screen mode id:i:1'
  $rdp += 'use multimon:i:0'
  $rdp += 'desktopwidth:i:1920'
  $rdp += 'desktopheight:i:1080'
  $rdp += 'session bpp:i:32'
  $rdp += 'compression:i:1'
  $rdp += 'keyboardhook:i:2'
  $rdp += 'audiocapturemode:i:0'
  $rdp += 'videoplaybackmode:i:1'
  $rdp += 'connection type:i:7'
  $rdp += 'networkautoreconnect:i:1'
  $rdp += 'bandwidthautodetect:i:1'
  $rdp += 'displayconnectionbar:i:1'
  $rdp += 'enableworkspacereconnect:i:0'
  $rdp += 'disable wallpaper:i:0'
  $rdp += 'allow font smoothing:i:0'
  $rdp += 'allow desktop composition:i:0'
  $rdp += 'disable full window drag:i:1'
  $rdp += 'disable menu anims:i:1'
  $rdp += ('winposstr:s:0,1,{0},{1},{2},{3}' -f $c.x, $c.y, $c.w, $c.h)
  Set-Content -Path $file -Value $rdp -Encoding Ascii
  $p = Start-Process mstsc -ArgumentList ('"' + $file + '"') -PassThru
  [void]$jobs.Add(@{ proc = $p; c = $c })
}
for ($pass = 0; $pass -lt 6; $pass++) {
  Start-Sleep -Milliseconds 1200
  foreach ($j in $jobs) {
    try {
      $j.proc.Refresh()
      $h = $j.proc.MainWindowHandle
      if ($h -ne 0) {
        [RdpWin]::MoveWindow($h, [int]$j.c.x, [int]$j.c.y, [int]$j.c.w, [int]$j.c.h, $true) | Out-Null
      }
    } catch {}
  }
}
Write-Host ''
Write-Host "All $($conns.Count) connections opened — credentials auto-stored via cmdkey." -ForegroundColor Green
Write-Host 'No password prompt — direct login. Press any key to close this window.'
Read-Host | Out-Null
`;

  const b64 = encodeScript(ps);
  const lines: string[] = [];
  lines.push('@echo off');
  lines.push('title RDP Auto Connect — All Instances');
  lines.push('echo.');
  lines.push('echo ======================================================');
  lines.push('echo  Connecting to all saved instances...');
  lines.push('echo  Credentials auto-stored via cmdkey — no password needed');
  lines.push('echo ======================================================');
  lines.push('echo.');
  lines.push('powershell -noprofile -executionpolicy bypass -encodedcommand ' + b64);
  lines.push('for %%F in ("%~dp0connect_all*.bat") do if /i not "%%~fF"=="%~f0" del /q "%%~fF" >nul 2>&1');
  return lines.join('\r\n');
}

function downloadBat(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export default function Instances({ onNavigate }: { onNavigate: (view: 'accounts' | 'finance' | 'instances') => void }) {
  const { isDark, toggleTheme } = useTheme();

  const [ips, setIps] = useState('');
  const [positions, setPositions] = useState('');
  const [savedIps, setSavedIps] = useState<string[]>([]);
  const [savedPositions, setSavedPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'ok' | 'err'>('ok');
  const [showSettings, setShowSettings] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToastType(type);
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d: InstancesData = await loadInstances();
      setIps(d.ips.join('\n'));
      setPositions(d.positions.join('\n'));
      setSavedIps(d.ips);
      setSavedPositions(d.positions);
      setShowSettings(d.ips.length === 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const cleanIps = ips.split('\n').map((s) => s.trim()).filter(Boolean);
  const cleanPos = positions.split('\n').map((s) => s.trim()).filter(Boolean);
  const batContent = useMemo(() => buildConnectAll(cleanIps, cleanPos), [ips, positions]);

  async function handleSave(which: 'ips' | 'positions') {
    const bad = cleanIps.find((ip) => !VALID_IP.test(ip));
    if (bad) { showToast(`Invalid IP: ${bad}`, 'err'); return; }
    setSaving(true);
    setError('');
    try {
      const data: InstancesData = { ips: cleanIps, positions: cleanPos };
      await saveInstances(data);
      setSavedIps(cleanIps);
      setSavedPositions(cleanPos);
      showToast(`Saved ${cleanIps.length} IPs + ${cleanPos.length} positions`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  function resetGrid() {
    const n = cleanIps.length;
    if (n === 0) { showToast('Add IPs first', 'err'); return; }
    const sw = window.screen?.width || 1920;
    const sh = window.screen?.height || 1080;
    const cols = n <= 2 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const w = Math.floor(sw / cols);
    const h = Math.floor(sh / rows);
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = c * w, y = r * h;
      lines.push(`0,1,${x},${y},${x + w},${y + h}`);
    }
    setPositions(lines.join('\n'));
    showToast('Grid generated for your screen — click Save Positions to keep it');
  }

  function handleConnectAll() {
    if (cleanIps.length === 0) { showToast('Add at least one IP first', 'err'); return; }
    downloadBat(batContent, 'connect_all.bat');
    showToast('connect_all.bat downloaded — double-click to auto-connect (cmdkey + mstsc)');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const navItems = [
    { id: 'accounts', label: 'AWS Accounts', icon: '☁' },
    { id: 'instances', label: 'Connect Instance', icon: '🖥' },
    { id: 'finance', label: 'Finance', icon: '₹' },
  ];

  const handleNav = (id: string) => {
    if (id === 'accounts' || id === 'finance' || id === 'instances') onNavigate(id as 'accounts' | 'finance' | 'instances');
  };

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12.5,
    background: active ? 'rgba(0,212,255,0.16)' : 'rgba(0,0,0,0.25)',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    border: active ? '1px solid rgba(0,212,255,0.3)' : '1px solid var(--glass-border)',
    cursor: 'pointer',
  });

  const textareaStyle: React.CSSProperties = {
    width: '100%', minHeight: 220, resize: 'vertical',
    background: 'rgba(0,0,0,0.3)', color: 'var(--text)', border: '1px solid var(--glass-border)',
    borderRadius: 12, padding: 14, fontSize: 13.5, fontFamily: 'monospace', lineHeight: 1.6,
  };

  return (
    <>
      <ThreeBackground />
      <MadeByBadge />
      <Sidebar
        activeItem="instances"
        onNavigate={handleNav}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        items={navItems}
        title="AWS EC2 Pro"
        subtitle="Enterprise Management"
        userBadge={`${savedIps.length} IPs`}
      />
      <div className="main-content">
        <div style={{ maxWidth: 1100 }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6, letterSpacing: -0.5 }} className="gradient-text">
              Connect Instance
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Connect to all running instances at their saved window positions
            </p>
          </div>

          {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: 20 }}>{error}</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 80 }}><Loader3D /></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <button style={toggleBtn(showSettings)} onClick={() => setShowSettings((v) => !v)}>
                  ⚙ {showSettings ? 'Hide' : 'Show'} IPs & Positions
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                  {savedIps.length} IPs · {Math.min(savedIps.length, savedPositions.length)} positions
                </span>
              </div>

              {showSettings && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div className="card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>🌐 AWS Instance IPs</h3>
                        <button className="btn-primary btn-sm" onClick={() => handleSave('ips')} disabled={saving} style={{ padding: '6px 12px', fontSize: 12 }}>
                          {saving ? <span className="spinner" /> : '💾'} Save IPs
                        </button>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
                        One IP per line {savedIps.length > 0 && <span style={{ color: 'var(--success)' }}>· {savedIps.length} saved</span>}
                      </p>
                      <textarea
                        value={ips}
                        onChange={(e) => setIps(e.target.value)}
                        placeholder={'13.232.192.77\n43.204.116.168\n3.108.250.53'}
                        style={textareaStyle}
                      />
                    </div>
                    <div className="card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>🪟 Window Positions</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button className="btn-primary btn-sm" onClick={resetGrid} style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', color: 'var(--primary)' }}>
                            ↺ Reset Grid
                          </button>
                          <button className="btn-primary btn-sm" onClick={() => handleSave('positions')} disabled={saving} style={{ padding: '6px 12px', fontSize: 12 }}>
                            {saving ? <span className="spinner" /> : '💾'} Save Positions
                          </button>
                        </div>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
                        One position per line — matched to IPs in order {savedPositions.length > 0 && <span style={{ color: 'var(--success)' }}>· {savedPositions.length} saved</span>}
                      </p>
                      <textarea
                        value={positions}
                        onChange={(e) => setPositions(e.target.value)}
                        placeholder={'0,1,0,0,384,540\n0,1,384,0,768,540\n0,1,768,0,1152,540'}
                        style={textareaStyle}
                      />
                    </div>
                  </div>

                  {savedIps.length > 0 && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700 }}>Saved Mapping Preview</h3>
                      </div>
                      {savedIps.map((ip, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 12.5 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{i + 1}</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{ip}</span>
                          <span style={{ flex: 1 }} />
                          <span style={{ color: savedPositions[i] ? 'var(--success)' : 'var(--text-muted)' }}>{savedPositions[i] || 'default position'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <button
                    className="btn-primary"
                    onClick={handleConnectAll}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '14px 28px', fontSize: 15, fontWeight: 800,
                      background: 'rgba(0,230,118,0.16)', border: '1px solid rgba(0,230,118,0.45)', color: 'var(--success)',
                    }}
                  >
                    ⚡ RDP Connect All
                  </button>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      Connect to all saved instances
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>
                      Downloads a small launcher file — double-click it to open all connections at their saved positions.
                      Old launcher files are deleted automatically.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <button style={toggleBtn(showLauncher)} onClick={() => setShowLauncher((v) => !v)}>
                  📄 {showLauncher ? 'Hide' : 'View'} Launcher
                </button>
              </div>

              {showLauncher && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700 }}>Launcher file (connect_all.bat)</h3>
                    <div style={{ flex: 1 }} />
                    <button className="btn-primary btn-sm" onClick={() => downloadBat(batContent, 'connect_all.bat')} style={{ padding: '6px 12px', fontSize: 12 }}>
                      ⬇ Download connect_all.bat
                    </button>
                  </div>
                  <pre style={{
                    maxHeight: 360, overflow: 'auto', margin: 0, padding: 14,
                    background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: 12,
                    fontSize: 11.5, fontFamily: 'Consolas, monospace', lineHeight: 1.5, color: 'var(--text-muted)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {batContent}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toastType === 'ok' ? 'toast-success' : 'toast-error'}`}>{toast}</div>}
    </>
  );
}
