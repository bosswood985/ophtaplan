const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/calendar/jours-feries?year=2026
router.get('/jours-feries', (req, res) => {
  const { year } = req.query;
  const db = getDB();
  const jf = year
    ? db.prepare("SELECT * FROM jours_feries WHERE date LIKE ? ORDER BY date").all(`${year}-%`)
    : db.prepare('SELECT * FROM jours_feries ORDER BY date').all();
  res.json(jf);
});

// GET /api/calendar/my-events?year=2026&month=2
router.get('/my-events', (req, res) => {
  const { year, month } = req.query;
  const db = getDB();
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end = `${year}-${String(month).padStart(2,'0')}-31`;
  const user = req.session.user;
  const conges = db.prepare(`
    SELECT * FROM conges WHERE user_id = ? AND (start_date <= ? AND end_date >= ?)
    ORDER BY start_date
  `).all(user.id, end, start);
  let remplacements = [];
  if (user.role === 'remplacant') {
    remplacements = db.prepare(`
      SELECT r.*, m.full_name as medecin_name FROM remplacements r
      JOIN users m ON r.medecin_id = m.id
      WHERE r.remplacant_id = ? AND r.date BETWEEN ? AND ?
    `).all(user.id, start, end);
  }
  res.json({ conges, remplacements });
});

// GET /api/calendar/disponibilites?year=2026&month=2 (pour les remplacants)
router.get('/disponibilites', (req, res) => {
  const { year, month } = req.query;
  const db = getDB();
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end = `${year}-${String(month).padStart(2,'0')}-31`;
  const disponibilites = db.prepare(`
    SELECT c.start_date, c.end_date, u.id as medecin_id, u.full_name as medecin_name
    FROM conges c
    JOIN users u ON c.user_id = u.id
    WHERE c.type = 'indisponibilite' AND c.status = 'approuve'
    AND (c.start_date <= ? AND c.end_date >= ?)
    ORDER BY c.start_date
  `).all(end, start);
  res.json(disponibilites);
});

// POST /api/calendar/conges
router.post('/conges', (req, res) => {
  const { start_date, end_date, type, note } = req.body;
  const user = req.session.user;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Dates requises' });
  if (end_date < start_date) return res.status(400).json({ error: 'Date de fin invalide' });
  const validTypes = ['conge'];
  if (user.role === 'medecin') validTypes.push('indisponibilite');
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  const db = getDB();
  const status = type === 'indisponibilite' ? 'approuve' : 'en_attente';
  const result = db.prepare('INSERT INTO conges (user_id, start_date, end_date, type, status, note) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, start_date, end_date, type, status, note || null);
  res.json({ id: result.lastInsertRowid });
});

// DELETE /api/calendar/conges/:id
router.delete('/conges/:id', (req, res) => {
  const db = getDB();
  const conge = db.prepare('SELECT * FROM conges WHERE id = ?').get(req.params.id);
  if (!conge) return res.status(404).json({ error: 'Introuvable' });
  if (conge.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  if (conge.status === 'approuve' && req.session.user.role !== 'admin') {
    return res.status(400).json({ error: 'Impossible d\'annuler un congé déjà approuvé' });
  }
  db.prepare('DELETE FROM conges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/calendar/remplacements
router.post('/remplacements', (req, res) => {
  const { medecin_id, date, note } = req.body;
  const user = req.session.user;
  if (user.role !== 'remplacant') return res.status(403).json({ error: 'Rôle requis: remplacant' });
  if (!medecin_id || !date) return res.status(400).json({ error: 'Champs requis' });
  const db = getDB();
  // Vérifier que le médecin est bien indisponible ce jour
  const dispo = db.prepare(`
    SELECT * FROM conges WHERE user_id = ? AND type = 'indisponibilite' AND status = 'approuve'
    AND start_date <= ? AND end_date >= ?
  `).get(medecin_id, date, date);
  if (!dispo) return res.status(400).json({ error: 'Le médecin n\'est pas marqué indisponible ce jour' });
  const existing = db.prepare('SELECT id FROM remplacements WHERE remplacant_id = ? AND medecin_id = ? AND date = ?').get(user.id, medecin_id, date);
  if (existing) return res.status(409).json({ error: 'Demande déjà soumise pour ce jour' });
  const result = db.prepare('INSERT INTO remplacements (remplacant_id, medecin_id, date, note) VALUES (?, ?, ?, ?)').run(user.id, medecin_id, date, note || null);
  res.json({ id: result.lastInsertRowid });
});

module.exports = router;
