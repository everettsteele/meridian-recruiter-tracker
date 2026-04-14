const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { crawlLimiter } = require('../middleware/security');
const db = require('../db/store');
const { todayET, diagLog } = require('../utils');
const { randomUUID } = require('crypto');
const { logEvent } = require('../services/events');

const router = Router();

router.get('/job-board', requireAuth, async (req, res) => {
  const { status } = req.query;
  const leads = await db.listJobBoardLeads(req.user.tenantId, status || null);
  diagLog(`GET /api/job-board tenant=${req.user.tenantId} status=${status || 'new'} count=${leads.length}`);
  res.json(leads);
});

router.post('/job-board/batch-update', requireAuth, validate(schemas.leadBatchUpdate), async (req, res) => {
  const count = await db.batchUpdateJobBoardLeads(req.user.tenantId, req.body.updates);
  res.json({ ok: true, updated: count });
});

router.post('/job-board/snag', requireAuth, validate(schemas.snagRequest), async (req, res) => {
  const { lead_id } = req.body;
  const lead = await db.getJobBoardLead(req.user.tenantId, lead_id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const today = todayET();
  const fd = new Date(today + 'T12:00:00Z');
  fd.setDate(fd.getDate() + 7);

  const newApp = await db.createApplication(req.user.tenantId, req.user.id, {
    company: lead.organization || lead.title,
    role: lead.title,
    applied_date: today,
    status: 'identified',
    source_url: lead.url,
    follow_up_date: fd.toISOString().split('T')[0],
    notes: `Snagged from ${lead.source_label || lead.source}${lead.location ? ' · ' + lead.location : ''}`,
    activity: [{ date: today, type: 'identified', note: `Snagged from ${lead.source_label || lead.source}` }],
  });

  await db.updateJobBoardLead(req.user.tenantId, lead_id, { status: 'snagged', snagged_app_id: newApp.id });
  const { autoSelectResumeInBackground, autoBuildDossierInBackground } = require('./applications');
  autoSelectResumeInBackground(req.user.tenantId, req.user.id, newApp, { fullName: req.user.fullName });
  autoBuildDossierInBackground(req.user.tenantId, req.user, newApp);
  logEvent(req.user.tenantId, req.user.id, 'application.created', {
    entityType: 'application',
    entityId: newApp.id,
    payload: {
      source: 'snag',
      source_domain: (() => { try { return new URL(lead.url).hostname.toLowerCase(); } catch (_) { return ''; } })(),
      has_url: !!lead.url,
    },
  });
  logEvent(req.user.tenantId, req.user.id, 'job_board.lead_snagged', {
    entityType: 'job_board_lead',
    entityId: lead.id,
    payload: { source: lead.source || 'unknown', fit_score: lead.fit_score || 0 },
  });
  res.json({ ok: true, application: newApp });
});

router.post('/job-board/crawl', requireAuth, crawlLimiter, async (req, res) => {
  res.json({ ok: true, message: 'Crawl running in background. Check back in 2-3 minutes.' });
  const { crawlJobBoards } = require('../services/crawler');
  crawlJobBoards(req.user.tenantId, req.user.id)
    .then(r => {
      console.log(`[crawl] Done for user ${req.user.id}. Added ${r.leads.length} new leads.`);
      const stats = r.sourceStats || {};
      for (const [source, s] of Object.entries(stats)) {
        logEvent(req.user.tenantId, req.user.id, 'job_board.crawled', {
          payload: {
            source,
            urls_found: s.urlsFound || 0,
            urls_kept: s.added || 0,
            filtered_by_location: s.filteredByLocation || 0,
            filtered_by_score: s.filteredByScore || 0,
          },
        });
      }
    })
    .catch(e => console.error('[crawl error]', e.message));
});

// List available job board sources
router.get('/job-board/sources', requireAuth, async (req, res) => {
  const { JOB_SOURCES } = require('../services/crawler');
  const sources = JOB_SOURCES.map(s => ({ name: s.name, label: s.label, category: s.category || 'General' }));
  res.json(sources);
});

// Get user's job search config
router.get('/job-board/config', requireAuth, async (req, res) => {
  let config = await db.getJobSearchConfig(req.user.id);
  if (!config) {
    config = {
      enabled_sources: [],
      search_keywords: [],
      location_allow: [],
      location_deny: [],
      min_score: 3,
    };
  }
  res.json(config);
});

// Update user's job search config
router.patch('/job-board/config', requireAuth, async (req, res) => {
  const { isPro } = require('../middleware/tier');
  const body = { ...req.body };
  if (Array.isArray(body.enabled_sources) && !isPro(req.user) && body.enabled_sources.length > 3) {
    return res.status(403).json({ error: 'Free plan allows up to 3 job board sources. Upgrade to Pro for unlimited.', upgrade: true });
  }
  await db.saveJobSearchConfig(req.user.id, body);
  const updated = await db.getJobSearchConfig(req.user.id);
  res.json(updated);
});

// Generic lead update — MUST come after specific /job-board/* routes above
router.patch('/job-board/:id', requireAuth, validate(schemas.leadPatch), async (req, res) => {
  const updated = await db.updateJobBoardLead(req.user.tenantId, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.get('/export/job-board', requireAuth, async (req, res) => {
  const leads = await db.listJobBoardLeads(req.user.tenantId, req.query.status || null);
  if (req.query.format === 'csv') {
    const header = 'Title,Organization,Location,Source,Fit Score,Fit Reason,Date Found,Status,URL';
    const rows = leads.map(l =>
      [l.title, l.organization, l.location, l.source_label || l.source, l.fit_score, l.fit_reason, l.date_found, l.status, l.url]
        .map(f => `"${String(f || '').replace(/"/g, '""')}"`).join(',')
    );
    res.set('Content-Type', 'text/csv').set('Content-Disposition', 'attachment; filename="job-board.csv"');
    return res.send([header, ...rows].join('\n'));
  }
  res.json(leads);
});

module.exports = router;
