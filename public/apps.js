// HopeSpot — Applications + Metrics extension
// Loaded after main script. Accesses globals: TOKEN, API_KEY_MODE, toast
// TAB and auth state are managed through the patched switchTab below.

const APP_STATUSES = {
  applied:               { label: 'Applied',       color: '#6b7280' },
  confirmation_received: { label: 'Confirmed',     color: '#2563eb' },
  interviewing:          { label: 'Interviewing',  color: '#d97706' },
  offer:                 { label: 'Offer',          color: '#16a34a' },
  rejected:              { label: 'Rejected',       color: '#dc2626' },
  no_response:           { label: 'No Response',   color: '#9ca3af' },
  withdrawn:             { label: 'Withdrawn',     color: '#9ca3af' }
};

let _appsData = [];

function _authH() {
  const k = localStorage.getItem('hopespot_apikey');
  if (k) return { 'x-api-key': k, 'Content-Type': 'application/json' };
  const t = localStorage.getItem('hopespot_token');
  return { 'x-auth-token': t || '', 'Content-Type': 'application/json' };
}
function _authFH() {
  const k = localStorage.getItem('hopespot_apikey');
  if (k) return { 'x-api-key': k };
  return { 'x-auth-token': localStorage.getItem('hopespot_token') || '' };
}

async function loadApps() {
  try {
    const r = await fetch('/api/applications', { headers: _authFH() });
    _appsData = await r.json();
  } catch(e) { _appsData = []; }
  renderApplications();
}

function renderApplications() {
  const counts = {};
  _appsData.forEach(a => { counts[a.status] = (counts[a.status]||0)+1; });
  const summary = Object.entries(APP_STATUSES)
    .filter(([k]) => counts[k])
    .map(([k,v]) => `<span style="padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background:${v.color}18;color:${v.color};border:1px solid ${v.color}35">${counts[k]} ${v.label}</span>`)
    .join('');
  const today = new Date().toISOString().split('T')[0];
  const rows = _appsData.map(app => {
    const st = APP_STATUSES[app.status] || { label: app.status, color: '#333' };
    const ov = app.follow_up_date && app.follow_up_date <= today && !['rejected','offer','withdrawn'].includes(app.status);
    const latest = (app.activity||[]).slice(-1)[0];
    const actHtml = latest ? `<span style="font-size:11px;color:#9ca3af">${latest.date}: ${latest.note||latest.type}</span>` : '';
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:10px 14px;font-weight:600;font-size:13px">${app.company}</td>
      <td style="padding:10px 14px;font-size:12px;color:#6b7280">${app.role}</td>
      <td style="padding:10px 14px;font-size:12px;white-space:nowrap">${app.applied_date||'—'}</td>
      <td style="padding:10px 14px">
        <select onchange="updateAppStatus('${app.id}',this.value)" style="font-size:12px;padding:3px 6px;color:${st.color};border:1px solid ${st.color}50;border-radius:5px;background:${st.color}10;cursor:pointer">
          ${Object.entries(APP_STATUSES).map(([k,v])=>`<option value="${k}" ${app.status===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </td>
      <td style="padding:10px 14px;font-size:12px;color:${ov?'#dc2626':'#6b7280'};white-space:nowrap">${app.follow_up_date||'—'}${ov?' \u26a0':''}</td>
      <td style="padding:10px 14px">${actHtml}</td>
      <td style="padding:10px 14px;white-space:nowrap">
        ${app.notion_url?`<a href="${app.notion_url}" target="_blank" style="display:inline-block;padding:3px 9px;background:#f3f4f6;border-radius:5px;font-size:11px;color:#374151;text-decoration:none;margin-right:4px">Package</a>`:''}
        ${app.source_url?`<a href="${app.source_url}" target="_blank" style="display:inline-block;padding:3px 9px;background:#f97316;border-radius:5px;font-size:11px;color:#fff;text-decoration:none;margin-right:4px">Apply</a>`:''}
        <button onclick="deleteApp('${app.id}')" style="padding:3px 7px;background:#fee2e2;border:none;border-radius:5px;font-size:11px;color:#dc2626;cursor:pointer">\u2715</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <div style="font-size:22px;font-weight:700">Job Applications</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:2px">${_appsData.length} application${_appsData.length!==1?'s':''} tracked</div>
      </div>
      <button onclick="showAddAppModal()" style="padding:9px 18px;background:#f97316;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+ Log Application</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${summary}</div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Company</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Role</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Applied</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Status</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Follow-up</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Latest</th>
            <th style="padding:10px 14px"></th>
          </tr>
        </thead>
        <tbody>${rows||'<tr><td colspan="7" style="padding:48px;text-align:center;color:#9ca3af">No applications logged yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function updateAppStatus(id, status) {
  await fetch('/api/applications/'+id, { method:'PATCH', headers:_authH(), body:JSON.stringify({ status }) });
  await loadApps();
  if (typeof toast === 'function') toast('Status updated');
}

async function deleteApp(id) {
  if (!confirm('Remove this application?')) return;
  await fetch('/api/applications/'+id, { method:'DELETE', headers:_authFH() });
  await loadApps();
}

function showAddAppModal() {
  const m = document.getElementById('add-app-modal');
  if (m) { m.style.display = 'flex'; document.getElementById('nac-date').value = new Date().toISOString().split('T')[0]; }
}
function closeAddAppModal() {
  const m = document.getElementById('add-app-modal');
  if (m) { m.style.display = 'none'; ['nac-company','nac-role','nac-url','nac-notion','nac-notes'].forEach(id=>{ const el=document.getElementById(id); if(el)el.value=''; }); }
}
async function submitAddApp() {
  const company = document.getElementById('nac-company').value.trim();
  const role = document.getElementById('nac-role').value.trim();
  if (!company||!role) { alert('Company and role required.'); return; }
  await fetch('/api/applications', { method:'POST', headers:_authH(), body:JSON.stringify({
    company, role,
    source_url: document.getElementById('nac-url').value.trim(),
    notion_url: document.getElementById('nac-notion').value.trim(),
    applied_date: document.getElementById('nac-date').value,
    notes: document.getElementById('nac-notes').value.trim()
  })});
  closeAddAppModal();
  await loadApps();
  if (typeof toast === 'function') toast('Application logged');
}

async function renderMetrics() {
  let apps = [], stats = null;
  try { apps = await (await fetch('/api/applications', { headers:_authFH() })).json(); } catch(e) {}
  try { stats = await (await fetch('/api/stats', { headers:_authFH() })).json(); } catch(e) {}

  const total = apps.length;
  const confirmed = apps.filter(a=>['confirmation_received','interviewing','offer'].includes(a.status)).length;
  const interviewing = apps.filter(a=>['interviewing','offer'].includes(a.status)).length;
  const offers = apps.filter(a=>a.status==='offer').length;
  const rejected = apps.filter(a=>a.status==='rejected').length;
  const pending = apps.filter(a=>a.status==='applied').length;
  const pct = (n,d) => d>0 ? Math.round((n/d)*100) : 0;

  const byWeek = {};
  apps.forEach(a => {
    if (!a.applied_date) return;
    const d = new Date(a.applied_date+'T12:00:00Z'), day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1));
    const wk = mon.toISOString().split('T')[0];
    byWeek[wk] = (byWeek[wk]||0)+1;
  });
  const weeks = Object.entries(byWeek).sort(([a],[b])=>a.localeCompare(b));
  const maxW = weeks.length ? Math.max(...weeks.map(([,v])=>v)) : 1;

  const mc = (label,val,color,sub) =>
    `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:30px;font-weight:700;color:${color}">${val}</div>
      <div style="font-size:10px;font-weight:700;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:.05em">${label}</div>
      ${sub?`<div style="font-size:11px;color:${color};margin-top:2px">${sub}</div>`:''}
    </div>`;

  const fr = (label,n,tot) => {
    const p = pct(n,tot);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:#374151;font-weight:500">${label}</span><span style="color:#9ca3af">${n} (${p}%)</span>
      </div>
      <div style="height:8px;background:#e5e7eb;border-radius:4px">
        <div style="height:100%;background:#f97316;border-radius:4px;width:${p}%"></div>
      </div></div>`;
  };

  const weekBars = weeks.map(([wk,n])=>{
    const h = Math.round((n/maxW)*80);
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:30px">
      <span style="font-size:11px;font-weight:600;color:#374151">${n}</span>
      <div style="width:100%;background:#f97316;height:${h}px;border-radius:3px 3px 0 0;min-height:4px"></div>
      <span style="font-size:10px;color:#9ca3af;white-space:nowrap">${wk.slice(5)}</span>
    </div>`;
  }).join('');

  const outreach = stats ? stats.segments.map(s=>
    `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:8px">${s.label}</div>
      <div style="font-size:24px;font-weight:700">${s.contacted}</div>
      <div style="font-size:11px;color:#9ca3af">contacted of ${s.total}</div>
      ${s.conv>0?`<div style="font-size:11px;color:#10b981;margin-top:4px">${s.conv} in conversation</div>`:''}
    </div>`).join('') : '';

  document.getElementById('main-content').innerHTML = `
    <div style="font-size:22px;font-weight:700;margin-bottom:4px">Metrics</div>
    <div style="font-size:13px;color:#9ca3af;margin-bottom:20px">Pipeline and response tracking</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:24px">
      ${mc('Applied',total,'#f97316')}
      ${mc('Confirmed',confirmed,'#2563eb',pct(confirmed,total)+'%')}
      ${mc('Interviewing',interviewing,'#d97706',pct(interviewing,total)+'%')}
      ${mc('Offers',offers,'#16a34a',pct(offers,total)+'%')}
      ${mc('Rejected',rejected,'#dc2626')}
      ${mc('Pending',pending,'#9ca3af')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:14px">Pipeline Funnel</div>
        ${fr('Submitted',total,total)}
        ${fr('Confirmation',confirmed,total)}
        ${fr('Interview',interviewing,total)}
        ${fr('Offer',offers,total)}
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:14px">Weekly Volume</div>
        <div style="display:flex;align-items:flex-end;gap:6px;height:96px">${weekBars||'<div style="color:#9ca3af;font-size:12px;padding-top:12px">No data yet.</div>'}</div>
      </div>
    </div>
    ${outreach?`<div style="font-size:14px;font-weight:600;margin-bottom:12px;color:#374151">Outreach Summary</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${outreach}</div>`:''}`;
}

// Inject nav items and modal after DOM is ready
(function init() {
  function inject() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav || document.getElementById('nav-applications')) return;

    const section = document.createElement('div');
    section.innerHTML = `
      <div class="nav-section-label">Jobs</div>
      <div class="nav-item" id="nav-applications" onclick="_switchToTab('applications');closeSidebar()">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
        Applications
        <span class="nav-badge" id="badge-applications">0</span>
      </div>
      <div class="nav-item" id="nav-metrics" onclick="_switchToTab('metrics');closeSidebar()">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Metrics
      </div>`;
    Array.from(section.children).forEach(c => nav.appendChild(c));

    // Add-app modal
    const modal = document.createElement('div');
    modal.id = 'add-app-modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1001;align-items:center;justify-content:center';
    modal.onclick = e => { if (e.target === modal) closeAddAppModal(); };
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:480px;max-width:90%;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,.22)">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px">Log Application</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          <input type="text" id="nac-company" placeholder="Company *" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none">
          <input type="text" id="nac-role" placeholder="Role *" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none">
          <input type="text" id="nac-url" placeholder="Apply URL" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none">
          <input type="text" id="nac-notion" placeholder="Notion package URL" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none">
          <input type="date" id="nac-date" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none">
          <textarea id="nac-notes" placeholder="Notes" rows="2" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;resize:vertical"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
            <button onclick="submitAddApp()" style="padding:8px 18px;background:#f97316;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer">Save</button>
            <button onclick="closeAddAppModal()" style="padding:8px 14px;background:#f3f4f6;color:#374151;border:none;border-radius:7px;font-size:13px;cursor:pointer">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    setTimeout(inject, 300);
  }
})();

// Tab switching for apps/metrics — called from nav onclick
function _switchToTab(tab) {
  // deactivate all nav items
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('nav-'+tab);
  if (el) el.classList.add('active');
  // update topbar
  const titles = { applications: ['Applications','Job applications and tracking'], metrics: ['Metrics','Pipeline funnel and response rates'] };
  const t = titles[tab];
  if (t) {
    const tb = document.getElementById('topbar-title'); if (tb) tb.textContent = t[0];
    const ts = document.getElementById('topbar-sub');   if (ts) ts.textContent = t[1];
    const mt = document.getElementById('mobile-title'); if (mt) mt.textContent = t[0];
  }
  // deactivate existing tabs via their nav items (use switchTab for core tabs if available)
  if (tab === 'applications') loadApps();
  if (tab === 'metrics') renderMetrics();
}
