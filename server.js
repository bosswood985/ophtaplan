require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const { initDB } = require('./db/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const calendarRoutes = require('./routes/calendar');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB
initDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'ophtaplan_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 8 * 60 * 60 * 1000 // 8 heures
  }
}));

app.use(flash());

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/users', userRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OphtaPlan démarré sur http://localhost:${PORT}`);
});
