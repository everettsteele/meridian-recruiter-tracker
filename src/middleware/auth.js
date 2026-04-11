const { randomUUID } = require('crypto');

const PASSWORD = process.env.AUTH_PASSWORD || '';
const API_KEY = process.env.API_KEY || '';
const sessions = new Set();

function requireAuth(req, res, next) {
  if (!PASSWORD) return next();
  if (API_KEY) {
    const hk = req.headers['x-api-key'] || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    if (hk && hk === API_KEY) return next();
  }
  if (sessions.has(req.headers['x-auth-token'] || req.query.token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function login(password) {
  if (!PASSWORD) return { ok: true, token: 'no-auth' };
  if (password === PASSWORD) {
    const token = randomUUID();
    sessions.add(token);
    return { ok: true, token };
  }
  return null;
}

function isAuthRequired() {
  return !!PASSWORD;
}

module.exports = { requireAuth, login, isAuthRequired, sessions, PASSWORD, API_KEY };
