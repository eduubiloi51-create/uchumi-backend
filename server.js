require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { initSchema } = require('./db/init');

const app = express();

// This is an API-only service — the customer site and staff dashboard are
// separate deployments (their own repos/hosting), so they call this API
// cross-origin. Set ALLOWED_ORIGINS to a comma-separated list of the exact
// URLs allowed to do that, e.g.:
//   ALLOWED_ORIGINS=https://uchumi-feedback.vercel.app,https://uchumi-dashboard.vercel.app
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests, curl, health checks, etc. have no Origin header.
      // Unrecognized origins simply don't get CORS headers back — the
      // browser then blocks the response client-side — rather than the
      // server throwing an error.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // just a small status page, see public/index.html

app.use('/api/branches', require('./routes/branches'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/users', require('./routes/users'));
app.use('/api/qr', require('./routes/qr'));
app.use('/api/setup', require('./routes/setup'));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

const PORT = process.env.PORT || 4000;

// Schema creation (and branch seeding) is now a network call to Turso
// rather than an instant local file operation, so it has to finish before
// we start accepting requests.
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Uchumi feedback platform running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize the database:', err);
    process.exit(1);
  });
