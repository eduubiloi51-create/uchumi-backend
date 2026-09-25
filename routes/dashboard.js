const express = require('express');
const { db } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Managers are locked to their own branch; the CEO can see everything or
// filter down to one branch via the query string.
function resolveBranchFilter(req) {
  if (req.user.role === 'manager') return req.user.branch_id;
  const q = req.query.branch_id;
  return q && q !== 'all' ? Number(q) : null;
}

function buildWhere(req) {
  const clauses = [];
  const params = {};

  const branchId = resolveBranchFilter(req);
  if (branchId) {
    clauses.push('branch_id = :branch_id');
    params.branch_id = branchId;
  }
  if (req.query.type) {
    clauses.push('type = :type');
    params.type = req.query.type;
  }
  if (req.query.category) {
    clauses.push('category = :category');
    params.category = req.query.category;
  }
  if (req.query.status) {
    clauses.push('status = :status');
    params.status = req.query.status;
  }
  if (req.query.rating) {
    clauses.push('rating = :rating');
    params.rating = Number(req.query.rating);
  }
  if (req.query.from) {
    clauses.push('date(created_at) >= date(:from)');
    params.from = req.query.from;
  }
  if (req.query.to) {
    clauses.push('date(created_at) <= date(:to)');
    params.to = req.query.to;
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

router.get('/stats', async (req, res, next) => {
  try {
    const { where, params } = buildWhere(req);

    const totalsResult = await db.execute({
      sql: `SELECT COUNT(*) AS total, AVG(rating) AS avg_rating FROM feedback ${where}`,
      args: params,
    });
    const totals = totalsResult.rows[0];

    const complaintsResult = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM feedback ${where} ${where ? 'AND' : 'WHERE'} type = 'complaint'`,
      args: params,
    });
    const complaints = Number(complaintsResult.rows[0].n);

    const openComplaintsResult = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM feedback ${where} ${where ? 'AND' : 'WHERE'} type = 'complaint' AND status != 'resolved'`,
      args: params,
    });
    const openComplaints = Number(openComplaintsResult.rows[0].n);

    const byRatingResult = await db.execute({
      sql: `SELECT rating, COUNT(*) AS n FROM feedback ${where} GROUP BY rating ORDER BY rating`,
      args: params,
    });

    const byCategoryResult = await db.execute({
      sql: `SELECT category, COUNT(*) AS n FROM feedback ${where} GROUP BY category ORDER BY n DESC`,
      args: params,
    });

    const byBranchResult = await db.execute({
      sql: `SELECT b.name AS branch, COUNT(f.id) AS n, AVG(f.rating) AS avg_rating
            FROM branches b LEFT JOIN feedback f ON f.branch_id = b.id
            ${where.replace('branch_id', 'f.branch_id')}
            GROUP BY b.id ORDER BY b.name`,
      args: params,
    });

    const trendResult = await db.execute({
      sql: `SELECT date(created_at) AS day, COUNT(*) AS n, AVG(rating) AS avg_rating
            FROM feedback ${where}
            GROUP BY day ORDER BY day DESC LIMIT 30`,
      args: params,
    });

    res.json({
      total: Number(totals.total),
      avg_rating: totals.avg_rating ? Number(Number(totals.avg_rating).toFixed(2)) : null,
      complaints,
      open_complaints: openComplaints,
      by_rating: byRatingResult.rows.map((r) => ({ rating: r.rating, n: Number(r.n) })),
      by_category: byCategoryResult.rows.map((r) => ({ category: r.category, n: Number(r.n) })),
      by_branch: byBranchResult.rows.map((r) => ({
        branch: r.branch,
        n: Number(r.n),
        avg_rating: r.avg_rating != null ? Number(r.avg_rating) : null,
      })),
      trend: [...trendResult.rows]
        .map((r) => ({ day: r.day, n: Number(r.n), avg_rating: r.avg_rating != null ? Number(r.avg_rating) : null }))
        .reverse(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/feedback', async (req, res, next) => {
  try {
    const { where, params } = buildWhere(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;

    const totalResult = await db.execute({ sql: `SELECT COUNT(*) AS n FROM feedback ${where}`, args: params });
    const total = Number(totalResult.rows[0].n);

    const rowsResult = await db.execute({
      sql: `SELECT f.*, b.name AS branch_name
            FROM feedback f JOIN branches b ON b.id = f.branch_id
            ${where}
            ORDER BY f.created_at DESC
            LIMIT :limit OFFSET :offset`,
      args: { ...params, limit: pageSize, offset },
    });

    res.json({ total, page, pageSize, rows: rowsResult.rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/feedback/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['new', 'in_review', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const rowResult = await db.execute({ sql: 'SELECT * FROM feedback WHERE id = :id', args: { id: Number(req.params.id) } });
    const row = rowResult.rows[0];
    if (!row) return res.status(404).json({ error: 'Feedback entry not found.' });
    if (req.user.role === 'manager' && row.branch_id !== req.user.branch_id) {
      return res.status(403).json({ error: 'You can only update feedback for your own branch.' });
    }

    await db.execute({
      sql: `UPDATE feedback SET status = :status,
              resolved_at = CASE WHEN :status = 'resolved' THEN datetime('now') ELSE NULL END,
              resolved_by = CASE WHEN :status = 'resolved' THEN :user_id ELSE NULL END
            WHERE id = :id`,
      args: { status, user_id: req.user.id, id: Number(req.params.id) },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const { where, params } = buildWhere(req);
    const rowsResult = await db.execute({
      sql: `SELECT f.created_at, b.name AS branch, f.rating, f.type, f.category, f.status,
                   f.message, f.price_product, f.price_uchumi, f.price_elsewhere, f.price_elsewhere_shop,
                   f.customer_name, f.customer_phone, f.customer_email
            FROM feedback f JOIN branches b ON b.id = f.branch_id
            ${where}
            ORDER BY f.created_at DESC`,
      args: params,
    });

    const header = [
      'Date', 'Branch', 'Rating', 'Type', 'Category', 'Status', 'Message',
      'Product', 'Price at Uchumi', 'Price elsewhere', 'Seen at',
      'Customer name', 'Customer phone', 'Customer email',
    ];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...rowsResult.rows.map((r) =>
        [
          r.created_at, r.branch, r.rating, r.type, r.category, r.status, r.message,
          r.price_product, r.price_uchumi, r.price_elsewhere, r.price_elsewhere_shop,
          r.customer_name, r.customer_phone, r.customer_email,
        ]
          .map(escape)
          .join(',')
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="uchumi-feedback-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
