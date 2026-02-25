const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { getDB } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis' });
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Identifiants incorrects' });
  req.session.user = {
    id: user.id, username: user.username, role: user.role,
    full_name: user.full_name, email: user.email,
    must_change_password: user.must_change_password
  };
  res.json({ user: req.session.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Champs requis' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, user.id);
  req.session.user.must_change_password = 0;
  res.json({ ok: true });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Nom d\'utilisateur requis' });
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) return res.json({ ok: true }); // Pas de fuite d'info
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO reset_codes (user_id, code, expires_at) VALUES (?, ?, ?)').run(user.id, code, expires);
  try {
    getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'OphtaPlan - Réinitialisation de mot de passe',
      text: `Votre code de réinitialisation : ${code}\n\nCe code est valable 15 minutes.`
    });
  } catch (e) { console.error('Email non envoyé:', e.message); }
  res.json({ ok: true });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  const { username, code, new_password } = req.body;
  if (!username || !code || !new_password) return res.status(400).json({ error: 'Champs requis' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) return res.status(400).json({ error: 'Utilisateur introuvable' });
  const reset = db.prepare(`SELECT * FROM reset_codes WHERE user_id = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).get(user.id, code);
  if (!reset) return res.status(400).json({ error: 'Code invalide ou expiré' });
  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, user.id);
  db.prepare('UPDATE reset_codes SET used = 1 WHERE id = ?').run(reset.id);
  res.json({ ok: true });
});

module.exports = router;
