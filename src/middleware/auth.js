const jwt = require('jsonwebtoken');
const { findUserById, findUserByApiKey } = require('../db/users');

const JWT_SECRET = process.env.JWT_SECRET || 'snag-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

function signToken(user) {
  return jwt.sign(
    { userId: user.id, tenantId: user.tenant_id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return req.headers['x-auth-token'] || req.query.token || null;
}

// Build the req.user context from a user DB row
function buildUserContext(user) {
  return {
    id: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    tenantName: user.tenant_name,
    tenantPlan: user.tenant_plan,
    profile: {
      phone: user.phone,
      emailDisplay: user.email_display,
      linkedinUrl: user.linkedin_url,
      location: user.location,
      backgroundText: user.background_text,
      targetRoles: user.target_roles,
      targetGeography: user.target_geography,
      targetIndustries: user.target_industries,
      dailyOutreachTarget: user.daily_outreach_target,
      slaTarget: user.sla_target,
      weeklyOutreachTarget: user.weekly_outreach_target,
      weeklyAppsTarget: user.weekly_apps_target,
      weeklyEventsTarget: user.weekly_events_target,
      weeklyFollowupsTarget: user.weekly_followups_target,
      signatureStyle: user.signature_style,
      signatureImageUrl: user.signature_image_url,
      signatureClosing: user.signature_closing,
    },
  };
}

// Main auth middleware — sets req.user with full context
async function requireAuth(req, res, next) {
  try {
    // API key path (Chrome extension, scripts)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const user = await findUserByApiKey(apiKey);
      if (!user) return res.status(401).json({ error: 'Invalid API key' });
      req.user = buildUserContext(user);
      return next();
    }

    // JWT path (web app)
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = await findUserById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = buildUserContext(user);
    next();
  } catch (e) {
    console.error('[auth] Error:', e.message);
    res.status(500).json({ error: 'Authentication error' });
  }
}

// Optional auth — sets req.user if token present, but doesn't block
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload) return next();

  try {
    const user = await findUserById(payload.userId);
    if (user) req.user = buildUserContext(user);
  } catch (e) { /* proceed without user context */ }
  next();
}

module.exports = { requireAuth, optionalAuth, signToken, verifyToken, JWT_SECRET };
