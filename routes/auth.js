const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db/init');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Slow down brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = :email',
      args: { email: String(email).trim().toLowerCase() },
    });
    const user = result.rows[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    setSessionCookie(res, user);

    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      branch_id: user.branch_id,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
