const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const googleAuth = require('../services/google/auth');
const drive = require('../services/google/drive');
const gmail = require('../services/google/gmail');
const calendar = require('../services/google/calendar');

const router = Router();

// ================================================================
// OAuth flow
// ================================================================

// GET /api/google/auth — redirect user to Google consent screen
router.get('/auth', requireAuth, (req, res) => {
  try {
    // Encode user ID in state parameter so callback knows who to associate tokens with
    const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64url');
    const url = googleAuth.getAuthUrl(state);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/google/callback — handle OAuth redirect from Google
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/#google-error=' + encodeURIComponent(error));
  }

  if (!code || !state) {
    return res.redirect('/#google-error=missing-code');
  }

  let userId;
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    userId = stateData.userId;
  } catch (e) {
    return res.redirect('/#google-error=invalid-state');
  }

  try {
    const tokens = await googleAuth.exchangeCode(code);
    const email = await googleAuth.saveTokens(userId, tokens);
    res.redirect('/#google-connected=' + encodeURIComponent(email || 'success'));
  } catch (e) {
    console.error('[google] OAuth callback error:', e.message);
    res.redirect('/#google-error=' + encodeURIComponent(e.message));
  }
});

// GET /api/google/status — check if user has Google connected
router.get('/status', requireAuth, async (req, res) => {
  const status = await googleAuth.isConnected(req.user.id);
  res.json(status);
});

// POST /api/google/disconnect — revoke and remove tokens
router.post('/disconnect', requireAuth, async (req, res) => {
  await googleAuth.revokeTokens(req.user.id);
  res.json({ ok: true });
});

// ================================================================
// Drive endpoints
// ================================================================

// POST /api/google/drive/package — create application package in user's Drive
router.post('/drive/package', requireAuth, async (req, res) => {
  const { company, role, variant, coverLetterText } = req.body;
  if (!company || !role) return res.status(400).json({ error: 'company and role required' });

  try {
    const profile = req.user.profile || {};
    const contactParts = [
      profile.emailDisplay || req.user.email,
      profile.phone,
      profile.linkedinUrl,
      profile.location,
    ].filter(Boolean).join('  |  ');

    const result = await drive.createApplicationPackage(req.user.id, {
      company, role, variant,
      coverLetterText: coverLetterText || '',
      userName: req.user.fullName,
      userContact: contactParts,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/google/drive/folders — list application folders
router.get('/drive/folders', requireAuth, async (req, res) => {
  try {
    const folders = await drive.listApplicationFolders(req.user.id);
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// Gmail endpoints
// ================================================================

// POST /api/google/gmail/draft — create a single draft
router.post('/gmail/draft', requireAuth, async (req, res) => {
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body required' });

  try {
    const profile = req.user.profile || {};
    const from = profile.emailDisplay || req.user.email;
    const result = await gmail.createDraft(req.user.id, { to, subject, body, from });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/google/gmail/drafts — create multiple drafts (batch outreach)
router.post('/gmail/drafts', requireAuth, async (req, res) => {
  const emails = req.body.emails;
  if (!Array.isArray(emails) || !emails.length) return res.status(400).json({ error: 'emails array required' });

  try {
    const profile = req.user.profile || {};
    const from = profile.emailDisplay || req.user.email;
    const enriched = emails.map(e => ({ ...e, from }));
    const results = await gmail.createDrafts(req.user.id, enriched);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/google/gmail/send — send an email directly
router.post('/gmail/send', requireAuth, async (req, res) => {
  const { to, subject, body, threadId } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body required' });

  try {
    const profile = req.user.profile || {};
    const from = profile.emailDisplay || req.user.email;
    const result = await gmail.sendEmail(req.user.id, { to, subject, body, from, threadId });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/google/gmail/sent — list recent sent emails
router.get('/gmail/sent', requireAuth, async (req, res) => {
  try {
    const messages = await gmail.listSentEmails(req.user.id, {
      maxResults: parseInt(req.query.limit) || 50,
      after: req.query.after,
    });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/google/gmail/thread/:threadId — get thread replies
router.get('/gmail/thread/:threadId', requireAuth, async (req, res) => {
  try {
    const messages = await gmail.getThreadReplies(req.user.id, req.params.threadId);
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// Calendar endpoints
// ================================================================

// GET /api/google/calendar/list — list user's calendars
router.get('/calendar/list', requireAuth, async (req, res) => {
  try {
    const calendars = await calendar.listCalendars(req.user.id);
    res.json(calendars);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/google/calendar/events — fetch upcoming events
router.get('/calendar/events', requireAuth, async (req, res) => {
  try {
    const calConfig = await require('../db/store').getCalConfig(req.user.id);
    const calIds = calConfig.whitelisted_calendar_ids?.length
      ? calConfig.whitelisted_calendar_ids
      : ['primary'];
    const events = await calendar.listUpcomingEvents(req.user.id, {
      calendarIds: calIds,
      daysAhead: parseInt(req.query.daysAhead) || 30,
      daysBehind: parseInt(req.query.daysBehind) || 14,
    });
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/google/calendar/sync — pull calendar events into networking
router.post('/calendar/sync', requireAuth, async (req, res) => {
  try {
    const calConfig = await require('../db/store').getCalConfig(req.user.id);
    const calIds = calConfig.whitelisted_calendar_ids?.length
      ? calConfig.whitelisted_calendar_ids
      : ['primary'];
    const events = await calendar.syncEvents(req.user.id, calIds);

    // Forward to networking calendar-sync endpoint logic
    const db = require('../db/store');
    const existing = await db.listEvents(req.user.tenantId, req.user.id, { includeHidden: true });
    const extIds = new Set(existing.filter(e => e.external_id).map(e => e.external_id));

    let added = 0, updated = 0;
    for (const ev of events) {
      if (ev.external_id && extIds.has(ev.external_id)) {
        const existingEvent = existing.find(e => e.external_id === ev.external_id);
        if (existingEvent) {
          await db.updateEvent(req.user.tenantId, existingEvent.id, {
            title: ev.title, start_date: ev.start_date,
            start_time: ev.start_time, end_time: ev.end_time,
            location: ev.location, attendees: ev.attendees,
          });
          updated++;
        }
      } else {
        await db.createEvent(req.user.tenantId, req.user.id, {
          source: 'google_calendar',
          external_id: ev.external_id,
          calendar_id: ev.calendar_id,
          calendar_name: ev.calendar_name,
          title: ev.title,
          start_date: ev.start_date,
          start_time: ev.start_time,
          end_time: ev.end_time,
          location: ev.location,
          attendees: ev.attendees,
        });
        if (ev.external_id) extIds.add(ev.external_id);
        added++;
      }
    }

    res.json({ ok: true, added, updated, total: events.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
