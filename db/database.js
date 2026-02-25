const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'ophtaplan.db');
let db;

function getDB() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

// Calcul de Pâques (algorithme de Butcher)
function getEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(date) {
  return date.toISOString().split('T')[0];
}

function getJoursFeries(year) {
  const easter = getEaster(year);
  return [
    { date: `${year}-01-01`, label: '1er Janvier' },
    { date: fmt(addDays(easter, 1)), label: 'Lundi de Pâques' },
    { date: `${year}-05-01`, label: 'Fête du Travail' },
    { date: `${year}-05-08`, label: 'Victoire 1945' },
    { date: fmt(addDays(easter, 39)), label: 'Ascension' },
    { date: fmt(addDays(easter, 50)), label: 'Lundi de Pentecôte' },
    { date: `${year}-07-14`, label: 'Fête Nationale' },
    { date: `${year}-08-15`, label: 'Assomption' },
    { date: `${year}-11-01`, label: 'Toussaint' },
    { date: `${year}-11-11`, label: 'Armistice' },
    { date: `${year}-12-25`, label: 'Noël' },
  ];
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','medecin','secretaire','orthoptiste','remplacant')),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      must_change_password INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jours_feries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('conge','indisponibilite')),
      status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','approuve','refuse')),
      note TEXT,
      admin_comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS quota_conges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      jours_alloues INTEGER DEFAULT 25,
      UNIQUE(user_id, year),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS remplacements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remplacant_id INTEGER NOT NULL,
      medecin_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','approuve','refuse')),
      note TEXT,
      admin_comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(remplacant_id) REFERENCES users(id),
      FOREIGN KEY(medecin_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reset_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Seed jours fériés
  const currentYear = new Date().getFullYear();
  [currentYear, currentYear + 1].forEach(year => {
    getJoursFeries(year).forEach(jf => {
      db.prepare(`INSERT OR IGNORE INTO jours_feries (date, label) VALUES (?, ?)`).run(jf.date, jf.label);
    });
  });

  // Compte admin par défaut
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('Admin1234!', 12);
    db.prepare(`INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
      VALUES (?, ?, 'admin', 'Administrateur', 'admin@ophtaplan.fr', 1)`).run('admin', hash);
    console.log('Compte admin créé : admin / Admin1234!');
  }

  return db;
}

module.exports = { getDB, initDB, getJoursFeries };
