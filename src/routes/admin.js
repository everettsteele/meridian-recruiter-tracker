const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { query } = require('../db/pool');

const router = Router();

// All admin routes require auth + admin check
router.use(requireAuth, requireAdmin);

// GET /api/admin/overview — headline metrics
router.get('/overview', async (req, res) => {
  const [
    tenantCount,
    userCount,
    planBreakdown,
    appCount,
    leadCount,
    eventCount,
    aiUsage7d,
    aiUsage30d,
    recentSignups,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM tenants`),
    query(`SELECT COUNT(*)::int AS c FROM users`),
    query(`SELECT plan, COUNT(*)::int AS c FROM tenants GROUP BY plan`),
    query(`SELECT COUNT(*)::int AS c FROM applications`),
    query(`SELECT COUNT(*)::int AS c FROM job_board_leads`),
    query(`SELECT COUNT(*)::int AS c FROM networking_events`),
    query(`SELECT action, COUNT(*)::int AS c, SUM(tokens_used)::int AS tokens FROM usage_log WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY action`),
    query(`SELECT action, COUNT(*)::int AS c, SUM(tokens_used)::int AS tokens FROM usage_log WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY action`),
    query(`SELECT u.email, u.created_at, t.plan FROM users u JOIN tenants t ON t.id = u.tenant_id ORDER BY u.created_at DESC LIMIT 10`),
  ]);

  res.json({
    tenants: tenantCount.rows[0].c,
    users: userCount.rows[0].c,
    plans: planBreakdown.rows.reduce((acc, r) => { acc[r.plan] = r.c; return acc; }, {}),
    applications: appCount.rows[0].c,
    leads: leadCount.rows[0].c,
    events: eventCount.rows[0].c,
    usage7d: aiUsage7d.rows,
    usage30d: aiUsage30d.rows,
    recentSignups: recentSignups.rows,
  });
});

// GET /api/admin/users — list all users with their tenant info
router.get('/users', async (req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.email, u.role, u.created_at,
           up.full_name, up.location,
           t.id AS tenant_id, t.name AS tenant_name, t.plan,
           t.stripe_customer_id, t.stripe_subscription_id,
           (SELECT COUNT(*)::int FROM applications WHERE user_id = u.id) AS app_count,
           (SELECT COUNT(*)::int FROM usage_log WHERE user_id = u.id AND created_at > NOW() - INTERVAL '30 days') AS usage_30d
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ORDER BY u.created_at DESC
  `);
  res.json(rows);
});

// PATCH /api/admin/tenants/:id — update tenant plan
router.patch('/tenants/:id', async (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  const { rows } = await query(
    `UPDATE tenants SET plan = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [plan, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Tenant not found' });
  res.json(rows[0]);
});

// GET /api/admin/usage — detailed usage log
router.get('/usage', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const { rows } = await query(`
    SELECT u.action, u.tokens_used, u.metadata, u.created_at,
           users.email AS user_email
    FROM usage_log u
    LEFT JOIN users ON users.id = u.user_id
    WHERE u.created_at > NOW() - INTERVAL '${days} days'
    ORDER BY u.created_at DESC
    LIMIT 500
  `);
  res.json(rows);
});

module.exports = router;
