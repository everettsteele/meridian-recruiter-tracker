const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Helmet: sensible security headers — CSP disabled since we use inline styles/scripts
const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

// CORS — restrict to same origin by default, allow configured origins
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : null; // null = same-origin only

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS) {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
  } else {
    // In development or single-deploy: allow same-origin requests
    if (origin) res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Cache-Control', 'no-store');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-auth-token, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

const expensiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limited. This is an expensive operation — wait a few minutes.' },
});

const crawlLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limited. Crawls run in background — wait for the current one to finish.' },
});

const cronLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limited.' },
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  globalLimiter,
  expensiveLimiter,
  crawlLimiter,
  cronLimiter,
};
