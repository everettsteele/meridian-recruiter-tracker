const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const store = require('../data/store');
const router = Router();

// Generic CSV converter
function toCSV(data, columns) {
  if (!data.length) return '';
  const headers = columns.map(c => c.label || c.key);
  const rows = data.map(item =>
    columns.map(c => {
      let val = typeof c.key === 'function' ? c.key(item) : (item[c.key] ?? '');
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

router.get('/applications', requireAuth, async (req, res) => {
  const { format } = req.query;
  const apps = await store.loadApplications();
  if (format === 'csv') {
    const csv = toCSV(apps, [
      { key: 'company', label: 'Company' },
      { key: 'role', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'applied_date', label: 'Applied Date' },
      { key: 'follow_up_date', label: 'Follow Up' },
      { key: 'source_url', label: 'Source URL' },
      { key: 'resume_variant', label: 'Resume Variant' },
      { key: 'notes', label: 'Notes' },
    ]);
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="applications.csv"');
    return res.send(csv);
  }
  res.json(apps);
});

router.get('/contacts', requireAuth, async (req, res) => {
  const { format } = req.query;
  const contacts = await store.loadDynamic();
  if (format === 'csv') {
    const csv = toCSV(contacts, [
      { key: 'contact_name', label: 'Name' },
      { key: 'contact_email', label: 'Email' },
      { key: 'org_name', label: 'Organization' },
      { key: 'track', label: 'Track' },
      { key: 'status', label: 'Status' },
      { key: 'last_contacted', label: 'Last Contacted' },
      { key: 'notes', label: 'Notes' },
    ]);
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="contacts.csv"');
    return res.send(csv);
  }
  res.json(contacts);
});

router.get('/job-board', requireAuth, async (req, res) => {
  const { format } = req.query;
  const leads = await store.loadJobBoardLeads();
  if (format === 'csv') {
    const csv = toCSV(leads, [
      { key: 'title', label: 'Title' },
      { key: 'organization', label: 'Organization' },
      { key: 'location', label: 'Location' },
      { key: 'source_label', label: 'Source' },
      { key: 'fit_score', label: 'Fit Score' },
      { key: 'fit_reason', label: 'Fit Reason' },
      { key: 'status', label: 'Status' },
      { key: 'date_found', label: 'Date Found' },
      { key: 'url', label: 'URL' },
    ]);
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="job-board-leads.csv"');
    return res.send(csv);
  }
  res.json(leads);
});

router.get('/networking', requireAuth, async (req, res) => {
  const { format } = req.query;
  const events = await store.loadNetworking();
  if (format === 'csv') {
    const csv = toCSV(events, [
      { key: 'title', label: 'Title' },
      { key: 'start_date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'location', label: 'Location' },
      { key: 'notes', label: 'Notes' },
      { key: (e) => (e.contacts || []).map(c => c.name).join('; '), label: 'Contacts' },
      { key: (e) => (e.next_steps || []).map(s => s.text).join('; '), label: 'Next Steps' },
    ]);
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="networking-events.csv"');
    return res.send(csv);
  }
  res.json(events);
});

module.exports = router;
