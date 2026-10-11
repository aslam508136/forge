import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { encrypt } from './crypto.js';
import { supabaseConfigured, oldLogin, fetchUserData } from './supabase.js';

const SECRET = process.env.JWT_SECRET || 'ec2forge-jwt-secret-change-me';

export function signToken(userId) {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: '30d' });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: payload.uid };
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, login again' });
  }
}

// Import old Supabase data (profiles + schedules + auto-configs) into our DB.
// Uses the user's own Supabase token fetched from the password they just typed.
async function importOldData(userId, sbToken) {
  const { profiles, schedules, autos } = await fetchUserData(sbToken);
  const profileMap = new Map();

  for (const p of profiles || []) {
    if (!p || !p.id) continue;
    const dup = await db.one('SELECT id FROM aws_profiles WHERE sb_ref = ?', [String(p.id)]);
    if (dup) { profileMap.set(String(p.id), Number(dup.id)); continue; }
    const rows = await db.query(
      'INSERT INTO aws_profiles (user_id, profile_name, access_key_enc, secret_key_enc, region, sb_ref) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [userId, p.profile_name || 'Imported', encrypt(p.access_key || ''), encrypt(p.secret_key || ''), p.region || 'us-east-1', String(p.id)]
    );
    let nid = rows[0]?.id;
    if (nid === undefined) nid = (await db.one('SELECT id FROM aws_profiles WHERE user_id = ? ORDER BY id DESC', [userId]))?.id;
    if (nid) profileMap.set(String(p.id), Number(nid));
  }

  for (const s of schedules || []) {
    if (!s || !s.id) continue;
    const np = profileMap.get(String(s.profile_id));
    if (!np) continue;
    const dup = await db.one('SELECT id FROM instance_schedules WHERE sb_ref = ?', [String(s.id)]);
    if (dup) continue;
    await db.query(
      'INSERT INTO instance_schedules (profile_id, name, action, time, instance_ids, enabled, last_fired, sb_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [np, s.name || 'Schedule', s.action || 'start', s.time || '09:00', JSON.stringify(s.instance_ids || []), s.enabled === false ? 0 : 1, s.last_fired || null, String(s.id)]
    );
  }

  for (const a of autos || []) {
    if (!a || !a.id) continue;
    const np = profileMap.get(String(a.profile_id));
    if (!np) continue;
    const dup = await db.one('SELECT id FROM instance_auto_config WHERE profile_id = ? AND instance_id = ?', [np, a.instance_id]);
    if (dup) continue;
    await db.query(
      'INSERT INTO instance_auto_config (profile_id, instance_id, auto_enabled, on_time, off_time, shrink_enabled, last_on_fired, last_off_fired, sb_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [np, a.instance_id || '', a.auto_enabled ? 1 : 0, a.on_time || null, a.off_time || null, a.shrink_enabled ? 1 : 0, a.last_on_fired || null, a.last_off_fired || null, String(a.id)]
    );
  }
}

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email aur at least 6 chracters ka password do' });
  }
  try {
    const existing = await db.one('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const rows = await db.query('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id', [email, hash]);
    const userId = rows[0]?.id ?? (await db.one('SELECT id FROM users WHERE email = ?', [email])).id;
    if (supabaseConfigured()) {
      try {
        const sb = await oldLogin(email, password);
        if (sb) await importOldData(userId, sb.accessToken);
      } catch { /* best-effort */ }
    }
    return res.json({ token: signToken(userId) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email aur password do' });
  try {
    let user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
    let ok = !!(user && (await bcrypt.compare(password, user.password_hash)));

    // Old Supabase account? Log in there with the same details and migrate.
    if (!ok && supabaseConfigured()) {
      try {
        const sb = await oldLogin(email, password);
        if (sb) {
          const hash = await bcrypt.hash(password, 10);
          if (!user) {
            const rows = await db.query('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id', [email, hash]);
            const uid = rows[0]?.id ?? (await db.one('SELECT id FROM users WHERE email = ?', [email])).id;
            user = { id: uid };
          } else {
            await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
          }
          await importOldData(Number(user.id), sb.accessToken).catch(() => {});
          return res.json({ token: signToken(user.id), migrated: true });
        }
      } catch { /* fallthrough to 401 */ }
    }

    if (!ok) return res.status(401).json({ error: 'Email ya password galat hai' });
    return res.json({ token: signToken(user.id) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;