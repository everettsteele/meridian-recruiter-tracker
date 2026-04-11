const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const store = require('../data/store');
const { todayET, daysAgoStr } = require('../utils');
const { randomUUID } = require('crypto');

const router = Router();

router.get('/events', requireAuth, async (req, res) => {
  const events = await store.loadNetworking();
  const { days, include_hidden } = req.query;
  const pool = include_hidden === 'true' ? events : events.filter(e => !e.hidden);
  if (days) {
    const cutoff = daysAgoStr(parseInt(days));
    return res.json(pool.filter(e => e.start_date >= cutoff).sort((a, b) => b.start_date.localeCompare(a.start_date)));
  }
  res.json(pool.sort((a, b) => b.start_date.localeCompare(a.start_date)));
});

router.post('/events', requireAuth, validate(schemas.eventCreate), async (req, res) => {
  const { title, start_date, start_time, end_time, location, type, notes, contacts, next_steps } = req.body;
  const event = {
    id: randomUUID(), source: 'manual', external_id: null, title, start_date,
    start_time: start_time || '', end_time: end_time || '', location: location || '',
    attendees: [], notes: notes || '', contacts: contacts || [], next_steps: next_steps || [],
    type: type || 'other', hidden: false, follow_up_sent: false, created_at: todayET(),
  };
  const events = await store.loadNetworking();
  events.push(event);
  await store.saveNetworking(events);
  res.json(event);
});

router.patch('/events/:id', requireAuth, async (req, res) => {
  const events = await store.loadNetworking();
  const idx = events.findIndex(e => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  events[idx] = { ...events[idx], ...req.body, id: events[idx].id };
  await store.saveNetworking(events);
  res.json(events[idx]);
});

router.delete('/events/:id', requireAuth, async (req, res) => {
  const events = await store.loadNetworking();
  const idx = events.findIndex(e => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  events.splice(idx, 1);
  await store.saveNetworking(events);
  res.json({ ok: true });
});

router.post('/calendar-sync', requireAuth, async (req, res) => {
  let incoming = req.body.events || [];
  if (!incoming.length) return res.json({ ok: true, added: 0, updated: 0, filtered: 0 });
  const calCfg = await store.loadCalConfig();
  let filtered = 0;
  if (calCfg.setup_complete && calCfg.whitelisted_calendar_ids.length > 0) {
    const before = incoming.length;
    incoming = incoming.filter(ev => !ev.calendar_id || calCfg.whitelisted_calendar_ids.includes(ev.calendar_id));
    filtered = before - incoming.length;
  }
  const events = await store.loadNetworking();
  const extIds = new Set(events.filter(e => e.external_id).map(e => e.external_id));
  let added = 0, updated = 0;
  incoming.forEach(ev => {
    if (!ev.title || !ev.start_date) return;
    if (ev.external_id && extIds.has(ev.external_id)) {
      const idx = events.findIndex(e => e.external_id === ev.external_id);
      if (idx >= 0) {
        events[idx] = { ...events[idx], title: ev.title, start_date: ev.start_date, start_time: ev.start_time || events[idx].start_time || '', end_time: ev.end_time || events[idx].end_time || '', location: ev.location || events[idx].location || '', attendees: ev.attendees || events[idx].attendees || [] };
        updated++;
      }
    } else {
      events.push({
        id: randomUUID(), source: 'google_calendar', external_id: ev.external_id || null,
        calendar_id: ev.calendar_id || null, calendar_name: ev.calendar_name || null,
        title: ev.title, start_date: ev.start_date, start_time: ev.start_time || '', end_time: ev.end_time || '',
        location: ev.location || '', attendees: ev.attendees || [], notes: '', contacts: [], next_steps: [],
        type: 'other', hidden: false, follow_up_sent: false, created_at: todayET(),
      });
      if (ev.external_id) extIds.add(ev.external_id);
      added++;
    }
  });
  await store.saveNetworking(events);
  res.json({ ok: true, added, updated, filtered });
});

router.get('/calendar-config', requireAuth, async (req, res) => res.json(await store.loadCalConfig()));

router.post('/calendar-config', requireAuth, async (req, res) => {
  const config = await store.loadCalConfig();
  const { whitelisted_calendar_ids, whitelisted_calendar_names, setup_complete } = req.body;
  if (whitelisted_calendar_ids !== undefined) config.whitelisted_calendar_ids = whitelisted_calendar_ids;
  if (whitelisted_calendar_names !== undefined) config.whitelisted_calendar_names = whitelisted_calendar_names;
  if (setup_complete !== undefined) config.setup_complete = setup_complete;
  await store.saveCalConfig(config);
  res.json({ ok: true, config });
});

module.exports = router;
