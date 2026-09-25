const express = require('express');
const QRCode = require('qrcode');
const { db } = require('../db/init');

const router = express.Router();

// Public: returns a printable PNG QR code that opens the feedback form
// pre-filled to a specific branch. Point a poster or table-tent QR at
// GET /api/qr/<branch-slug>.png
router.get('/:slug.png', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM branches WHERE slug = :slug',
      args: { slug: req.params.slug },
    });
    const branch = result.rows[0];
    if (!branch) return res.status(404).json({ error: 'Unknown branch.' });

    const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const targetUrl = `${base}/?branch=${branch.slug}`;

    const png = await QRCode.toBuffer(targetUrl, { width: 640, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${branch.slug}-feedback-qr.png"`);
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'Could not generate QR code.' });
  }
});

module.exports = router;
