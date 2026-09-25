const { createClient } = require('@libsql/client');

// In production, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN point at a hosted
// Turso database — data lives there permanently, independent of Render, so
// redeploys/restarts never lose anything. Locally (no env vars set), this
// falls back to a plain SQLite file on disk, so `npm start` still works
// out of the box for development without needing a Turso account.
const url = process.env.TURSO_DATABASE_URL || 'file:./data/uchumi.db';
const authToken = process.env.TURSO_AUTH_TOKEN; // not needed for the local file fallback

if (!process.env.TURSO_DATABASE_URL) {
  console.warn('[info] TURSO_DATABASE_URL not set — using a local SQLite file (./data/uchumi.db). Data will NOT survive a Render redeploy. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for persistent storage.');
}

const db = createClient(authToken ? { url, authToken } : { url });

async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS branches (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      slug    TEXT NOT NULL UNIQUE,
      address TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('ceo', 'supervisor', 'manager')),
      branch_id     INTEGER REFERENCES branches(id),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feedback (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id       INTEGER NOT NULL REFERENCES branches(id),
      rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      type            TEXT NOT NULL CHECK (type IN ('compliment', 'complaint', 'suggestion')),
      category        TEXT NOT NULL,
      message         TEXT NOT NULL,
      price_product         TEXT,
      price_uchumi           TEXT,
      price_elsewhere         TEXT,
      price_elsewhere_shop     TEXT,
      customer_name   TEXT,
      customer_phone  TEXT,
      customer_email  TEXT,
      consent_given   INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at     TEXT,
      resolved_by     INTEGER REFERENCES users(id)
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_branch ON feedback(branch_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)');

  // Seed the currently trading branches if the table is empty. Update this
  // list (or edit the branches table directly, e.g. via Turso's dashboard)
  // as new stores open.
  const countResult = await db.execute('SELECT COUNT(*) AS n FROM branches');
  const branchCount = Number(countResult.rows[0].n);

  if (branchCount === 0) {
    const seedBranches = [
      { name: "Lang'ata Hyper", slug: 'langata-hyper', address: "Carnivore Way, off Lang'ata Road, Nairobi" },
      { name: 'Unicity Mall', slug: 'unicity-mall', address: 'Thika Road, near Kenyatta University, Nairobi' },
      { name: 'Kitengela', slug: 'kitengela', address: 'Kajiado Road, Kitengela' },
      { name: 'Uchumi Deli', slug: 'uchumi-deli', address: 'In-store bakery & deli counter' },
    ];
    await db.batch(
      seedBranches.map((b) => ({
        sql: 'INSERT INTO branches (name, slug, address) VALUES (:name, :slug, :address)',
        args: b,
      })),
      'write'
    );
    console.log("Seeded 4 branches: Lang'ata Hyper, Unicity Mall, Kitengela, Uchumi Deli");
  }
}

module.exports = { db, initSchema };
