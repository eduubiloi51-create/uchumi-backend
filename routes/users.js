const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/init');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ceo'));

router.get('/', async (req, res, next) => {
  try {
    const result = await db.execute(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id, b.name AS branch_name, u.created_at
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.role, u.name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role, branch_id } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required.' });
    }
    if (!['ceo', 'supervisor', 'manager'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "ceo", "supervisor", or "manager".' });
    }
    if (role === 'manager' && !branch_id) {
      return res.status(400).json({ error: 'Managers must be assigned to a branch.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const emailNorm = String(email).toLowerCase();
    const existingResult = await db.execute({
      sql: 'SELECT id FROM users WHERE email = :email',
      args: { email: emailNorm },
    });
    if (existingResult.rows[0]) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const info = await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash, role, branch_id) VALUES (:name, :email, :password_hash, :role, :branch_id)',
      args: {
        name,
        email: emailNorm,
        password_hash,
        role,
        branch_id: role === 'manager' ? Number(branch_id) : null,
      },
    });

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove your own account.' });
    }
    await db.execute({ sql: 'DELETE FROM users WHERE id = :id', args: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
