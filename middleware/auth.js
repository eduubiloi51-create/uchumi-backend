const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'uchumi_session';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-long-random-string') {
  console.warn(
    '[warning] JWT_SECRET is not set to a real secret. Set a long random ' +
      'value in your .env file before deploying to production.'
  );
}

// The frontend and this API are on different domains (customer-site /
// staff-dashboard on Vercel, this on Render), so the session cookie needs
// SameSite=None + Secure to be sent cross-site at all. Any code that sets
// OR clears this cookie must use the exact same options, or the browser
// won't recognize it as the same cookie — clearCookie() silently does
// nothing if its options don't match the cookie actually stored.
const crossSite = Boolean(process.env.ALLOWED_ORIGINS);
const cookieOptions = {
  httpOnly: true,
  secure: crossSite || process.env.NODE_ENV === 'production',
  sameSite: crossSite ? 'none' : 'lax',
};

function signSession(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, branch_id: user.branch_id },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

module.exports = { COOKIE_NAME, signSession, setSessionCookie, clearSessionCookie, requireAuth, requireRole };
