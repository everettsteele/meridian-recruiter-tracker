// Super-admin access. Comma-separated emails in ADMIN_EMAILS env var.
const ADMIN_SET = new Set(
  (process.env.ADMIN_EMAILS || 'everett.steele@gmail.com')
    .toLowerCase()
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)
);

function isAdmin(user) {
  if (!user?.email) return false;
  return ADMIN_SET.has(user.email.toLowerCase());
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  res.status(403).json({ error: 'Admin only' });
}

module.exports = { isAdmin, requireAdmin };
