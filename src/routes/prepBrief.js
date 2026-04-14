const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { expensiveLimiter } = require('../middleware/security');
const { validate, schemas } = require('../middleware/validate');
const { isPro, logAiUsage } = require('../middleware/tier');
const db = require('../db/store');
const { fetchJobDescription } = require('../services/anthropic');
const { buildPrepBrief } = require('../services/prepBrief');
const { getResumeVariants } = require('../db/users');
const { logEvent, lengthBucket } = require('../services/events');

const router = Router();

function requireInterviewing(app) {
  return app && app.status === 'interviewing';
}

// GET /applications/:id/prep-brief — returns cached brief or null.
router.get('/applications/:id/prep-brief', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (!isPro(req.user)) {
    return res.status(403).json({ error: 'Interview prep is a Pro feature', upgrade: true });
  }
  if (!requireInterviewing(app)) {
    return res.status(400).json({ error: 'Prep brief unlocks at Interviewing status' });
  }

  const brief = await db.getApplicationPrepBrief(req.user.tenantId, req.params.id);
  res.json({ brief });
});

// POST /applications/:id/prep-brief/build — generate (or regenerate with { refresh: true }).
router.post('/applications/:id/prep-brief/build',
  requireAuth, expensiveLimiter, validate(schemas.prepBriefBuildRequest),
  async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    const app = await db.getApplication(req.user.tenantId, req.params.id);
    if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    if (!isPro(req.user)) {
      return res.status(403).json({ error: 'Interview prep is a Pro feature', upgrade: true });
    }
    if (!requireInterviewing(app)) {
      return res.status(400).json({ error: 'Prep brief unlocks at Interviewing status' });
    }

    // Return cache unless refresh requested.
    const existing = await db.getApplicationPrepBrief(req.user.tenantId, req.params.id);
    if (existing && !req.body?.refresh) {
      return res.json({ brief: existing, cached: true });
    }

    // Ensure JD cached.
    let jdText = app.jd_text || '';
    if (!jdText && app.source_url) {
      try {
        jdText = await fetchJobDescription(app.source_url);
        if (jdText && jdText.length > 50) {
          await db.setJdText(req.user.tenantId, app.id, jdText);
        }
      } catch (_) {}
    }

    // Load resume variant text.
    let resumeText = '';
    if (app.resume_variant) {
      const variants = await getResumeVariants(req.user.id);
      const v = variants.find(x => x.slug === app.resume_variant);
      resumeText = v?.parsed_text || '';
    }

    const contacts = await db.listApplicationContacts(req.user.tenantId, app.id);

    let brief;
    try {
      brief = await buildPrepBrief({
        userId: req.user.id,
        tenantId: req.user.tenantId,
        app,
        jdText,
        resumeText,
        contacts,
        profile: req.user.profile || {},
      });
    } catch (e) {
      console.error('[prep-brief]', e.message);
      return res.status(500).json({ error: e.message || 'Prep brief generation failed' });
    }

    await logAiUsage(req.user.tenantId, req.user.id, 'prep_brief',
      (brief.tokens_in || 0) + (brief.tokens_out || 0),
      { company: app.company, role: app.role, refresh: !!req.body?.refresh });

    logEvent(req.user.tenantId, req.user.id, 'prep_brief.built', {
      entityType: 'application',
      entityId: app.id,
      payload: {
        has_dossier: false,
        has_resume: !!resumeText,
        jd_length_bucket: lengthBucket(jdText),
        tokens_in: brief.tokens_in || 0,
        tokens_out: brief.tokens_out || 0,
        refresh: !!req.body?.refresh,
      },
    });

    res.json({ brief, cached: false });
  });

module.exports = router;
