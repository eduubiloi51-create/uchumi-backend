/**
 * Creates or updates a staff account (CEO, supervisor, or manager).
 *
 * Usage:
 *   node scripts/create-admin.js --name "Jane Wanjiru" --email jane@uchumi.co.ke \
 *     --password "a-strong-password" --role ceo
 *
 *   node scripts/create-admin.js --name "Peter Otieno" --email peter@uchumi.co.ke \
 *     --password "a-strong-password" --role manager --branch kitengela
 *
 * Note: the /setup.html admin page (gated by SETUP_KEY) does the same thing
 * from a browser, with no server/terminal access needed — usually easier.
 * This script is here for local development or if you have shell access.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initSchema } = require('../db/init');

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const name = arg('name');
const email = arg('email');
const password = arg('password');
const role = arg('role', 'manager');
const branchSlug = arg('branch');

async function main() {
  if (!name || !email || !password) {
    console.error('Usage: node scripts/create-admin.js --name "..." --email "..." --password "..." --role ceo|supervisor|manager [--branch <slug>]');
    process.exit(1);
  }
  if (!['ceo', 'supervisor', 'manager'].includes(role)) {
    console.error('--role must be "ceo", "supervisor", or "manager"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  await initSchema();

  let branch_id = null;
  if (role === 'manager') {
    if (!branchSlug) {
      console.error('Managers need --branch <slug>. Available branches:');
      const branchesResult = await db.execute('SELECT slug, name FROM branches');
      for (const b of branchesResult.rows) {
        console.error(`  ${b.slug}  (${b.name})`);
      }
      process.exit(1);
    }
    const branchResult = await db.execute({ sql: 'SELECT id FROM branches WHERE slug = :slug', args: { slug: branchSlug } });
    const branch = branchResult.rows[0];
    if (!branch) {
      console.error(`No branch with slug "${branchSlug}".`);
      process.exit(1);
    }
    branch_id = branch.id;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const emailNorm = email.toLowerCase();
  const existingResult = await db.execute({ sql: 'SELECT id FROM users WHERE email = :email', args: { email: emailNorm } });
  const existing = existingResult.rows[0];

  if (existing) {
    await db.execute({
      sql: 'UPDATE users SET name = :name, password_hash = :password_hash, role = :role, branch_id = :branch_id WHERE id = :id',
      args: { name, password_hash, role, branch_id, id: existing.id },
    });
    console.log(`Updated existing account for ${emailNorm} (${role}).`);
  } else {
    await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash, role, branch_id) VALUES (:name, :email, :password_hash, :role, :branch_id)',
      args: { name, email: emailNorm, password_hash, role, branch_id },
    });
    console.log(`Created ${role} account for ${emailNorm}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
