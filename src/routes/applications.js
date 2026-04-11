const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas, VALID_APP_STATUSES } = require('../middleware/validate');
const { expensiveLimiter } = require('../middleware/security');
const store = require('../data/store');
const { todayET, diagLog } = require('../utils');
const { randomUUID } = require('crypto');
const { generateCoverLetter, selectResumeVariant, fetchJobDescription, cleanCoverLetterText } = require('../services/anthropic');

const router = Router();

// ================================================================
// Helpers
// ================================================================

async function postToAppsScript(url, body) {
  const payload = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json' };
  let resp = await fetch(url, { method: 'POST', headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  let hops = 0;
  while (resp.status >= 300 && resp.status < 400 && hops < 5) {
    const loc = resp.headers.get('location');
    if (!loc) throw new Error('Redirect with no Location');
    diagLog('WEBHOOK redirect ' + resp.status + ' -> ' + loc.slice(0, 120));
    resp = await fetch(loc, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    hops++;
  }
  return resp;
}

// ================================================================
// Routes
// ================================================================

router.get('/applications', requireAuth, async (req, res) => {
  const apps = await store.loadApplications();
  res.json(apps.sort((a, b) => (b.applied_date || '').localeCompare(a.applied_date || '')));
});

router.post('/applications', requireAuth, validate(schemas.applicationCreate), async (req, res) => {
  const { company, role, source_url, notion_url, notes, applied_date, status } = req.body;
  const today = applied_date || todayET();
  const fd = new Date(today + 'T12:00:00Z');
  fd.setDate(fd.getDate() + 7);
  const rec = {
    id: randomUUID(),
    company,
    role,
    applied_date: today,
    status: status || 'queued',
    source_url: source_url || '',
    notion_url: notion_url || '',
    drive_url: '',
    follow_up_date: fd.toISOString().split('T')[0],
    last_activity: today,
    notes: notes || '',
    activity: [{ date: today, type: status || 'queued', note: 'Added to queue' }],
  };
  const apps = await store.loadApplications();
  apps.push(rec);
  await store.saveApplications(apps);
  res.json(rec);
});

router.patch('/applications/:id', requireAuth, validate(schemas.applicationPatch), async (req, res) => {
  const apps = await store.loadApplications();
  const idx = apps.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  const today = todayET();

  if (req.body.status && req.body.status !== apps[idx].status) {
    const activity = apps[idx].activity || [];
    activity.push({ date: today, type: req.body.status, note: req.body.activity_note || '' });
    apps[idx].activity = activity;
  }

  apps[idx] = { ...apps[idx], ...req.body, id: apps[idx].id, last_activity: today };
  delete apps[idx].activity_note;
  await store.saveApplications(apps);
  res.json(apps[idx]);
});

router.delete('/applications/:id', requireAuth, async (req, res) => {
  const apps = await store.loadApplications();
  const idx = apps.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  apps.splice(idx, 1);
  await store.saveApplications(apps);
  res.json({ ok: true });
});

router.post('/applications/email-sync', requireAuth, async (req, res) => {
  const matches = req.body.matches || [];
  if (!matches.length) return res.json({ ok: true, changed: 0 });
  const apps = await store.loadApplications();
  let changed = 0;
  matches.forEach(({ id, status, note, date }) => {
    const idx = apps.findIndex(a => a.id === id);
    if (idx < 0) return;
    const actDate = date || todayET();
    if (status && VALID_APP_STATUSES.includes(status) && status !== apps[idx].status) {
      apps[idx].status = status;
    }
    (apps[idx].activity = apps[idx].activity || []).push({ date: actDate, type: status || 'note', note: note || '' });
    apps[idx].last_activity = actDate;
    changed++;
  });
  await store.saveApplications(apps);
  res.json({ ok: true, changed });
});

router.get('/applications/:id/cover-letter', requireAuth, async (req, res) => {
  const apps = await store.loadApplications();
  const appRecord = apps.find(a => a.id === req.params.id);
  if (!appRecord) return res.status(404).send('Application not found.');
  if (!appRecord.cover_letter_text) return res.status(404).send('No cover letter generated yet.');

  const letterText = cleanCoverLetterText(appRecord.cover_letter_text);
  const paragraphs = letterText
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);
  const paragraphsHtml = paragraphs
    .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('\n');
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const companyEsc = (appRecord.company || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${companyEsc} Cover Letter</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Times New Roman',serif;font-size:12pt;color:#000;background:#fff}.page{max-width:8in;margin:0 auto;padding:1in}.header{text-align:center;margin-bottom:32pt}.header h1{font-size:14pt;font-weight:bold;letter-spacing:1px;margin-bottom:6pt}.header .contact{font-size:10pt;color:#333}.date{margin-bottom:10pt}.company{margin-bottom:24pt}p{margin-bottom:12pt;line-height:1.6;text-align:justify}.no-print{position:fixed;top:16px;right:16px;padding:10px 20px;background:#1f2d3d;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-family:sans-serif}@media print{.no-print{display:none}body{font-size:12pt}.page{padding:0;max-width:100%}@page{margin:1in;size:letter}}</style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><div class="page"><div class="header"><h1>EVERETT STEELE</h1><div class="contact">everett.steele@gmail.com &nbsp;|&nbsp; 678.899.3971 &nbsp;|&nbsp; linkedin.com/in/everettsteeleATL &nbsp;|&nbsp; Atlanta, GA</div></div><div class="date">${dateStr}</div><div class="company">${companyEsc}</div>${paragraphsHtml}</div><script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});<\/script></body></html>`;

  res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-store').send(html);
});

router.post('/applications/batch-packages', requireAuth, expensiveLimiter, async (req, res) => {
  const webhookUrl = process.env.DRIVE_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'DRIVE_WEBHOOK_URL not configured' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const apps = await store.loadApplications();
  const targets = apps.filter(a => a.status === 'queued' && (!a.cover_letter_text || !a.drive_url));
  if (!targets.length) return res.json({ ok: true, built: 0, message: 'All queued applications already have complete packages' });

  diagLog('BATCH-PKG starting for ' + targets.length + ' apps: ' + targets.map(a => a.company).join(', '));
  res.json({ ok: true, queued: targets.length, message: `Building packages for ${targets.length} applications in background. Check back in 2-3 minutes.` });

  setImmediate(async () => {
    let built = 0, failed = 0;
    for (const appRec of targets) {
      try {
        diagLog('BATCH-PKG processing: ' + appRec.company + ' (id=' + appRec.id + ')');
        const allApps = await store.loadApplications();
        const idx = allApps.findIndex(a => a.id === appRec.id);
        if (idx < 0) { diagLog('BATCH-PKG app not found: ' + appRec.id); continue; }
        const today = todayET();
        let coverLetter = allApps[idx].cover_letter_text;
        let jdText = '';

        // Phase 1: Generate cover letter if missing
        if (!coverLetter) {
          diagLog('BATCH-PKG generating cover letter for ' + appRec.company);
          jdText = await fetchJobDescription(appRec.source_url);
          if (!jdText || jdText.length < 50) {
            jdText = `Position: ${appRec.role} at ${appRec.company}. ${appRec.notes || ''}`.trim();
          }
          coverLetter = await generateCoverLetter(appRec, jdText);
          if (!coverLetter || coverLetter.length < 50) {
            diagLog('BATCH-PKG cover letter generation failed for ' + appRec.company);
            failed++;
            continue;
          }
          allApps[idx].cover_letter_text = coverLetter;
          allApps[idx].last_activity = today;
          diagLog('BATCH-PKG cover letter generated for ' + appRec.company + ' (' + coverLetter.length + ' chars)');
        } else {
          diagLog('BATCH-PKG cover letter exists for ' + appRec.company);
        }

        // Phase 2: Select resume variant + create Drive folder if missing
        if (!allApps[idx].drive_url) {
          if (!jdText) {
            jdText = await fetchJobDescription(appRec.source_url);
            if (!jdText || jdText.length < 50) {
              jdText = `Position: ${appRec.role} at ${appRec.company}. ${appRec.notes || ''}`.trim();
            }
          }
          diagLog('BATCH-PKG selecting variant for ' + appRec.company + ' (jd=' + jdText.length + ' chars)');
          const variant = await selectResumeVariant(appRec, jdText);
          allApps[idx].resume_variant = variant;
          diagLog('BATCH-PKG variant=' + variant + ' for ' + appRec.company + ', calling webhook...');

          if (!webhookUrl) {
            diagLog('BATCH-PKG NO WEBHOOK URL');
          } else {
            try {
              const response = await postToAppsScript(webhookUrl, {
                folderName: `${appRec.company} - ${appRec.role}`,
                variant,
                coverLetterText: coverLetter,
                company: appRec.company,
                role: appRec.role,
              });
              const text = await response.text();
              diagLog('BATCH-PKG webhook response for ' + appRec.company + ': ' + text.slice(0, 300));
              let result;
              try { result = JSON.parse(text); } catch (e) { result = null; }
              if (result && result.ok) {
                const folderUrl = result.folderUrl || result.driveUrl || result.url || result.folder_url || '';
                if (folderUrl) {
                  allApps[idx].drive_url = folderUrl;
                  allApps[idx].drive_folder_id = result.folderId || '';
                  (allApps[idx].activity = allApps[idx].activity || []).push({
                    date: today,
                    type: 'package_created',
                    note: variant + ' package: ' + folderUrl,
                  });
                  diagLog('BATCH-PKG drive folder created for ' + appRec.company + ': ' + folderUrl);
                } else {
                  diagLog('BATCH-PKG webhook ok but no folderUrl in response for ' + appRec.company);
                }
              } else {
                diagLog('BATCH-PKG webhook failed for ' + appRec.company + ': ' + (result ? JSON.stringify(result) : 'non-JSON response'));
              }
            } catch (driveErr) {
              diagLog('BATCH-PKG webhook error for ' + appRec.company + ': ' + driveErr.message);
            }
          }
        } else {
          diagLog('BATCH-PKG drive_url exists for ' + appRec.company + ': ' + allApps[idx].drive_url);
        }

        await store.saveApplications(allApps);
        built++;
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        diagLog('BATCH-PKG EXCEPTION for ' + appRec.company + ': ' + err.message);
        failed++;
      }
    }
    diagLog('BATCH-PKG complete. Built: ' + built + ', Failed: ' + failed);
  });
});

router.post('/create-drive-package', requireAuth, async (req, res) => {
  const { app_id, variant, cover_letter_text, company, role } = req.body;
  if (!app_id || !variant || !cover_letter_text) {
    return res.status(400).json({ error: 'app_id, variant, and cover_letter_text required' });
  }
  const webhookUrl = process.env.DRIVE_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'DRIVE_WEBHOOK_URL not configured.' });

  const apps = await store.loadApplications();
  const idx = apps.findIndex(a => a.id === app_id);
  if (idx < 0) return res.status(404).json({ error: 'Application not found' });
  const ar = apps[idx];

  try {
    const response = await postToAppsScript(webhookUrl, {
      folderName: (company || ar.company) + ' - ' + (role || ar.role),
      variant,
      coverLetterText: cover_letter_text,
      company: company || ar.company,
      role: role || ar.role,
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch (e) {
      return res.status(500).json({ error: 'Apps Script non-JSON: ' + text.slice(0, 100) });
    }
    if (!result.ok) return res.status(500).json({ error: result.error || 'Drive webhook failed' });

    const today = todayET();
    apps[idx].drive_url = result.folderUrl;
    apps[idx].drive_folder_id = result.folderId;
    apps[idx].last_activity = today;
    (apps[idx].activity = apps[idx].activity || []).push({ date: today, type: 'package_created', note: 'Drive: ' + result.folderUrl });
    await store.saveApplications(apps);
    res.json({ ok: true, folderUrl: result.folderUrl, folderId: result.folderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
