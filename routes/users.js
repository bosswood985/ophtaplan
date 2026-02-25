const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/users/quota?year=2026
router.get('/quota', (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const db = getDB();
  const user = req.session.user;
  const quota = db.prepare('SELECT * FROM quota_conges WHERE user_id = ? AND year = ?').get(user.id, year);
  const pris = db.prepare(`
    SELECT SUM(
      (julianday(MIN(end_date, ? || '-12-31')) - julianday(MAX(start_date, ? || '-01-01')) + 1)
    ) as total
    FROM conges WHERE user_id = ? AND type = 'conge' AND status = 'approuve'
    AND start_date <= ? || '-12-31' AND end_date >= ? || '-01-01'
  `).get(year, year, user.id, year, year);
  res.json({
    jours_alloues: quota ? quota.jours_alloues : 25,
    jours_pris: pris.total || 0
  });
});

module.exports = router;
