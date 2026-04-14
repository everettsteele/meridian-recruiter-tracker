const crypto = require('crypto');
const db = require('../db/store');
const { diagLog } = require('../utils');

// Fire-and-forget analytics event. Never throws, never blocks a request.
// Errors are logged via diagLog and swallowed. Caller should not `await`
// this in a hot path, though doing so is safe.
async function logEvent(tenantId, userId, eventType, opts = {}) {
  if (!tenantId || !userId || !eventType) return;
  try {
    const optOut = await db.isAnalyticsOptOut(userId);
    if (optOut) return;
    await db.createProductEvent(
      tenantId, userId, eventType,
      opts.entityType, opts.entityId, opts.payload || {}
    );
  } catch (e) {
    diagLog('logEvent failed: ' + (e.message || e));
  }
}

// Bucket a string length into coarse bins. Used so payloads never leak
// exact content length while still letting us correlate "short vs long"
// cover letters / JDs / notes with outcomes.
function lengthBucket(s) {
  const n = (s || '').length;
  if (n === 0) return 'none';
  if (n < 500) return 'short';
  if (n < 2000) return 'medium';
  return 'long';
}

// Reduce a URL to its hostname. Never returns the full URL or any path.
function urlHost(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; }
}

// Short deterministic hash of a variant slug scoped to a user. Lets us
// compare relative performance of "slot A vs slot B" per user without
// exposing user-chosen variant names (which can contain role titles).
function hashSlug(userId, slug) {
  return crypto.createHash('sha256')
    .update(String(userId) + ':' + String(slug || ''))
    .digest('hex')
    .slice(0, 16);
}

module.exports = { logEvent, lengthBucket, urlHost, hashSlug };
