const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { query } = require('../db/pool');

const router = Router();
router.use(requireAuth, requireAdmin);

// Price per action in USD (rough estimates based on Claude Sonnet 4.6 pricing)
const COST_PER_ACTION = {
  cover_letters: 0.015,   // cover letter or email draft
  variant_select: 0.001,  // Haiku, tiny prompt
  resume_variant: 0.025,  // larger context/output
  crawl: 0,
};

const PRO_PRICE_MONTHLY = 10; // $10/month

// ────────────────────────────────────────────────────────────────
// GET /api/admin/overview — SaaS revenue + cost dashboard
// ────────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  // Plan breakdown
  const { rows: plans } = await query(`
    SELECT plan, COUNT(*)::int AS c FROM tenants GROUP BY plan
  `);
  const planCounts = plans.reduce((acc, r) => { acc[r.plan] = r.c; return acc; }, {});
  const paid = (planCounts.pro || 0) + (planCounts.enterprise || 0);
  const free = planCounts.free || 0;
  const total = paid + free;

  // Revenue
  const mrr = (planCounts.pro || 0) * PRO_PRICE_MONTHLY;
  const arr = mrr * 12;

  // New signups by period
  const { rows: [{ c: signups30 }] } = await query(
    `SELECT COUNT(*)::int AS c FROM users WHERE created_at > NOW() - INTERVAL '30 days'`
  );
  const { rows: [{ c: signups7 }] } = await query(
    `SELECT COUNT(*)::int AS c FROM users WHERE created_at > NOW() - INTERVAL '7 days'`
  );

  // Pro upgrades in last 30 days (subscription created in that window)
  // Using tenant updated_at as a proxy since we don't have a plan history table
  const { rows: [{ c: newPaid30 }] } = await query(
    `SELECT COUNT(*)::int AS c FROM tenants
     WHERE plan IN ('pro', 'enterprise')
     AND stripe_subscription_id IS NOT NULL
     AND updated_at > NOW() - INTERVAL '30 days'`
  );

  // Churn: tenants that have a stripe_customer_id but no active subscription
  // (cancelled subscriptions set stripe_subscription_id to NULL via webhook)
  const { rows: [{ c: churned }] } = await query(
    `SELECT COUNT(*)::int AS c FROM tenants
     WHERE stripe_customer_id IS NOT NULL
     AND stripe_subscription_id IS NULL
     AND plan = 'free'`
  );
  const churnRate = paid > 0 ? Math.round((churned / (paid + churned)) * 1000) / 10 : 0;

  // AI cost totals (all time)
  const { rows: costRows } = await query(`
    SELECT action, COUNT(*)::int AS calls, SUM(tokens_used)::int AS tokens
    FROM usage_log
    GROUP BY action
  `);
  let totalCost = 0;
  let totalTokens = 0;
  const byAction = {};
  costRows.forEach(r => {
    const cost = (COST_PER_ACTION[r.action] || 0) * r.calls;
    totalCost += cost;
    totalTokens += r.tokens || 0;
    byAction[r.action] = { calls: r.calls, tokens: r.tokens || 0, cost };
  });

  // AI cost this month
  const { rows: monthCostRows } = await query(`
    SELECT action, COUNT(*)::int AS calls
    FROM usage_log
    WHERE created_at > DATE_TRUNC('month', NOW())
    GROUP BY action
  `);
  const costThisMonth = monthCostRows.reduce(
    (sum, r) => sum + (COST_PER_ACTION[r.action] || 0) * r.calls,
    0
  );

  // Gross margin: (revenue - AI cost) / revenue
  const grossMargin = mrr > 0 ? Math.round(((mrr - costThisMonth) / mrr) * 1000) / 10 : null;

  res.json({
    revenue: {
      mrr,
      arr,
      paidUsers: paid,
      freeUsers: free,
      totalUsers: total,
      newPaid30,
      churned,
      churnRate,
      grossMargin,
    },
    signups: {
      last7: signups7,
      last30: signups30,
    },
    aiCost: {
      totalCost: Math.round(totalCost * 100) / 100,
      costThisMonth: Math.round(costThisMonth * 100) / 100,
      totalTokens,
      byAction,
    },
    prices: {
      proMonthly: PRO_PRICE_MONTHLY,
      perAction: COST_PER_ACTION,
    },
  });
});

// ────────────────────────────────────────────────────────────────
// GET /api/admin/users — with per-user cost + revenue
// ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.email, u.role, u.created_at,
           up.full_name, up.location,
           t.id AS tenant_id, t.name AS tenant_name, t.plan,
           t.stripe_customer_id, t.stripe_subscription_id,
           (SELECT COUNT(*)::int FROM applications WHERE user_id = u.id) AS app_count,
           (SELECT COUNT(*)::int FROM usage_log WHERE user_id = u.id AND created_at > NOW() - INTERVAL '30 days') AS ai_calls_30d,
           (SELECT COUNT(*)::int FROM usage_log WHERE user_id = u.id) AS ai_calls_total,
           (SELECT json_object_agg(action, count) FROM (
              SELECT action, COUNT(*)::int AS count FROM usage_log WHERE user_id = u.id GROUP BY action
           ) sub) AS usage_breakdown
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ORDER BY t.plan DESC, u.created_at DESC
  `);

  // Compute per-user AI cost
  const users = rows.map(u => {
    const breakdown = u.usage_breakdown || {};
    let cost = 0;
    for (const [action, count] of Object.entries(breakdown)) {
      cost += (COST_PER_ACTION[action] || 0) * count;
    }
    const monthlyRevenue = u.plan === 'pro' ? PRO_PRICE_MONTHLY : 0;
    return {
      ...u,
      ai_cost_total: Math.round(cost * 100) / 100,
      monthly_revenue: monthlyRevenue,
    };
  });

  res.json(users);
});

// PATCH /api/admin/tenants/:id — change tenant plan
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

module.exports = router;
