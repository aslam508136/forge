import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import authRouter, { authRequired } from './auth.js';
import { encrypt, decrypt } from './crypto.js';
import * as aws from './aws.js';
import { startScheduler } from './scheduler.js';

const app = express();
app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const api = express.Router();
api.use(authRequired);

async function loadProfile(userId, profileId) {
  const prof = await db.one('SELECT * FROM aws_profiles WHERE id = ? AND user_id = ?', [profileId, userId]);
  if (!prof) throw { status: 404, message: 'Profile nahi mila' };
  prof.access_key = decrypt(prof.access_key_enc);
  prof.secret_key = decrypt(prof.secret_key_enc);
  if (!prof.access_key || !prof.secret_key) throw { status: 500, message: 'Keys decrypt nahi huin (FORGE_KEY/IV problem)' };
  delete prof.access_key_enc;
  delete prof.secret_key_enc;
  return prof;
}

// ---- Profiles ----
api.get('/profiles', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM aws_profiles WHERE user_id = ? ORDER BY id', [req.user.id]);
    res.json(rows.map((p) => ({ ...p, access_key_enc: undefined, secret_key_enc: undefined, access_key_masked: p.access_key_enc?.slice(0, 8) + '…' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

api.post('/profiles', async (req, res) => {
  const { profile_name, access_key, secret_key, region } = req.body || {};
  if (!profile_name || !access_key || !secret_key) return res.status(400).json({ error: 'Name, Access key aur Secret key required' });
  try {
    const rows = await db.query(
      'INSERT INTO aws_profiles (user_id, profile_name, access_key_enc, secret_key_enc, region) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [req.user.id, profile_name, encrypt(access_key), encrypt(secret_key), region || 'us-east-1']
    );
    res.json({ id: rows[0]?.id ?? (await db.one('SELECT id FROM aws_profiles WHERE user_id = ? ORDER BY id DESC', [req.user.id])).id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

api.put('/profiles/:id', async (req, res) => {
  try {
    const { profile_name, access_key, secret_key, region } = req.body || {};
    const existing = await loadProfile(req.user.id, req.params.id);
    const fields = [];
    const vals = [];
    if (profile_name !== undefined) { fields.push('profile_name = ?'); vals.push(profile_name); }
    if (access_key) { fields.push('access_key_enc = ?'); vals.push(encrypt(access_key)); }
    if (secret_key) { fields.push('secret_key_enc = ?'); vals.push(encrypt(secret_key)); }
    if (region !== undefined) { fields.push('region = ?'); vals.push(region); }
    if (!fields.length) throw { status: 400, message: 'Kuch to update karo' };
    vals.push(req.params.id, req.user.id);
    await db.query(`UPDATE aws_profiles SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

api.delete('/profiles/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM aws_profiles WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- EC2 ----
api.post('/ec2/:profileId/:action', async (req, res) => {
  try {
    const prof = await loadProfile(req.user.id, req.params.profileId);
    const client = aws.makeClient(prof);
    const creds = { accessKey: prof.access_key, secretKey: prof.secret_key, region: prof.region };
    const result = await aws.awsAction(req.params.action, client, creds, req.body || {});
    res.json(result);
  } catch (e) {
    const msg = e.status ? e.message : (e.name === 'UnrecognizedClientException' || /Invalid.*Credential/i.test(e.message || '') ? 'AWS keys galat hai ya permission nahi' : (e.message || String(e)));
    res.status(e.status || 400).json({ error: msg });
  }
});

// ---- Schedules ----
api.get('/schedules/:profileId', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM instance_schedules WHERE profile_id = ?', [req.params.profileId]);
    res.json(rows.map((r) => ({ ...r, instance_ids: JSON.parse(r.instance_ids || '[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

api.post('/schedules/:profileId', async (req, res) => {
  const { name, action, time, instance_ids, enabled } = req.body || {};
  if (!name || !['start', 'stop'].includes(action) || !time) return res.status(400).json({ error: 'Name, action (start/stop), time required' });
  try {
    const rows = await db.query(
      'INSERT INTO instance_schedules (profile_id, name, action, time, instance_ids, enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.profileId, name, action, time, JSON.stringify(instance_ids || []), enabled === false ? false : true]
    );
    let id = rows[0]?.id;
    if (id === undefined) {
      const last = await db.one('SELECT id FROM instance_schedules ORDER BY id DESC LIMIT 1');
      id = last?.id ?? null;
    }
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

api.put('/schedules/:id', async (req, res) => {
  try {
    const row = await db.one('SELECT * FROM instance_schedules WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Schedule nahi mila' });
    const fields = [];
    const vals = [];
    for (const k of ['name', 'action', 'time', 'enabled']) {
      if (req.body[k] !== undefined) { fields.push(`${k} = ?`); vals.push(req.body[k]); }
    }
    if (req.body.instance_ids !== undefined) { fields.push('instance_ids = ?'); vals.push(JSON.stringify(req.body.instance_ids)); }
    if (!fields.length) return res.status(400).json({ error: 'Kuch to update karo' });
    vals.push(req.params.id);
    await db.query(`UPDATE instance_schedules SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

api.delete('/schedules/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM instance_schedules WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Auto config ----
api.get('/auto-configs/:profileId', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM instance_auto_config WHERE profile_id = ?', [req.params.profileId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function upsertAuto(profileId, instanceId, body) {
  const { auto_enabled, on_time, off_time, shrink_enabled } = body || {};
  const existing = await db.one('SELECT * FROM instance_auto_config WHERE profile_id = ? AND instance_id = ?', [profileId, instanceId]);
  if (existing) {
    await db.query(
      'UPDATE instance_auto_config SET auto_enabled = ?, on_time = ?, off_time = ?, shrink_enabled = ?, shrunk_on = NULL WHERE profile_id = ? AND instance_id = ?',
      [!!auto_enabled, on_time || null, off_time || null, !!shrink_enabled, profileId, instanceId]
    );
  } else {
    await db.query(
      'INSERT INTO instance_auto_config (profile_id, instance_id, auto_enabled, on_time, off_time, shrink_enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [profileId, instanceId, !!auto_enabled, on_time || null, off_time || null, !!shrink_enabled]
    );
  }
}

api.post('/auto-configs/:profileId/:instanceId', async (req, res) => {
  try {
    await upsertAuto(req.params.profileId, req.params.instanceId, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

api.delete('/auto-configs/:profileId/:instanceId', async (req, res) => {
  try {
    await db.query('DELETE FROM instance_auto_config WHERE profile_id = ? AND instance_id = ?', [req.params.profileId, req.params.instanceId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api', api);

// ---- Static frontend (build/dist) ----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[server] running on :${PORT}`);
  startScheduler();
});