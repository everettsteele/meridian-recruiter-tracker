const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/store');
const store = require('../data/store');
const { todayET, daysAgoStr } = require('../utils');

const router = Router();

router.get('/status', requireAuth, async (req, res) => {
  const today = todayET();
  const tenantId = req.user.tenantId;
  const userId = req.user.id;

  // Applications
  const apps = await db.listApplications(tenantId, userId);
  const needsPackage = apps
    .filter(a => a.status === 'queued' && !a.drive_url)
    .map(a => ({ id: a.id, company: a.company, role: a.role, source_url: a.source_url, notes: a.notes }));
  const appFollowUps = apps
    .filter(a => a.follow_up_date && a.follow_up_date <= today && !['rejected', 'withdrawn', 'offer', 'closed'].includes(a.status))
    .map(a => ({ id: a.id, company: a.company, role: a.role, status: a.status, follow_up_date: a.follow_up_date }));
  const appsByStatus = apps.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  // Job board leads
  const leads = await db.listJobBoardLeads(tenantId, 'new');
  const newLeads = leads.length;
  const topLeads = leads.slice(0, 3).map(l => ({
    id: l.id, title: l.title, organization: l.organization,
    fit_score: l.fit_score, source_label: l.source_label, url: l.url,
  }));

  // Networking events
  const events = await db.listEvents(tenantId, userId, { includeHidden: false });
  const cutoff14 = daysAgoStr(14);
  const overdueNextSteps = events
    .flatMap(e => (e.next_steps || [])
      .filter(ns => !ns.done && ns.due_date && ns.due_date <= today)
      .map(ns => ({ eventId: e.id, eventTitle: e.title, step: ns.text, due: ns.due_date })));
  const eventsNoNotes = events
    .filter(e => e.start_date >= cutoff14 && e.start_date <= today && !(e.notes || '').trim())
    .map(e => ({ id: e.id, title: e.title, start_date: e.start_date }));

  // Outreach (still JSON-based for firms/ceos/vcs)
  let draftsQueued = 0, dueCount = 0;
  try {
    const { getDB, PILLARS } = require('./firms');
    for (const key of PILLARS) {
      const items = await getDB(key);
      items.forEach(item => {
        if (item.status === 'draft') draftsQueued++;
        if (item.status === 'contacted' && item.followup_date && item.followup_date <= today && item.is_job_search !== false) dueCount++;
      });
    }
  } catch (e) { /* fallback to 0 if firms route not available */ }

  res.json({
    today,
    applications: {
      byStatus: appsByStatus,
      needsPackage: needsPackage.length,
      needsPackageItems: needsPackage.slice(0, 5),
      followUpsDue: appFollowUps.length,
      followUpItems: appFollowUps.slice(0, 5),
    },
    jobBoard: {
      newLeads,
      topLeads,
    },
    networking: {
      overdueSteps: overdueNextSteps.length,
      overdueItems: overdueNextSteps.slice(0, 5),
      eventsNoNotes: eventsNoNotes.length,
      eventsNoNotesItems: eventsNoNotes.slice(0, 5),
    },
    outreach: {
      draftsQueued,
      dueFollowUps: dueCount,
    },
  });
});

module.exports = router;
