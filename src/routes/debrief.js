const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { expensiveLimiter } = require('../middleware/security');
const { validate, schemas } = require('../middleware/validate');
const { isPro, logAiUsage } = require('../middleware/tier');
const db = require('../db/store');
const { buildDebrief } = require('../services/debrief');
const { getResumeVariants } = require('../db/users');
const { logEvent, lengthBucket } = require('../services/events');
const { todayET } = require('../utils');

const router = Router();

function requireInterviewing(app) {
  return app && app.status === 'interviewing';
}

// GET /applications/:id/debriefs — list newest first.
router.get('/applications/:id/debriefs', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (!isPro(req.user)) {
    return res.status(403).json({ error: 'Interview debrief is a Pro feature', upgrade: true });
  }
  const rows = await db.listApplicationDebriefs(req.user.tenantId, req.params.id);
  res.json({ debriefs: rows });
});

// POST /applications/:id/debriefs — create a new debrief from transcript text.
router.post('/applications/:id/debriefs',
  requireAuth, expensiveLimiter, validate(schemas.debriefCreateRequest),
  async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    const app = await db.getApplication(req.user.tenantId, req.params.id);
    if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    if (!isPro(req.user)) {
      return res.status(403).json({ error: 'Interview debrief is a Pro feature', upgrade: true });
    }
    if (!requireInterviewing(app)) {
      return res.status(400).json({ error: 'Debrief unlocks at Interviewing status' });
    }

    let resumeText = '';
    if (app.resume_variant) {
      const variants = await getResumeVariants(req.user.id);
      const v = variants.find(x => x.slug === app.resume_variant);
      resumeText = v?.parsed_text || '';
    }
    const contacts = await db.listApplicationContacts(req.user.tenantId, app.id);

    let debrief;
    try {
      debrief = await buildDebrief({
        userId: req.user.id,
        tenantId: req.user.tenantId,
        app,
        transcriptText: req.body.transcript,
        resumeText,
        jdText: app.jd_text || '',
        coverLetter: app.cover_letter_text || '',
        contacts,
        profile: req.user.profile || {},
      });
    } catch (e) {
      console.error('[debrief]', e.message);
      if (/too short/i.test(e.message)) {
        return res.status(422).json({ error: e.message });
      }
      return res.status(500).json({ error: e.message || 'Debrief generation failed' });
    }

    // Side effect: append to activity timeline.
    const today = todayET();
    const activity = Array.isArray(app.activity) ? [...app.activity] : [];
    activity.push({
      date: today,
      type: 'debrief_logged',
      note: (debrief.summary || '').slice(0, 200),
    });
    await db.updateApplication(req.user.tenantId, app.id, { activity, last_activity: today });

    await logAiUsage(req.user.tenantId, req.user.id, 'debrief',
      (debrief.tokens_in || 0) + (debrief.tokens_out || 0),
      { company: app.company });

    logEvent(req.user.tenantId, req.user.id, 'debrief.logged', {
      entityType: 'application',
      entityId: app.id,
      payload: {
        transcript_length_bucket: lengthBucket(req.body.transcript),
        tokens_in: debrief.tokens_in || 0,
        tokens_out: debrief.tokens_out || 0,
        followup_count: Array.isArray(debrief.follow_ups) ? debrief.follow_ups.length : 0,
        strength_count: Array.isArray(debrief.strengths) ? debrief.strengths.length : 0,
        watchout_count: Array.isArray(debrief.watchouts) ? debrief.watchouts.length : 0,
        has_thank_you: !!debrief.thank_you_draft,
      },
    });

    res.json({ debrief });
  });

// DELETE /applications/:id/debriefs/:debriefId
router.delete('/applications/:id/debriefs/:debriefId', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

  const debrief = await db.getApplicationDebrief(req.user.tenantId, req.params.debriefId);
  if (!debrief || debrief.application_id !== req.params.id) {
    return res.status(404).json({ error: 'Not found' });
  }

  const ok = await db.deleteApplicationDebrief(req.user.tenantId, req.params.debriefId);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
