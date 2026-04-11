const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas, VALID_APP_STATUSES } = require('../middleware/validate');
const { crawlLimiter } = require('../middleware/security');
const store = require('../data/store');
const { todayET, diagLog, withJobBoardLock } = require('../utils');
const { randomUUID } = require('crypto');
const { crawlJobBoards } = require('../services/crawler');

const router = Router();

// ================================================================
// Routes
// ================================================================

router.get('/job-board', requireAuth, async (req, res) => {
  const leads = await store.loadJobBoardLeads();
  const { status } = req.query;
  const statusCounts = {};
  leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
  diagLog('GET /api/job-board query_status=' + (status || '(default=new)') + ' total=' + leads.length + ' counts=' + JSON.stringify(statusCounts));
  const filtered = status ? leads.filter(l => l.status === status) : leads.filter(l => l.status === 'new');
  res.json(filtered.sort((a, b) => (b.fit_score - a.fit_score) || b.date_found.localeCompare(a.date_found)));
});

router.patch('/job-board/:id', requireAuth, validate(schemas.leadPatch), (req, res) => {
  diagLog('PATCH id=' + req.params.id + ' body=' + JSON.stringify(req.body));
  withJobBoardLock(async () => {
    const leads = await store.loadJobBoardLeads();
    diagLog('PATCH-LOCK loaded ' + leads.length + ' leads, searching for id=' + req.params.id);
    const idx = leads.findIndex(l => l.id === req.params.id);
    if (idx < 0) {
      diagLog('PATCH-LOCK NOT FOUND id=' + req.params.id + ' sample_ids=' + JSON.stringify(leads.slice(0, 3).map(l => l.id)));
      res.status(404).json({ error: 'Not found' });
      return;
    }
    diagLog('PATCH-LOCK found idx=' + idx + ' cur_status=' + leads[idx].status + ' new_status=' + req.body.status);
    leads[idx] = { ...leads[idx], ...req.body, id: leads[idx].id };
    const saved = await store.saveJobBoardLeads(leads);
    diagLog('PATCH-LOCK saved=' + saved);
    if (!saved) { res.status(500).json({ error: 'Save failed' }); return; }
    res.json(leads[idx]);
  });
});

router.post('/job-board/batch-update', requireAuth, validate(schemas.leadBatchUpdate), (req, res) => {
  const updates = req.body.updates;
  diagLog('BATCH-UPDATE received ' + updates.length + ' updates: ' + JSON.stringify(updates));
  withJobBoardLock(async () => {
    const leads = await store.loadJobBoardLeads();
    const results = [];
    updates.forEach(({ id, status, ...rest }) => {
      const idx = leads.findIndex(l => l.id === id);
      if (idx < 0) { diagLog('BATCH-UPDATE id=' + id + ' NOT FOUND'); return; }
      diagLog('BATCH-UPDATE idx=' + idx + ' id=' + id + ' from=' + leads[idx].status + ' to=' + status);
      leads[idx] = { ...leads[idx], ...rest, status, id: leads[idx].id };
      results.push(leads[idx]);
    });
    const saved = await store.saveJobBoardLeads(leads);
    diagLog('BATCH-UPDATE saved=' + saved + ' updated=' + results.length);
    if (!saved) { res.status(500).json({ error: 'Save failed' }); return; }
    res.json({ ok: true, updated: results.length });
  });
});

router.post('/job-board/snag', requireAuth, validate(schemas.snagRequest), (req, res) => {
  const { lead_id } = req.body;
  diagLog('SNAG lead_id=' + lead_id);
  withJobBoardLock(async () => {
    const leads = await store.loadJobBoardLeads();
    const li = leads.findIndex(l => l.id === lead_id);
    diagLog('SNAG-LOCK loaded=' + leads.length + ' findIndex=' + li);
    if (li < 0) {
      diagLog('SNAG-LOCK NOT FOUND lead_id=' + lead_id);
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    const lead = leads[li];
    const today = todayET();
    const fd = new Date(today + 'T12:00:00Z');
    fd.setDate(fd.getDate() + 7);
    const newApp = {
      id: randomUUID(),
      company: lead.organization || lead.title,
      role: lead.title,
      applied_date: today,
      status: 'queued',
      source_url: lead.url,
      notion_url: '',
      drive_url: '',
      follow_up_date: fd.toISOString().split('T')[0],
      last_activity: today,
      notes: 'Snagged from ' + (lead.source_label || lead.source) + (lead.location ? ' \u00b7 ' + lead.location : ''),
      activity: [{ date: today, type: 'queued', note: 'Snagged from ' + (lead.source_label || lead.source) }],
    };

    const apps = await store.loadApplications();
    apps.push(newApp);
    const appSaved = await store.saveApplications(apps);
    if (!appSaved) { res.status(500).json({ error: 'Failed to save application' }); return; }

    leads[li].status = 'snagged';
    leads[li].snagged_app_id = newApp.id;
    const leadSaved = await store.saveJobBoardLeads(leads);
    if (!leadSaved) { res.status(500).json({ error: 'Failed to update lead status' }); return; }

    res.json({ ok: true, application: newApp });
  });
});

router.post('/job-board/crawl', requireAuth, crawlLimiter, (req, res) => {
  res.json({ ok: true, message: 'Crawl running in background. Check back in 2-3 minutes.' });
  crawlJobBoards()
    .then(r => console.log(`[crawl] Done. Added ${r.leads.length} new leads.`))
    .catch(e => console.error('[crawl error]', e.message));
});

module.exports = router;
