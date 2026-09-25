const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db/init');

const router = express.Router();

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function checkKey(key) {
  const expected = process.env.SETUP_KEY;
  if (!expected) return { ok: false, error: 'SETUP_KEY is not configured on the server.' };
  if (key !== expected) return { ok: false, error: 'Incorrect setup key.' };
  return { ok: true };
}

// GET /api/setup/staff?setup_key=... — lists every staff account plus the
// branch list, so the admin page can show who exists and populate the
// branch dropdown. Gated by SETUP_KEY, works any time.
router.get('/staff', setupLimiter, async (req, res, next) => {
  try {
    const chk = checkKey(req.query.setup_key);
    if (!chk.ok) return res.status(403).json({ error: chk.error });

    const staffResult = await db.execute(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.role, u.name`
    );
    const branchesResult = await db.execute('SELECT id, name, slug FROM branches ORDER BY name');

    res.json({ staff: staffResult.rows, branches: branchesResult.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/setup/create-staff — creates a CEO, supervisor, or manager
// account. Gated by SETUP_KEY, works any time (not a one-time-only thing),
// so it doubles as your recovery tool if you ever get locked out.
router.post('/create-staff', setupLimiter, async (req, res, next) => {
  try {
    const { name, email, password, role, branch_id, setup_key } = req.body || {};
    const chk = checkKey(setup_key);
    if (!chk.ok) return res.status(403).json({ error: chk.error });

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are all required.' });
    }
    if (!['ceo', 'supervisor', 'manager'].includes(role)) {
      return res.status(400).json({ error: 'Role must be ceo, supervisor, or manager.' });
    }
    if (role === 'manager' && !branch_id) {
      return res.status(400).json({ error: 'Managers must be assigned to a branch.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const existingResult = await db.execute({
      sql: 'SELECT id FROM users WHERE email = :email',
      args: { email: emailNorm },
    });
    if (existingResult.rows[0]) {
      return res.status(409).json({ error: 'An account with that email already exists. Use the reset-password tool instead.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash, role, branch_id) VALUES (:name, :email, :password_hash, :role, :branch_id)',
      args: {
        name,
        email: emailNorm,
        password_hash,
        role,
        branch_id: role === 'manager' ? Number(branch_id) : null,
      },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/setup/staff/:id?setup_key=... — removes a staff account.
router.delete('/staff/:id', setupLimiter, async (req, res, next) => {
  try {
    const chk = checkKey(req.query.setup_key);
    if (!chk.ok) return res.status(403).json({ error: chk.error });

    await db.execute({ sql: 'DELETE FROM users WHERE id = :id', args: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/setup/reset-password — resets any account's password. Gated by
// SETUP_KEY, works any time.
router.post('/reset-password', setupLimiter, async (req, res, next) => {
  try {
    const { email, new_password, setup_key } = req.body || {};
    const chk = checkKey(setup_key);
    if (!chk.ok) return res.status(403).json({ error: chk.error });

    if (!email || !new_password) {
      return res.status(400).json({ error: 'Email and new password are required.' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const userResult = await db.execute({ sql: 'SELECT id FROM users WHERE email = :email', args: { email: emailNorm } });
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'No account with that email.' });
    }

    const password_hash = bcrypt.hashSync(new_password, 10);
    await db.execute({
      sql: 'UPDATE users SET password_hash = :password_hash WHERE id = :id',
      args: { password_hash, id: user.id },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/setup/update-name — changes an existing account's display name
// (the email itself stays the same, since that's the login identifier).
// Gated by SETUP_KEY, works any time.
router.post('/update-name', setupLimiter, async (req, res, next) => {
  try {
    const { email, new_name, setup_key } = req.body || {};
    const chk = checkKey(setup_key);
    if (!chk.ok) return res.status(403).json({ error: chk.error });

    if (!email || !new_name || !String(new_name).trim()) {
      return res.status(400).json({ error: 'Email and new name are required.' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const userResult = await db.execute({ sql: 'SELECT id FROM users WHERE email = :email', args: { email: emailNorm } });
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'No account with that email.' });
    }

    await db.execute({
      sql: 'UPDATE users SET name = :name WHERE id = :id',
      args: { name: String(new_name).trim(), id: user.id },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
