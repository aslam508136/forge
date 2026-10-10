import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

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
    return res.json({ token: signToken(userId) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email aur password do' });
  try {
    const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email ya password galat hai' });
    }
    return res.json({ token: signToken(user.id) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;