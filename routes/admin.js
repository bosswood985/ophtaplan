const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDB } = require('../db/database');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('admin'));

// GET /api/admin/users
router.get('/users', (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT id, username, role, full_name, email, active, created_at FROM users ORDER BY full_name').all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  if (!username || !password || !role || !full_name || !email) return res.status(400).json({ error: 'Tous les champs sont requis' });
  const validRoles = ['admin','medecin','secretaire','orthoptiste','remplacant'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  const db = getDB();
  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash, role, full_name, email, must_change_password) VALUES (?, ?, ?, ?, ?, 1)').run(username, hash, role, full_name, email);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', (req, res) => {
  const { full_name, email, role, active, password } = req.body;
  const db = getDB();
  if (password) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE users SET must_change_password = 1, password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }
  if (full_name) db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(full_name, req.params.id);
  if (email) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.params.id);
  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDB();
  const conges_pending = db.prepare(`
    SELECT c.*, u.full_name, u.role FROM conges c
    JOIN users u ON c.user_id = u.id
    WHERE c.status = 'en_attente' AND c.type = 'conge'
    ORDER BY c.created_at DESC
  `).all();
  const remplacements_pending = db.prepare(`
    SELECT r.*, u.full_name as remplacant_name, m.full_name as medecin_name
    FROM remplacements r
    JOIN users u ON r.remplacant_id = u.id
    JOIN users m ON r.medecin_id = m.id
    WHERE r.status = 'en_attente'
    ORDER BY r.date ASC
  `).all();
  res.json({ conges_pending, remplacements_pending });
});

// POST /api/admin/conges/:id/decision
router.post('/conges/:id/decision', (req, res) => {
  const { status, admin_comment } = req.body;
  if (!['approuve','refuse'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  const db = getDB();
  db.prepare('UPDATE conges SET status = ?, admin_comment = ? WHERE id = ?').run(status, admin_comment || null, req.params.id);
  res.json({ ok: true });
});

// POST /api/admin/remplacements/:id/decision
router.post('/remplacements/:id/decision', (req, res) => {
  const { status, admin_comment } = req.body;
  if (!['approuve','refuse'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  const db = getDB();
  db.prepare('UPDATE remplacements SET status = ?, admin_comment = ? WHERE id = ?').run(status, admin_comment || null, req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/quotas/:userId/:year
router.get('/quotas/:userId/:year', (req, res) => {
  const db = getDB();
  const quota = db.prepare('SELECT * FROM quota_conges WHERE user_id = ? AND year = ?').get(req.params.userId, req.params.year);
  res.json(quota || { user_id: req.params.userId, year: req.params.year, jours_alloues: 25 });
});

// PUT /api/admin/quotas
router.put('/quotas', (req, res) => {
  const { user_id, year, jours_alloues } = req.body;
  const db = getDB();
  db.prepare('INSERT INTO quota_conges (user_id, year, jours_alloues) VALUES (?, ?, ?) ON CONFLICT(user_id, year) DO UPDATE SET jours_alloues = excluded.jours_alloues').run(user_id, year, jours_alloues);
  res.json({ ok: true });
});

// GET /api/admin/all-events
router.get('/all-events', (req, res) => {
  const { year, month } = req.query;
  const db = getDB();
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end = `${year}-${String(month).padStart(2,'0')}-31`;
  const conges = db.prepare(`
    SELECT c.*, u.full_name, u.role FROM conges c
    JOIN users u ON c.user_id = u.id
    WHERE (c.start_date <= ? AND c.end_date >= ?)
    ORDER BY c.start_date
  `).all(end, start);
  const remplacements = db.prepare(`
    SELECT r.*, u.full_name as remplacant_name, m.full_name as medecin_name
    FROM remplacements r
    JOIN users u ON r.remplacant_id = u.id
    JOIN users m ON r.medecin_id = m.id
    WHERE r.date BETWEEN ? AND ?
  `).all(start, end);
  res.json({ conges, remplacements });
});

module.exports = router;
