const express = require('express');
const { db } = require('../db/init');

const router = express.Router();

// Public: used to populate the branch dropdown on the feedback form.
router.get('/', async (req, res, next) => {
  try {
    const result = await db.execute('SELECT id, name, slug, address FROM branches ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
